---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
plan: 03
subsystem: api
tags: [abastecimento, vinculo-reverso, confirm-import, idor, importacao, car-10, car-11]

# Dependency graph
requires:
  - phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
    plan: 01
    provides: "assertOwnedAbastecimento tri-state; confirmImportRowSchema com abastecimentoId/abastecimentoKind/parcelaNum; tipo AbastecimentoMatch (carroId)"
  - phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
    plan: 02
    provides: "abastecimentoMatch persistido em statements.parsed_rows (a fonte de verdade do palpite que casou)"
  - phase: 26-substrato-do-abastecimento-ponta-a-ponta
    provides: "junção abastecimento_parcelas (0039) + unique indexes (_transaction_uniq, _num_uniq, abastecimentos_transaction_uniq) = backstop de duplo-link"
provides:
  - "confirmImport estendido: IDOR re-derive #5 do abastecimentoId ANTES de qualquer link-write; link à-vista (update transaction_id + carro_id sync); link parcelado (insert abastecimento_parcelas com parcela_num server-computed); D-09 dedupe-skip via lookup batched; 23505 → already-linked; partial-failure surface-but-keep"
  - "tests/import-abastecimento-link.test.ts: 5 invariantes DB-integration (à-vista, parcela, IDOR, dedupe-skip, duplo-link)"
