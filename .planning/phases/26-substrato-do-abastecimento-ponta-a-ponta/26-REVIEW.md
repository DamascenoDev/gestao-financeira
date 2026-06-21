---
phase: 26-substrato-do-abastecimento-ponta-a-ponta
reviewed: 2026-06-21T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - supabase/migrations/0039_abastecimento_parcelado.sql
  - supabase/migrations/0040_categorias_combustivel.sql
  - tests/abastecimento-cost-check.test.ts
  - tests/abastecimento-parcelas.test.ts
  - tests/categorias-combustivel.test.ts
  - tests/carro-consumo.test.ts
  - tests/carro-rls.test.ts
  - tests/seed-categories.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-06-21
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed two SQL migrations (`0039` parcelamento substrate, `0040` Combustível category)
and the six integration tests that gate them, against the sibling migrations `0027`
(carros base), `0029` (consumo same-odometer fix), `0035` (Marketplace category seed),
and `0002` (categories base) used as the contract baselines.

The four review focal points all hold up:

- **RLS on `abastecimento_parcelas`** is correct — `(select auth.uid()) = user_id` in
  both `using` and `with check`, `for all to authenticated`, RLS enabled, identical to the
  0027 `own abastecimentos` policy. The cross-user *read* leak is closed.
- **`security_invoker = true`** is restated on the rewritten `v_abastecimento_consumo`
  view (`create or replace view` resets it to definer otherwise — correctly re-stated).
- **`security definer` + `set search_path = public`** are both present on the re-seeded
  `handle_new_user()`, matching the 0002/0035 privilege-escalation mitigation.
- **The relaxed `abastecimentos_cost_xor` CASE truth table is sound.** Every one of the 9
  states in the test matrix maps to the documented PASS/REJECT, money columns stay
  positive-or-null (`valor_total_cents > 0`), and the parcelado/à-vista cost models are
  kept structurally disjoint. The `parcelas_total = 1` boundary correctly falls into the
  à-vista branch.

The view rewrite is a faithful copy of the LIVE 0029 body with only the two cost
expressions swapped to the parcelado-aware CASE — the WR-02 identity-anchored interval
membership and WR-05/06 guards are preserved verbatim. Both migrations are replay-clean.

The findings below are integrity gaps and coverage gaps, not correctness bugs in the
happy path. None block ship, but two warrant a follow-up before the Phase 27/28 action
layer is built on top.

## Warnings

### WR-01: Junction allows cross-user `abastecimento_id` / `transaction_id` references

**File:** `supabase/migrations/0039_abastecimento_parcelado.sql:85-108`
**Issue:** The `abastecimento_parcelas` RLS policy gates only on the *denormalized*
`user_id` column (`(select auth.uid()) = user_id`), which the inserting client sets
itself. Nothing forces `abastecimento_id` or `transaction_id` to belong to that same
user. The FKs only check row *existence*, not ownership; the junction's own RLS never
inspects the parent rows. A client that knows (or guesses) another user's
`abastecimento_id` can insert a row with `user_id = <self>`, `abastecimento_id = <victim's
abastecimento>` — the insert passes RLS and both unique constraints. This is a data-
integrity / cross-user-write poisoning gap (it does NOT leak the victim's data on read,
because `v_abastecimento_consumo` and `v_carro_resumo` scope by their own `user_id`).

This mirrors the *pre-existing* pattern on `abastecimentos` itself (its `carro_id` /
`transaction_id` are likewise not ownership-checked at the DB layer), so it is consistent
with the codebase, and the migration's own header (lines 25-33) explicitly defers the
cross-row residual to the Phase 27/28 action layer. Flagged so that deferral is a
*conscious* decision and the action layer actually closes it, not an oversight.

**Fix:** Either add a `with check` predicate that verifies ownership of the referenced
rows (requires a subquery, which Postgres RLS `with check` supports), e.g.

```sql
create policy "own abastecimento_parcelas" on public.abastecimento_parcelas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.abastecimentos a
      where a.id = abastecimento_id and a.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.user_id = (select auth.uid())
    )
  );
```

…or explicitly document in the Phase 27/28 action plan that the server action MUST verify
`abastecimento.user_id === transaction.user_id === session.user.id` before inserting, and
add an integration test asserting a cross-user junction insert is rejected.

### WR-02: No test covers `parcelas_total = 1` (the parcelado/à-vista branch boundary)

**File:** `tests/abastecimento-cost-check.test.ts:119-210`
**Issue:** The CHECK branches on `parcelas_total is not null and parcelas_total > 1`. The
boundary value `parcelas_total = 1` is the exact point where a row flips from the
parcelado branch to the à-vista branch — it must behave like an à-vista row (require one
of transaction_id/amount_cents, forbid valor_total_cents). The 9-row truth table only ever
sets `parcelas_total` to `null` or `3`; the `= 1` boundary is never exercised. A future
regression that changed `> 1` to `>= 1` (or dropped the `parcelas_total_chk` lower bound)
would slip through the entire suite. The `abastecimentos_parcelas_total_chk` (`>= 1 or
null`) lower bound is also never asserted (`parcelas_total = 0` should REJECT).

**Fix:** Add two rows to the truth-table test: (a) `parcelas_total = 1, amount_cents set,
V null` → PASS (treated as à-vista); (b) `parcelas_total = 1, valor_total_cents set, T/A
null` → REJECT (à-vista branch forbids V). Optionally add `parcelas_total = 0` → REJECT to
pin `abastecimentos_parcelas_total_chk`.

