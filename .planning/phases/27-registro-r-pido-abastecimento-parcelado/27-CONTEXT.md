# Phase 27: Registro rápido + abastecimento parcelado - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Camada de **aplicação** sobre o substrato de dados pronto da Phase 26 (migrations
`0039`/`0040`). Entrega duas capacidades visíveis ao usuário, **sem** novo schema:

1. **Registro rápido pela lista `/carros`** — um botão "Novo abastecimento" por carro,
   na face do `CarroCard`, abre o `AbastecimentoForm` já existente e registra o
   abastecimento sem navegar para `/carros/[id]`. O caminho é manual/à-vista (litros +
   odômetro + valor), pensado para registrar **durante o mês, antes da fatura chegar**.
2. **Abastecimento parcelado** — no `AbastecimentoForm`, o usuário marca o registro como
   parcelado e informa **nº de parcelas + valor total**, gravados nas colunas criadas na
   Phase 26 (`parcelas_total`, `valor_total_cents`). O caso à-vista continua inalterado.

**Já travado pela Phase 26 / ROADMAP (NÃO re-discutir, é substrato pronto):**
- Parcelado = `parcelas_total > 1` → grava `valor_total_cents`, com `transaction_id` NULL
  **e** `amount_cents` NULL (o CHECK `abastecimentos_cost_xor` do `0039` garante).
- Parcelado **nunca** tem transação vinculada nesta fase — o vínculo por valor (uma parcela
  por fatura) é a Phase 28. Aqui o parcelado nasce sem `abastecimento_parcelas`.
- À-vista (v1.2) é **intocável**: `transaction_id` 1:1 + índice único preservados.
- Reusa `AbastecimentoForm` + `createAbastecimento`/`updateAbastecimento` (v1.2).
- IDOR-safe via `assertOwnedCarro` (já no `createAbastecimento`).

**NÃO está no escopo (fica em 28 / fora do milestone):** sugestão de vínculo lançamento↔
abastecimento por valor na grid de importação (Phase 28); botão de abastecimento no Extrato
(decisão do founder — só na lista `/carros`); OCR de cupom; relink de custo de abastecimento
já criado pela UI (CAR-14, v2).

</domain>

<decisions>
## Implementation Decisions

### D1 — Forma do form na lista `/carros`
- **D-01 (manual/parcelado only na lista):** o botão da lista abre o `AbastecimentoForm`
  **sem** a aba "Da fatura" — só os caminhos **Manual** (à-vista) e **Parcelado**. Casa com
  o frame "registrar antes da fatura chegar" e mantém a page `/carros` leve: ela **NÃO** passa
  a buscar lançamentos não-vinculados (`transacoes`). A aba "Da fatura" continua existindo no
  form do **detalhe** `/carros/[id]` (que já busca `transacoes`); vincular fatura é a Phase 28.
- **D-02 (prop no form):** introduzir um prop tipo `manualOnly` (nome exato = discrição) no
  `AbastecimentoForm` que esconde a aba "Da fatura". Quando ligado, o `CostSource` inicial é
  `'manual'` e o segmento "Da fatura" não renderiza. Detalhe não passa o prop → comportamento
  atual preservado.

### D2 — Posição do botão no `CarroCard`
- **D-03 (botão na face do card):** o "Novo abastecimento" fica **visível na face** do
  `CarroCard` (ex.: abaixo da faixa de KPIs `dl`), não escondido no `DropdownMenu`
  (que segue só com Editar/Arquivar). Ação central da fase → descoberta imediata, 1 clique.
  O `AbastecimentoForm` renderiza seu próprio trigger (`trigger` prop ou o default); o card
  já é client component, então encaixa direto. Sem `transacoes` (D-01).

### D3 — UI do parcelado no `AbastecimentoForm`
- **D-04 (terceira aba):** o custo passa de `Tabs [Da fatura | Manual]` para
  `Tabs [Da fatura | Manual | Parcelado]`. No contexto manual-only da lista (D-01) vira
  `[Manual | Parcelado]`. O tipo `CostSource` ganha `'parcelado'` (hoje `'fatura' | 'manual'`).
- **D-05 (reusa o clear de fonte):** o `onSourceChange` existente já limpa a fonte inativa;
  estendê-lo para que escolher "Parcelado" limpe `transactionId` **e** `amount`, e sair dele
  limpe os campos de parcelamento. XOR estrutural de graça — alinhado ao CHECK do `0039`.
- **D-06 (campos do parcelado):** a aba Parcelado mostra **valor total** (`MoneyInput` →
  `valor_total_cents`) + **nº de parcelas** (`Input` inteiro → `parcelas_total`). Sem
  odômetro/litros novos (esses são compartilhados, fora do bloco de custo).

