---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
plan: 01
subsystem: api
tags: [abastecimento, vinculo-reverso, value-match, importacao, ownership, zod, vitest]

# Dependency graph
requires:
  - phase: 26-substrato-do-abastecimento-ponta-a-ponta
    provides: "junção abastecimento_parcelas (0039), CHECK relaxado, valor_total_cents/parcelas_total, views de consumo parcelado-aware"
  - phase: 27-registro-r-pido-abastecimento-parcelado
    provides: "abastecimento parcelado nasce sem junção; valor por parcela ~total/N que o match casa"
provides:
  - "Módulo PURO src/lib/carro/abastecimento-match.ts: D-01 (floor/ceil em centavos), D-03 (nearest-by-date + FIFO), D-04 (greedy 1:1 + ≤1 parcela/fatura)"
  - "Tipo canônico AbastecimentoMatch (abastecimentoId/kind/parcelaNum?/carroId/carroApelido) — único shape consumido por types + schema + UI"
  - "assertOwnedAbastecimento tri-state (IDOR re-derive WR-01) para o link-write do Plano 03"
  - "ParsedReviewRow.abastecimentoMatch opcional não-vinculante (palpite, nunca auto-commit)"
  - "confirmImportRowSchema com abastecimentoId + abastecimentoKind + parcelaNum opcionais"
affects: [28-02-ingest-match-pass, 28-03-link-write-confirmImport, 28-04-grid-carro-cell]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Módulo PURO testável por unidade (sem DB, sem cliente, sem float) — molde consumo.ts"
    - "Predicado de valor por conjunto exato {floor,ceil} em centavos inteiros (nunca janela arbitrária)"
    - "Atribuição greedy 1:1 como invariante ESTRUTURAL (≤1 parcela/fatura nasce no match, não só na validação)"
    - "Ownership tri-state ('owned'|'not-owned'|'error') espelhando assertOwnedCarro"

key-files:
  created:
    - src/lib/carro/abastecimento-match.ts
    - src/lib/carro/abastecimento-match.test.ts
  modified:
    - src/lib/ownership.ts
    - src/lib/parsers/types.ts
    - src/lib/schemas/import.ts

key-decisions:
  - "Reusar o tipo canônico AbastecimentoMatch de abastecimento-match.ts em ParsedReviewRow (um único shape, sem re-declaração) — alinha o retorno do match com o campo do contrato"
  - "≤1 parcela NOVA por fatura é estrutural: um candidato parcelado é elegível apenas se 0 parcelas já atribuídas nesta fatura (não 'restantes > 0'), garantindo o invariante D-04 mesmo com várias linhas casando o valor"
  - "Desempate D-03 por |diff de dias| via Date.parse de civil dates em UTC midnight; empate → mais antigo (occurredOn, depois createdAt) FIFO determinístico"

patterns-established:
  - "Pure value-match: predicado D-01 em aritmética inteira, candidatos sem filtro de data (D-02), 1 sugestão/linha por nearest-by-date (D-03), greedy 1:1 (D-04)"
  - "Contrato canônico único: o shape do match é exportado pelo módulo e importado por types/schema/UI — sem drift"

requirements-completed: [CAR-09, CAR-11]

# Metrics
duration: 4min
completed: 2026-06-22
status: complete
---

# Phase 28 Plan 01: Contratos de fundação do vínculo reverso por valor Summary

**Módulo PURO de value-match (D-01 floor/ceil em centavos, D-03 nearest-by-date+FIFO, D-04 greedy 1:1 ≤1-parcela/fatura) com 16 testes unitários verdes, + os 3 contratos (assertOwnedAbastecimento tri-state, ParsedReviewRow.abastecimentoMatch, campos de vínculo no confirmImportRowSchema) que os Planos 02/03/04 vão consumir.**

## Performance

- **Duration:** ~4 min (245s)
- **Started:** 2026-06-22T18:50:13Z
- **Completed:** 2026-06-22T18:54:30Z
- **Tasks:** 2
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments
- **Lógica pura de match isolada e 100% testada sem DB** — `abastecimento-match.ts` implementa o predicado de valor D-01 (`parcelaTargetCents` = `{Math.floor(v/N), Math.ceil(v/N)}`; `matchesValue` à-vista exato + parcela via `Set.has`), o desempate D-03 (mais próximo por data, empate → mais antigo) e a atribuição greedy 1:1 D-04 (`assignAbastecimentoMatches`) com o invariante estrutural ≤1 parcela nova por fatura.
- **16 casos unitários verdes** cobrindo: conjunto `{floor,ceil}`, divisão exata `{N}`, à-vista exato vs 9999, sem-filtro-de-data (dois candidatos a meses de distância ambos elegíveis), nearest-by-date, FIFO no empate, greedy 1:1 (duas linhas → 1 match), parcelado N=3 com 2 já na junção → `parcelaNum=3`, parcelado completo → 0, e 0-já + 2-linhas → exatamente 1.
- **Contratos de fundação fixados** — `assertOwnedAbastecimento` tri-state (a mitigação T-28-01 / IDOR re-derive para o Plano 03), `ParsedReviewRow.abastecimentoMatch` opcional não-vinculante reusando o tipo canônico, e `confirmImportRowSchema` estendido com `abastecimentoId`/`abastecimentoKind`/`parcelaNum` opcionais.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): testes falhando do value-match** - `9c8a1c5` (test)
2. **Task 1 (GREEN): módulo puro D-01/D-03/D-04** - `1385939` (feat)
3. **Task 2: contratos ownership + types + schema** - `1da459e` (feat)

