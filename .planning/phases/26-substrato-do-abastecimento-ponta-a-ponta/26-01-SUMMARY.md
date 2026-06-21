---
phase: 26
plan: 01
subsystem: testing / data-layer (abastecimento parcelado + Combustível seed)
status: complete
tags: [tdd-red, vitest, supabase-rls, nyquist-gate, fuel-01]
requires:
  - tests/helpers/local-supabase.ts (existing harness, hard-guarded to 127.0.0.1)
  - local Supabase Docker stack (`supabase start`)
provides:
  - tests/abastecimento-cost-check.test.ts (SC2/SC3 — 9-row relaxed-CHECK truth table)
  - tests/abastecimento-parcelas.test.ts (SC4 — junction unique + double-link + RLS)
  - tests/categorias-combustivel.test.ts (SC1 — Combustível seed + backfill idempotency)
  - tests/carro-consumo.test.ts parcelado fixture (no-double-count view invariant)
affects:
  - Wave 1 migration 0039_abastecimento_parcelado.sql (gated by these tests)
  - Wave 1 migration 0040_categorias_combustivel.sql (gated by these tests)
tech-stack:
  added: []
  patterns:
    - "TDD-red: integration tests written before the schema they assert against"
    - "vitest-against-local-Supabase as the pgTAP substitute for DB invariants"
key-files:
  created:
    - tests/abastecimento-cost-check.test.ts
    - tests/abastecimento-parcelas.test.ts
    - tests/categorias-combustivel.test.ts
  modified:
    - tests/carro-consumo.test.ts
decisions:
  - "Combustível asserted at sort 4 / kind consumo per the plan; the current seed has sort 4 = Saúde, so the renumbering is 0040's job (test is RED now by design)."
  - "Cross-table double-link residual documented as a 27/28 action-layer invariant, NOT asserted at the DB level (RESEARCH A1)."
  - "Each linked tx is unique per insert so the preserved abastecimentos_transaction_uniq partial index never masks the CHECK under test."
metrics:
  duration: ~6 min
  tasks: 3
  files: 4
  completed: 2026-06-21
---

# Phase 26 Plan 01: Wave 0 TDD-Red Nyquist Gates Summary

Four failing integration tests encode every Phase 26 success criterion (SC1–SC4 + the
no-double-count view invariant) as executable assertions against the local Supabase stack,
BEFORE any migration exists — locking the relaxed-CHECK truth table, the junction
constraints, the Combustível seed, and the parcelado no-double-count behavior so the Wave 1
migrations (0039 schema, 0040 seed) cannot silently regress or under-deliver.

## What Was Built

- **`tests/abastecimento-cost-check.test.ts`** (Task 1, SC2/SC3) — the 9-row relaxed-CHECK
  truth table as 9 insert assertions: 4 PASS rows (à-vista manual, à-vista linked,
  attach-later T+A, parcelado valid) and 5 REJECT rows (neither, V-leak on non-parcelado,
  parcelado+tx, parcelado+amount, parcelado-no-V). The "neither" REJECT additionally pins
  `error.code === '23514'` (check_violation) so the failure is the CHECK firing, not some
  other constraint. Distinct `odometro_km` per insert and unique linked txs avoid collisions.
- **`tests/abastecimento-parcelas.test.ts`** (Task 2, SC4) — junction `unique(transaction_id)`
  rejection, `unique(abastecimento_id, parcela_num)` rejection, attach-later re-link to a
  pre-existing abastecimento (succeeds), and two-user RLS isolation (userB reads ZERO).
  The cross-table double-link residual is documented as a 27/28 action-layer invariant.
- **`tests/categorias-combustivel.test.ts`** (Task 3A, SC1) — a fresh user (via the
  `handle_new_user()` trigger) has exactly one "Combustível" at `sort === 4` / `kind ===
  'consumo'`, plus a backfill-idempotency assertion (count stays 1).
- **`tests/carro-consumo.test.ts` extension** (Task 3B, view invariant) — additive parcelado
  carro fixture (`carroParceladoId`, `PARCELADO_VALOR_TOTAL_C`, `PARCELADO_LITROS`) and a
  new describe block asserting `custo_intervalo_cents === valor_total_cents` counted ONCE,
  and that a `carro_id`-tagged "parcela" transaction does NOT inflate consumo cost. The
  existing happy / guard / same-odometer fixtures and assertions are untouched.

## How It Was Verified

All four files are RED for the correct reason against the pre-0039/0040 schema:

- `abastecimento-cost-check` — the parcelado-PASS rows fail because `parcelas_total` /
  `valor_total_cents` columns do not exist (`PGRST204` schema-cache miss).
- `abastecimento-parcelas` — `beforeAll` fails seeding a parcelado abastecimento (missing
  columns) and the `abastecimento_parcelas` table does not exist; all assertions gated.
- `categorias-combustivel` — no "Combustível" category is seeded today (count 0, expected 1).
- `carro-consumo` — `beforeAll` fails on the parcelado fill's missing columns (8 skipped).

`npx tsc --noEmit` is clean for all four files (strict TypeScript, no `any` smuggling).

Aggregate run: `4 failed (4)` test files — the complete Nyquist gate set for Phase 26.

## Deviations from Plan

None — plan executed exactly as written. All four artifacts created/extended with the
specified assertions; no Rule 1–4 deviations were needed.

## Known Stubs

None. These are deliberately-failing TDD-red tests (the expected, documented end state for
a Wave 0 plan); they are not stubs and will be turned green by Wave 1 migrations 0039/0040.

## TDD Gate Compliance

This is the RED phase of the phase-level TDD cycle: the `test(...)` commits for all four
gates exist (`aeec6e3`, `3bfb7b1`, `f7b112b`). The GREEN gate (`feat(...)` migration commits)
is owned by Plan 02 (0039 schema) and Plan 03 (0040 seed) in Wave 1.

## Self-Check: PASSED

- FOUND: tests/abastecimento-cost-check.test.ts
- FOUND: tests/abastecimento-parcelas.test.ts
- FOUND: tests/categorias-combustivel.test.ts
- FOUND: tests/carro-consumo.test.ts (extended)
- FOUND commit: aeec6e3 (Task 1)
- FOUND commit: 3bfb7b1 (Task 2)
- FOUND commit: f7b112b (Task 3)
