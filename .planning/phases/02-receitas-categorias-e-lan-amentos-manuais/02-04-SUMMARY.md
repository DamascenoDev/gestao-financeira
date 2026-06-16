---
phase: 02-receitas-categorias-e-lan-amentos-manuais
plan: 04
subsystem: extrato-slice
tags: [server-actions, tanstack-table, row-selection, bulk-reclassify, url-filters, security_invoker, zod, rsc, tdd, TXN]
requires:
  - 02-01 transactions table (amount_cents > 0, category_id ON DELETE RESTRICT, RLS) + v_category_totals security_invoker view
  - 02-01 lib/schemas/transaction.ts (transactionSchema) + lib/month.ts (currentMonthKey/monthBounds/monthLabel)
  - 02-02 src/components/money-input.tsx (MoneyInput/isValidMoney) + amount-cell.tsx (AmountCell)
  - 02-03 src/components/category-badge.tsx (CategoryBadge/CategoryDot)
  - src/actions/auth.ts + incomes.ts + categories.ts (Zod boundary + getClaims() owner pattern)
  - @tanstack/react-table@8.21.3 (installed 02-01)
provides:
  - src/actions/transactions.ts (createTransaction, updateTransaction, deleteTransaction, bulkReclassify)
  - src/app/(app)/extrato/page.tsx (RSC: ?mes + ?cat filter, month tx + per-category/grand totals from v_category_totals)
  - src/components/extrato-table.tsx (TanStack react-table: getRowId=tx.id, row selection, sort, inline category edit, totals footer)
  - src/components/selection-action-bar.tsx (self-contained { selectedIds, categories, onApply, onClear } — Phase-4 reusable verbatim)
  - src/components/transacao-form.tsx (Novo lançamento / edit dialog: data + descrição + valor + categoria)
  - src/components/category-filter.tsx (multi-category popover writing ?cat to the URL)
affects:
  - 02-05 (human-verify walkthrough: TXN-03 filter URL round-trip + TXN-04 bulk re-classify)
  - Phase 4 (import-review/memory flow reuses SelectionActionBar verbatim for bulk confirm)
  - Phase 3 (metas consumes per-category transaction totals as the spend side of adherence)
tech-stack:
  added: []
  patterns:
    - "TanStack row-selection model with getRowId = (r) => r.id (stable transaction id) so selection survives re-render and Phase 4 reuses the SelectionActionBar verbatim"
    - "URL-persisted filters: ?mes (shell MonthSelector) + ?cat (comma-joined ids) read in the RSC, written via useSearchParams + router.replace; month always preserved on a ?cat write"
    - "per-category + grand totals read from the security_invoker v_category_totals view (sums in SQL inside the RLS boundary), filtered to ?mes and the active ?cat in the RSC"
    - "bulkReclassify is a single update().in('id', ids) — RLS scopes the UPDATE to the caller even with a forged id (no N per-row writes)"
    - "inline category edit: a small Select in the Categoria cell calls updateTransaction with the full row payload so transactionSchema validates on a category-only change"
key-files:
  created:
    - src/actions/transactions.ts
    - src/actions/transactions.test.ts
    - "src/app/(app)/extrato/page.tsx"
    - src/components/extrato-table.tsx
    - src/components/selection-action-bar.tsx
    - src/components/transacao-form.tsx
    - src/components/category-filter.tsx
  modified: []
decisions:
  - "Wave-0 tests transactions-rls + bulk-reclassify assert the DB-substrate guarantees and were already GREEN from 02-01; this slice ADDS the action-level tests (transactions.test.ts) the plan called for (CRUD/bulk wrapper behavior)"
  - "bulkReclassify validates the target categoryId as a uuid at the boundary (Zod) in addition to the empty-selection guard, so a forged/missing target is rejected before the .in() update"
  - "Test UUID fixtures use RFC-4122 v4 shape (version nibble 4, variant 8) because zod v4 .uuid() validates the variant bits — all-1s/all-2s placeholder uuids are rejected"
  - "Inline category edit (Select-in-cell) chosen over a click-to-open mini-dialog per UI-SPEC 'fast re-tagging without opening a dialog'; the full Novo lançamento dialog covers create + full edit"
  - "Expense Valor renders neutral text-foreground (AmountCell kind='expense', signed={false}) — never red — per UI-SPEC (a gasto is not an error state)"
