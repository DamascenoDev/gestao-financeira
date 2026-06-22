// Value-match logic for the reverse abastecimento link (CAR-09 / CAR-11). PURE —
// no DB, no I/O, no server client, no server directive. The caller (Plano 02) fetches
// the user's UNLINKED abastecimentos + the junction parcela counts and hands them in
// as plain objects; this module decides which review row (lançamento) matches which
// abastecimento and returns a per-row non-binding `AbastecimentoMatch` suggestion.
//
// The three pinned truths (28-CONTEXT D1/D2/D3):
//   * D-01 — a parcela casa quando o valor (centavos) ∈ {floor(total/N), ceil(total/N)};
//     à-vista casa quando valor === amountCents EXATO. Aritmética INTEIRA (floor/ceil
//     sobre centavos), nunca float, nunca janela de centavos arbitrária.
//   * D-02 — candidatos são os abastecimentos não-vinculados que casam o predicado,
//     SEM filtro de data (a data nunca trava elegibilidade — parcelado chega ao longo
//     de meses). A data só DESEMPATA em D-03.
//   * D-03 — quando >1 candidato casa o valor de uma linha, escolhe o de occurred_on
//     mais próximo; empate de distância → o mais antigo (occurred_on, depois createdAt).
//   * D-04 — atribuição greedy 1:1: cada candidato é consumido por no máx uma linha;
//     para parcelado conta jaParceladas (na junção) + as já atribuídas NESTA fatura →
//     no máx 1 parcela nova por fatura, e para de sugerir quando as N parcelas fecham.

/**
 * Um candidato de match — montado pelo chamador (Plano 02) a partir do fetch dos
 * abastecimentos não-vinculados do usuário + do count de parcelas já na junção.
 * À-vista: parcelasTotal null/<=1 + amountCents presente. Parcelado: parcelasTotal N
 * (>1) + valorTotalCents presente. jaParceladas = parcelas já gravadas na junção.
 */
export interface AbastecimentoMatchCandidate {
  id: string
  carroId: string
  carroApelido: string
  /** Civil date 'YYYY-MM-DD' do abastecimento — só desempata (D-03), nunca filtra. */
  occurredOn: string
  /** Timestamp de criação — desempate FIFO final quando occurredOn empata. */
  createdAt: string
  /** N parcelas; null ou <=1 ⇒ à-vista. */
  parcelasTotal: number | null
  /** Custo-de-registro do parcelado em centavos inteiros; null para à-vista. */
  valorTotalCents: number | null
  /** Valor à-vista esperado em centavos inteiros; null para parcelado. */
  amountCents: number | null
  /** Parcelas já gravadas na junção `abastecimento_parcelas` para este abastecimento. */
  jaParceladas: number
}

/** O shape mínimo de uma linha de revisão que o match consome (valor + data). */
export interface AbastecimentoMatchRow {
  id: string
  /** Valor do lançamento em centavos inteiros positivos. */
  amountCents: number
  /** Civil date 'YYYY-MM-DD' do lançamento. */
  occurredOn: string
}

/**
 * A sugestão de vínculo NÃO-vinculante anexada a uma linha — o shape canônico
 * espelhado por `ParsedReviewRow.abastecimentoMatch` (types.ts) e pelos campos de
 * vínculo do `confirmImportRowSchema` (schemas/import.ts).
 */
export interface AbastecimentoMatch {
  abastecimentoId: string
  kind: 'avista' | 'parcela'
  /** Presente só para kind === 'parcela' (o número desta parcela: jaParceladas + 1...). */
  parcelaNum?: number
  carroId: string
  carroApelido: string
}

/** True quando o candidato é parcelado (parcelasTotal > 1). */
function isParcelado(cand: AbastecimentoMatchCandidate): boolean {
  return cand.parcelasTotal !== null && cand.parcelasTotal > 1
}

/**
 * D-01 (parcela): o conjunto-alvo `{floor(valorTotalCents / N), ceil(valorTotalCents / N)}`
 * em centavos inteiros. Aritmética inteira só — `Math.floor` / `Math.ceil` sobre a divisão
 * de centavos, NUNCA float arredondado. Cobre o split padrão de cartão (resto na última
 * parcela): 10000 ÷ 3 → {3333, 3334}; divisão exata 9000 ÷ 3 → {3000} (floor == ceil).
 */
export function parcelaTargetCents(valorTotalCents: number, parcelasTotal: number): Set<number> {
  const piso = Math.floor(valorTotalCents / parcelasTotal)
  const teto = Math.ceil(valorTotalCents / parcelasTotal)
  return new Set<number>([piso, teto])
}

/**
 * D-01: o valor do lançamento casa o candidato? À-vista (parcelasTotal null/<=1) usa
 * igualdade EXATA com amountCents; parcelado usa `.has(...)` do conjunto {floor,ceil}.
 * Nunca float, nunca tolerância de centavos.
 */
