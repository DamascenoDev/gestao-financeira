---
phase: 10-abastecimento-h-brido-consumo
plan: 01
requirements_completed: [CAR-03, CAR-04]
subsystem: carro-consumo
tags: [migration, supabase-views, security-invoker, consumption-math, integration-test, wr-fixes]
requires:
  - "supabase/migrations/0027_carros.sql (carros + abastecimentos + the two views)"
  - "tests/helpers/local-supabase.ts (readLocalConfig/serviceClient/userClient)"
  - "local Supabase stack UP at 127.0.0.1:55321 (migrations 0001-0027 applied)"
provides:
  - "supabase/migrations/0028_carros_fix.sql — carros CHECKs + corrected v_abastecimento_consumo"
  - "trustworthy v_abastecimento_consumo / v_carro_resumo rows (no negative km/l, no zero-delta intervals, deterministic ties)"
  - "carros_ano_chk (1900..2100) + carros_combustivel_padrao_chk enum at the DB boundary"
  - "tests/carro-consumo.test.ts — Wave-0 consumption-view integration proof"
affects:
  - "10-02 (server layer reads regenerated types + now-correct view rows)"
  - "10-03 (UI surfaces km/l + R$/km from the views)"
  - "11 (detail + chart consume the same views)"
tech-stack:
  added: []
  patterns:
    - "fix-only create-or-replace-view migration (security_invoker preserved, no table/RLS/grant changes)"
    - "idempotent drop-constraint-if-exists then add for CHECK constraints"
    - "two-carro test design: one clean happy-path interval + one bad-data guard carro"
key-files:
  created:
    - "supabase/migrations/0028_carros_fix.sql"
    - "tests/carro-consumo.test.ts"
  modified: []
decisions:
  - "v_carro_resumo left untouched: its avg(...) filter (where ... is not null) already excludes the now-null/dropped bad intervals — interval logic stays in ONE place (v_abastecimento_consumo)"
  - "ano upper bound is the FIXED literal 2100, never extract(year from now()) — no year-rollover drift (08-REVIEW WR-01)"
  - "WR-06 guard reaches its trigger via the zero-delta tie (km_rodados=0 excluded by the intervals WHERE > 0); a lower odometer reading re-routes the interval floor (correct interval math) rather than producing a negative number"
metrics:
  duration: ~14 min
  tasks: 2
  files_created: 2
  files_modified: 0
  completed: 2026-06-17
---

# Phase 10 Plan 01: Migration 0028 carros fix + consumption-view Wave-0 test Summary

Shipped `0028_carros_fix.sql` (deferred Phase-8 review fixes WR-01/05/06) applied to the LOCAL stack with zero type drift, and proved the corrected tanque-cheio consumption math with a Wave-0 integration test — the BLOCKING substrate the rest of Phase 10 builds on.

## What was built

**Task 1 — `supabase/migrations/0028_carros_fix.sql` (commit `a14f580`, fix):**
A fix-only, idempotent migration that touches nothing structural from 0027 (no table/column/RLS/grant/index changes):
- **WR-01 carros CHECKs:** `carros_ano_chk` (`ano is null or (ano between 1900 and 2100)` — fixed literal upper bound, never `now()`) and `carros_combustivel_padrao_chk` (`combustivel_padrao is null or in ('Flex','Gasolina','Etanol','Diesel','GNV')`), each `drop constraint if exists` then `add` (idempotent). Both confirmed live in `pg_constraint` after apply; existing rows satisfy them.
- **WR-05 deterministic tie-break:** the `full_fills` lag window changed from `order by a.odometro_km` to `order by a.odometro_km, a.occurred_on, a.created_at, a.id` so two tanque_cheio fills with the same odometer resolve deterministically.
- **WR-06 non-positive km guard:** the `intervals` CTE WHERE now adds `and (f.odometro_km - f.prev_full_odometro) > 0` so a zero/negative-delta interval never reaches the rows or the resumo averages; the `km_por_litro` and `reais_por_km` CASE branches additionally guard `km_rodados <= 0 -> null`.
- **Invariants preserved:** `with (security_invoker = true)` kept on the view (T-10-01 / T-08-02); `preco_litro` stays derived (no stored column).

Applied via `supabase migration up --local` (NOT `db push`, NOT `db reset`); `npm run gen:types` left `src/types/database.types.ts` byte-identical (`git diff --quiet` exit 0) — view COLUMNS unchanged, only row VALUES change.

**Task 2 — `tests/carro-consumo.test.ts` (commit `0eb8da2`, test):**
A Vitest integration test against the local stack, cloning the createUser/userClient/serviceClient harness from `carro-view-leak.test.ts`. One user A, two carros:
- **Happy path (carro 1):** fills at 10000 (open) and 10500 (40 L, 24000 cents) → one interval: `km_rodados=500`, `km_por_litro≈12.5`, `reais_por_km≈48`; `v_carro_resumo.km_por_litro_medio≈12.5`.
- **WR-06 guard (carro 2):** a tied/rolled-back odometer fill — assert NO row carries a negative km/l or R$/km, the non-positive (`km_rodados<=0`) interval is excluded from the rows entirely, and the resumo average stays a strictly positive number built off valid intervals only.
- **preco_litro derived:** `select preco_litro from abastecimentos` errors (column absent) — the value is only ever derived.
All reads run through the RLS-active user client. 6/6 green.

## Verification

- `supabase migration up --local`: 0028 applied clean, no error; no remote push, no db reset.
- `npm run gen:types`: `git diff --quiet src/types/database.types.ts` exit 0 — no schema drift.
- `npm test -- carro-consumo.test.ts`: 6 passed.
- Full suite `npm test`: **670 passed / 78 files** (baseline ~664, +6 new).
- `npx tsc --noEmit`: clean (exit 0).
- `npm run build`: exit 0.
- `grep`: both `carros_ano_chk` and `carros_combustivel_padrao_chk` present; `security_invoker = true` present; ano bound is the literal `2100`.

## Deviations from Plan

None — plan executed exactly as written.

The plan's example for the WR-06 case ("insert a fill whose odometro_km is LOWER than the prior full-tank") was explored empirically against the live view before writing assertions. Because the interval window orders by odometer ascending, a single lower-odometer fill becomes a new interval *floor* (correct interval math) rather than producing a negative delta; the guard's reachable trigger is the zero-delta tie (`km_rodados=0`, excluded by the `> 0` WHERE). The test therefore asserts the plan's accepted outcomes verbatim — "the interval either does not appear OR appears with km_por_litro = null" and "no negative number ever surfaces" — using a tied-odometer fill, which is the faithful WR-05/06 scenario. This is a test-design choice within the plan's stated acceptance, not a deviation from it.

## Self-Check: PASSED

- FOUND: supabase/migrations/0028_carros_fix.sql
- FOUND: tests/carro-consumo.test.ts
- FOUND commit: a14f580 (migration)
- FOUND commit: 0eb8da2 (test)
- carros_ano_chk + carros_combustivel_padrao_chk live in pg_constraint
- database.types.ts byte-identical (no drift)