### D4 — Regras / validação do parcelado
- **D-07 (faixa de parcelas 2–24):** nº de parcelas é inteiro **≥ 2** (mínimo casa com o
  CHECK `parcelas_total > 1` do `0039`) e **≤ 24** (teto de validação — cobre folgado o
  parcelamento real de combustível em cartão e barra digitação absurda que quebraria o
  preview/Phase 28). Validado no schema + no form.
- **D-08 (preview "valor por parcela"):** sob os campos, exibir ao vivo
  **`valor_total ÷ N` formatado** (`formatCents`) como linha derivada display-only —
  **não persiste**. Ajuda a conferir e antecipa o valor que a Phase 28 vai casar por fatura
  (~total/N). Some quando valor total ou nº parcelas estiverem inválidos/vazios.
- **D-09 (valor total positivo):** `valor_total_cents` segue a invariante de dinheiro =
  centavos `bigint` **positivo** (mesmo guard do `amount_cents`; o CHECK do `0039` já exige
  `> 0`). Reusar `parseBRLToCents` + `isValidMoney` como no caminho manual.

### Claude's Discretion
- **Shape exato do `superRefine`** do `abastecimentoSchema` para os **3 estados** espelhando
  o CHECK do `0039`: à-vista (exatamente uma de `transactionId`/`amountCents`, sem
  `valorTotalCents`/`parcelasTotal>1`) **vs** parcelado (`valorTotalCents` + `parcelasTotal`
  entre 2–24, **sem** `transactionId`/`amountCents`). Defense-in-depth alinhado ao DB.
- **Nomes exatos** do prop (`manualOnly`?), dos novos campos no `AbastecimentoInput`
  (`valorTotalCents`, `parcelasTotal`?) e do valor de `CostSource` para parcelado.
- **`parcelas_total` no caso à-vista:** gravar `null` ou `1` — o CHECK do `0039` trata os dois
  como à-vista; escolher uma convenção e mantê-la no `abastecimentoWriteFields`.
- **Mapeamento dos novos campos** em `abastecimentoWriteFields` (centavos/null por estado).
- Layout visual fino do botão na face (ícone + label, gold/outline) e da linha de preview.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito + roadmap
- `.planning/REQUIREMENTS.md` — **CAR-07** (registro pela lista `/carros`) + **CAR-08**
  (marcar abastecimento manual como parcelado: nº parcelas + valor total). Também a seção
  "Out of Scope" (sem botão no Extrato; sem auto-vincular).
- `.planning/ROADMAP.md` § "Phase 27: Registro rápido + abastecimento parcelado" — Goal +
  Success Criteria 1–4 (botão na lista, registro manual antes da fatura, parcelado validado,
  posse IDOR-safe + sem double-count).

### Substrato pronto da Phase 26 (a base que esta fase apenas WIRA)
- `.planning/phases/26-substrato-do-abastecimento-ponta-a-ponta/26-CONTEXT.md` — decisões
  D-01..D-09 do substrato (attach-later, parcelado N:1, cost-of-record, seed Combustível).
- `supabase/migrations/0039_abastecimento_parcelado.sql` — **fonte da verdade do parcelado:**
  colunas `parcelas_total int` (L45-46) + `valor_total_cents bigint check (>0)` (L48-50);
  `abastecimentos_parcelas_total_chk` (`>= 1 or null`, L54-57); CHECK relaxado
  `abastecimentos_cost_xor` (L66-78, a truth table parcelado vs à-vista que o `superRefine`
  espelha); junção `abastecimento_parcelas` (L85-108, **não usada na P27**); view de consumo
  parcelado-aware (L117-235, já lê `valor_total_cents` uma vez — esta fase só cria as linhas).
- `supabase/migrations/0040_categorias_combustivel.sql` — categoria default "Combustível"
  (FUEL-01); P27 não a aplica (apply-on-confirm é Phase 28), mas é o contexto do milestone.

### Código a alterar (o wiring desta fase)
- `src/components/abastecimento-form.tsx` — `AbastecimentoForm`: `CostSource` (L57),
  `Tabs` de custo (L307-342), `onSourceChange` (L156-160), `buildInput` (L163-182),
  re-seed no `handleOpenChange` (L139-152). Ganha a aba Parcelado + prop `manualOnly`.
- `src/lib/schemas/abastecimento.ts` — `abastecimentoSchema` + `superRefine` XOR (L49-60):
  **relaxar para 3 estados** (item diferido explícito da P26). Adicionar `valorTotalCents`
  + `parcelasTotal` ao objeto.
- `src/actions/abastecimentos.ts` — `abastecimentoWriteFields` (L55-67) mapeia os novos
  campos; `createAbastecimento` (L70) já tem o `assertOwnedCarro`; o pre-check de tx 1:1
  (L95-109) só roda no caminho à-vista — parcelado pula (sem `transactionId`).
- `src/components/carro-card.tsx` — `CarroCard` (client): adicionar o `AbastecimentoForm`
  manual-only na face. Precisa de `carroId` (= `carro.id`) + `combustivelPadrao`
  (= `carro.combustivelPadrao`); **sem** `transacoes`.
