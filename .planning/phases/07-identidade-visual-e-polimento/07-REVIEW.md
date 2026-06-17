---
phase: 07-identidade-visual-e-polimento
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/app/(app)/dashboard/page.tsx
  - src/components/extrato-table.tsx
  - src/components/import-review-table.tsx
  - src/components/nf-table.tsx
  - src/components/ui/chart.tsx
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: clean
---

# Phase 7: Code Review Report (iteration 2)

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 5
**Status:** clean

## Summary

Re-review of the Phase 7 RE-SKIN ONLY change after iteration 1 fixed 5 of 6 warnings
(commits c728934, 0365b01, 0b733df, 3d8368c). All five fixes (WR-01/02/03/04/06) are
genuinely resolved. Each was traced through its full data/control path against the
supporting helper (`src/lib/money.ts`) and the two chart consumers
(`receita-gasto-chart.tsx`, `category-distribution-chart.tsx`). No new bug, money-drift,
disabled-state, or theme/behavior regression was introduced. WR-05 remains an accepted,
documented skip and is noted below as INFO (it does not affect the clean status).

No Critical or Warning findings remain.

### Verification of iteration-1 fixes

- **WR-01 (dashboard chart money via bigint) — RESOLVED.** `receitaByMonth` and
  `gastoByMonth` are now `Map<string, bigint>`, accumulated with `centsToBigInt(...)` +
  bigint `+` (page.tsx:293-306). `Number()` is applied only at the Recharts datum boundary
  (page.tsx:310-311, 334). `centsToBigInt(null/undefined)` returns `0n` and `BigInt()`
  converts integer strings/numbers exactly, so no lossy float step exists in the money
  aggregation. The chart consumers re-sum the already-coerced plain numbers for the labeled
  totals legend; those values stay well within `Number.MAX_SAFE_INTEGER` for any realistic
  budget, and `formatCents` still guards `Number.isSafeInteger`. No drift.

- **WR-02 (empty-state gate on source-row presence) — RESOLVED.**
  `hasReceitaGastoData = incomeSeries.length > 0 || categoryTotals.length > 0`
  (page.tsx:318-319) now keys off raw read presence, not post-filter sums, so activity that
  nets to zero in both series (e.g. only alocação transfers, correctly excluded from gasto)
  no longer falsely shows the "Sem dados" copy. Truthful contract.

- **WR-03 (extrato aporte-confirm disable via isPending) — RESOLVED.** `confirmReserva`
  dispatches through `apply()`, which uses `startTransition` (extrato-table.tsx:126-131,
  146-160); the "Confirmar aporte" button is `disabled={isPending}` (extrato-table.tsx:218).
  The previous synchronous `setIsSaving` could never gate an async-scheduled write;
  `isPending` correctly does. Closing the dialog after dispatch is acceptable UX (the write
  proceeds in the background and the sonner toast confirms). The underlying Server Action
  call is unchanged.

- **WR-04 (import: reset isConfirming before router.push) — RESOLVED.**
  `setIsConfirming(false)` runs before `router.push('/extrato')` on success
  (import-review-table.tsx:348-349), and the error/catch branches also reset it
  (lines 337, 353). A slow/intercepted soft navigation or a back-navigation to the still-
  mounted tree can no longer leave the confirm button permanently stuck on "Importando…".

- **WR-06 (chart tooltip runs formatter regardless of falsy item.name) — RESOLVED.** The
  per-item branch now gates on `formatter && item?.value !== undefined` (chart.tsx:222)
  instead of additionally requiring a truthy `item.name`. Both consumers pass
  `formatter={(value) => formatCents(Number(value))}` and read only the value, so money is
  always currency-formatted and never falls through to the raw
  `item.value.toLocaleString()` integer-cents default. Verified against both chart callers.

## Info

### IN-01: WR-05 dual desktop/mobile render duplicates accessible names (accepted skip)

**File:** `src/components/extrato-table.tsx:374-518`, `src/components/import-review-table.tsx:368-533`, `src/components/nf-table.tsx:187-276`
**Issue:** Each of the three tables renders a desktop `<Table>` (`hidden md:table`) and a
separate mobile `<ul>` card list (`md:hidden`) from the same row model, so interactive
controls and accessible names (checkbox `aria-label="Selecionar linha"`, the inline
category `Select`, per-row action triggers, totals nodes) exist twice in the DOM. Only one
branch is visible at a time and Tailwind `md:table`/`md:hidden` resolve to `display:none`,
so the inactive subtree is removed from the accessibility tree and there is no functional
defect. This was WR-05 in iteration 1 — intentionally NOT fixed.
**Fix:** Documented accepted skip. The only real fix is a single-render responsive refactor,
which would touch the frozen TanStack row models and violate the Phase 7 re-skin guardrail.
Deferred intentionally; recorded as INFO, not a blocker.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
