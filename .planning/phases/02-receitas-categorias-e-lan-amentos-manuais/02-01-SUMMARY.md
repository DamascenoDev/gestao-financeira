---
phase: 02-receitas-categorias-e-lan-amentos-manuais
plan: 01
subsystem: receitas-substrate-and-app-shell
tags: [migrations, rls, security_invoker, civil-month, zod, shadcn, app-shell, wave-0-tests]
requires:
  - Phase 1 RLS shape (profiles/categories migrations, grants, user_id index)
  - tests/helpers/local-supabase.ts (two-user harness)
  - src/lib/money.ts, src/lib/supabase/server.ts
provides:
  - income_templates + income_occurrences + transactions tables (RLS-enabled)
  - v_income_month + v_category_totals (security_invoker views, leak-free)
  - reassign_and_delete_category(src,dst) atomic RPC
  - categories.color swatch column
  - src/lib/month.ts (currentMonthKey/monthLabel/shiftMonthKey/monthBounds)
  - src/lib/schemas/{income,category,transaction}.ts (shared Zod schemas)
  - app shell (sidebar + global MonthSelector + user menu) under (app)
  - app-wide financial-semantic design tokens (--income/--expense/--allocation/--consumption + teal --primary)
  - eight Wave-0 integration tests (INC/CAT/TXN substrate + view-leak)
affects:
  - 02-02 (Receitas slice consumes income tables + v_income_month + month helper + income schema)
  - 02-03 (Categorias slice consumes color column + reassign RPC + category schema)
  - 02-04 (Extrato slice consumes transactions + v_category_totals + transaction schema + MonthSelector)
tech-stack:
  added:
    - "@tanstack/react-table@8.21.3"
    - date-fns@4.4.0
    - date-fns-tz@3.2.0
    - react-day-picker@10.0.1 (pulled in by shadcn calendar)
  patterns:
    - "security_invoker = true on every aggregate view (RLS-inheriting, leak-free)"
    - "civil-month math centralized in one America/Sao_Paulo-pinned module"
    - "shared Zod schema per entity (single source of truth for form + action)"
    - "base-ui render prop (not Radix asChild) for shadcn base-nova composition"
key-files:
  created:
    - supabase/migrations/0004_incomes.sql
    - supabase/migrations/0005_transactions.sql
    - supabase/migrations/0006_categories_color.sql
    - supabase/migrations/0007_views.sql
    - supabase/migrations/0008_reassign_and_delete.sql
    - src/lib/month.ts
    - src/lib/month.test.ts
    - src/lib/schemas/income.ts
    - src/lib/schemas/category.ts
    - src/lib/schemas/transaction.ts
    - src/components/month-selector.tsx
    - src/components/app-sidebar.tsx
    - src/components/user-menu.tsx
    - tests/income-month.test.ts
    - tests/income-occurrence.test.ts
    - tests/income-adhoc.test.ts
    - tests/category-delete.test.ts
    - tests/category-kind.test.ts
    - tests/transactions-rls.test.ts
    - tests/bulk-reclassify.test.ts
    - tests/view-leak.test.ts
    - "15 shadcn components under src/components/ui/ (+ sheet, src/hooks/use-mobile.ts)"
  modified:
    - src/types/database.types.ts
    - src/app/globals.css
    - "src/app/(app)/layout.tsx"
    - tests/rls-isolation.test.ts
    - src/components/ui/calendar.tsx
    - package.json
decisions:
  - "Wave-0 tests assert the DB-substrate guarantees directly (RLS, FK RESTRICT, unique constraint, RPC, security_invoker) rather than waiting on feature actions — all 8 pass now against the migrated stack"
  - "Requirements INC/CAT/TXN left Pending in REQUIREMENTS.md: the substrate is delivered but the user-facing capabilities complete in slices 02-02/03/04"
  - "Used base-ui `render` prop instead of Radix `asChild` (base-nova preset is base-ui, not Radix)"
metrics:
  duration: ~9 min (task execution)
  completed: 2026-06-16
---

# Phase 2 Plan 01: Receitas Substrate + App Shell Summary

Migrations 0004-0008 (income templates/occurrences, transactions with FK RESTRICT, category color, two security_invoker aggregate views, atomic reassign RPC) applied to the local Supabase stack with regenerated typed client; plus the civil-month helper, three shared Zod schemas, an upgraded sidebar + global MonthSelector app shell, app-wide financial-semantic design tokens, and eight Wave-0 integration tests — establishing the foundation every Phase 2 feature slice executes test-first against.

## What Was Built

**Task 1 — Migrations + types (commit a954e3a).** Five idempotent migrations mirroring the Phase 1 RLS shape verbatim:
- `income_templates` + `income_occurrences` with `unique(user_id, template_id, month_key)` (idempotent materialize for INC-02; NULL-distinct allows multiple avulsas for INC-03), RLS USING+WITH CHECK `to authenticated`, DML grants, user_id/(user_id,month_key) indexes.
- `transactions` with `category_id → categories ON DELETE RESTRICT` (CAT-02 DB safety net), `amount_cents > 0` (sign derives from kind), RLS + grants + indexes.
- `categories.color` additive nullable swatch-key column.
- `v_income_month` + `v_category_totals` both `with (security_invoker = true)` — mandatory so they inherit RLS instead of running as definer.
- `reassign_and_delete_category(src, dst)` security-invoker plpgsql RPC doing UPDATE-then-DELETE atomically.
- `npm run db:reset` applied all 8 migrations cleanly; `npm run gen:types` regenerated `database.types.ts` (contains the new tables, both views, the RPC, and the color column).