### WR-03: REJECT-row tests do not pin the error code, so a wrong-constraint failure passes

**File:** `tests/abastecimento-cost-check.test.ts:170-209`, `tests/abastecimento-parcelas.test.ts:150-172`
**Issue:** Only the "à-vista neither" case asserts `error?.code === '23514'` (line 167).
Every other REJECT case asserts merely `expect(error).not.toBeNull()`. That is too weak:
e.g. the "à-vista with V leak" row (line 170) reuses `txParceladoId` as its
`transaction_id` — if that tx had already been linked by an earlier test, the row would be
rejected by the `abastecimentos_transaction_uniq` index (`23505`) instead of the cost
CHECK (`23514`), and the test would still go green while proving nothing about the CHECK
under test. Same weakness in the junction test: a `23502` (not-null) or unrelated failure
would pass the `not.toBeNull()` assertion. (In this file `txParceladoId` happens to be
fresh per REJECT row by ordering, but the assertion does not *guarantee* it.)

**Fix:** Pin the expected SQLSTATE on each REJECT assertion: `expect(error?.code).toBe(
'23514')` for the cost-CHECK rows, and `expect(error?.code).toBe('23505')` for the
unique-violation rows in `abastecimento-parcelas.test.ts`. This makes the test assert the
*specific* constraint fired, not just "some error".

### WR-04: Idempotency test asserts COUNT but never actually re-runs the migration backfill

**File:** `tests/categorias-combustivel.test.ts:66-95`
**Issue:** The test is titled "backfill is idempotent — re-running the backfill does not
duplicate", but it never re-runs the `where not exists` backfill from `0040`. It checks
whether the row exists and inserts *only if missing* (lines 78-86) — which, given the
signup seed already created it, is always a no-op insert that is never executed. The final
`length === 1` assertion therefore passes trivially without ever exercising the backfill's
guard. The real idempotency risk — running the `0040` part-(2) `insert … select … where
not exists` a second time on an account that already has the row — is not tested. (The
production replay path is migration re-application, which this never simulates.)

**Fix:** Execute the actual backfill SQL twice via `admin` (service role) and assert the
count stays at 1, e.g.

```ts
const backfill = `
  insert into public.categories (user_id, name, kind, sort, is_reserva)
  select p.user_id, 'Combustível', 'consumo', 4, false
    from public.profiles p
   where not exists (
     select 1 from public.categories c
      where c.user_id = p.user_id and c.name = 'Combustível')`
await admin.rpc(/* or a raw-SQL helper */)  // run backfill once
await admin.rpc(/* … */)                     // run backfill again
// then assert exactly one 'Combustível' for userA
```

If no raw-SQL execution helper exists in the harness, at minimum insert a *second*
`Combustível` via the guarded predicate path and assert the guard suppressed it — do not
gate the insert on a JS-side existence check that mirrors the guard.

## Info

### IN-01: `0040` backfill creates a duplicate `sort = 4` tie with existing `Saúde`

**File:** `supabase/migrations/0040_categorias_combustivel.sql:45-52`
**Issue:** For *existing* accounts, the backfill inserts `Combustível` at `sort = 4` while
`Saúde` already sits at `sort = 4` (it was seeded there by `0002`/`0035` and is NOT
renumbered). `categories.sort` has no unique constraint, so this is legal, and the
migration header (lines 42-44) explicitly calls it a "cosmetic display-order tie." The
result is a non-deterministic ordering between `Combustível` and `Saúde` in any UI list
that sorts purely by `sort`. New signups (via the re-seeded trigger) do not have this
problem because the trigger shifts Saúde→13 down. The asymmetry between new vs. existing
accounts is a known, documented trade-off — noting it so the UI layer adds a stable
secondary sort key (e.g. `order by sort, name`).

**Fix:** None required at the SQL layer (matches the 0035 precedent). Ensure the category
list UI orders by `(sort, name)` or `(sort, id)` so the tie renders deterministically.

### IN-02: Migration `0040` `is_reserva` value relies on column existing — no defensive guard

**File:** `supabase/migrations/0040_categorias_combustivel.sql:22-35,45`
**Issue:** Both the re-seed and the backfill write the `is_reserva` column. This is correct
(the column was added in `0012`), but `0040` carries no `add column if not exists` guard of
its own — it is fully dependent on `0012` having run. This is the normal forward-migration
contract and is fine in a linear migration chain; noted only for completeness since the
file header claims "no schema change" (true) while assuming a schema feature from three
migrations back.

**Fix:** None. Behavior is correct under ordered migration application.

### IN-03: `litros` interval sum is unfiltered by cost model — confirm intended

**File:** `supabase/migrations/0039_abastecimento_parcelado.sql:186-194`
**Issue:** The `litros_intervalo` subquery sums `s.litros` across every fill in the
interval regardless of parcelado/à-vista, while `custo_intervalo_cents` (lines 195-209)
branches per row. This is correct — `litros` is a volume that always counts toward the
interval, only the *cost source* differs by model. Verified against the
`carro-consumo.test.ts` parcelado fixture (lines 362-383), which asserts
`litros_intervalo === PARCELADO_LITROS` and `custo_intervalo_cents ===
PARCELADO_VALOR_TOTAL_C` counted once. No defect — recorded as a positive confirmation of
the no-double-count invariant the migration was written to guarantee.

**Fix:** None.

---

_Reviewed: 2026-06-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
