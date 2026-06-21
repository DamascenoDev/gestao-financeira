---
phase: 26-substrato-do-abastecimento-ponta-a-ponta
plan: 02
subsystem: abastecimento/schema
status: complete
tags: [migration, rls, security_invoker, parcelamento, check-constraint, junction-table]
requires:
  - "26-01 (Wave 0 failing tests: cost-check, parcelas, carro-consumo parcelado fixture)"
  - "supabase/migrations/0029_consumo_same_odometer_fix.sql (LIVE view body — rewrite base)"
  - "supabase/migrations/0027_carros.sql (abastecimentos table + RLS policy shape)"
provides:
  - "supabase/migrations/0039_abastecimento_parcelado.sql (relaxed CHECK + 2 columns + junction + view rewrite)"
  - "abastecimento_parcelas junction table (RLS-scoped, double-link-preventing uniques)"
  - "abastecimentos.parcelas_total + abastecimentos.valor_total_cents columns"
  - "relaxed abastecimentos_cost_xor (attach-later + parcelado truth table)"
  - "v_abastecimento_consumo rewritten (parcelado cost once, no double-count, security_invoker)"
  - "src/types/database.types.ts regenerated (new table + 2 columns)"
affects:
  - "Phase 27/28 (parcelado action wiring builds on this junction + columns)"
  - "Plan 26-04 (Wave 2 full-suite gate with 0039 + 0040 both present)"
tech-stack:
  added: []
  patterns:
    - "Drop-then-add idempotent CHECK with CASE branch on parcelado marker"
    - "RLS-scoped junction cloned 1:1 from 0027 'own abastecimentos' policy"
    - "create or replace view re-stating security_invoker = true (Pitfall 4)"
    - "Cost CASE: parcelas_total > 1 then valor_total_cents else coalesce(real, esperado)"
key-files:
  created:
    - "supabase/migrations/0039_abastecimento_parcelado.sql"
  modified:
    - "src/types/database.types.ts"
decisions:
  - "v_carro_resumo LEFT UNTOUCHED (reads off rewritten consumo view + transactions tag) — matches 0028/0029 precedent"
  - "Cross-row tx double-link residual documented as action-layer invariant (Phase 27/28), NOT a P26 DB constraint (RESEARCH A1)"
  - "valor_total_cents positive-or-null CHECK inline on the column (mirrors amount_cents at 0027 L56)"
metrics:
  duration: ~5 min
  tasks: 2
  files: 2
  completed: 2026-06-21
---

# Phase 26 Plan 02: 0039 Abastecimento Parcelado Migration Summary

The Wave 1 schema substrate for fuel-up parcelamento (FUEL-01): one migration that relaxes the strict cost XOR to the attach-later + parcelado truth table, adds `parcelas_total`/`valor_total_cents`, creates the RLS-scoped `abastecimento_parcelas` junction with double-link-preventing unique constraints, and rewrites `v_abastecimento_consumo` off the LIVE 0029 body so parcelado cost is `valor_total_cents` counted exactly once — with the à-vista 1:1 path (`abastecimentos_transaction_uniq`) untouched for zero v1.2 regression.

## What Was Built

**Task 1 — `supabase/migrations/0039_abastecimento_parcelado.sql`** (commit `dd1aabd`)

Four replay-idempotent sub-parts:

- **Sub-part B (columns):** `parcelas_total int` + `valor_total_cents bigint` (positive-or-null CHECK inline, mirroring `amount_cents`), plus a `parcelas_total >= 1 or null` guard. Added FIRST so the relaxed CHECK can compile against them.
- **Sub-part A (relaxed CHECK):** drop-then-add `abastecimentos_cost_xor` with the CASE predicate from RESEARCH Pattern 1 — parcelado branch (`parcelas_total > 1`): `valor_total_cents not null AND transaction_id null AND amount_cents null`; à-vista branch (else): `not(both null) AND valor_total_cents null`. Loosens v1.2 "exactly one" to "at least one" (attach-later legal) while keeping "neither" rejected.
- **Sub-part C (junction):** `abastecimento_parcelas` (id, user_id, abastecimento_id, transaction_id, parcela_num, created_at) with `unique(transaction_id)` + `unique(abastecimento_id, parcela_num)` + `parcela_num > 0` CHECK, two indexes, RLS enabled, grants to authenticated/service_role, and the "own abastecimento_parcelas" policy cloned 1:1 from 0027.
- **Sub-part D (view rewrite):** `v_abastecimento_consumo` rewritten VERBATIM from the 0029 body (id-anchored interval tuple, WR-02/05/06 preserved), changing ONLY the cost expression at the two sites (fills CTE per-row cost + interval subquery sum) to the parcelado-aware CASE. `with (security_invoker = true)` re-stated; grant re-issued.

Header pins the centavos/litros/security_invoker invariants and documents the cross-row double-link residual as a Phase 27/28 action-layer invariant.

**Task 2 — `src/types/database.types.ts` regenerated** (commit `570cf2b`)

`npm run db:reset` (exit 0, clean replay through 0039) then `npm run gen:types` (exit 0). Diff is purely additive (55 insertions, 0 deletions), scoped exactly to the new `abastecimento_parcelas` table type + `parcelas_total`/`valor_total_cents` on Row/Insert/Update — nothing in `categories` or `handle_new_user`. Codegen output only, not hand-edited.

## Verification

- `grep` confirms `security_invoker = true` present in 0039; `abastecimentos_transaction_uniq` appears ONLY in preserve comments (never dropped/altered).
- `npm run db:reset` exits 0 (clean ordered replay through 0039 on the local stack).
- `git diff src/types/database.types.ts` scoped to the junction table + 2 columns, additive only.
- **Wave 0 tests turn GREEN against 0039:**
  - `tests/abastecimento-cost-check.test.ts` — 9-row relaxed-CHECK truth table: all PASS/REJECT(23514) rows correct.
  - `tests/abastecimento-parcelas.test.ts` — junction uniques (tx + abast/num), attach-later re-link legal, RLS isolation.
  - `tests/carro-view-leak.test.ts` — security_invoker anti-leak holds.
  - `tests/carro-consumo.test.ts` — parcelado no-double-count fixture (custo == valor_total_cents).
  - Combined: 18 + 8 = 26 tests passed.

## Deviations from Plan

None — plan executed exactly as written. The migration follows the RESEARCH Pattern 1/2/3 SQL verbatim and the Wave 0 tests (which define correctness) all pass without any test edits.

## Notes / Gotchas

- **Env-flakiness (known, MEMORY):** the first Wave 0 test run failed with `createUser failed: {}` because `npm run db:reset` restarts the Supabase containers and the GoTrue auth service briefly 502'd during the restart window. Auth returned to 200 once containers settled (~1 min); the re-run passed 18/18 with no code change. This is the documented "Supabase integration tests are env-flaky" gotcha, not a schema defect. Plan 04's full-suite gate should allow for an auth warm-up after db:reset.
- **0040 not yet on disk:** the parallel Wave 1 seed plan (26-03) had not written `0040` at execution time; per the plan this is fine — the scoped-diff assertion holds regardless since 0040 adds no gen:types diff. The full clean-replay + full-suite gate with both migrations present is owned by Plan 04.

## Self-Check: PASSED

- FOUND: supabase/migrations/0039_abastecimento_parcelado.sql
- FOUND: src/types/database.types.ts (modified, contains abastecimento_parcelas)
- FOUND commit: dd1aabd (Task 1 migration)
- FOUND commit: 570cf2b (Task 2 types)
