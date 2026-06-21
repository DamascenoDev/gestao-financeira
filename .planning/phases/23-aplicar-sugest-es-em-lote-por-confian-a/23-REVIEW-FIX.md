---
phase: 23-aplicar-sugest-es-em-lote-por-confian-a
fixed_at: 2026-06-21T11:45:00Z
review_path: .planning/phases/23-aplicar-sugest-es-em-lote-por-confian-a/23-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 23: Code Review Fix Report

**Fixed at:** 2026-06-21T11:45:00Z
**Source review:** .planning/phases/23-aplicar-sugest-es-em-lote-por-confian-a/23-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Side-effecting `toast()` call inside the `setRows` state updater

**Files modified:** `src/components/import-review-table.tsx`
**Commit:** 83763a6
**Applied fix:** Hoisted the `toast(...)` call OUT of the `setRows((prev) => …)` reducer in `applyAllSuggestions`. The reducer is now a pure `prev.map(...)` that only fills confident rows. The applied count is derived after the state update via `rows.filter(isConfidentPending).length`, and the toast fires once outside the reducer, gated on `applied > 0`. The LOCKED pt-BR copy is byte-identical ("{N} sugestões confiáveis aplicadas" / singular "1 sugestão confiável aplicada"). The `React.useCallback` dependency array was updated from `[]` to `[rows]` since the count now reads `rows` directly (the closure must see current state). Phase invariants preserved: still client-state-only (no `confirmImport`, no DB write), low-confidence rows untouched, amber-tag predicate and low-confidence-first sort unchanged.

Verification: `tsc --noEmit` clean; full component suite green (22/22).

### IN-01: Test coverage does not pin the `suggestion === undefined` (absent) row through the bulk path

**Files modified:** `src/components/import-review-table.test.tsx`
**Commit:** f9fac1c
**Applied fix:** Added test `apply-all-undefined-suggestion-untouched`, which renders a confident row (0.9) alongside a row with NO `suggestion` field (the v1.3 / no-AI back-compat path), clicks the bulk-apply button (which reads "Aplicar 1 sugest…", proving only the confident row is counted), and asserts the no-suggestion row is left untouched: its "Classificar" placeholder remains, its descriptor is still present, no "Aplicar sugestão" chip ever rendered for it, the bulk button disappears, and `confirmImport` is never called. This exercises the `!!r.suggestion?.categoryId` guard in `isConfidentPending` directly within a mixed batch.

Note: an initial draft of this test also asserted the literal "Transporte" was absent from the DOM, but that category is a permanent `<Select>` option in every row regardless of classification, so the assertion was removed in favor of the "Classificar" placeholder + absent-chip checks that actually pin the back-compat behavior.

Verification: `tsc --noEmit` clean; full component suite green (22/22, up from 21).

---

_Fixed: 2026-06-21T11:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