metrics:
  duration: ~9 min
  completed: 2026-06-16
---

# Phase 2 Plan 04: Extrato Slice Summary

Extrato vertical slice closing TXN-01/02/03/04 — the central screen: a Zod-validated transaction Server Action layer (manual CRUD + the load-bearing single-statement `bulkReclassify`) plus the dense `@tanstack/react-table` Extrato with stable `getRowId=tx.id` row selection, inline category re-tagging, per-category + grand totals from the `v_category_totals` security_invoker view, URL-persisted month + multi-category filters, a "Novo lançamento" dialog, and a self-contained `SelectionActionBar` that Phase 4's import-review reuses verbatim — turning the Wave-0 `transactions-rls` and `bulk-reclassify` tests' guarantees into the user-facing manual data loop.

## What Was Built

**Task 1 — Transaction Server Actions (TDD; commits d00f871 RED, 6cdee5e GREEN).** `src/actions/transactions.ts` (`'use server'`) mirroring `auth.ts`/`incomes.ts`/`categories.ts`: each action safeParses with the 02-01 `lib/schemas/transaction.ts` → `{ error }`, resolves the owner via `getClaims()` (`claims.sub` → "Sessão expirada." when absent), parses money via `parseBRLToCents` (catch → "Valor monetário inválido."), and `revalidatePath('/extrato')` on success.
- `createTransaction(formData)`: inserts a manual gasto with `kind: 'expense'` and a **positive** `amount_cents` bigint (sign derives from kind, never a negative value — `amount_cents > 0` DB check, T-02-TXN-VAL) for the user (TXN-01).
- `updateTransaction(id, formData)` / `deleteTransaction(id)`: edit/remove the user's own row by id; RLS guarantees a forged id matches 0 rows for another user (TXN-02).
- `bulkReclassify(ids, categoryId)`: guards `ids.length === 0` ("Nenhuma transação selecionada."), validates the target as a uuid, then a **single** `update({ category_id }).in('id', ids)` — RLS scopes the UPDATE to the caller's rows even if an id is forged (TXN-04, T-02-TXN-BULK).
- RED-first `src/actions/transactions.test.ts` (14 tests) mocks `@/lib/supabase/server` with a chainable query-builder (now with `.in()` support), asserting the positive-cents `kind:'expense'` insert, money/uuid/date Zod rejections, the by-id update/delete filters, the single `.in('id', ids)` bulk shape + empty-selection guard + uuid-target guard, and the session gate across all four actions.

