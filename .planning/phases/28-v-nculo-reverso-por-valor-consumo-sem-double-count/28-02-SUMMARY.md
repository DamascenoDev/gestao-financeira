---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
plan: 02
subsystem: api
tags: [abastecimento, vinculo-reverso, ingest, value-match, importacao, wr-02]

# Dependency graph
requires:
  - phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
    plan: 01
    provides: "módulo PURO abastecimento-match.ts (assignAbastecimentoMatches, AbastecimentoMatchCandidate), ParsedReviewRow.abastecimentoMatch, confirmImportRowSchema com campos de vínculo"
provides:
  - "ingestStatement estendido: pass de match batched (fetch não-vinculados + count na junção + assign greedy 1:1 + attach de row.abastecimentoMatch antes do persist)"
  - "O abastecimentoMatch viaja persistido em statements.parsed_rows (servidor é a fonte da verdade do palpite, igual à suggestion da IA)"
affects: [28-03-link-write-confirmImport, 28-04-grid-carro-cell]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pass de match espelhando EXATAMENTE o pré-fetch batched + o PASS 2 de attach da IA — duas queries .in(...) fora do loop de linhas (WR-02), zero query per-row"
    - "Candidatos montados sem filtro de data (D-02); toda a aritmética D-01/D-03/D-04 mora no módulo puro do Plano 01 (sem lógica de predicado duplicada no action)"
    - "Linha identificada pelo dedupe_key no assign (não há id estável até o confirm) — espelha como suggestion é mapeada por descriptor_norm"
    - "Sem auto-commit: só anexa row.abastecimentoMatch, nunca escreve category_id/carro_id (mirror do PASS 2 da IA)"

key-files:
  created: []
  modified:
    - src/actions/import.ts

key-decisions:
  - "Linha-id no assign = dedupe_key: ingestStatement não atribui um id estável às linhas até o confirm; o dedupe_key (já computado batched em keysByRaw) é a chave determinística usada tanto no Map de retorno quanto no attach, espelhando como a suggestion é mapeada"
  - "Regra de capacidade (à-vista consumido / parcelado completo) fica EM UMA fonte — o módulo puro D-04; o action só monta o pool não-vinculado (transaction_id is null) e o count da junção, sem reimplementar o filtro de capacidade"
  - "Filtro do pool no action = `.is('transaction_id', null)` cobre à-vista não-vinculado E parcelado (que por CHECK 0039 é sempre transaction_id null); carro órfão (apelido ausente) é o único descarte local"

patterns-established:
  - "Match pass no ingest = pré-fetch batched (2× .in/.is fora do loop) → assignAbastecimentoMatches → attach não-vinculante antes do persist de parsed_rows"

requirements-completed: [CAR-09, CAR-11]

# Metrics
duration: 6min
completed: 2026-06-22
status: complete
---

# Phase 28 Plan 02: Pass de match de abastecimento em ingestStatement Summary

**`ingestStatement` ganhou a camada de match do vínculo reverso — duas queries batched (abastecimentos não-vinculados via `.is('transaction_id', null)` SEM filtro de data + count das parcelas na junção via `.in(...)`) fora do loop de linhas (WR-02/D-02), `assignAbastecimentoMatches` do módulo puro do Plano 01 rodando o greedy 1:1 (D-04) sobre as linhas, e o `row.abastecimentoMatch` não-vinculante anexado antes do persist — sem auto-commit, espelhando o PASS 2 da IA.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- **Pass de match batched (WR-02):** um pré-fetch espelhando o molde existente (categoryList/keywordRules/dupSet) — `supabase.from('abastecimentos').select(...).is('transaction_id', null)` (L491, sem `.gte`/`.lte` de data, D-02) + um count das parcelas já na junção `abastecimento_parcelas` via UMA `.in('abastecimento_id', abastIds)` (L504) montando o `Map<id, jaParceladas>` em O(1). Ambas as queries ficam ANTES do loop do PASS 1 (L532) e de qualquer `for (const row of rows)` — zero query per-row.
- **Candidatos a partir do shape canônico do Plano 01:** `AbastecimentoMatchCandidate` montado de (fetch + count), descartando localmente só o carro órfão (apelido ausente sob RLS); a regra de capacidade (à-vista consumido / parcelado completo) fica em UMA fonte — o módulo puro D-04.
- **Assign + attach sem auto-commit:** `assignAbastecimentoMatches(rows-por-dedupe_key, candidates)` produz o `Map<dedupe_key, AbastecimentoMatch>`; o attach (mirror do PASS 2 da IA, L602+) seta SÓ `row.abastecimentoMatch` — nunca `category_id`/`carro_id` — antes do persist de `parsed_rows` (servidor é a fonte da verdade do palpite, igual à suggestion). Lista de candidatos vazia → o assign é pulado (degrada limpo, igual ao skip da IA quando não há miss).

