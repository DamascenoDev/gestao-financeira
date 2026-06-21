---
phase: 23-aplicar-sugest-es-em-lote-por-confian-a
plan: 01
subsystem: ui
tags: [react, tanstack-table, import-review, classification, confidence-threshold, vitest]

# Dependency graph
requires:
  - phase: 16-confianca-no-review-grid
    provides: "LOW_CONFIDENCE constant, ConfidenceTag + isLowConfidenceAi predicates, low-confidence-first sort, the original apply-all bulk button"
  - phase: 15-classificacao-ia
    provides: "ReviewRow.suggestion { categoryId, confidence, source:'ia' } threaded from the parse pipeline"
provides:
  - "Confidence-gated bulk apply: applyAllSuggestions fills only confidence >= 0.6 rows"
  - "isConfidentPending(row) predicate — single home for the 0.6 apply/count boundary"
  - "confidentSuggestionCount derivation (replaces unappliedSuggestionCount) driving button visibility + label"
  - "LOCKED pt-BR confident copy (button + toast) in singular/plural"
affects: [import-review, classificacao, review-grid]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source threshold predicate: isConfidentPending mirrors isLowConfidenceAi so the 0.6 boundary lives in exactly one place (count + apply gate), partitioning the space with the amber-tag's < 0.6 at no gap/overlap"
    - "Non-null assertion (r.suggestion!) inside a boolean-predicate-gated branch where the boolean helper does not narrow under TS strict"

key-files:
  created: []
  modified:
    - src/components/import-review-table.tsx
    - src/components/import-review-table.test.tsx

key-decisions:
  - "Reused LOW_CONFIDENCE (0.6) as the bulk-apply threshold — no new constant, so the 'confiável' set and the existing amber 'baixa confiança' set never drift"
  - "Inclusive boundary: confidence >= LOW_CONFIDENCE applies (a 0.6 row is confident, no amber tag); < 0.6 stays pending — consistent with the existing tag predicate"
  - "Factored a single isConfidentPending predicate (Claude's discretion per CONTEXT) used by both the count and the apply gate; non-null assertion for TS-strict narrowing in the apply branch"
  - "Deleted dead unappliedSuggestionCount entirely (single-use); confirmImport left byte-identical — bulk apply mutates client state only"

patterns-established:
  - "Confidence-partitioned bulk action: confident rows auto-fill, low-confidence rows are left untouched for per-row manual review"

requirements-completed: [CLSAI-10]

# Metrics
duration: 4min
completed: 2026-06-21
status: complete
---

# Phase 23 Plan 01: Aplicar sugestões em lote por confiança Summary

**Bulk-apply in the import review grid now fills ONLY confident (confidence >= 0.6) AI suggestions in one click, leaving low-confidence rows pending + uncategorized for manual review, with the threshold made explicit in the LOCKED pt-BR "confiáveis" copy — no auto-commit, confirmImport untouched.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-21T14:31:05Z
- **Completed:** 2026-06-21T14:35:xxZ
- **Tasks:** 1 (TDD)
- **Files modified:** 2

## Accomplishments
- Gated `applyAllSuggestions` on `isConfidentPending` (`confidence >= LOW_CONFIDENCE`) — low-confidence rows stay untouched and pending
- Replaced `unappliedSuggestionCount` with `confidentSuggestionCount`, driving both button visibility (hidden at 0 confident, even with low-confidence rows still pending) and the count in the label
- Relabeled the button + success toast to the LOCKED pt-BR confident copy in singular ("Aplicar 1 sugestão confiável" / "1 sugestão confiável aplicada") and plural forms
- Single `isConfidentPending` predicate keeps the 0.6 boundary in one place — partitions the space with the existing amber `< 0.6` tag at no gap/overlap
- `confirmImport` and all server/sort/amber-tag/provenance code left byte-identical (no DB write in the apply path)

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1 (RED): failing confidence-gated tests** - `93581a5` (test)
2. **Task 1 (GREEN): gate bulk-apply + relabel** - `bd8de3c` (feat)

_No REFACTOR commit — the predicate was factored cleanly in the GREEN edit; no further cleanup needed._

