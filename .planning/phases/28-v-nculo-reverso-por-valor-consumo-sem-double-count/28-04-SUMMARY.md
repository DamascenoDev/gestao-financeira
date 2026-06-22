---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
plan: 04
subsystem: ui
tags: [abastecimento, vinculo-reverso, grid, combustivel, importacao, ux]

# Dependency graph
requires:
  - phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
    plan: 01
    provides: "tipo canônico AbastecimentoMatch + ParsedReviewRow.abastecimentoMatch + confirmImportRowSchema com os campos de vínculo"
  - phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
    plan: 02
    provides: "abastecimentoMatch já resolvido e persistido em parsed_rows pelo ingestStatement (server-fonte-da-verdade)"
provides:
  - "ReviewRow.abastecimentoMatch (palpite não-vinculante) + os campos da escolha do vínculo (abastecimentoId/abastecimentoKind/parcelaNum) no estado cliente"
  - "applyLinkToRow PURO + exportado: seta carro_id + a escolha + 'Combustível' (origin manual, sobrescreve IA/memória/keyword), degrada limpo sem combustivelCategoryId"
  - "InlineReviewCarroCell com affordance Vincular a {apelido}/descartar (ancorado na coluna Carro, sem 3ª coluna)"
  - "confirmLinkRow/discardLinkRow + 'Vincular todos' em lote (reducer puro + toast-once)"
  - "runConfirm payload carregando abastecimentoId/abastecimentoKind/parcelaNum para o confirmImport (Plano 03)"
  - "RSC threada r.abastecimentoMatch + resolve e passa o id da categoria 'Combustível'"
affects: [28-03-link-write-confirmImport]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Affordance confirmar/descartar ancorado numa coluna existente (sem 3ª coluna) espelhando SuggestionSlot — D-05"
    - "Reducer puro exportado (applyLinkToRow) compartilhado pelo per-row + batch, retornando a MESMA referência quando não há match (React pula re-render)"
    - "Predicado único (isLinkPending) como home do gate do botão de lote + do affordance — count e reducer nunca divergem"
    - "apply-on-confirm que SOBRESCREVE auto-classificação (vínculo = sinal explícito > palpite), degradando limpo quando o id da categoria não veio"

key-files:
  created: []
  modified:
    - src/components/import-review-table.tsx
    - src/app/(app)/importar/[statementId]/page.tsx

key-decisions:
  - "Guardar a ESCOLHA do vínculo (abastecimentoId/kind/parcelaNum) em campos próprios do ReviewRow (setados por applyLinkToRow), em vez de re-derivar do abastecimentoMatch no payload — o abastecimentoId setado também serve de flag 'confirmado' (isLinkPending = match presente && abastecimentoId undefined), mantendo o match na linha após confirmar e simplificando o gate do affordance/botão"
  - "Resolver o id de 'Combustível' das categories JÁ buscadas no RSC (find por name) — sem nenhuma query nova; degrada para null quando ausente"
  - "Após confirmar, manter abastecimentoMatch na linha (não limpar) — só discardLinkRow o limpa; o estado 'confirmado vs pendente' é distinguido por abastecimentoId, deixando o affordance some e o Select normal aparecer com o carro setado"

patterns-established:
  - "Affordance de vínculo na coluna Carro (chip Vincular a {apelido} + lixeira descartar) reusando o estilo do SuggestionSlot — min-h para não reflowar"
  - "applyLinkToRow puro compartilhado por per-row e 'Vincular todos' (mesmo molde de applyAllSuggestions/reclassifyRowsWithKeyword)"

requirements-completed: [CAR-10, FUEL-01]

# Metrics
duration: 4min
completed: 2026-06-22
status: complete
---

# Phase 28 Plan 04: Vínculo reverso na grid (coluna Carro) Summary

**A sugestão de vínculo reverso por valor chega à grid de revisão ancorada na coluna Carro existente (D-05, sem 3ª coluna): `InlineReviewCarroCell` mostra "Vincular a {apelido}"/descartar quando há `abastecimentoMatch` pendente; confirmar seta `carro_id` + a escolha do vínculo + "Combustível" sobrescrevendo IA/memória/keyword (D-06/FUEL-01) em estado cliente puro; "Vincular todos" aplica o lote; o RSC threada o match (vindo de `parsed_rows`, WR-01) e passa o id de "Combustível", e o payload do `runConfirm` carrega `abastecimentoId`/kind/parcelaNum para o Plano 03 gravar.**

## Performance

