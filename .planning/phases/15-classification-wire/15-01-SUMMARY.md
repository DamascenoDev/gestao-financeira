---
phase: 15-classification-wire
plan: 01
subsystem: ai
tags: [ai-sdk, doGenerate, gemini, claude, zod, json-schema, classification, byok]

# Dependency graph
requires:
  - phase: 14-key-storage-byok-settings
    provides: "modelFor(provider, model, apiKey) BYOK provider factory; DEFAULT_MODEL registry; AiProvider enum; validateSuggestion enum gate"
provides:
  - "classifyDescriptors(descriptors, categories, aiSettings) — single batched, schema-constrained doGenerate call returning Map<descriptorNorm, {categoryId, confidence}>"
  - "flat $ref-free JSONSchema7 + flat Zod output schema (categoryId free string, enum-gated post-hoc)"
  - "ParsedReviewRow.suggestion? additive optional AI-hint field (never written to category_id)"
affects: [15-02 (import.ts two-pass wire + suggestCategory delegation), 16 (review grid SuggestionSlot rendering)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "doGenerate + responseFormat:{type:'json',schema} for structured JSON on both Gemini+Claude — no `ai` umbrella package"
    - "Flat hand-written JSONSchema7 literal (no $ref/$defs) for provider portability; runtime Zod parse separate"
    - "categoryId as free string in-schema, enum-gated AFTER via validateSuggestion (never a UUID enum in-schema)"
    - "Inner try/catch → empty Map never-throw boundary for AI calls"

key-files:
  created:
    - src/lib/ai/classify.ts
    - src/lib/ai/classify.test.ts
  modified:
    - src/lib/parsers/types.ts

key-decisions:
  - "Hand-wrote the flat JSONSchema7 literal instead of zod→JSON conversion (Assumption A5): guarantees $ref-free, Claude-flat-safe schema with zero conversion-shape risk"
  - "Single inner try/catch wraps call+extract+parse+validate → empty Map on ANY failure; no retries (CLSAI-06)"
  - "categoryId stays a free nullable string in-schema; owned-id constraint applied post-hoc by validateSuggestion (multi-provider enum trap avoided)"

patterns-established:
  - "Batched LLM classification via LanguageModelV3.doGenerate (no umbrella) — extract single {type:'text'} content part, JSON.parse, Zod-validate, enum-gate"
  - "PII-safe prompt builder: buildUserText takes string[] of descriptor_norm + id:name lines only — no amount/date/raw"

requirements-completed: [CLSAI-03, CLSAI-04, CLSAI-06]

# Metrics
duration: 3min
completed: 2026-06-19
status: complete
---

# Phase 15 Plan 01: Classification Wire — classifyDescriptors Summary

**Batched, schema-constrained `doGenerate` classifier (`classifyDescriptors`) over Gemini+Claude with a flat $ref-free JSONSchema7, post-hoc enum-gating via `validateSuggestion`, a never-throw empty-Map fallback, and a PII-safe descriptor_norm-only prompt — plus the additive `ParsedReviewRow.suggestion` hint field.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-18T23:58:09Z
- **Completed:** 2026-06-19T00:00:33Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `classifyDescriptors` — the single genuinely new code in Phase 15: ONE `doGenerate` call for N>0 unique descriptors, ZERO for empty input (CLSAI-03).
- Every model-returned `categoryId` is enum-gated through the real `validateSuggestion` → null if not owned (CLSAI-04); free string in-schema avoids the multi-provider UUID-enum trap.
- Inner `try/catch` makes the call never throw — any provider error / malformed JSON / Zod failure degrades to an empty Map (CLSAI-06). No retries.
- Prompt carries ONLY `descriptor_norm` strings + `id: name` category lines — no amount/date/raw descriptor (SEC-03 / LGPD), asserted by a payload-guard test.
- Additive `ParsedReviewRow.suggestion?: { categoryId, confidence, source: 'ia' }` hint field that Plan 02 attaches, never written to `category_id`.

## Task Commits

Each task was committed atomically (TDD: RED → GREEN):

1. **Task 1: Extend ParsedReviewRow with the optional suggestion hint** - `e51f9e0` (feat)
2. **Task 2: RED — write classify.test.ts** - `9f91add` (test)
3. **Task 3: GREEN — implement classify.ts** - `5e3f8ba` (feat)

_No REFACTOR commit: the GREEN implementation matched the verified RESEARCH pattern cleanly._

## Files Created/Modified
- `src/lib/ai/classify.ts` (created) - `classifyDescriptors` batched doGenerate call, flat Zod + hand-written flat JSONSchema7, PII-safe prompt builder, per-result `validateSuggestion` enum gate, inner try/catch → empty Map.
- `src/lib/ai/classify.test.ts` (created) - 10 unit tests: 1-call-N-unique, 0-call empty input (no descriptors / no categories), happy path, enum-drift→null, null escape, three fallback paths (reject / malformed JSON / schema failure), PII payload guard. Mocks `provider-factory.modelFor`; runs the REAL `validateSuggestion`.
- `src/lib/parsers/types.ts` (modified) - additive `suggestion?` optional field on `ParsedReviewRow` with pt-BR JSDoc noting it is a non-binding hint never applied to `category_id`.

## Decisions Made
- **Hand-wrote the flat `JSONSchema7` literal** (per plan Assumption A5) rather than converting the Zod schema, guaranteeing a `$ref`/`$defs`-free schema that Claude's flat-only constraint accepts and Gemini's OpenAPI subset honors. The Zod schema is used independently for runtime parse of the returned text.
- **`categoryId` is a free nullable string in-schema**, enum-gated post-hoc by `validateSuggestion` — avoids embedding a 50-UUID enum that both providers choke on.
- **One inner `try/catch`, no retries** — an unrecoverable AI failure degrades to manual pick (empty Map), never blocks an upload.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. RED was confirmed before implementing; GREEN passed first run (10/10), `npx tsc --noEmit` clean, the ai+classifier subset is 22/22 green, and the no-`ai`-umbrella invariant holds (`['@ai-sdk/anthropic', '@ai-sdk/google']`).

Note: `.planning/STATE.md` shows working-tree changes (phase 14→15, plan counts) — these are the orchestrator's pre-execution updates, left untouched per the plan's ownership boundary.

## User Setup Required
None - no external service configuration required. (BYOK key path + provider factory already shipped in Phase 14; this plan added zero packages.)

## Next Phase Readiness
- `classifyDescriptors` and `ParsedReviewRow.suggestion` are ready for Plan 02's `import.ts` two-pass wire (PASS 1 memory / collect unique misses / ONE call / PASS 2 attach `row.suggestion`) and the `suggestCategory` 1-item wrapper rewrite.
- Scope fence honored: no `import.ts` changes, no review-grid, no DeepSeek, no new packages.

## Self-Check: PASSED

All created/modified files exist on disk; all three task commits (`e51f9e0`, `9f91add`, `5e3f8ba`) are present in git history.

---
*Phase: 15-classification-wire*
*Completed: 2026-06-19*