affects: [28-04-grid-carro-cell, 28-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IDOR re-derive #5 espelhando VERBATIM o bloco de carro_id #4 (coleta distinct → tri-state assertOwnedAbastecimento → 'not-owned'/'error' rejeita o payload INTEIRO antes de qualquer write)"
    - "parcela_num RECOMPUTADO server-side (já-na-junção batched + atribuídas-neste-confirm + 1) — nunca confia no parcelaNum do cliente (T-28-04 tampering)"
    - "D-09/WR-02: tx dedupe-skipped resolvida por UM lookup batched .in('dedupe_key', missingKeys), nunca per-row; Map dedupe_key→txId unindo insertedByKey + existentes"
    - "Defense-in-depth de duplo-link: 23505 dos unique indexes da P26 → already-linked (swallow), nunca 500; falha não-23505 pós-insert da tx → surface-but-keep (espelha LEARN L985-989)"

key-files:
  created:
    - tests/import-abastecimento-link.test.ts
  modified:
    - src/actions/import.ts

key-decisions:
  - "carro_id sync à-vista usa r.carroId ?? r.base.abastecimentoMatch?.carroId — a escolha explícita do cliente prevalece, com o carro do match persistido (Plano 02) como fallback; ambos já IDOR-seguros (o abastecimento é do caller, logo seu carro também)"
  - "parcela_num server-computed (não confiar no payload): pre-fetch batched do count na junção por abastecimentoId (UMA .in(...)) + contador local por abastecimentoId que cresce a cada parcela atribuída neste confirm — o cliente nunca controla a numeração"
  - "linkRows = authoritativeRows.filter(abastecimentoId definido) com type guard; o link-write roda APÓS o loop insertedByKey + o aporte de reserva, ANTES do LEARN — o seam exato da D-08"
  - "kind ausente ⇒ trata como à-vista (default) — só 'parcela' segue o caminho da junção"

patterns-established:
  - "Link-write reverso no confirm: IDOR gate (#5) → resolver txId (insertedByKey ∪ lookup dedupe_key batched) → à-vista update transaction_id + carro_id sync | parcelado insert parcela com parcela_num recomputado → 23505 swallow / não-23505 surface-but-keep"

requirements-completed: [CAR-10, CAR-11]

# Metrics
duration: 4min
completed: 2026-06-22
status: complete
---

# Phase 28 Plan 03: Link-write do vínculo reverso em confirmImport Summary

**`confirmImport` agora grava o vínculo reverso no confirm (CAR-10/CAR-11) — um IDOR re-derive #5 do `abastecimentoId` via `assertOwnedAbastecimento` (tri-state) ANTES de qualquer write (espelho VERBATIM do bloco de carro_id #4, T-28-IDOR/ASVS L1), o link à-vista (`update abastecimentos.transaction_id` + sync de `carro_id` na tx) e parcelado (`insert abastecimento_parcelas` com `parcela_num` recomputado server-side), a tx dedupe-skipped resolvida por UM lookup batched `.in('dedupe_key', …)` (D-09/WR-02), o 23505 dos unique indexes da P26 mapeado para already-linked e a falha pós-insert tratada como surface-but-keep — provado por 5 invariantes DB-integration verdes.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-22T19:17:28Z
- **Completed:** 2026-06-22T19:21:07Z
- **Tasks:** 2
- **Files modified:** 2 (1 criado, 1 modificado)

## Accomplishments
- **IDOR gate #5 (D-08, T-28-IDOR — HIGH/ASVS L1):** após o IDOR de carro_id (#4), `confirmImport` coleta os `abastecimentoId` distintos do payload e chama `assertOwnedAbastecimento(supabase, id)` por id — `'not-owned'` → `'Abastecimento inválido.'`, `'error'` → retry genérico — ANTES de qualquer link-write. Um id forjado/foreign rejeita o payload INTEIRO (FKs não são RLS-aware). Espelho verbatim do bloco de carro_id.
- **Link-write à-vista + parcelado:** para cada `AuthoritativeRow` com `abastecimentoId` definido, à-vista faz `update abastecimentos set transaction_id = txId` + `update transactions set carro_id` (só carro_id, nunca category/amount — espelha abastecimentos.ts L158-166); parcelado faz `insert abastecimento_parcelas {user_id, abastecimento_id, transaction_id, parcela_num}` com `parcela_num` recomputado server-side (já-na-junção + neste-confirm + 1).
- **D-09 dedupe-skip + WR-02 batched:** as linhas com vínculo cujo dedupe_key NÃO está em `insertedByKey` (tx já existia) são resolvidas por UMA `.in('dedupe_key', missingKeys)` montando um Map dedupe_key→txId — nunca per-row. O Map une `insertedByKey` + os existentes.
- **Backstop de duplo-link + partial-failure:** um 23505 (abastecimentos_transaction_uniq / _transaction_uniq / _num_uniq) é swallow (already-linked), nunca 500; um erro não-23505 APÓS o insert da tx retorna `'As transações foram importadas, mas o vínculo do abastecimento não foi salvo.'` sem desfazer o import (surface-but-keep, espelha LEARN L985-989). `revalidatePath(CARROS_PATH)` acrescentado (o consumo vinculado muda a visão de carros).
- **5 invariantes DB-integration verdes:** à-vista vincula (transaction_id + carro_id), parcelado insere 1 parcela (parcela_num correto), IDOR (`assertOwnedAbastecimento` do id de userB sob o cliente de userA → `'not-owned'`, 0 writes), dedupe-skip ainda vincula (resolvido por dedupe_key), duplo-link (23505 → already-linked, ≤1 linha, sem 500).

## Task Commits

1. **Task 1: link-write em confirmImport** - `2207e98` (feat)
2. **Task 2: teste DB-integration (5 invariantes)** - `d96ce00` (test)

## Files Created/Modified
- `src/actions/import.ts` (modificado) — import de `assertOwnedAbastecimento` + const `CARROS_PATH`; IDOR re-derive #5 do abastecimentoId (após carro_id #4); `AuthoritativeRow` ganha `abastecimentoId`/`abastecimentoKind` (escolha do cliente); o bloco de link-write reverso (após o aporte de reserva, antes do LEARN): resolução de txId batched (D-09), à-vista update + carro_id sync, parcelado insert com parcela_num server-computed, 23505 swallow, surface-but-keep; `revalidatePath(CARROS_PATH)` no final.
- `tests/import-abastecimento-link.test.ts` (NOVO) — harness two-user clonado de import-idor.test.ts; 5 `it` provando as invariantes contra o stack local. O IDOR é testado via `assertOwnedAbastecimento` VERBATIM (o gate exato que a action roda), não re-implementado.

## Decisions Made
- **carro_id sync com fallback ao match persistido:** o à-vista sincroniza `r.carroId ?? r.base.abastecimentoMatch?.carroId ?? null` — a escolha explícita do cliente prevalece, com o carro do `abastecimentoMatch` persistido (Plano 02) como fallback. Ambos são IDOR-seguros: o abastecimentoId já foi re-derivado de posse no gate #5, então seu carro é necessariamente do caller.
- **parcela_num nunca confiado do cliente:** mesmo o schema aceitando `parcelaNum`, o servidor o RECOMPUTA (count batched na junção + contador por abastecimentoId neste confirm + 1) — atende T-28-04 (tampering). O cliente não controla a numeração; os unique indexes são o backstop final.
- **kind ausente ⇒ à-vista:** só `abastecimentoKind === 'parcela'` segue o caminho da junção; qualquer outro valor (incl. ausente) trata como à-vista (`update transaction_id`).
- **Teste via substrato (não a action):** como import-idor/import-learn-on-confirm/import-reserva-aporte, a suíte exercita o caminho de writes equivalente sob o `userClient` RLS-ativo (a action depende do `createClient` cookie-bound do Next). O gate de segurança IDOR é testado as-shipped via `assertOwnedAbastecimento`, não re-implementado.

## Deviations from Plan

None - plano executado exatamente como escrito. (O `assertOwnedAbastecimento` e os campos do schema já existiam do Plano 01; este plano só os consumiu no link-write conforme o `<action>`.)

## Issues Encountered
None. `npx tsc --noEmit` limpo de primeira; os 5 testes verdes na primeira execução contra o stack local (sem 502 de GoTrue transiente nesta run).

## Threat Surface
- **T-28-IDOR (Elevation of Privilege / IDOR, HIGH/ASVS L1) — MITIGADO E PROVADO:** o re-derive #5 via `assertOwnedAbastecimento` roda ANTES de qualquer link-write; o `it` (3) prova que o id de userB sob o cliente de userA dá `'not-owned'` e 0 linhas de vínculo de userB são gravadas. Espelho verbatim do bloco de carro_id #4.
- **T-28-04 (Tampering no parcela_num/kind) — MITIGADO:** `parcela_num` recomputado server-side; os unique indexes `_num_uniq` + `_transaction_uniq` são o backstop (23505 → already-linked).
- **T-28-05 (DoS, falha parcial pós-insert) — ACEITO:** surface-but-keep (espelha LEARN); a tx já landou, o vínculo falho é reportado mas não derruba o import. O usuário re-vincula via o caminho da P26.
- **T-28-06 (Spoofing da sessão) — MITIGADO:** `getClaims()` + cliente RLS-ativo (inalterado de confirmImport).
- Sem novas superfícies de ameaça fora do `<threat_model>` do plano.

## Next Phase Readiness
- **Plano 04 (grid):** o link-write já consome `abastecimentoId`/`abastecimentoKind` do payload + o `abastecimentoMatch` persistido para o carro_id sync; a célula de Carro do grid (Plano 04) seta esses campos no payload do confirm.
- Sem blockers. `npx tsc --noEmit` limpo; `npm test -- tests/import-abastecimento-link.test.ts` 5/5 verde contra o stack local.

## Self-Check: PASSED

- Files: `src/actions/import.ts`, `tests/import-abastecimento-link.test.ts`, `28-03-SUMMARY.md` — all FOUND.
- Commits: `2207e98` (feat link-write), `d96ce00` (test 5 invariantes) — all FOUND.

---
*Phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count*
*Completed: 2026-06-22*