export function matchesValue(
  valorLancamentoCents: number,
  cand: AbastecimentoMatchCandidate,
): boolean {
  if (isParcelado(cand)) {
    if (cand.valorTotalCents === null || cand.parcelasTotal === null) return false
    return parcelaTargetCents(cand.valorTotalCents, cand.parcelasTotal).has(valorLancamentoCents)
  }
  // À-vista: igualdade exata em inteiros.
  return cand.amountCents !== null && cand.amountCents === valorLancamentoCents
}

/** |diff em dias| entre duas civil dates 'YYYY-MM-DD' (UTC midnight; só magnitude). */
function dayDistance(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
  return Math.round(ms / 86_400_000)
}

/**
 * D-03: dentre os candidatos elegíveis para uma linha, escolhe o de occurred_on mais
 * próximo do lançamento; empate de distância → o mais antigo (occurredOn, depois
 * createdAt) — determinístico/FIFO. Retorna null se a lista vier vazia.
 */
function pickNearest(
  rowOccurredOn: string,
  eligible: AbastecimentoMatchCandidate[],
): AbastecimentoMatchCandidate | null {
  let best: AbastecimentoMatchCandidate | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const cand of eligible) {
    const dist = dayDistance(rowOccurredOn, cand.occurredOn)
    if (dist < bestDist) {
      best = cand
      bestDist = dist
      continue
    }
    if (dist === bestDist && best !== null) {
      // Empate de distância: o mais antigo vence (occurredOn, depois createdAt).
      if (
        cand.occurredOn < best.occurredOn ||
        (cand.occurredOn === best.occurredOn && cand.createdAt < best.createdAt)
      ) {
        best = cand
      }
    }
  }
  return best
}

/**
 * D-04 (greedy 1:1 + D-03 desempate): percorre as linhas e atribui no máx um candidato
 * por linha, cada candidato consumido por no máx uma linha. Para à-vista, o candidato
 * sai do pool ao ser consumido. Para parcelado, conta `jaParceladas` (na junção) + as
 * já atribuídas NESTA fatura e para de sugerir quando as N parcelas fecham → ≤1 parcela
 * nova por fatura, com `parcelaNum = jaParceladas + atribuídasNestaFatura + 1`.
 *
 * Devolve um `Map<rowId, AbastecimentoMatch>`. As linhas SEM match não entram no Map.
 * NUNCA aplica filtro de data na elegibilidade (D-02) — a data só entra no desempate.
 */
export function assignAbastecimentoMatches(
  rows: AbastecimentoMatchRow[],
  candidates: AbastecimentoMatchCandidate[],
): Map<string, AbastecimentoMatch> {
  const result = new Map<string, AbastecimentoMatch>()
  // À-vista consumidos (id removido do pool ao casar uma linha).
  const consumedAvista = new Set<string>()
  // Parcelado: contador de parcelas já atribuídas NESTA fatura, por abastecimento id.
  const atribuidasNestaFatura = new Map<string, number>()

  for (const row of rows) {
    const eligible: AbastecimentoMatchCandidate[] = []
    for (const cand of candidates) {
      if (!matchesValue(row.amountCents, cand)) continue
      if (isParcelado(cand)) {
        const total = cand.parcelasTotal ?? 0
        const jaNestaFatura = atribuidasNestaFatura.get(cand.id) ?? 0
        // ≤1 parcela NOVA por fatura (D-04): já atribuiu uma nesta fatura → fecha.
        if (jaNestaFatura >= 1) continue
        const restantes = total - cand.jaParceladas - jaNestaFatura
        if (restantes <= 0) continue // N parcelas completas → não sugere mais
      } else {
        if (consumedAvista.has(cand.id)) continue // à-vista já consumido por outra linha
      }
      eligible.push(cand)
    }

    const chosen = pickNearest(row.occurredOn, eligible)
    if (chosen === null) continue

    if (isParcelado(chosen)) {
      const jaNestaFatura = atribuidasNestaFatura.get(chosen.id) ?? 0
      const parcelaNum = chosen.jaParceladas + jaNestaFatura + 1
      atribuidasNestaFatura.set(chosen.id, jaNestaFatura + 1)
      result.set(row.id, {
        abastecimentoId: chosen.id,
        kind: 'parcela',
        parcelaNum,
        carroId: chosen.carroId,
        carroApelido: chosen.carroApelido,
      })
    } else {
      consumedAvista.add(chosen.id)
      result.set(row.id, {
        abastecimentoId: chosen.id,
        kind: 'avista',
        carroId: chosen.carroId,
        carroApelido: chosen.carroApelido,
      })
    }
  }

  return result
}