## Task Commits

1. **Task 1: pass de match batched em ingestStatement** - `1ebd81e` (feat)

## Files Created/Modified
- `src/actions/import.ts` (modificado) — import de `assignAbastecimentoMatches` + `AbastecimentoMatchCandidate` do módulo puro; o pré-fetch batched dos abastecimentos não-vinculados + count na junção (após o dupSet, antes do PASS 1); e o attach do `row.abastecimentoMatch` (após o PASS 2 da IA, antes do persist de `parsed_rows`).

## Decisions Made
- **Linha-id no assign = `dedupe_key`:** ingestStatement não dá um id estável às linhas até o confirm; o `dedupe_key` (já computado batched em `keysByRaw`) é a chave determinística para o `Map` de retorno e o attach — espelha como a `suggestion` da IA é mapeada por `descriptor_norm`.
- **Pool não-vinculado = `.is('transaction_id', null)`:** cobre à-vista não-vinculado E parcelado (que por CHECK 0039 é sempre `transaction_id null` — os vínculos vivem na junção). Nenhum filtro de data (D-02). RLS escopa ao caller — sem `.eq('user_id', …)`.
- **Capacidade em uma fonte só:** o action não reimplementa "à-vista já consumido" / "parcelado completo" — entrega o pool + `jaParceladas` ao módulo puro, que aplica D-04 (greedy 1:1 + ≤1 parcela nova/fatura).

## Deviations from Plan

None - plano executado exatamente como escrito. O único refinamento (id da linha = `dedupe_key`) já estava implícito no `<read_first>` da Task 1 (`row.id ?? row.dedupe_key`) — as linhas do ingest não têm `id`, então `dedupe_key` é a chave canônica.

## Issues Encountered
None. `npx tsc --noEmit` limpo de primeira; o join `carros(apelido)` veio tipado como objeto singular (mesmo shape do `categories(sort)` existente), acessado via `a.carros?.apelido`.

## User Setup Required
None.

## Next Phase Readiness
- **Plano 03 (link-write):** o `abastecimentoMatch` já viaja persistido em `parsed_rows`; o `confirmImport` re-deriva de posse do `abastecimentoId` (via `assertOwnedAbastecimento` do Plano 01) e grava o vínculo (à-vista: `transaction_id`; parcela: linha na junção) — nunca confiando no payload do cliente (T-28-02/03).
- **Plano 04 (grid):** `ParsedReviewRow.abastecimentoMatch` chega populado do parse para a célula de Carro renderizar a dica.
- Sem blockers. `npx tsc --noEmit` limpo; `npx vitest run src/lib/carro/abastecimento-match.test.ts` 16/16 verde.

## Threat Surface

T-28-02 (Information Disclosure) mitigado: o fetch dos candidatos roda sob o cliente RLS-ativo (sem app-layer user_id) — só os abastecimentos do caller entram no pool. T-28-03 (Tampering) aceito: o match é só um palpite não-vinculante persistido; o write de vínculo (com re-derive de posse) é do Plano 03, não deste pass.

## Self-Check: PASSED

- Files: `src/actions/import.ts`, `28-02-SUMMARY.md` — FOUND.
- Commit: `1ebd81e` — FOUND.

---
*Phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count*
*Completed: 2026-06-22*
