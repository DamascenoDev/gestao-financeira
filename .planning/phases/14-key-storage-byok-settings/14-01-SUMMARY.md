---
phase: 14-key-storage-byok-settings
plan: 01
subsystem: infra
tags: [ai-sdk, byok, vercel-ai, gemini, claude, vitest, nyquist]

# Dependency graph
requires:
  - phase: 13-pdf-fatura
    provides: existing classifier null seam (src/lib/classifier/suggest.ts) the BYOK providers will eventually back
provides:
  - "@ai-sdk/google@3.0.83 + @ai-sdk/anthropic@3.0.85 installed (first-party Vercel providers)"
  - "Wave 0 RED test scaffolds pinning BYOK-01 (provider enum + apiKey shape), BYOK-04 (provider factory mapping), BYOK-03 (provider-error → pt-BR mapping, no key leak)"
affects: [14-02, 14-03, 14-04, 14-05, phase-15-classification]

# Tech tracking
tech-stack:
  added: ["@ai-sdk/google@3.0.83", "@ai-sdk/anthropic@3.0.85"]
  patterns:
    - "Nyquist Wave 0: RED tests committed before target modules exist — fail only on module-not-found, never syntax/setup"
    - "Provider SDKs are pure JS — NOT added to serverExternalPackages (only pdf-parse needs that)"

key-files:
  created:
    - src/lib/schemas/ai-settings.test.ts
    - src/lib/ai/provider-factory.test.ts
    - src/actions/ai-settings.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Installed only @ai-sdk/google + @ai-sdk/anthropic; @ai-sdk/deepseek intentionally excluded (deferred CLSAI-F1)"
  - "Did not re-add ai/zod at different majors — zod@4.4.x already present; ai resolved transitively as provider peer"
  - "Legitimacy checkpoint (Task 1) pre-approved by user via orchestrator — SUS/too-new was a false positive (daily republish of vercel/ai monorepo)"

patterns-established:
  - "Wave 0 RED scaffold: import the future symbol, assert the contract, commit RED before the module lands"
  - "Provider-error mapper must return one of three fixed pt-BR strings and never echo sk-/AIza/stack"

requirements-completed: []  # BYOK-01/03/04 are SCAFFOLDED here (RED); they turn GREEN in Plans 03/04

# Metrics
duration: ~6min
completed: 2026-06-18
status: complete
---

# Phase 14 Plan 01: BYOK provider install + Wave 0 scaffolds Summary

**Installed the two first-party Vercel AI providers (@ai-sdk/google 3.0.83, @ai-sdk/anthropic 3.0.85) behind an approved legitimacy gate, and laid down three RED Nyquist Wave 0 tests pinning the BYOK schema, provider factory, and provider-error→pt-BR contracts.**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-06-18T20:39:53Z
- **Tasks:** 3 (Task 1 checkpoint pre-approved; Tasks 2-3 executed)
- **Files modified:** 5 (2 modified, 3 created)

## Accomplishments
- `@ai-sdk/google@3.0.83` + `@ai-sdk/anthropic@3.0.85` installed; `@ai-sdk/deepseek` confirmed absent; `zod@4.4.x` major untouched.
- `npx tsc --noEmit` and `npm run build` both pass clean with the new packages present.
- Three Wave 0 RED scaffolds in place, failing only on "module not implemented" (verified) — no syntax/setup errors.

## Task Commits

1. **Task 1: Legitimacy checkpoint** — pre-approved by the user via the orchestrator (no commit; verification-only gate). Both packages confirmed first-party Vercel (github.com/vercel/ai), no postinstall, `@ai-sdk/deepseek` excluded.
2. **Task 2: Install BYOK providers** — `9868816` (chore)
3. **Task 3: Wave 0 RED scaffolds** — `ba5cbc4` (test)

## Files Created/Modified
- `package.json` / `package-lock.json` — added `@ai-sdk/google@^3.0.83` + `@ai-sdk/anthropic@^3.0.85`
- `src/lib/schemas/ai-settings.test.ts` — provider enum (`gemini`|`claude`) + non-empty apiKey shape; rejects deepseek/openai/empty (BYOK-01)
- `src/lib/ai/provider-factory.test.ts` — `modelFor` maps gemini/claude to a defined LanguageModel, unknown provider throws, no network call (BYOK-04)
- `src/actions/ai-settings.test.ts` — `mapProviderError` 401/403→invalid-key, 429→no-credits, network→try-again (exact UI-SPEC pt-BR copy); asserts no `sk-`/`AIza`/`stack` leak (BYOK-03)

## Decisions Made
- Excluded `@ai-sdk/deepseek` (deferred CLSAI-F1) and kept `zod`/`ai` at their existing/transitive majors per the locked CLAUDE.md stack.
- Created `src/lib/ai/` directory (did not previously exist) to host the provider-factory test.

## Deviations from Plan

None - plan executed exactly as written.

The Task 2 note observed that `ai` is not currently a direct dependency (only `zod@4.4.x` is). This is consistent with the plan's "do NOT re-add them at different majors" guard — `ai` resolves as a transitive peer of the providers. No action taken beyond the specified install. Not a deviation.

## Issues Encountered
None. The three test files fail RED exactly as designed (Vite "Failed to resolve import" for the not-yet-created `@/lib/schemas/ai-settings`, `@/lib/ai/provider-factory`, `@/actions/ai-settings`).

## Known Stubs
None. The three test files are intentional Wave 0 RED scaffolds (not stubs) — the production modules they target are created in Plans 03/04, which will turn BYOK-01/03/04 GREEN. No placeholder UI/data was shipped.

## User Setup Required
None - no external service configuration required for this plan.

## Next Phase Readiness
- Provider SDKs available for the provider factory (Plan 03) and test-connection ping (Plan 04).
- Wave 0 RED gates are in place — no downstream plan can ship BYOK-01/03/04 without turning these GREEN.
- The legitimacy checkpoint is closed (approved); subsequent plans need no further package gate.

## Self-Check: PASSED

- Files verified present: `src/lib/schemas/ai-settings.test.ts`, `src/lib/ai/provider-factory.test.ts`, `src/actions/ai-settings.test.ts`, `package.json`
- Commits verified in git log: `9868816` (Task 2), `ba5cbc4` (Task 3)

---
*Phase: 14-key-storage-byok-settings*
*Completed: 2026-06-18*
