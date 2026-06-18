---
phase: 08-substrato-carro-crud-navega-o
plan: 01
subsystem: database
tags: [supabase, postgres, rls, security_invoker, migration, carros, abastecimentos, typescript]

# Dependency graph
requires:
  - phase: 05-mei
    provides: "uniform per-table RLS shape (0025) + security_invoker view pattern (0026) cloned for carros/abastecimentos and the two consumo views"
  - phase: 02-transactions
    provides: "transactions table (0005) that the additive carro_id column ALTERs"
provides:
  - "public.carros table (id, user_id→auth.users CASCADE, apelido, modelo, placa, ano, combustivel_padrao, is_archived, created_at)"
  - "public.abastecimentos table with cost XOR CHECK + partial unique index on transaction_id"
  - "transactions.carro_id nullable additive tag (ON DELETE SET NULL, non-accounting D4)"
  - "v_abastecimento_consumo + v_carro_resumo views (security_invoker = true)"
  - "uniform RLS own-row policies + grants + user_id/carro_id indexes"
  - "regenerated src/types/database.types.ts (no drift)"
  - "Wave-0 RLS isolation + view-leak tests proving cross-user non-leak"
affects: [09-etiquetar-gastos-carro, 10-abastecimento-consumo, 11-detalhe-carro-grafico]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cost XOR CHECK constraint: exactly one cost source (linked transaction_id XOR manual amount_cents)"
    - "Partial unique index on transaction_id WHERE NOT NULL (one lançamento ↔ at most one abastecimento)"
    - "Tanque-cheio interval consumption modelled via a full_fills CTE + lag() (FILTER not allowed on window functions in Postgres)"
    - "litros stored as numeric(7,3) (volume) vs money as integer centavos (bigint)"

key-files:
  created:
    - "supabase/migrations/0027_carros.sql"
    - "tests/carro-rls.test.ts"
    - "tests/carro-view-leak.test.ts"
  modified:
    - "src/types/database.types.ts"
    - ".planning/phases/08-substrato-carro-crud-navega-o/08-VALIDATION.md"

key-decisions:
  - "carro_id is a non-accounting additive tag (D4): ON DELETE SET NULL unlinks lançamentos rather than deleting them; no policy/view keys budget off it"
  - "Cost XOR CHECK (D2) enforced at the DB level — both/neither/double-link rejected regardless of app code"
  - "Both consumo views are security_invoker=true so they inherit the caller's RLS (a DEFINER view leaks every user's rows)"
  - "v_carro_resumo builds consumption averages OFF v_abastecimento_consumo so the interval logic lives in one place"

patterns-established:
  - "Tanque-cheio interval CTE: isolate tanque_cheio fills before lag() because Postgres rejects FILTER on window functions (SQLSTATE 0A000)"
  - "gasto_mes_corrente computed against date_trunc('month', now() at time zone 'America/Sao_Paulo') to pin SP month boundary"

requirements-completed: [CAR-01, CAR-06]

# Metrics
duration: 4min
completed: 2026-06-17
---

# Phase 8 Plan 01: Substrato Carro Summary

**Carro data substrate: `carros` + `abastecimentos` tables, the nullable non-accounting `transactions.carro_id` tag, two `security_invoker` consumption views (km/l + R$/km), the cost XOR CHECK + partial unique index, uniform RLS — applied to the local stack with a no-drift typed client and Wave-0 cross-user isolation proofs.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-17T15:53:23Z
- **Completed:** 2026-06-17T15:57:58Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Migration `0027_carros.sql`: both tables, the `transactions.carro_id` ALTER (ON DELETE SET NULL), both `security_invoker` views, the cost XOR CHECK, the partial unique index on `transaction_id`, uniform RLS + grants + indexes — fully idempotent.
- Applied to the LOCAL Supabase stack via `supabase migration up` (no remote push) and regenerated `src/types/database.types.ts` with 162 insertions and ZERO deletions (no drift); `npx tsc --noEmit` clean.
- Two Wave-0 integration tests (11 assertions) green against the local stack: 2-user RLS isolation across `carros`/`abastecimentos`/`transactions.carro_id`, the XOR + partial-unique DB constraints, and `security_invoker` proof for both views (User B reads zero).
- Full suite remains green at 610 passed (up from ~599).

