---
phase: 15-classification-wire
plan: 02
subsystem: ai
tags: [ai-sdk, classification, ingest, memory-first, byok, pii-guard, maxDuration, two-pass]

# Dependency graph
requires:
  - phase: 15-classification-wire (plan 01)
    provides: "classifyDescriptors(descriptors, categories, aiSettings) batched never-throw classifier; ParsedReviewRow.suggestion? additive field"
  - phase: 14-key-storage-byok-settings
    provides: "getDecryptedAiSettings() server-only decrypt DAL; modelFor provider factory; validateSuggestion enum gate"
provides:
  - "import.ts two-pass ingest wire: PASS1 memory-first / COLLECT unique misses / ONE classifyDescriptors call / PASS2 attach row.suggestion (never row.category_id)"
  - "Non-blocking IngestSummary.iaIndisponivel? note on no-key / empty-Map AI fallback"
  - "suggestCategory rewritten as a 1-item PII-safe delegate to classifyDescriptors (null on no-key, no provider fetch)"
  - "pii-guard payload-egress invariant: the sent prompt carries ONLY descriptor_norm, no amount/date/raw"
  - "maxDuration 60 on the importar page segment (bounds parse + one batched LLM classify)"
affects: [16 (review grid SuggestionSlot rendering of row.suggestion + iaIndisponivel surfacing)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-pass ingest: per-row memory loop collects a unique miss Set; ONE batched AI call after the loop; map results back by descriptor_norm"
    - "Memory-first zero-call: when the miss set is empty, the AI path (incl. the key read) is skipped entirely"
    - "Non-binding AI hint: suggestion attached to row.suggestion, NEVER applied to row.category_id (no auto-commit)"
    - "PII contract enforced by payload inspection (spy doGenerate.prompt), not by absence-of-call"

key-files:
  created:
    - tests/fixtures/itau-dup-descriptor.ofx
  modified:
    - src/lib/classifier/suggest.ts
    - src/lib/classifier/suggest.test.ts
    - src/actions/import.ts
    - src/actions/import.test.ts
    - tests/pii-guard.test.ts
    - "src/app/(app)/importar/page.tsx"

key-decisions:
  - "suggestCategory reads getDecryptedAiSettings() itself (no aiSettings param) and delegates a 1-item classifyDescriptors — preserves its Promise<string|null> contract and existing callers"
  - "The hot ingest path uses classifyDescriptors directly (batched); suggestCategory exists for contract/test stability and any 1-item caller, NOT called per-row in import.ts"
  - "A 'use server' module cannot export const maxDuration (build rejects it); the timeout is bound on the importing page segment instead"

patterns-established:
  - "Two-pass memory-first ingest around a single batched LLM classify call"
  - "iaIndisponivel as an additive, optional, non-blocking summary note (set on no-key OR empty-Map)"

requirements-completed: [CLSAI-01, CLSAI-02, CLSAI-03, CLSAI-05, CLSAI-06]

# Metrics
duration: 8min
completed: 2026-06-19
status: complete
---

# Phase 15 Plan 02: Classification Wire — two-pass ingest + suggestCategory delegate Summary

**Wired the real AI into the ingest pipeline as a memory-first two-pass loop around ONE batched `classifyDescriptors` call (zero calls when every descriptor is a memory hit), attaching non-binding `row.suggestion` hints on misses without ever auto-committing to `category_id`, plus a `suggestCategory` 1-item delegate, a payload-only-`descriptor_norm` PII guard, and `maxDuration = 60`.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-19T00:02:00Z
- **Completed:** 2026-06-19T00:09:33Z
- **Tasks:** 3 (TDD)
- **Files modified:** 7 (1 created, 6 modified)

## Accomplishments
- Reshaped `ingestStatement` into PASS1 (memory-first, collects unique miss `descriptor_norm`) → ONE `classifyDescriptors` call (skipped entirely when the miss set is empty) → PASS2 (attach `row.suggestion`, never `row.category_id`).
- Rewrote `suggestCategory` from an inert null seam into a 1-item PII-safe delegate that reads the decrypt DAL and returns null (no provider fetch) when there is no key.
- Replaced the pii-guard `(b)/(c)` assertions with a single payload-egress guard (the model prompt carries only `descriptor_norm`, no amount/date/raw); kept the `(a)` no-`ai`-umbrella / no-DeepSeek invariant.
- Raised the importar page `maxDuration` from 30 to 60 to bound parse + one batched LLM classify.
- Preserved the v1.3 `confirmImport` learn loop verbatim — `merchant_patterns` is still written ONLY on human confirm.

## Task Commits

Each task was committed atomically:

1. **Task 1: suggestCategory 1-item delegate + suggest.test.ts DAL mock** - `700f953` (feat)
2. **Task 2: two-pass ingest reshape + import.test.ts edges + fixture** - `48be0e0` (feat)
3. **Task 3: pii-guard payload guard + maxDuration 60** - `e993035` (feat)
4. **Rule 3 fix: drop illegal maxDuration export from the 'use server' module** - `ffedc3e` (fix)

_TDD: each task wrote/updated the failing test first, then the implementation to green._

## Files Created/Modified
- `src/lib/classifier/suggest.ts` - `suggestCategory` now reads `getDecryptedAiSettings()` and delegates a 1-item `classifyDescriptors`; `validateSuggestion` unchanged.
- `src/lib/classifier/suggest.test.ts` - mocks `getDecryptedAiSettings → null` so the null + no-fetch invariants are deterministic without Supabase.
- `src/actions/import.ts` - two-pass reshape (PASS1/COLLECT/ONE call/PASS2), additive `IngestSummary.iaIndisponivel?`, `classifyDescriptors` + `getDecryptedAiSettings` imports; per-row `suggestCategory` call removed from the hot path.
- `src/actions/import.test.ts` - AI seam mocks (controllable `classifyDescriptors`/`getDecryptedAiSettings` spies) + 7 new ingest edge tests.
- `tests/pii-guard.test.ts` - payload-only-`descriptor_norm` egress guard via a spied `doGenerate`; no-umbrella invariant kept.
- `src/app/(app)/importar/page.tsx` - `maxDuration` 30 → 60.
- `tests/fixtures/itau-dup-descriptor.ofx` - 4 rows / 2 unique descriptors (padaria ×3, netflix ×1) for the M>N one-call dedupe proof.

## Decisions Made
- `suggestCategory` fetches its own settings (no `aiSettings` param) to keep its existing signature/callers; the hot ingest path bypasses it and calls `classifyDescriptors` directly (batched), so the per-row seam is no longer on the ingest hot path.
- `iaIndisponivel` is additive/optional and only set on the page summary when AI was skipped (no key) or degraded (empty Map) — non-blocking; Phase 16 surfaces it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed illegal `maxDuration` export from the `'use server'` action module**
- **Found during:** Per-wave merge gate (`npm run build`), after Task 3.
- **Issue:** The plan's Task 3 conditionally asked to ALSO add `export const maxDuration = 60` to `import.ts`. But a `'use server'` module may ONLY export async functions — a non-function `export const maxDuration` makes Next.js treat the module as having "no exports at all", so the build failed on every `@/actions/import` import (`saveCsvProfile`/`ingestStatement` not found).
- **Fix:** Removed the `export const maxDuration` from `import.ts` and replaced it with an explanatory NOTE; the timeout is bound on the importing page segment (`importar/page.tsx` already sets 60), which covers the action invoked from that page.
- **Files modified:** `src/actions/import.ts`
- **Verification:** `npm run build` succeeds; `npx tsc --noEmit` clean; affected test files (53 tests) green.
- **Committed in:** `ffedc3e`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was required for the build to pass. The plan's intent (segment ≥ 60) is still satisfied via the page segment — the only adjustment is WHERE the export lives, because the action module cannot legally carry it. No scope creep. The plan's own `<action>` framed this as conditional ("if … does NOT already carry a route-segment maxDuration") and flagged the action-vs-page inheritance as an open question (T-15-08, accept).

## Issues Encountered
- `npm test` shows 1 failing file: `tests/category-kind.test.ts`. This is a pre-existing env-flaky integration test that requires a live local `supabase start` Docker stack (not running in this environment) — unrelated to this plan. All 810 unit tests pass (1 skipped); the three plan-affected files are 100% green.

## User Setup Required
None - no external service configuration required. (Real-AI behavior requires a BYOK key configured at `/conta/configuracoes-ia` for the manual-only verifies in the plan.)

## Next Phase Readiness
- The wire is live: memory-first zero-call, one batched call, no-auto-commit, and graceful fallback all proven by unit tests.
- Phase 16 can now render `row.suggestion` in the review grid's SuggestionSlot and surface the `iaIndisponivel` note.
- Manual verifies remain (real-AI suggestion on a new merchant with a live key; PROD `maxDuration` inheritance) — both deploy/key-dependent, documented in the plan.

## Self-Check: PASSED

---
*Phase: 15-classification-wire*
*Completed: 2026-06-19*