## Files Created/Modified
- `src/components/import-review-table.tsx` - Added `isConfidentPending` predicate; gated `applyAllSuggestions` (apply only `>= 0.6`, `r.suggestion!` narrowing, confident toast copy); replaced `unappliedSuggestionCount` with `confidentSuggestionCount`; relabeled button to confident copy (singular/plural). `confirmImport`, `ConfidenceTag`, `isLowConfidenceAi`, `lowConfidenceFirst`, `LOW_CONFIDENCE` value all untouched.
- `src/components/import-review-table.test.tsx` - Rewrote the `apply-all` case to confident-only semantics; added `confident-applies-low-stays-pending`, `boundary-0.6-is-confident`, `button-hidden-when-zero-confident`, and the confident-toast (singular + plural) cases; added a `toast` mock clear in `beforeEach` so the `toHaveBeenCalledWith` toast assertions cannot leak across cases.

## Decisions Made
- Reused `LOW_CONFIDENCE = 0.6` as the threshold (no new constant) per the LOCKED CONTEXT decision — single source of truth shared by the amber tag and the confident gate.
- Inclusive `>= LOW_CONFIDENCE` boundary so exactly 0.6 is treated as confident (pinned by the `boundary-0.6-is-confident` test).
- Used a non-null assertion (`r.suggestion!.categoryId`) inside the `applyAllSuggestions` branch — the `boolean` predicate does not narrow `r.suggestion` under TS strict (smallest diff; confirmed by `npm run build`).
- Added a `toast` mock `mockClear()` in `beforeEach` (beyond the plan's literal edit set) so the new `toHaveBeenCalledWith` toast-copy assertions are not contaminated by a `toast()` call from a prior case — a correctness requirement for the new tests (deviation Rule 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a `toast` mock clear in the test `beforeEach`**
- **Found during:** Task 1 (writing the new bulk-toast singular/plural cases)
- **Issue:** The existing harness reset only `confirmImportMock` in `beforeEach`; the bare `toast(...)` mock was never cleared. The new `bulk-toast-confident-copy` cases assert via `toHaveBeenCalledWith`, which matches any prior call — a `toast()` from an earlier case in the same file could produce a false pass/fail.
- **Fix:** Made `beforeEach` async and added `vi.mocked(toast).mockClear()` (imported from the `sonner` mock).
- **Files modified:** src/components/import-review-table.test.tsx
- **Verification:** Full target suite (21 cases) + full project suite (916 cases) green.
- **Committed in:** `93581a5` (RED test commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical — test isolation).
**Impact on plan:** Necessary for correct, non-flaky test assertions. No scope creep; production diff confined exactly to the two target files.

## Issues Encountered

- **Acceptance-criterion grep heuristic off by 2 (benign).** The plan's acceptance criteria expected `grep -cE 'confidence < LOW_CONFIDENCE'` to return `2` (the two amber-tag code predicates). The actual count is `4` because two PRE-EXISTING doc-comments (the `LOW_CONFIDENCE` const comment at `:105` and the `ReviewRow.suggestion` comment at `:274`) also contain the literal string `confidence < LOW_CONFIDENCE`. Verified the HEAD (pre-edit) file already returned `4`, and `git diff` shows ZERO changes to any `< LOW_CONFIDENCE` line — both amber-tag code predicates (`ConfidenceTag` `:181`, `isLowConfidenceAi` `:197`) are byte-identical. The criterion's substantive intent (amber predicates untouched) is fully satisfied; only the planner's grep assumption (lines vs. code-only) was imprecise. No action needed.

## User Setup Required

None - no external service configuration required. Pure client-side relabel/regate of existing in-memory grid state; no env vars, no migration, no package change.

## Next Phase Readiness
- CLSAI-10 satisfied. The operator can now bulk-apply only confident pending suggestions; low-confidence rows are left for per-row manual review.
- Diff confined to `import-review-table.tsx` + its test. No server/schema/types/migration/package change — the schema-push gate stayed OFF as planned.
- Phase 23 has a single plan (23-01); phase is execution-complete pending verification.

## Self-Check: PASSED
- `src/components/import-review-table.tsx` — FOUND (modified)
- `src/components/import-review-table.test.tsx` — FOUND (modified)
- Commit `93581a5` (RED) — FOUND
- Commit `bd8de3c` (GREEN) — FOUND

---
*Phase: 23-aplicar-sugest-es-em-lote-por-confian-a*
*Completed: 2026-06-21*
