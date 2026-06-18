---
phase: 12-produ-o-live-verify
plan: 01
subsystem: carro-consumo / migrations + milestone audit hygiene
status: complete
requirements_completed: [DEBT-01, DEBT-02]
tags: [migration, supabase-views, security-invoker, WR-02, same-odometer, row-value-comparison, doc-hygiene, tdd]
requires:
  - "supabase/migrations/0028_carros_fix.sql (the prior v_abastecimento_consumo definition: full_fills/fills/intervals CTEs, security_invoker, WR-05/WR-06 fixes)"
  - "tests/carro-consumo.test.ts (existing createUser/userClient harness; happy-path 12.5 km/l, WR-06 guard, preco_litro-not-stored proofs)"
  - "local Supabase stack UP at 127.0.0.1:55321 (migrations 0001-0028 applied)"
provides:
  - "supabase/migrations/0029_consumo_same_odometer_fix.sql — create-or-replace of v_abastecimento_consumo with identity-anchored interval bounds (security_invoker preserved)"
  - "same-odometer WR-02 regression proof appended to tests/carro-consumo.test.ts (RED on 0028, GREEN on 0029)"
  - "six v1.2 SUMMARY frontmatters carrying requirements_completed (CAR-02 / CAR-03 / CAR-04)"
affects:
  - "12-02 (db push of 0001-0029 to the remote project ships the corrected view; prod is born with the WR-02 fix)"
  - "v1.2 milestone audit trail (DEBT-02 closed; the milestone CLI/audit now reads requirements_completed off the SUMMARYs)"
tech-stack:
  added: []
  patterns:
    - "Postgres row-value (lexicographic) comparison `(a,b,c,d) > (...)` to bound interval membership on a full deterministic ordering tuple, not a single column"
    - "lag() the FULL ordering tuple of the prior full-tank fill (odometro_km, occurred_on, created_at, id), not just odometer — identity-anchored interval lower bound"
key-files:
  created:
    - supabase/migrations/0029_consumo_same_odometer_fix.sql
  modified:
    - tests/carro-consumo.test.ts
    - .planning/milestones/v1.2-phases/09-etiquetar-gastos-da-fatura-ao-carro/09-01-SUMMARY.md
    - .planning/milestones/v1.2-phases/09-etiquetar-gastos-da-fatura-ao-carro/09-02-SUMMARY.md
    - .planning/milestones/v1.2-phases/09-etiquetar-gastos-da-fatura-ao-carro/09-03-SUMMARY.md
    - .planning/milestones/v1.2-phases/10-abastecimento-h-brido-consumo/10-01-SUMMARY.md
    - .planning/milestones/v1.2-phases/10-abastecimento-h-brido-consumo/10-02-SUMMARY.md
    - .planning/milestones/v1.2-phases/10-abastecimento-h-brido-consumo/10-03-SUMMARY.md
decisions:
  - "Fix the same-odometer sweep-in by anchoring interval membership on the prior full-tank fill's IDENTITY (full ordering tuple), using Postgres row-value comparison — keeps the interval logic in ONE place (the view), v_carro_resumo untouched (0027/0028 precedent)."
  - "0029 is a fix-only create-or-replace: no table/column/RLS/grant/index DDL, security_invoker preserved (T-12-viewleak / T-12-clobber mitigations)."
metrics:
  duration: "~20 min"
  completed: 2026-06-18
  tasks: 2
  files: 8
---

# Phase 12 Plan 01: Close v1.2 tech debt (WR-02 view fix + doc hygiene) Summary

Fixed the same-odometer sweep-in in `v_abastecimento_consumo` via migration 0029 — interval liters/cost now anchor on the prior full-tank fill's full ordering tuple (row-value comparison) instead of bare odometer, so a sibling `tanque_cheio` fill sharing the exact same `odometro_km` no longer understates km/l or overstates R$/km — proven RED→GREEN; and backfilled `requirements_completed` (CAR-02 / CAR-03 / CAR-04) into the six v1.2 SUMMARY frontmatters.

## What Was Built

### Task 1 — Migration 0029 (WR-02 / DEBT-01), TDD RED→GREEN