- `src/app/(app)/carros/page.tsx` — RSC da lista: passa os dados ao `CarroCard`; **não**
  deve passar a buscar `transacoes` (D-01). `CarroCardData` pode já bastar (tem id +
  combustivelPadrao).

### Padrões de referência (espelhar, não alterar)
- `src/app/(app)/carros/[id]/page.tsx` L181-212 — como o detalhe monta `transacoes`
  (não-vinculados, ≤100, `carro_id is null or eq id`, exclui já-linkados). Contexto do que a
  lista deliberadamente **não** faz.
- `src/lib/money.ts` — `parseBRLToCents`, `formatCents`, `isValidMoney` (preview D-08 +
  parse do valor total).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`AbastecimentoForm`** (`src/components/abastecimento-form.tsx`): self-contained, já
  exportado, com trigger default "Novo abastecimento" e modo controlado. É o componente que a
  lista reusa — só precisa do prop `manualOnly` (D-01/D-02) e da aba Parcelado (D-04).
- **`createAbastecimento`** (`src/actions/abastecimentos.ts:70`): já faz Zod safeParse +
  `getClaims` sub-gate + `assertOwnedCarro` tri-state + `revalidatePath('/carros')` e
  `/carros/[id]`. Parcelado entra por aqui sem tocar o caminho de tx (que só roda quando há
  `transactionId`).
- **`CarroCard`** (`src/components/carro-card.tsx`): já é client com `useTransition`/toast e
  hospeda um `CarroForm` controlado — molde direto para hospedar o `AbastecimentoForm`.
- **`MoneyInput` + `parseBRLToCents`/`isValidMoney`/`formatCents`**: o caminho manual já os usa
  — valor total e preview reusam 1:1.

### Established Patterns
- **Cost-source em DOIS lugares** (DB CHECK `0039` + Zod `superRefine`) — defense in depth.
  O `superRefine` ficou de propósito desalinhado desde a P26; esta fase o alinha (3 estados).
- **Dinheiro = centavos `bigint` positivo**; `litros` = volume numérico, nunca centavos
  (invariantes pinados no `0027`/`0039`). `valor_total_cents` segue `amount_cents`.
- **Toggle de custo limpa a fonte inativa** (`onSourceChange`, T-10-08) para o submit carregar
  exatamente um estado — estender para o terceiro estado (parcelado).
- **Form re-seed da verdade do servidor no open** (sem `useEffect`) — manter ao adicionar os
  novos campos no `handleOpenChange`.
- **RSC lista + ação revalida `/carros`**: o `createAbastecimento` já revalida a lista, então
  o novo registro aparece sem fetch extra na page.

### Integration Points
- `CarroCard` ← novo `AbastecimentoForm` (manual-only) na face; precisa `carro.id` +
  `carro.combustivelPadrao` (já em `CarroCardData`).
- `abastecimentoSchema` ← `valorTotalCents` + `parcelasTotal` + `superRefine` 3-estados.
- `abastecimentoWriteFields` ← grava `parcelas_total`/`valor_total_cents` por estado.
- Nenhuma migration nova (substrato é da P26); `database.types.ts` já tem as colunas.

</code_context>

<specifics>
## Specific Ideas

- O founder enquadra o registro pela lista como o caminho **rápido do dia a dia** ("antes da
  fatura"), por isso a lista é manual/parcelado-only e o botão fica **na cara do card**, não
  num menu.
- Parcelado é tratado como uma **terceira fonte de custo de primeira classe** (aba própria),
  reusando a mecânica de XOR/clear que já existe — não um sub-modo escondido do Manual.
- O **preview "valor por parcela"** é intencionalmente só display: antecipa o valor que a
  Phase 28 vai casar por fatura (~total/N), reforçando o modelo mental sem persistir nada novo.

</specifics>

<deferred>
## Deferred Ideas

- **CAR-09/10/11 (vínculo reverso por valor + uma parcela por fatura sem double-count)** —
  Phase 28. O parcelado nasce nesta fase sem `abastecimento_parcelas`; o casamento por valor
  e a etiqueta `carro_id`/"Combustível" são lá.
- **CAR-12 (relatório de consumo refletindo manuais + vinculados)** — Phase 28; as views já
  estão prontas (P26), só faltam as linhas vinculadas.
- **CAR-13 (projeção de parcelas futuras ainda não vinculadas)** — v2.
- **CAR-14 (edição/relink de custo de abastecimento já criado pela UI)** — v2; fora do
  milestone (a nota "relinking out of scope" segue em `updateAbastecimento` L145-147).
- **Botão de abastecimento no Extrato** — fora de escopo por decisão do founder; acesso rápido
  fica só na lista `/carros`.

</deferred>

---

*Phase: 27-registro-r-pido-abastecimento-parcelado*
*Context gathered: 2026-06-21*