_TDD task 1 = RED (`9c8a1c5`) → GREEN (`1385939`)._

## Files Created/Modified
- `src/lib/carro/abastecimento-match.ts` (NOVO) - módulo PURO: tipos `AbastecimentoMatchCandidate`/`AbastecimentoMatchRow`/`AbastecimentoMatch` + `parcelaTargetCents`/`matchesValue`/`assignAbastecimentoMatches` (D-01/D-03/D-04, aritmética inteira)
- `src/lib/carro/abastecimento-match.test.ts` (NOVO) - 16 testes vitest puros (espelha consumo.test.ts), todos os casos do `<behavior>`
- `src/lib/ownership.ts` - `assertOwnedAbastecimento(supabase, id): Promise<OwnershipResult>` tri-state (mirror verbatim de `assertOwnedCarro`)
- `src/lib/parsers/types.ts` - `ParsedReviewRow.abastecimentoMatch?: AbastecimentoMatch` opcional não-vinculante (importa o tipo canônico)
- `src/lib/schemas/import.ts` - `confirmImportRowSchema` + `abastecimentoId`/`abastecimentoKind`/`parcelaNum` (`.optional()`)

## Decisions Made
- **Shape canônico único:** `ParsedReviewRow.abastecimentoMatch` reusa `AbastecimentoMatch` exportado por `abastecimento-match.ts` (em vez de re-declarar) — o retorno de `assignAbastecimentoMatches` e o campo do contrato são literalmente o mesmo tipo, eliminando drift (atende a behavior assertion da Task 2).
- **≤1 parcela/fatura estrutural:** um candidato parcelado é elegível apenas quando 0 parcelas já foram atribuídas a ele NESTA fatura (guard `jaNestaFatura >= 1 → continue`), não "restantes > 0". Sem esse guard, duas linhas casando o valor gerariam 2 parcelas na mesma fatura (CONTEXT D-04 proíbe). Esse foi o único ajuste GREEN após o primeiro draft (test (d) pegou).
- **Desempate D-03:** distância por |dias| via `Date.parse` em UTC midnight (civil dates 'YYYY-MM-DD'); empate de distância resolve por `occurredOn` mais antigo, depois `createdAt` — FIFO determinístico.

## Deviations from Plan

None - plan executed exactly as written. (O guard de ≤1 parcela/fatura foi um refinamento natural da fase GREEN do TDD para satisfazer o caso (d) do `<behavior>`, não um desvio de escopo.)

## Issues Encountered
- **Caso (d) falhou no primeiro GREEN draft:** a primeira implementação permitia até `restantes` parcelas por fatura, atribuindo 2 matches quando 2 linhas casavam o valor de um parcelado N=3 com 0 já na junção. Resolvido endurecendo a elegibilidade para "≤1 parcela nova por fatura" (CONTEXT D-04). Suíte 16/16 verde depois.
- **Falso-positivo de grep no acceptance:** `grep -c "use server\|@supabase"` casava a palavra `'use server'` literal num comentário (prosa). Reescrito o comentário ("no server client, no server directive") para o assertion retornar 0 sem alterar o comportamento — o módulo nunca importou Supabase nem teve a directiva.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Plano 02 (ingest match pass):** pode importar `assignAbastecimentoMatches` + os tipos `AbastecimentoMatchCandidate`/`AbastecimentoMatchRow` e anexar `row.abastecimentoMatch` no pass batched de `ingestStatement` (montando os candidatos a partir do fetch dos abastecimentos não-vinculados + count na junção).
- **Plano 03 (link-write):** `assertOwnedAbastecimento` pronto para o IDOR re-derive em `confirmImport`; o schema já aceita `abastecimentoId`/`abastecimentoKind`/`parcelaNum`.
- **Plano 04 (grid):** `ParsedReviewRow.abastecimentoMatch` pronto para threadar até a célula de Carro.
- Sem blockers. `npx vitest run src/lib/carro/abastecimento-match.test.ts` 16/16 verde; `npx tsc --noEmit` limpo.

## Self-Check: PASSED

- Files: `src/lib/carro/abastecimento-match.ts`, `src/lib/carro/abastecimento-match.test.ts`, `28-01-SUMMARY.md` — all FOUND.
- Commits: `9c8a1c5` (test/RED), `1385939` (feat/GREEN), `1da459e` (feat contratos) — all FOUND.

---
*Phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count*
*Completed: 2026-06-22*
