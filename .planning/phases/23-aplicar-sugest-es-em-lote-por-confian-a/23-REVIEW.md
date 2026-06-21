---
phase: 23-aplicar-sugest-es-em-lote-por-confian-a
reviewed: 2026-06-21T11:40:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/components/import-review-table.tsx
  - src/components/import-review-table.test.tsx
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-06-21T11:40:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Phase 23 (CLSAI-10) gates the bulk-apply control on confidence: it adds the `isConfidentPending` predicate (`category_id === null && suggestion.categoryId && confidence >= LOW_CONFIDENCE`), replaces `unappliedSuggestionCount` with `confidentSuggestionCount` to drive the button label/visibility, and relabels the button + toast to pt-BR "confiáveis" copy.

I adversarially traced all four stated invariants and could not break any of them:

1. **Low-confidence rows stay pending + uncategorized.** `isConfidentPending` requires `confidence >= 0.6`, so a `0.3` row is never selected by `applyAllSuggestions` (line 413–437). Verified by tests `confident-applies-low-stays-pending` and `button-hidden-when-zero-confident`.
2. **Apply path writes nothing.** `applyAllSuggestions` only calls `setRows` + `toast`; no `confirmImport`, no server action. The per-row fill matches the chip path (`origin: 'manual'`, `reserva_id: null`). Verified by `apply-all` asserting `confirmImportMock` is never called.
3. **Amber-tag predicate + low-confidence-first sort are byte-identical.** `ConfidenceTag` (line 181) and `isLowConfidenceAi` (line 197) both still use `confidence < LOW_CONFIDENCE`; `lowConfidenceFirst` is untouched. The new `isConfidentPending` uses `>= LOW_CONFIDENCE`, so the two predicates partition the space at exactly 0.6 with **no gap and no overlap** — a `0.6` row is confident and shows no amber tag. Verified by `boundary-0.6-is-confident`.
4. **`r.suggestion!` non-null assertion is sound.** `isConfidentPending` short-circuits on `!!r.suggestion?.categoryId`, so when it returns `true`, `r.suggestion` is defined and `categoryId` is non-null. The `r.suggestion!.categoryId` at line 423 cannot dereference `undefined`. `tsc --noEmit` is clean for this file.

Additional checks:
- **No stale `unappliedSuggestionCount` reference** anywhere in `src/` (grep across `.ts`/`.tsx` returns nothing).
- **Count/visibility never mismatch.** Both `confidentSuggestionCount` (line 731) and the `applyAllSuggestions` map (line 416–417) derive from the same `rows` state via the same `isConfidentPending` predicate — not from `visibleRows` — so the button count, the apply effect, and the post-apply hide (`> 0` gate, line 741) are always consistent regardless of the `onlyUnclassified` filter.
- Full suite passes: 21/21 tests green.

Findings below are quality-only; neither blocks shipping this phase.

## Warnings

### WR-01: Side-effecting `toast()` call inside the `setRows` state updater

**File:** `src/components/import-review-table.tsx:413-437`
**Issue:** `applyAllSuggestions` fires `toast(...)` from *inside* the `setRows((prev) => { ... })` reducer. State updater functions are supposed to be pure; React may invoke them more than once (notably under StrictMode double-invocation in development, or when bailing out of an update), which would emit a duplicate toast. This is **pre-existing** (it was present before Phase 23 in commit `a3e7405`, and the same pattern is used by `deleteRow`'s undo toast at line 460) — Phase 23 only changed the toast *copy*, not its placement — so it is not a regression introduced by this phase. Flagged because the phase touched these exact lines and the pattern is fragile. StrictMode is not currently enabled in `next.config`, so the impact is latent today.
**Fix:** Compute the applied count outside the reducer and toast after the state commit, e.g.:
```tsx
const applyAllSuggestions = React.useCallback(() => {
  setRows((prev) => {
    let applied = 0
    const next = prev.map((r) => {
      if (isConfidentPending(r)) {
        applied += 1
        return { ...r, category_id: r.suggestion!.categoryId, reserva_id: null, origin: 'manual' as const }
      }
      return r
    })
    return next
  })
  const applied = rows.filter(isConfidentPending).length
  if (applied > 0) {
    toast(`${applied} ${applied === 1 ? 'sugestão confiável aplicada' : 'sugestões confiáveis aplicadas'}`)
  }
}, [rows])
```
(or capture the count via a ref) — keeping the reducer pure and the toast a one-shot effect of the click.

## Info

### IN-01: Test coverage does not pin the `suggestion === undefined` (absent) row through the bulk path

**File:** `src/components/import-review-table.test.tsx:269-308`
**Issue:** Every bulk-apply test supplies a `suggestion` object. The `isConfidentPending` predicate also has to correctly return `false` for a row with `suggestion: undefined` (the v1.3 / no-AI back-compat path) via the `!!r.suggestion?.categoryId` guard. This path is exercised indirectly by `no-suggestions-v1.3-identical`, but no test mixes an undefined-suggestion row *into a batch that also contains confident rows* and asserts the undefined row is left untouched by `applyAllSuggestions`. The code is correct (optional chaining handles it), so this is a coverage gap, not a defect.
**Fix:** Add a row with no `suggestion` field alongside a confident row in an `apply-all`-style test and assert the no-suggestion row's category stays `null` (its "Classificar" placeholder remains) after clicking the bulk button.

---

_Reviewed: 2026-06-21T11:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
