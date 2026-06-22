---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
verified: 2026-06-22T19:45:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 28: Vínculo Reverso por Valor / Consumo sem Double-Count — Relatório de Verificação

**Phase Goal:** Por VALOR, casa um lançamento de fatura a um abastecimento pré-registrado (à vista = valor total; parcelado = ~total ÷ N), sugere o vínculo na grid (espelhando o confirm da IA, SEM auto-commit); ao confirmar, vincula o lançamento, etiqueta `carro_id` e aplica categoria "Combustível"; parcelado casa UMA parcela/fatura sem recontar custo; as views de consumo (`v_abastecimento_consumo`/`v_carro_resumo`, km/l + R$/km) refletem manuais + vinculados sem double-count.

**Verified:** 2026-06-22T19:45:00Z
**Status:** passed
**Re-verification:** No — verificação inicial (o verificador anterior caiu em erro de conexão antes de escrever o arquivo).

## Goal Achievement

### Observable Truths

| #   | Truth | Status     | Evidence |
| --- | ----- | ---------- | -------- |
| 1   | Linha cujo valor casa um abastecimento pré-registrado recebe sugestão de vínculo na grid — sem auto-commit (CAR-09). | ✓ VERIFIED | `abastecimento-match.ts` predicado D-01 com `Math.floor`/`Math.ceil` em centavos inteiros (L79-80), à-vista igualdade exata (L98), greedy 1:1 D-04 (L148-201), módulo PURO sem `@supabase`/I/O. `import.ts` L493-497 `.from('abastecimentos').select(...).is('transaction_id', null)` SEM filtro de data, count batched na junção (L506), `assignAbastecimentoMatches` (L622) anexa `row.abastecimentoMatch` (L634) sem tocar category_id/carro_id. Grid `InlineReviewCarroCell` renderiza chip "Vincular a {apelido}" (L1518). Zero write na grid (`grep supabase/from/fetch` = 0; só `setRows`). |
| 2   | Confirmar na grid vincula, etiqueta `carro_id`, aplica "Combustível" (CAR-10/FUEL-01); descartar limpa. | ✓ VERIFIED | `applyLinkToRow` (L391+) seta `carro_id = match.carroId`, guarda `abastecimentoId`/kind/parcelaNum e aplica "Combustível" com `origin: 'manual'` sobrescrevendo IA/memória/keyword (L400-409). `confirmAllLinks` (L625) batch; `discardLinkRow` limpa só `abastecimentoMatch`. Payload `runConfirm` carrega `abastecimentoId`/`abastecimentoKind`/`parcelaNum` (L891-893). RSC `page.tsx` resolve `combustivelCategoryId` (L236-237) e threada `r.abastecimentoMatch` (L229) — SEM novo `from('abastecimentos')` (WR-01). `confirmImport`: IDOR re-derive #5 via `assertOwnedAbastecimento` ANTES de qualquer write (L826-850, id forjado → 'Abastecimento inválido.' rejeita payload inteiro); à-vista `update transaction_id` + sync `carro_id` na tx (L1160-1185). Teste `import-abastecimento-link.test.ts`: à-vista (L161), IDOR userB→0 writes (L221). |
| 3   | Parcelado casa UMA parcela/fatura, registrada sem recontar custo — sem double-count em `v_abastecimento_consumo` nem `v_carro_resumo` (CAR-11). | ✓ VERIFIED | Match: guard `jaNestaFatura >= 1 → continue` (L166) garante ≤1 parcela nova/fatura estrutural. `confirmImport`: insert `abastecimento_parcelas` com `parcela_num` RECOMPUTADO server-side (já-na-junção + neste-confirm + 1, L1140-1148) — nunca confia no payload; 23505 → already-linked (L1151), surface-but-keep não-23505 (L1153). Teste held-out `abastecimento-consumo-no-double-count.test.ts` CAR-12(1) (L241): vincular 1→2→3 parcelas NÃO altera o custo (= `valor_total_cents`), fixture 17000 escolhido para não colidir. Teste link parcela `parcela_num` recomputado (L195), double-link 23505 (L295). |
| 4   | Consumo (km/l, R$/km) reflete manuais + vinculados; km/l só litros + odômetro (não exige fatura) (CAR-12). | ✓ VERIFIED | Nenhum SQL novo de view (a fase alimenta as views da P26 — confirmado: `grep create view` = 0). Teste CAR-12: (2) à-vista coalesce real over esperado UMA vez (L285); (3) km/l = Δodômetro÷Σlitros estável sob vínculo + carro SEM fatura (transaction_id null) ainda produz km/l não-null (L322, L339); (4) manual + vinculado ambos no `gasto_total_cents` de `v_carro_resumo` (L401). |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/carro/abastecimento-match.ts` | Módulo PURO D-01/D-03/D-04 | ✓ VERIFIED | 201 linhas, `parcelaTargetCents`/`matchesValue`/`assignAbastecimentoMatches`, aritmética inteira, sem `@supabase`. Importado por import.ts (L8) + types/schema/UI. |
| `src/actions/import.ts` (ingestStatement) | Match pass batched | ✓ VERIFIED | Fetch `.is('transaction_id', null)` sem data (L493-497), count batched (L506), assign + attach (L622-634). |
| `src/actions/import.ts` (confirmImport) | IDOR gate + link-write | ✓ VERIFIED | IDOR #5 ANTES do write (L826-850); à-vista (L1160) / parcelado (L1143) / 23505 swallow / surface-but-keep; `revalidatePath(CARROS_PATH)` (L1245). |
| `src/components/import-review-table.tsx` | Affordance Carro + sem auto-commit | ✓ VERIFIED | `applyLinkToRow`, `confirmLinkRow`/`discardLinkRow`/`confirmAllLinks`, chip na coluna Carro (sem 3ª coluna), payload estendido. Zero DB write. |
| `src/app/(app)/importar/[statementId]/page.tsx` | Thread match + Combustível id | ✓ VERIFIED | `abastecimentoMatch` threaded (L229), `combustivelCategoryId` resolvido (L236), SEM novo fetch de abastecimentos (WR-01). |
| `tests/import-abastecimento-link.test.ts` | 5 invariantes (incl. IDOR) | ✓ VERIFIED | 327 linhas, 5 `it`: à-vista, parcela, IDOR userB→0 writes, dedupe-skip, double-link 23505. |
| `tests/abastecimento-consumo-no-double-count.test.ts` | 4 invariantes CAR-12 | ✓ VERIFIED | 432 linhas, 5 `it`: parcelado UMA vez (held-out 1/2/3), coalesce, km/l sem fatura, manual+vinculado. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `import.ts` ingest | `abastecimento-match.ts` | `assignAbastecimentoMatches` import (L8) + call (L622) | ✓ WIRED |
| grid `applyLinkToRow` | `confirmImport` payload | `abastecimentoId`/kind/parcelaNum no runConfirm (L891-893) | ✓ WIRED |
| `confirmImport` link-write | `abastecimento_parcelas` / `abastecimentos.transaction_id` | insert/update após IDOR gate (L1143/L1162) | ✓ WIRED |
| RSC page | grid | `abastecimentoMatch` + `combustivelCategoryId` props (L229/L257) | ✓ WIRED |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| CAR-09 (sugestão por valor à-vista/parcelado) | 28-01, 28-02 | ✓ SATISFIED | Predicado D-01 + ingest pass + grid affordance. |
| CAR-10 (confirma/descarta na grid sem auto-commit, etiqueta carro_id) | 28-03, 28-04 | ✓ SATISFIED | applyLinkToRow + confirmImport link-write + IDOR gate; teste à-vista. |
| CAR-11 (parcelado UMA parcela/fatura sem recontar custo) | 28-02, 28-03 | ✓ SATISFIED | Guard ≤1/fatura + parcela_num server-computed; teste held-out 1/2/3. |
| CAR-12 (consumo reflete manuais+vinculados; km/l só litros+odômetro) | 28-05 | ✓ SATISFIED | Views P26 alimentadas (zero SQL novo); 4 invariantes provados. |

### Anti-Patterns Found

Nenhum bloqueador. Sem `TBD`/`FIXME`/`XXX` nos arquivos modificados. Sem auto-commit na grid (somente `setRows`). Comentários `// 23505 → already-linked` e similares são prosa de domínio legítima, não débito.

