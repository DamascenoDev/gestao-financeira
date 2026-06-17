---
phase: 05
plan: 01
subsystem: mei-substrate
tags: [migrations, mei, dasn, rls, security-invoker, tdd, wave-0]
requires:
  - "Phase 1 schema + auth.users + uniform RLS shape (0013_reservas.sql)"
  - "0014_adherence_views.sql security_invoker + integer-cents pattern"
  - "src/lib/money.ts (formatCents), src/lib/ownership.ts (assertOwnedStatement clone source)"
  - "src/lib/adherence.ts (tiered-status mapper twin)"
  - "tests/helpers/local-supabase.ts two-user harness; tests/view-leak.test.ts, tests/reserva-idor.test.ts shapes"
provides:
  - "mei_settings (mei_start_date, unique per user), mei_year_flags (has_employee per year), mei_invoices (activity_type split, gross cents) + uniform RLS/grants/indexes"
  - "v_mei_year_summary security_invoker view: gross + comercio/servicos split + applicable_limit + band_ceiling + ratio_bp per (user, year)"
  - "src/lib/mei/rules.ts — the SOLE source of the four verified 2026 MEI numbers"
  - "src/lib/mei/limit.ts — applicableLimitCents + bandCeilingCents (parity with the SQL view)"
  - "src/lib/mei/status.ts — meiStatus tiered mapper + isNearLimit 80% alert"
  - "src/lib/mei/csv.ts — meiReportToCsv DASN-ready serializer (establishes Phase-6 DATA-01 export pattern)"
  - "assertOwnedMeiInvoice IDOR re-derive in src/lib/ownership.ts"
  - "4 local-DB Wave-0 integration tests (RLS isolation, report split+employee+limit parity, view-leak, IDOR)"
affects:
  - "Plan 05-02 (actions/mei.ts + dashboard) builds on the schema, rules/limit/status libs, and assertOwnedMeiInvoice"
  - "Plan 05-03 (NF list + settings + report) builds on the view + csv.ts export pattern"
  - "Phase 6 DATA-01 reuses the csv.ts BOM + ;-delimiter export pattern"
tech-stack:
  added: []
  patterns:
    - "applicable-limit CASE computed ONCE in a sub-CTE (no triple-repeated literal, no SQL drift)"
    - "SQL view literals held in parity with rules.ts by a test that reads the migration text"
    - "never-hardcode-fiscal-literal grep guard (forbidden regex built FROM the constants so the guard never flags itself)"
    - "UTF-8 BOM generated in code (String.fromCharCode(0xFEFF)), never a literal invisible char"
key-files:
  created:
    - supabase/migrations/0025_mei.sql
    - supabase/migrations/0026_mei_views.sql
    - src/lib/mei/rules.ts
    - src/lib/mei/rules.test.ts
    - src/lib/mei/limit.ts
    - src/lib/mei/limit.test.ts
    - src/lib/mei/status.ts
    - src/lib/mei/status.test.ts
    - src/lib/mei/csv.ts
    - src/lib/mei/csv.test.ts
    - tests/mei-invoice-rls.test.ts
    - tests/mei-report.test.ts
    - tests/mei-view-leak.test.ts
    - tests/mei-idor.test.ts
  modified:
    - src/lib/ownership.ts
    - src/types/database.types.ts
    - .planning/phases/05-m-dulo-mei-dasn-simei/05-VALIDATION.md
decisions:
  - "Open Question 1 resolved: has_employee modelled as a per-year mei_year_flags(user_id, year) table (clean RLS, clean join, no JSON)"
  - "Open Question 2 resolved: SQL rule numbers inlined in the view migration + a rules.test.ts parity guard reading the migration text (lighter than a seeded mei_rules reference table)"
  - "rules.ts (NOT mei.ts) is the SOLE constants module — the stale UI-SPEC mei.ts reference was not followed"
  - "applicable-limit CASE computed once in a `lim` sub-CTE so band/ratio reuse it without literal drift"
  - "CSV uses \\r\\n line endings + BOM + ; delimiter for Excel pt-BR (Phase-6 export pattern)"
metrics:
  duration: ~1h
  completed: 2026-06-17
  tasks: 3
  files_created: 14
  files_modified: 3
  commits: 5
  tests_added: 39
---

# Phase 5 Plan 01: MEI Substrate Summary

MEI module substrate landed before any UI slice: 3 RLS tables + 1 security_invoker summary view, the four pure fiscal libs (rules/limit/status/csv) that own all MEI numbers and math, the `assertOwnedMeiInvoice` IDOR helper, and 8 GREEN Wave-0 behaviors pinning the proportional applicable-limit math, tiered status, DASN report fields, RLS isolation, view-leak, and SQL↔TS parity.

## What Was Built

### Task 1 — Schema migrations + local apply + type regen (commit ad510bf)
- `0025_mei.sql`: `mei_settings` (mei_start_date, `unique(user_id)`), `mei_year_flags` (has_employee per `(user_id, year)`), `mei_invoices` (issued_on civil date, amount_cents > 0 gross, tomador, descricao, `activity_type in ('comercio_industria','servicos')`). Uniform 0013 RLS USING+WITH CHECK `auth.uid()=user_id` + grants + indexes per table.
- `0026_mei_views.sql`: `v_mei_year_summary` `with (security_invoker = true)` — gross + comércio/serviços split + `applicable_limit_cents` (proportional opening year via `675000 * (12 - opening_month + 1)`, 8100000 thereafter, 0 before) computed ONCE in a `lim` sub-CTE; `band_ceiling_cents` = applicable × 12000/10000; `ratio_bp` guarded against /0. Header comment ties literals to rules.ts.
- `npm run db:reset` replays 0001–0026 cleanly; `npm run gen:types` regenerated `database.types.ts` with the 3 tables + the view.

