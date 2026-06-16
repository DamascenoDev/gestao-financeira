---
phase: 03-metas-ader-ncia-e-reservas
plan: 02
subsystem: phase3-wave0-tests
tags: [vitest, integration-tests, rls, security-invoker, idor, toctou, adherence, basis-points, reserva-ledger, derived-balance, allocation-grouping, nyquist, BUD, RSV]
requires:
  - 03-01 substrate (migrations 0011-0016, v_adherence_month/_ytd, v_reserva_balance, register_reserva_saida, is_reserva, src/lib/adherence.ts)
  - tests/helpers/local-supabase.ts (two-user harness: serviceClient/userClient + createUser)
  - tests/view-leak.test.ts + tests/rls-isolation.test.ts + tests/category-idor.test.ts (Phase-1/2 patterns cloned)
provides:
  - tests/reserva-balance.test.ts (RSV-05 derived saldo = Σin−Σout, no stored column)
  - tests/reserva-saida.test.ts (RSV-04 atomic never-negative saída incl. concurrent)
  - tests/reserva-aporte.test.ts (RSV-02/03 aporte = alocação only, the #1 double-count guard)
  - tests/reserva-idor.test.ts (forged reserva_id rejected by ownership re-derive + RPC)
  - tests/reserva-crud.test.ts (RSV-01 optional alvo + cascade delete)
  - tests/budget-target-crud.test.ts (BUD-01 one-meta-per-category upsert + domain)
  - tests/budget-target-direction.test.ts (BUD-01 both directions; action-default RED-pending 03-03)
  - tests/adherence-month.test.ts (BUD-02 meta half-up + adherence_bp + /0 guard)
  - tests/adherence-consistency.test.ts (BUD-02/03 single-month year month==ytd)
  - tests/adherence-ytd.test.ts (BUD-03 civil-year accumulation)
  - src/lib/adherence.test.ts (BUD-04 unit: 80/100 thresholds + percent-never-NaN)
  - tests/view-leak.test.ts (extended: 3 new security_invoker views)
  - tests/rls-isolation.test.ts (extended: budget_targets, reservas, reserva_ledger)
  - supabase/migrations/0017_register_reserva_saida_lock.sql (Rule-1 fix: lock reservas row so concurrent saídas serialize)
affects:
  - 03-03 (dashboard slice — turns budget-target-direction action-default GREEN; reads the adherence views these tests pin)
  - 03-04 (reservas slice — registerSaida + assertOwnedReserva proven correct by reserva-saida/reserva-idor)
  - 03-05 (aporte sub-flow — reserva-aporte pins the alocação-grouping contract the sub-flow must preserve)
tech-stack:
  added: []
  patterns:
    - "Wave-0 integration tests clone the two-user local-supabase harness verbatim (serviceClient setup → userClient RLS-active assertions); no new framework"
    - "IDOR two-half proof reused for reserva_id (category-idor pattern): RAW caller-owned insert ACCEPTS a foreign FK target → ownership re-derive REJECTS it → RLS alone is insufficient"
    - "alocação grouping pinned by baseline-then-aporte diff: assert ONLY the alocação total rose by the aporte and EVERY consumo total is byte-identical (RSV-03 double-count guard)"
    - "monthly↔YTD consistency pinned via a single-month civil year: the two windows coincide so identical adherence_bp/realized/meta is required"
    - "concurrent-saída TOCTOU pinned via Promise.allSettled of two oversized saídas → assert saldo_cents >= 0 (caught a real bug in 0016)"
key-files:
  created:
    - tests/reserva-balance.test.ts
    - tests/reserva-saida.test.ts
    - tests/reserva-aporte.test.ts
    - tests/reserva-idor.test.ts
    - tests/reserva-crud.test.ts
    - tests/budget-target-crud.test.ts
    - tests/budget-target-direction.test.ts
    - tests/adherence-month.test.ts
    - tests/adherence-consistency.test.ts
    - tests/adherence-ytd.test.ts
    - src/lib/adherence.test.ts
    - supabase/migrations/0017_register_reserva_saida_lock.sql
  modified:
    - tests/view-leak.test.ts
    - tests/rls-isolation.test.ts
decisions:
  - "register_reserva_saida concurrent-overdraw was a REAL TOCTOU bug, not a test artifact: 0016 read v_reserva_balance then inserted, but the read-then-insert pair was not serialized — two near-concurrent oversized saídas both read the pre-insert balance, both passed amount<=saldo, both inserted → saldo went to −20000. Fixed in 0017 with `select id from reservas where id=$1 and user_id=auth.uid() for update` BEFORE the balance read, serializing per-reserva saídas under the caller's RLS (IDOR-safe). The function signature is unchanged so database.types.ts needed no regen."
  - "budget-target-direction's action-default assertion (consumo→teto, alocacao→alvo) is `it.skip('[03-03] ...')` — the default lives in upsertBudgetTarget which ships in 03-03. The DB/schema half (both directions accepted, override persists, invalid rejected) is GREEN now. This is the only intentionally-RED Wave-0 assertion."
  - "All other 9 Wave-0 behaviors are GREEN NOW against the 03-01 substrate — they are data-layer guarantees (migrations/views/RPC), so they pin the contract before the UI slices (03-03/04/05) implement against it (Nyquist)."
metrics:
  duration: ~13 min
  completed: 2026-06-16
---

# Phase 3 Plan 02: Wave-0 Tests (Metas / Aderência / Reservas) Summary

The nine Wave-0 integration tests from 03-VALIDATION.md plus the pure `adherence.ts` unit test, all authored against the LIVE 03-01 substrate and extending the Phase-1/2 view-leak/rls-isolation harnesses — pinning every Phase-3 correctness contract (derived balance, never-negative saída including concurrency, the aporte alocação-grouping double-count guard, reserva_id IDOR rejection, adherence math, and monthly↔YTD consistency) before the UI slices implement against them. Authoring the concurrent-saída test **caught a real TOCTOU overdraw bug** in the 03-01 `register_reserva_saida` RPC, fixed in migration 0017 with a per-reserva row lock.

## What Was Built

**Task 1 — Reserva + adherence integration tests + TOCTOU fix (commit c1484df).**
- `reserva-balance.test.ts` (RSV-05): seeds ledger ins/outs → `v_reserva_balance.saldo_cents == Σin − Σout` (120000 from 100000+50000−30000); empty reserva reads 0; selecting a `saldo_cents` column on the `reservas` table errors (proves balance is derived, not stored).
- `reserva-saida.test.ts` (RSV-04): `register_reserva_saida` ≤ saldo inserts an 'out' + returns an id; > saldo raises with a 'saldo' message and leaves the balance unchanged; 0/negative rejected (P0001); **two near-concurrent oversized saídas leave `saldo_cents >= 0`**.
- `reserva-aporte.test.ts` (RSV-02/03 — highest value): seeds income + a consumo teto + a Reserva alvo + a consumo expense baseline, then inserts a Reserva-category transaction + a linked `reserva_ledger 'in'` and asserts the alocação total rose by exactly the aporte while **every consumo total is byte-identical to baseline**; a second test asserts the aporte cents never appear in any `kind='consumo'` adherence row.
- `reserva-idor.test.ts` (IDOR): a RAW caller-owned ledger insert pointing at user B's `reserva_id` is ACCEPTED (RLS checks the row's own `user_id`, not the FK target's owner); the ownership re-derive (`select id from reservas where id=$1` under the caller's RLS) returns 0 for the foreign id and 1 for the owned id; `register_reserva_saida` on the foreign reserva aborts.
- `reserva-crud.test.ts` (RSV-01): create with/without `alvo` (null allowed), update nome+alvo, non-positive alvo rejected, delete cascades the ledger.
- `view-leak.test.ts` (extended): user A seeds a budget_target + reserva + ledger; a new describe asserts user B reads ZERO of user A's `v_adherence_month`, `v_adherence_ytd`, `v_reserva_balance` rows (security_invoker proof, T-03-T1).
- `rls-isolation.test.ts` (extended): `budget_targets`, `reservas`, `reserva_ledger` appended to TABLES with neutral insert shapes (placeholder FK UUIDs — RLS WITH CHECK rejects on `user_id` before the FK resolves); user B cannot SELECT/INSERT/UPDATE/DELETE user A's rows in each.
- `0017_register_reserva_saida_lock.sql` ([Rule 1 — Bug]): hardens the saída RPC with `select id from reservas where id=$1 and user_id=auth.uid() for update` before the balance read, serializing concurrent saídas per reserva.