- **Duration:** ~4 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- **Affordance de vínculo na coluna Carro (D-05):** `InlineReviewCarroCell` ganhou um ramo que, quando há `abastecimentoMatch` pendente (sem `abastecimentoId` setado), renderiza um chip estilo `SuggestionSlot` "Vincular a {carroApelido}" (sparkles, primary-tinted, `min-h-5` para não reflowar) + uma lixeira descartar — SEM 3ª coluna na grid. Após confirmar, o ramo some e o Select normal mostra o carro etiquetado.
- **apply-on-confirm (D-06/FUEL-01):** `applyLinkToRow` (puro + exportado) seta `carro_id = match.carroId`, guarda a escolha do vínculo (`abastecimentoId`/`abastecimentoKind`/`parcelaNum`) e aplica `category_id` = id de "Combustível" com `origin: 'manual'`/`reserva_id: null`, **sobrescrevendo** sugestão da IA/memória/palavra-chave. Degrada limpo: sem `combustivelCategoryId` (conta antiga sem backfill), vincula o carro mas deixa a categoria como está.
- **per-row + lote (D-07):** `confirmLinkRow`/`discardLinkRow` por linha + `confirmAllLinks` ("Vincular todos") aplicando `applyLinkToRow` a todas as linhas com match pendente (reducer PURO + toast-once, molde exato de `applyAllSuggestions`). `isLinkPending` é o home único do gate (count do botão + affordance da célula).
- **payload do runConfirm:** acrescenta `abastecimentoId`/`abastecimentoKind`/`parcelaNum` (só presentes quando confirmado), casando o `confirmImportRowSchema` estendido (Plano 01) — alimenta o `confirmImport` (Plano 03).
- **RSC (WR-01):** `reviewRows.map` threada `r.abastecimentoMatch` espelhando `r.suggestion`, SEM nenhum fetch de abastecimentos (o match vem de `parsed_rows`); resolve o id de "Combustível" das `categories` já buscadas e passa `combustivelCategoryId` à grid.

## Task Commits

1. **Task 1: vínculo na coluna Carro + confirmLinkRow + Vincular todos + payload** — `3e3b476` (feat)
2. **Task 2: RSC threada abastecimentoMatch + id da categoria Combustível** — `51b1f11` (feat)

## Files Created/Modified
- `src/components/import-review-table.tsx` — `ReviewRow.abastecimentoMatch` + campos da escolha do vínculo; `applyLinkToRow` puro exportado; `isLinkPending`; `confirmLinkRow`/`discardLinkRow`/`confirmAllLinks`; prop `combustivelCategoryId`; affordance em `InlineReviewCarroCell` (desktop + mobile); botão "Vincular N abastecimentos"; payload do `runConfirm` estendido.
- `src/app/(app)/importar/[statementId]/page.tsx` — `abastecimentoMatch: r.abastecimentoMatch` no `reviewRows.map`; resolve `combustivelCategoryId` das categories e o passa à `ImportReviewTable`. Nenhum fetch de abastecimentos adicionado (WR-01).

## Decisions Made
- **Escolha do vínculo em campos próprios do ReviewRow:** `applyLinkToRow` grava `abastecimentoId`/`abastecimentoKind`/`parcelaNum` no row; o `abastecimentoId` setado também é a flag "confirmado" (`isLinkPending = !!abastecimentoMatch && abastecimentoId === undefined`). Isso mantém o `abastecimentoMatch` na linha após confirmar (só `discardLinkRow` limpa) e faz o affordance/Select alternarem sem um flag extra.
- **id de "Combustível" via find nas categories já buscadas:** sem query nova no RSC; null degrada limpo.
- **Botão de lote rotulado "Vincular N abastecimentos"** (equivalente a "Vincular todos") ao lado de "Aplicar N sugestões confiáveis", visível só com ≥1 link pendente.

## Deviations from Plan

None - plano executado exatamente como escrito. (Os campos da escolha do vínculo foram guardados no ReviewRow em vez de re-derivados no payload — explicitamente permitido pelo plano: "guardar … no ReviewRow — ou re-derivar do abastecimentoMatch mantido".)

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
- **Plano 03 (link-write):** o payload do `runConfirm` já carrega `abastecimentoId`/`abastecimentoKind`/`parcelaNum`; o `confirmImport` re-deriva posse do `abastecimentoId` (IDOR, `assertOwnedAbastecimento` do Plano 01) e grava o vínculo após o insert da tx.
- `npx tsc --noEmit` limpo. Sem auto-commit na grid (só `setRows`); sem fetch de abastecimentos no RSC (WR-01); sem 3ª coluna (D-05).

## Self-Check: PASSED

- Files: `src/components/import-review-table.tsx`, `src/app/(app)/importar/[statementId]/page.tsx`, `28-04-SUMMARY.md` — all FOUND.
- Commits: `3e3b476` (feat Task 1), `51b1f11` (feat Task 2) — all FOUND.

---
*Phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count*
*Completed: 2026-06-22*