**Task 2 — Extrato page + table + selection bar + filter + form (commit 7cdf552).**
- `extrato-table.tsx` (client): `@tanstack/react-table` with `getRowId = (r) => r.id` (stable transaction id — Phase-4 reusable), `enableRowSelection`, `rowSelection`/`sorting` state. Columns: `checkbox` (header select-all + indeterminate via base-ui's `indeterminate` prop) / Data (`dd/MM`, mono muted) / Descrição (truncate + `tooltip`) / Categoria (`CategoryBadge`, inline-editable via a borderless `Select` calling `updateTransaction` with the full row payload) / Valor (`AmountCell` mono tabular right-aligned, `kind='expense'` neutral — never red). Sort by `occurred_on` desc default. A `TableFooter` renders each filtered category's summed `formatCents` total (weight 600 mono) + a grand Total row. `selectedIds = Object.keys(rowSelection)` feeds the `SelectionActionBar`; `applyBulk` calls `bulkReclassify` and fires the sonner success toast "{n} transações reclassificadas".
- `selection-action-bar.tsx`: a SELF-CONTAINED sticky `--card` bar taking `{ selectedIds, categories, onApply, onClear }` (Phase-4 reuses it verbatim). Shows "{n} selecionada(s)", a category `Select`, a primary "Reclassificar" button → `onApply(categoryId)`, and "Limpar seleção". Owns the pick+apply lifecycle (clears its own selection on success); hidden when nothing is selected.
- `category-filter.tsx` (client): a multi-category `popover` checkbox list writing the selected ids to `?cat` (comma-joined) via `useSearchParams` + `router.replace` (preserving `?mes`), with active filters as removable `badge`s (swatch dot + name + ✕) and a "Limpar filtros" link.
- `transacao-form.tsx`: the "Novo lançamento" `dialog` (manual-state + `useTransition` + `toast`, mirroring `receita-form`/`categoria-form`) with data (native `type="date"`), descrição (`Input`), valor (`MoneyInput` from 02-02, validated client-side via `isValidMoney`), categoria (`Select` of non-archived categories). Routes to `createTransaction`; an optional `edit` prop + controlled `open` reuse it for full-row edits via `updateTransaction` (TXN-01/02).
- `src/app/(app)/extrato/page.tsx` (RSC): reads `?mes` (default `currentMonthKey()`) + `?cat` (parsed to a category-id array), queries the month's `transactions` (`occurred_on` between `monthBounds`, optional `.in('category_id', cat)`, ordered desc), and reads per-category + grand totals from `v_category_totals` (security_invoker, scoped to `?mes` + the active `?cat`, summed in SQL). Renders the `CategoryFilter`, the `ExtratoTable`, the "Novo lançamento" CTA → `TransacaoForm`, and the two empty states (no-data vs filtered) + error with the exact UI-SPEC pt-BR copy.

## Verification Results

- `npx vitest run src/actions/transactions.test.ts`: **14/14 GREEN** (action layer).
- `npx vitest run transactions-rls bulk-reclassify`: GREEN (Task 1 verify — substrate TXN-01/02 four-verb isolation + TXN-04 forged-`.in()` RLS scoping).
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds; `/extrato` route compiled (ƒ Dynamic).
- `grep -q "getRowId" src/components/extrato-table.tsx`: matches. `grep -q "selectedIds" src/components/selection-action-bar.tsx`: matches.
- Full suite `npx vitest run`: **117/117 GREEN** across 17 files (103 prior + 14 new transaction action tests).
- `npx eslint` on the slice files: 0 errors (1 benign React-Compiler advisory on `useReactTable` — a known TanStack interaction, not a defect).

### tx CRUD + URL filters + bulk reclassify + totals footer
- **tx CRUD (TXN-01/02):** wired — `createTransaction` inserts a positive-cents `kind:'expense'` row; the dialog (create) + inline Select + full edit (update) + delete all post to real actions; RLS owner-scoping proven by the Wave-0 four-verb test.
- **URL filters (TXN-03):** the RSC reads `?mes` + `?cat`; `CategoryFilter` writes `?cat` via `router.replace` preserving `?mes`; the table data + the totals footer both reflect the active filter (not a page slice). Functional in build/tsc; the manual click-through round-trip is deferred to the 02-05 human-verify checkpoint per the plan.
- **Bulk reclassify (TXN-04):** `selectedIds = Object.keys(rowSelection)` → `SelectionActionBar` → `bulkReclassify` single `.in('id', ids)` update + sonner toast. Self-contained for Phase-4 reuse.
- **Totals footer (TXN-03):** per-category + grand totals from `v_category_totals` (summed in SQL inside RLS), rendered mono/600 right-aligned in the `TableFooter`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] base-ui Checkbox indeterminate prop (not a checked union)**
- **Found during:** Task 2 (`tsc --noEmit`).
- **Issue:** The header select-all checkbox passed `checked={'indeterminate' | boolean}`, but base-ui's `Checkbox` types `checked` as `boolean | undefined` and exposes a separate `indeterminate` boolean prop (TS2322).
- **Fix:** Split into `checked={table.getIsAllRowsSelected()}` + `indeterminate={getIsSomeRowsSelected() && !getIsAllRowsSelected()}`.
- **Files modified:** src/components/extrato-table.tsx
- **Commit:** 7cdf552