**Task 2 — Budget-target + adherence math/consistency + adherence.ts unit (commit 94acb80).**
- `src/lib/adherence.test.ts` (BUD-04, pure unit, GREEN): the teto branch (no-limite <80 / aproximando 80–<100 / estourou ≥100) and alvo branch (abaixo / quase-la / atingido) with inclusive 8000/10000 thresholds; null bp → sem-receita; `adherenceTokens` resolves non-empty fill/text/label for all 7 statuses; `formatBpAsPercent` renders `72,5%` / `100%` and returns `—` for null/Infinity/NaN.
- `budget-target-crud.test.ts` (BUD-01): insert round-trips; a second target for the same category via upsert on `(user_id, category_id)` updates (one meta per category); raw duplicate insert violates the unique constraint; `percent_bp` 0 and 10001 rejected; update + delete.
- `budget-target-direction.test.ts` (BUD-01): consumo accepts teto, alocacao accepts alvo, a consumo→alvo override persists, invalid direction rejected; the action-default assertion is `it.skip('[03-03] upsertBudgetTarget ...')`.
- `adherence-month.test.ts` (BUD-02): `meta_cents == (income*bp+5000)/10000` (240000 for 800000×30%), `adherence_bp == realized*1e8/(income*bp)` (7500 for 180000/240000), and a no-income user → `income_cents 0`, `meta_cents 0`, `adherence_bp null`.
- `adherence-consistency.test.ts` (BUD-02/03): a single-month civil year with a consumo + a Reserva aporte → per-category `adherence_bp` (and realized + meta) from `v_adherence_month` equals `v_adherence_ytd`.
- `adherence-ytd.test.ts` (BUD-03): income 500000(Mar)+700000(Jun) and spend 80000+120000 → YTD `income_cents 1200000`, `realized_cents 200000`, meta 360000, exact adherence_bp.