**Task 2 — Month helper + schemas + RLS extension (commit 90c1c07, TDD).** `lib/month.ts` (currentMonthKey/monthLabel/shiftMonthKey/monthBounds) pinned to America/Sao_Paulo via date-fns-tz — RED-then-GREEN, 9 unit tests incl. UTC-boundary, year rollover, Feb 28/29. Three shared Zod schemas (`income`, `category`, `transaction`) with inferred input types, mirroring `auth-schema.ts`. Extended `tests/rls-isolation.test.ts` TABLES with the three new tables and per-table neutral insert shapes (20 tests GREEN).

**Task 3 — Deps + shadcn + tokens + shell (commit 8e66e04).** Installed `@tanstack/react-table` (date-fns/date-fns-tz from Task 2); vendored 15 shadcn components (+ sheet, use-mobile, react-day-picker). globals.css gained the teal `--primary` override and `--income/--expense/--allocation/--consumption` OKLCH tokens in both themes + `@theme inline`. `month-selector.tsx` writes `?mes` via router.replace; `app-sidebar.tsx` is the collapsible nav (Dashboard/Receitas/Categorias/Extrato); `user-menu.tsx` holds the logout (AUTH-04) in a dropdown; `(app)/layout.tsx` is now SidebarProvider + AppSidebar + top bar with MonthSelector, getClaims() redirect preserved. `tsc --noEmit` clean, `npm run build` succeeds.

**Task 4 — Wave-0 tests (commit 020525b).** Eight integration tests reusing the local-supabase two-user harness: income-month, income-occurrence, income-adhoc, category-delete, category-kind, transactions-rls, bulk-reclassify, view-leak. Each headers which slice consumes it.

## Verification Results

- `npm run db:reset && npm run gen:types`: all 8 migrations apply, types regenerated, no drift.
- `npx vitest run view-leak`: GREEN (3/3 — security_invoker proven leak-free).
- `npx vitest run month`: GREEN (9/9 — civil-month helper).
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds.
- Full suite `npx vitest run`: **72/72 GREEN** across 14 files (incl. the 18 new Wave-0 + extended-RLS assertions and the prior Phase 1 suite).

### Wave-0 test status (GREEN vs intentionally-RED)

All eight Wave-0 tests are **GREEN on the migrated substrate** — this exceeds the plan's expectation that seven would stay RED until 02-02/03/04. The behaviors they assert (INC-02 occurrence-edit isolation, INC-03 NULL-distinct avulsas, CAT-02 FK 23503 block + reassign RPC + archive, CAT-03 kind toggle, TXN-01/02 CRUD + four-verb isolation, TXN-04 bulk update + forged `.in()` RLS scoping, T-02-VIEW leak-free) are **DB-substrate guarantees that 02-01 fully delivers** (the unique constraint, FK RESTRICT, RPC, RLS policies, security_invoker views). The honest test asserts the substrate directly through the service/user clients. The feature *actions* (createTransaction, bulkReclassify, deleteCategory, materialize-on-read, etc.) in 02-02/03/04 are thin Zod-validated wrappers over these proven guarantees; those slices add action/UI-level tests on top.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn calendar classNames key incompatible with react-day-picker v10**
- **Found during:** Task 3 (`tsc --noEmit` after `shadcn add calendar`).
- **Issue:** The vendored `calendar.tsx` used the classNames key `table:` which does not exist in react-day-picker 10.0.1's `ClassNames` type (TS2353), breaking the type-check.
- **Fix:** Renamed the key `table` → `month_grid` (the correct rdp v10 grid-element key). Behavior-preserving.
- **Files modified:** src/components/ui/calendar.tsx
- **Commit:** 8e66e04

**2. [Rule 1 - Type strictness] Wave-0 test array indexing**
- **Found during:** Task 4 (`tsc --noEmit`).
- **Issue:** `data![0].field` is possibly-undefined under TS strict even after the array non-null assertion (TS2532).
- **Fix:** Added the element-level assertion `data![0]!.field` in income-month and income-occurrence tests.
- **Files modified:** tests/income-month.test.ts, tests/income-occurrence.test.ts
- **Commit:** 020525b

### Plan-intent adjustments (no permission needed)

- **base-ui `render` vs Radix `asChild`:** The base-nova preset vendors base-ui components (not Radix). Composing a `Link` into `SidebarMenuButton` and a `Button` into `DropdownMenuTrigger` uses the base-ui `render={<Element/>}` prop instead of `asChild`. Active nav uses `data-active:` (base-ui's data attr), not `data-[active=true]`.
- **date-fns/date-fns-tz installed in Task 2 (not Task 3):** `lib/month.ts` imports them and its TDD test runs in Task 2, so the two date deps were installed there; `@tanstack/react-table` installed in Task 3 as planned.
- **Requirements left Pending:** Plan frontmatter lists `requirements: [INC-01..TXN-04]`, but these are user-facing capabilities completed by slices 02-02/03/04. The substrate (this plan) does not yet let the user "cadastrar receita" / "lançar transação", so REQUIREMENTS.md keeps them Pending for accuracy; the traceability completes when the slices ship.

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation warning (Phase 1 file convention) — surfaced by `npm run build`, unrelated to this plan's changes.

## Authentication Gates
None — the local Supabase stack was already running (`supabase status` returned local credentials); no auth gate was hit.

## Known Stubs
None. The shell nav links to /dashboard (exists), /receitas, /categorias, /extrato (these pages ship in 02-02/03/04 — intentional forward references, the routes are the next slices' deliverables, not stubs in this plan's surface). No hardcoded empty data flows to UI in the files this plan created.

## Local Stack
Left **running** (not torn down) — `supabase status` reports the local API at http://127.0.0.1:55321 with all 8 migrations applied. The next slice (02-02) can execute test-first immediately against the migrated schema.

## Self-Check: PASSED