**2. [Rule 3 - Blocking] DialogTrigger render expects a ReactElement, not ReactNode**
- **Found during:** Task 2 (`tsc --noEmit`).
- **Issue:** `TransacaoForm`'s `trigger?: React.ReactNode` passed to `DialogTrigger render={...}` failed — base-ui's `render` requires a `ReactElement` (TS2322).
- **Fix:** Narrowed the prop type to `React.ReactElement`.
- **Files modified:** src/components/transacao-form.tsx
- **Commit:** 7cdf552

**3. [Rule 1 - Bug] Test UUID fixtures must be RFC-4122 v4 shape**
- **Found during:** Task 1 (GREEN test run — 8 failures with "Selecione uma categoria").
- **Issue:** The placeholder fixtures `11111111-1111-1111-1111-111111111111` were rejected by `transactionSchema.categoryId.uuid()` because zod v4 `.uuid()` validates the version + variant nibbles.
- **Fix:** Used valid v4 fixtures (version nibble `4`, variant `8`): `…-4111-8111-…`. This is a test-data correctness fix, not a behavior change — it confirms the boundary correctly enforces real uuids (T-02-TXN-VAL).
- **Files modified:** src/actions/transactions.test.ts
- **Commit:** 6cdee5e

### Plan-intent adjustments (no permission needed)
- **Date field via native `type="date"`** rather than `popover`+`calendar`, consistent with 02-02's receita-form choice (accessible, validates the same `YYYY-MM-DD` the action expects). The `calendar` primitive remains available.
- **Per-category totals filtered in the RSC** from the month's `v_category_totals` rows (the view is keyed by `month_key` + `category_id`); the SQL still does the summing, the RSC only selects the active-filter subset and sorts by total desc.
- **bulkReclassify gains a uuid guard** on the target (Rule 2 — boundary hardening) beyond the planned empty-selection guard, so a missing/forged target category is rejected before the `.in()` update.
- **Wave-0 tx tests already GREEN:** per 02-01, `transactions-rls`/`bulk-reclassify` assert DB-substrate guarantees and were GREEN before this slice. This plan adds the *action-level* tests the plan called for (`transactions.test.ts`).

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation warning (Phase 1 file convention) — surfaced by `npm run build`, unrelated to this plan (already logged in 02-01/02/03).
- React-Compiler advisory on `useReactTable` (TanStack returns non-memoizable functions) — a known library interaction, 0 lint errors; the table renders correctly.

## Authentication Gates
None — the local Supabase stack was already running (API at http://127.0.0.1:55321, migrations 0001-0008). The actions resolve the owner via `getClaims()` and return "Sessão expirada." when unauthenticated (covered by unit tests across all four actions), which is normal flow, not a gate.

## Known Stubs
None. The page reads live `transactions` + `v_category_totals` for the selected month/filter; the form, inline Select, and SelectionActionBar all post to real Server Actions; the totals footer reflects the actual SQL sums. The Dashboard nav link remains the only forward reference (Phase 3+).

## Threat Surface
No new surface beyond the plan's `<threat_model>`. T-02-TXN-BULK (single `.in('id', ids)` UPDATE, RLS-scoped even with forged ids — `bulk-reclassify.test.ts` proves user B's forged-id update touches 0 rows), T-02-TXN-VAL (Zod uuid/date/amount + `parseBRLToCents` throw-on-invalid + positive `amount_cents` DB check; the bulk target is also uuid-validated), and T-02-TXN-RLS (transaction reads + `v_category_totals` via `getClaims()` owner + security_invoker view, no app-only filtering) are all implemented as specified.

## Local Stack
Left **running** for 02-05 — `supabase status` reports the local API at http://127.0.0.1:55321 with migrations 0001-0008 applied. The next plan (human-verify walkthrough) can exercise the Extrato filters + bulk re-classify against the live stack immediately.

## Self-Check: PASSED