## Task Commits

Each task was committed atomically:

1. **Task 1: Author migration 0027_carros.sql** - `482272b` (feat)
2. **Task 2: Apply to local stack + regenerate types (incl. view fix)** - `07ea0c0` (feat)
3. **Task 3: Wave-0 RLS isolation + view-leak tests** - `2cf1e69` (test)

_Task 3 was a TDD task but the schema substrate already existed (applied in Task 2), so the two integration tests were authored and verified green in a single commit._

## Files Created/Modified
- `supabase/migrations/0027_carros.sql` - carros + abastecimentos tables, transactions.carro_id tag, both consumo views, XOR CHECK, partial unique index, RLS/grants/indexes
- `src/types/database.types.ts` - regenerated typed client (carros, abastecimentos, carro_id, both views); no drift
- `tests/carro-rls.test.ts` - 2-user RLS isolation + XOR CHECK both/neither + partial-unique double-link rejection
- `tests/carro-view-leak.test.ts` - security_invoker proof for v_abastecimento_consumo + v_carro_resumo
- `.planning/phases/08-substrato-carro-crud-navega-o/08-VALIDATION.md` - Wave-0 deliverables recorded green

## Decisions Made
- Followed the locked spec D1-D5 and CONTEXT decisions verbatim; cloned the 0025/0026 RLS + security_invoker shapes.
- v_carro_resumo's averages are derived from v_abastecimento_consumo so the tanque-cheio interval logic exists in exactly one place.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FILTER on window function rejected by Postgres**
- **Found during:** Task 2 (applying the migration to the local stack)
- **Issue:** The first draft of `v_abastecimento_consumo` used `lag(...) filter (where a.tanque_cheio) over (...)` to find the previous full-tank odometer. Postgres rejects this: `ERROR: FILTER is not implemented for non-aggregate window functions (SQLSTATE 0A000)`. The migration failed to apply.
- **Fix:** Restructured the view to isolate the `tanque_cheio` fills into a dedicated `full_fills` CTE, then `lag()` over that filtered set (no FILTER on the window function); joined the result back onto all fills. Semantics unchanged — km_rodados is still the delta to the previous full-tank odometer.
- **Files modified:** supabase/migrations/0027_carros.sql
- **Verification:** `supabase migration up` applied cleanly (exit 0); the Wave-0 consumo interval test asserts `km_rodados === 400` for the seeded interval, green.
- **Committed in:** `07ea0c0` (Task 2 commit, alongside the regenerated types)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix was required for the migration to apply at all; the view's contract and output are identical. No scope creep.

## Issues Encountered
- The migration partially errored on first apply (window-function FILTER). Because each migration runs in a transaction, the failed apply rolled back cleanly; the corrected migration applied on retry with no orphaned objects.

## User Setup Required
None - no external service configuration required. (The deferred remote push/deploy — STATE blocker 01-04 — is unrelated to this local-only apply.)

## Next Phase Readiness
- The full Carro data substrate is live in the local DB and in the typed client. Plan 08-02 (schema/assertOwnedCarro + carros server actions) and Plan 08-03 (nav + CRUD UI) can build directly on these types and tables.
- Phase 9 (etiquetagem), Phase 10 (abastecimento + consumo), and Phase 11 (detail + chart) all depend on this substrate, which is now in place — including the two consumption views they will read.
- No blockers introduced. No remote push (local-only, per the standing decision).

## Self-Check: PASSED

---
*Phase: 08-substrato-carro-crud-navega-o*
*Completed: 2026-06-17*
