---
phase: 23-aplicar-sugest-es-em-lote-por-confian-a
reviewed: 2026-06-21T11:47:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/components/import-review-table.tsx
  - src/components/import-review-table.test.tsx
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-06-21T11:47:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Iteration-2 re-review of the WR-01 fix (commit `83763a6`): the `toast()` was hoisted out
of the `setRows` updater in `applyAllSuggestions`, the reducer is now a pure `prev.map(...)`,
the applied count is derived from `rows.filter(isConfidentPending).length` in the callback
closure, the toast fires once outside the reducer gated on `applied > 0`, and the
`useCallback` dep array changed `[]` → `[rows]`. The IN-01 back-compat test was also added.

The fix is **correct on all four verification axes**:

1. **Count correctness (no off-by-one / no stale undercount).** `useCallback(..., [rows])`
   recreates the handler on every `rows` change, so the `onClick`-bound closure
   (line 749) always references the latest committed `rows`. At click time, closure
   `rows` === reducer `prev` (no intervening setState in the handler), and `applied`
   (line 435) and the reducer (line 421-433) apply the **same `isConfidentPending`
   predicate over the same array** → the toast count equals the number actually applied.
   The dep change `[]` → `[rows]` is *necessary*: with `[]` the closure would freeze at
   `initialRows` and undercount after any state change. Confirmed correct. The
   button-label count (`confidentSuggestionCount`, line 735) reads `rows` from the same
   render closure, so the label count and the toast count are always identical.

2. **No double-toast / pure reducer.** The reducer is side-effect-free; the toast fires
   exactly once per click outside the updater. StrictMode double-invocation of the
   updater no longer emits a duplicate toast (the prior defect). Confirmed.

3. **Phase invariants hold.** Low-confidence rows untouched (`>= LOW_CONFIDENCE` gate
   unchanged); no `confirmImport`/DB write (`applyAllSuggestions` only calls `setRows` +
   `toast`; tests assert `confirmImportMock` never called); amber tag (`ConfidenceTag`,
   `isLowConfidenceAi`) + `lowConfidenceFirst` sort untouched by this diff; LOCKED pt-BR
   toast copy byte-identical (`"sugestão confiável aplicada"` /
   `"sugestões confiáveis aplicadas"`).

4. **IN-01 back-compat test is sound.** `apply-all-undefined-suggestion-untouched`
   (lines 310-345) exercises the `!!r.suggestion?.categoryId` guard for a
   `suggestion: undefined` row alongside a confident row — asserts the button reads
   "Aplicar 1", the no-suggestion row stays uncategorized, no chip rendered, the button
   disappears post-apply, and no write fires. Closes the iteration-1 coverage gap.

Full suite (22 tests) passes (`vitest run` green). The diff matches the described change
exactly. One behavioral nuance the fix *introduced* is recorded below as a WARNING — it is
minor and non-destructive, flagged for the record since it is a real change in toast
behavior versus the pre-fix code.

## Warnings

### WR-01: Rapid double-click can emit a spurious second "N aplicadas" toast

**File:** `src/components/import-review-table.tsx:435-440`
**Issue:** Before the fix, the toast lived inside the `setRows` reducer keyed on the
`applied` delta computed *during that reducer run*; a second reducer invocation over
already-applied rows recomputed `applied = 0` and did **not** toast. After the fix, the
toast reads `applied` from the callback closure's `rows`. The bulk-apply button is not
disabled while the apply settles, so if the user clicks it twice before React commits the
re-render, the second click still sees the **stale pre-update closure `rows`** (the
callback has not been recreated yet because `rows` has not changed), recomputes
`applied = N`, and emits a second identical `"N sugestões confiáveis aplicadas"` toast —
even though that second click applies nothing new (the reducer's `prev` is now the updated
state, so `prev.map` is a no-op).

Net effect: a double-click shows two identical success toasts; after re-render the button
correctly disappears. No data corruption, no extra writes, and the *first* toast's count is
always correct — purely a duplicate-toast UX blip on fast double-clicks. This is a small
behavioral regression versus the pre-fix code (which self-suppressed the second toast), so
it is flagged for the record; acceptable to defer if the phase scope is strictly the
reducer-purity fix.

**Fix:** Disable the bulk button while the apply settles (mirror the `isConfirming`
pattern already used for the confirm button at line 758), or early-return + drive the
button off the next-state so a second click cannot land before re-render:

```tsx
const applyAllSuggestions = React.useCallback(() => {
  const toApply = rows.filter(isConfidentPending)
  if (toApply.length === 0) return // nothing to apply → no toast, no setRows
  setRows((prev) =>
    prev.map((r) =>
      isConfidentPending(r)
        ? { ...r, category_id: r.suggestion!.categoryId, reserva_id: null, origin: 'manual' as const }
        : r,
    ),
  )
  toast(
    `${toApply.length} ${toApply.length === 1 ? 'sugestão confiável aplicada' : 'sugestões confiáveis aplicadas'}`,
  )
}, [rows])
```

The early-return alone does not fully close the race (the second click's closure `rows`
is still pre-update). The robust fix is to disable the button during the apply so a second
click cannot fire before the closure refreshes.

---

_Reviewed: 2026-06-21T11:47:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