### Gaps Summary

Nenhum gap. O objetivo da fase está observavelmente atingido no código-fonte:

- O match por valor é puro, em aritmética inteira (floor/ceil), sem filtro de data e com greedy 1:1 estrutural (≤1 parcela/fatura nasce no match).
- A sugestão chega à grid pela coluna Carro existente (sem 3ª coluna), sem nenhum write de banco no cliente — espelhando o confirm da IA.
- O confirm re-deriva posse do `abastecimentoId` (IDOR/ASVS L1) ANTES de qualquer write; um id forjado rejeita o payload inteiro.
- O parcelado grava UMA parcela por fatura com `parcela_num` recomputado server-side; 23505 dos unique indexes da P26 mapeia para already-linked (não 500).
- O double-count é negado por teste held-out honesto (nº de parcelas varia, custo invariante = `valor_total_cents`) com fixtures que não colidem por acaso.
- CAR-12 alimenta as views da P26 sem nenhum SQL novo (confirmado por grep) — comportamento esperado e não-faltante.

Fatos estabelecidos pelo orquestrador (não re-verificados): `npm test` 1000/1000, `tsc --noEmit` limpo, `next build` limpo.

---

_Verified: 2026-06-22T19:45:00Z_
_Verifier: Claude (gsd-verifier)_