- **The bug (0028):** each interval's `litros_intervalo` / `custo_intervalo_cents` subquery bounded membership on the bare odometer (`s.odometro_km > prev_full_odometro AND s.odometro_km <= f.odometro_km`). When two `tanque_cheio` fills share the EXACT same `odometro_km` (30000 → 30500 → 30500), the closing fill of the 30000→30500 interval swept in the SIBLING fill at 30500 — inflating liters (understating km/l) and cost (overstating R$/km). The `km_rodados > 0` guard dropped the zero-length 30500→30500 interval but did NOT stop the sweep-in into 30000→30500.
- **The fix:** `lag()` the prior full-tank fill's FULL ordering tuple `(odometro_km, occurred_on, created_at, id)` into the `intervals` CTE, then bound each subquery using Postgres row-value (lexicographic) comparison — strictly AFTER the prior full fill and up to/including the closing fill. Two rows at the same odometer now land deterministically on exactly one side of the boundary: the closing fill's own liters/cost count toward its interval, the next (sibling) fill's do NOT.
- Fix-only `create or replace view public.v_abastecimento_consumo with (security_invoker = true)` — no structural DDL. `v_carro_resumo` left untouched (its `avg(...) filter` reads off this view; interval logic stays in one place per 0027/0028 precedent).
- WR-06 guard intact: `intervals` WHERE still requires `prev_full_odometro is not null` and `km_rodados > 0`; the `km_por_litro` / `reais_por_km` CASE branches still guard `km_rodados <= 0` → null.

### Task 2 — DEBT-02 doc hygiene

Added `requirements_completed` to the six v1.2 SUMMARY frontmatters left empty at milestone close: Phase 9 (09-01/02/03 carro-tagging) → `[CAR-02]`; Phase 10 (10-01/02/03 abastecimento/consumo) → `[CAR-03, CAR-04]`. Frontmatter-only; no body or other-key edits. Files already carrying a `requirements:` list (09-02, 09-03, 10-03) keep it and add `requirements_completed` alongside; leaner files (09-01, 10-01, 10-02) get it near the top.

## Verification

- **RED (pre-0029):** the new same-odometer test FAILED on 0028 — `litros_intervalo` was 65 (L2+L3 = 40+25) instead of 40 (L2 only): `AssertionError: expected 65 to be 40`.
- **GREEN (post-0029, after `supabase db reset` applying 0001-0029):** full carro-consumo suite passes:

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

- The four pre-existing proofs (happy path 12.5 km/l, WR-06 non-positive guard, resumo average, preco_litro-not-stored) stay GREEN; `tests/carro-view-leak.test.ts` (security_invoker leak proof) stays GREEN (4 passed).
- `npx tsc --noEmit` clean (exit 0).
- Migrations 0001-0029 apply cleanly to the local stack (`supabase db reset`).
- Grep gates: `0029` contains `create or replace view public.v_abastecimento_consumo` and `security_invoker = true`.
- DEBT-02 gate: all six SUMMARYs carry `requirements_completed` (3× CAR-02, 3× CAR-03/CAR-04).

## Deviations from Plan

None - plan executed exactly as written.

## Threat Mitigations

- **T-12-viewleak:** 0029 keeps `with (security_invoker = true)`; carro-view-leak test stays GREEN.
- **T-12-badmath:** RED→GREEN regression pins exact expected `litros_intervalo` (40, sibling excluded) and `custo_intervalo_cents` (24000) before the fix was accepted; the four prior proofs stay GREEN.
- **T-12-clobber:** 0029 is a view-only create-or-replace — no table/column/RLS/grant/index statements (verified by inspection).

## Notes for Downstream

- Nothing remote was touched (that is 12-02). The local stack is fully green; production will be born with the corrected view when 12-02 runs `db push` of 0001-0029.
- `src/types/database.types.ts` was NOT regenerated — 0029 changes no column names/types in the view's output, so the generated types are unchanged (the view's selected columns are identical to 0028).

## Self-Check: PASSED

- `supabase/migrations/0029_consumo_same_odometer_fix.sql` exists.
- `.planning/phases/12-produ-o-live-verify/12-01-SUMMARY.md` exists.
- Commits present: d0d5cda (RED test), 01b59c4 (GREEN migration), 946abd9 (DEBT-02 doc hygiene).