### Task 2 — Rule constants + limit/status/csv pure libs (RED b8c4c74 → GREEN 4e05c62)
- `rules.ts`: the SOLE source of `MEI_ANNUAL_LIMIT_CENTS=8_100_000`, `MEI_MONTHLY_RATE_CENTS=675_000`, `MEI_TOLERANCE_BP=2000`, `MEI_ALERT_BP=8000`, `DASN_DEADLINE={month:5,day:31}`, `MEI_RULES_YEAR=2026`.
- `limit.ts`: `applicableLimitCents` (Jul→40.500, Mar→67.500, full year, pre-opening 0) + `bandCeilingCents` (×1.20 integer, proportional in the start year).
- `status.ts`: `meiStatus` tiered mapper (verde/ambar/vermelho-banda/vermelho-fora at exact bp/band edges, BigInt gross vs band) + `isNearLimit` (80% alert).
- `csv.ts`: `meiReportToCsv` DASN-ready serializer — BOM in code, `;` delimiter, pt-BR money via formatCents, zero-revenue row valid.
- 30/30 unit tests GREEN; the parity test reads 0026 and asserts the SQL literals equal the constants; the never-hardcode grep guard passes.

### Task 3 — IDOR helper + 4 local-DB integration tests (commit 8b8e423)
- `assertOwnedMeiInvoice` appended additively to ownership.ts (verbatim assertOwnedStatement clone; Phase-4 helpers untouched).
- `mei-invoice-rls`: two-user RLS isolation on all 3 tables; both activity_types persist.
- `mei-report`: view gross+split+employee + applicable_limit/band/ratio parity with the limit.ts oracle.
- `mei-view-leak`: user B reads 0 of user A's summary (security_invoker proof).
- `mei-idor`: forged mei_invoice_id rejected, owned accepted.
- 9 integration tests GREEN.

## Verification Results

- `npm run db:reset && npm run gen:types` — 0001–0026 replay clean; types contain the 3 tables + the view; view carries `security_invoker = true`.
- `npx vitest run src/lib/mei/` — 30/30 GREEN (incl. SQL↔TS parity guard).
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` — full suite **430 passed / 0 skipped** (55 files).
- `npx tsc --noEmit` — clean.
- `npm run build` — clean (compiles existing routes; no MEI routes yet, by design).
- never-hardcode grep gate (`grep -rn --include='*.ts' "81000\|97200" src | grep -v "src/lib/mei/rules.ts"`) — **returns nothing**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] rules.test grep-guard flagged its own bare literals**
- **Found during:** Task 2 (GREEN run)
- **Issue:** The never-hardcode guard scans every src .ts; bare `81000`/`97200` digits in rules.test.ts comments/regex made the guard flag itself (and would dirty the downstream grep gate which only excludes `rules.ts`).
- **Fix:** Built the forbidden regex FROM the constants (`MEI_ANNUAL_LIMIT_CENTS/100` etc.) so the bare digits never appear in the file; reworded comments to drop the literals.
- **Files modified:** src/lib/mei/rules.test.ts
- **Commit:** b8c4c74

**2. [Rule 1 - Bug] CSV money assertions used a regular space**
- **Found during:** Task 2 (GREEN run)
- **Issue:** `formatCents` emits a non-breaking space (U+00A0) between `R$` and the amount; `toContain('R$ 60.000,00')` with a regular space failed.
- **Fix:** Derived expected substrings via `formatCents(...)` itself; also fixed tsc "possibly undefined" on row indexing with destructured tuple access.
- **Files modified:** src/lib/mei/csv.test.ts
- **Commit:** b8c4c74

**3. [Rule 1 - Bug] tsc "possibly undefined" on settings/flags row access in RLS test**
- **Found during:** Task 3 (tsc gate)
- **Issue:** `settings![0].mei_start_date` tripped TS2532 under strict.
- **Fix:** Optional-chained to `settings?.[0]?.mei_start_date` / `flags?.[0]?.has_employee`.
- **Files modified:** tests/mei-invoice-rls.test.ts
- **Commit:** 8b8e423

## Known Stubs

None. This is a substrate plan — no UI is wired yet (by design; the dashboard/list/report slices are Plans 05-02/05-03). No empty-data-to-UI stubs exist.

## Requirements Progress

Substrate touches all six MEI requirements (the data + math + isolation foundation each later slice consumes):
- MEI-01 (NF model + IDOR), MEI-02 (applicable limit + band + status), MEI-03 (activity_type split + employee flag), MEI-04 (DASN report view + CSV), MEI-05 (80% alert), MEI-06 (MEI_RULES_YEAR for the disclaimer copy).

Full requirement completion is gated on the UI slices (05-02/05-03); this plan provides the verified substrate.

## Self-Check: PASSED

- All 14 created files + 3 modified files exist on disk.
- Commits ad510bf, b8c4c74, 4e05c62, 8b8e423 present in `git log`.
- Migrations apply clean, types regenerated, full suite + tsc + build GREEN.
