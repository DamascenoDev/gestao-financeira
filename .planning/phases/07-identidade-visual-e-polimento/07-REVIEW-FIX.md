---
phase: 07-identidade-visual-e-polimento
fixed_at: 2026-06-17T00:00:00Z
review_path: .planning/phases/07-identidade-visual-e-polimento/07-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 5
skipped: 1
status: partial
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-06-17
**Source review:** .planning/phases/07-identidade-visual-e-polimento/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (WR-01 … WR-06; Info findings excluded by critical_warning scope)
- Fixed: 5 (WR-01, WR-02, WR-03, WR-04, WR-06)
- Skipped: 1 (WR-05)

All fixes are behavior-preserving for the Phase 7 re-skin constraint: no
persisted-money change, no business-logic/data/security change to phases 1-6.
Full unit suite green after the fixes (72 files / 599 tests passing, including
`tests/mei-view-leak.test.ts` which passed this run), and `npx tsc --noEmit`
clean.

## Fixed Issues

### WR-01: Chart money aggregation uses lossy `Number()` instead of integer-cents/bigint

**Files modified:** `src/app/(app)/dashboard/page.tsx`
**Commit:** c728934
**Applied fix:** Reworked the receita/gasto chart aggregation to accumulate on
`bigint` via `centsToBigInt(...)` (the project's MD-04 money coercion helper,
already imported in this file), casting to `Number` only at the final Recharts
datum boundary (`receita`, `gasto`, and the distribution `cents`). Removes the
lossy `Number(r.total_cents ?? 0)` casts and the "stays within safe integer
range" assumption, matching every sibling money path in the same file
(`buildRows`, `incomeCentsForDialog`) and the tables. No change to persisted
money or to the existing RLS-scoped view reads.

### WR-02: Receita-vs-gasto empty state hides a half-populated chart

**Files modified:** `src/app/(app)/dashboard/page.tsx`
**Commit:** c728934 (same file/commit as WR-01 — both edits are in the dashboard
chart pipeline and could not be split into independent hunks cleanly; the commit
message documents both finding IDs)
**Applied fix:** Changed `hasReceitaGastoData` from the post-filter
`data.some(d => d.receita > 0 || d.gasto > 0)` sum gate to a source-row gate:
`incomeSeries.length > 0 || categoryTotals.length > 0`. This implements the
reviewer's recommended "has any transaction this window" contract, so activity
that nets to zero in both series (e.g. only alocação transfers, which are
correctly excluded from gasto and have no matching receita) no longer surfaces a
misleading "Sem dados" empty state. Purely a UI gating change; chart data and
filtering are otherwise unchanged.

### WR-03: `confirmReserva` toggles `isSaving` synchronously around an async transition (no real disable)

**Files modified:** `src/components/extrato-table.tsx`
**Commit:** 0365b01
**Applied fix:** Switched the `useTransition()` destructure to expose
`isPending`, removed the dead synchronous `isSaving` state, and bound the
"Confirmar aporte" button's `disabled` to `isPending`. `confirmReserva` now
dispatches `apply(...)` (which schedules the `updateTransaction` transition) and
closes the dialog, with the in-flight disable driven by the real transition
pending flag instead of a boolean that flipped back in the same tick. The
underlying Server Action behavior is unchanged.

### WR-04: `runConfirm` leaves `isConfirming` stuck `true` after a successful import

**Files modified:** `src/components/import-review-table.tsx`
**Commit:** 0b733df
**Applied fix:** Added `setIsConfirming(false)` on the success branch, before
`router.push('/extrato')`. Prevents the confirm button from being left
permanently disabled ("Importando…") if the soft navigation is slow/intercepted
or the user navigates back to the still-mounted tree. The error/catch branches
already reset the flag; `confirmImport` behavior is unchanged.

### WR-06: `ChartTooltipContent` formatter is invoked with raw cents; non-formatter fallback shows raw integer cents

**Files modified:** `src/components/ui/chart.tsx`
**Commit:** 3d8368c
**Applied fix:** Relaxed the tooltip-item guard in the vendored shadcn primitive
from `formatter && item?.value !== undefined && item.name` to
`formatter && item?.value !== undefined`. When a consumer supplies a `formatter`
(both dashboard charts pass `formatCents`), it now always runs, so money can no
longer leak through the default `item.value.toLocaleString()` branch as raw
integer cents when `item.name` is falsy. The default (no-formatter) rendering
path is untouched. Scoped, careful change to the vendored primitive.

## Skipped Issues

### WR-05: Mobile/desktop dual-render duplicates interactive controls and emits duplicate accessible names

**File:** `src/components/extrato-table.tsx:375-485`, `src/components/import-review-table.tsx:385-493`, `src/components/nf-table.tsx:190-274`
**Reason:** skipped — no clean behavior-preserving fix exists within the re-skin
constraint. The duplication is inherent to the chosen `hidden md:table` /
`md:hidden` card-collapse approach, and the reviewer's own analysis confirms (a)
the inactive breakpoint resolves to Tailwind `display:none` (so assistive tech
skips the hidden subtree — acceptable) and (b) the only true remediation is a
single-render restyle-per-breakpoint refactor of all three tables. That refactor
would touch the explicitly-frozen TanStack row model / selection / sort / footer
logic across three components, which is exactly the kind of behavior change the
Phase 7 re-skin guardrail forbids. The reviewer's minimal alternative is to
document that the duplicated-name (`getAllByText`) tests are intentional; that
documentation is captured here rather than via a code change. Recommend a future
non-re-skin phase own the single-render refactor.
**Original issue:** The card-collapse pattern renders both the desktop table and
the mobile card list into the DOM simultaneously, hiding one via CSS, so every
interactive control (checkboxes, category selects, action menus, tooltip
triggers, and nf-table `formatCents` totals) exists twice; the tests switched to
`getAllByText(...).length > 0`, which masks future single-render regressions.

---

_Fixed: 2026-06-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