## Verification Results

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` (full suite): **221 passed | 1 skipped** across **30 files** (up from the 155/19 baseline — 66 new tests across 11 new/extended files; the 1 skip is the intentional 03-03 RED-pending direction default).
- Task 1 set (`reserva-* view-leak rls-isolation`): 7 files, 56 passed.
- Task 2 set (`budget-target-* adherence-* src/lib/adherence.test.ts`): 6 files, 33 passed + 1 skipped.
- `npx tsc --noEmit`: clean (exit 0).
- `npm run db:reset`: migrations 0001–0017 apply cleanly (0017 added).
- The concurrent-saída test, run in isolation before AND after the 0017 fix, confirmed the bug (saldo −20000 pre-fix) and the fix (saldo ≥ 0, all 4 saída tests pass post-fix).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] register_reserva_saida concurrent-overdraw TOCTOU**
- **Found during:** Task 1 (authoring `reserva-saida.test.ts`, the Promise.allSettled concurrent assertion).
- **Issue:** 03-01's `0016_register_reserva_saida.sql` read `saldo_cents` from `v_reserva_balance` and then inserted the 'out' row in the same function body, but that read-then-insert pair was NOT serialized. Two near-concurrent oversized saídas (60000 + 60000 against a 100000 balance) each read the same pre-insert balance, both passed the `amount <= saldo` check, and both inserted — driving the balance to −20000. The RPC's own comment claimed "TOCTOU-safe," but a same-statement read of a derived view does not lock anything. This is the exact RSV-04 / Pitfall-4 invariant the Wave-0 test exists to pin, and the plan states this test must PASS against the Plan-01 schema.
- **Fix:** New migration `0017_register_reserva_saida_lock.sql` re-creates the function with `select id from public.reservas where id = p_reserva_id and user_id = (select auth.uid()) for update` BEFORE the balance read. Per-reserva saídas now serialize: the second waits for the first to commit, re-reads the reduced balance, and is rejected if it no longer fits. The lock is scoped to the caller's RLS (a foreign reserva returns no row → still aborts, IDOR-safe). SECURITY INVOKER and the pinned `search_path` are unchanged; the function signature is identical so `database.types.ts` needed no regen.
- **Files modified:** `supabase/migrations/0017_register_reserva_saida_lock.sql` (created).
- **Commit:** c1484df.

### Plan-intent adjustments (no permission needed)

- **budget-target-direction action-default as `it.skip` [plan-sanctioned RED-pending]:** the plan's `<action>` explicitly allows the direction-default assertion to start RED referencing 03-03's `upsertBudgetTarget`. Structured so the DB/schema half is GREEN now and the action half is a clearly-labeled `it.skip('[03-03] ...')` to flip when the action ships.
- **rls-isolation FK placeholders:** `budget_targets` / `reserva_ledger` neutral insert rows use `crypto.randomUUID()` for `category_id` / `reserva_id` because RLS `WITH CHECK` rejects on `user_id = userA.id` BEFORE any FK is resolved — a real owned FK target is unnecessary to prove insert-isolation (mirrors the existing neutral-row approach).

## Authentication Gates
None — the local Supabase stack was already running (03-01 left it up); `db:reset`, the full suite, and `tsc` all ran without an auth gate.

## Known Stubs
None. Every test runs against the live substrate. The single `it.skip` is a plan-sanctioned forward reference to 03-03's `upsertBudgetTarget`, not a stub — the contract it will assert (direction default from kind) is already documented and the DB half is covered now.

## Threat Surface
No new product surface — this plan is tests + one RPC hardening. The 0017 fix strengthens an existing mitigation (T-03-T4, concurrent saída overdraw) rather than adding surface. The Wave-0 tests are the executable proof of the 03-01 threat register: T-03-T1 (view-leak extension), T-03-T2 (reserva-idor), T-03-T3 (reserva-aporte alocação grouping), T-03-T4 (reserva-saida concurrent never-negative, now actually enforced via 0017).

## Wave-0 / Nyquist Status
- **GREEN now (data-layer guarantees, 8 of 9 + unit):** budget-target (CRUD + RLS), adherence-consistency (monthly↔YTD), allocation-grouping (aporte), adherence-leak (security_invoker), reserva-balance, reserva-saida (incl. concurrent, post-0017), reserva-aporte, reserva-idor, plus the `adherence.ts` unit (80/100 + percent format).
- **RED-pending until a UI slice lands:** the single `budget-target-direction` action-default assertion (`it.skip`) → turns GREEN in **03-03** when `upsertBudgetTarget` ships the consumo→teto / alocacao→alvo default.
- 03-VALIDATION.md can now be marked `wave_0_complete: true` / `nyquist_compliant: true`.

## Local Stack
Left **running** for 03-03 — API at http://127.0.0.1:55321 with migrations 0001-0017 applied and `database.types.ts` in sync.

## Self-Check: PASSED
