---
phase: 14-key-storage-byok-settings
plan: 03
subsystem: ai
tags: [byok, zod, ai-sdk, gemini, anthropic, server-only, supabase-rpc, vault]

# Dependency graph
requires:
  - phase: 14-01
    provides: "@ai-sdk/google + @ai-sdk/anthropic installed; ai_settings types"
  - phase: 14-02
    provides: "migration 0033 (ai_settings table + get/save/remove_ai_api_key Vault RPCs)"
provides:
  - "aiSettingsSchema — Zod BYOK validation boundary (closed provider enum {gemini,claude} + non-empty apiKey)"
  - "Client-safe lib/ai/settings registry (AI_PROVIDERS, PROVIDER_LABEL, DEFAULT_MODEL) — no key path"
  - "modelFor(provider, model, apiKey) — per-call BYOK provider factory returning a LanguageModelV3"
  - "server-only getDecryptedAiSettings() DAL — sole module handling the decrypted key, via get_ai_api_key RPC"
affects: [14-04, 14-05, 15-classification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "lib/ai split: client-safe settings.ts (labels/defaults) vs server-only settings.server.ts (key path) — structural bundle partition (Pitfall 1 / T-14-05)"
    - "Per-call BYOK factory: user's own key passed per call, never env/AI-Gateway"
    - "Exhaustive switch with never default for provider enum (compile-time + runtime guard)"

key-files:
  created:
    - src/lib/schemas/ai-settings.ts
    - src/lib/ai/settings.ts
    - src/lib/ai/provider-factory.ts
    - src/lib/ai/settings.server.ts
  modified: []

key-decisions:
  - "Return type LanguageModelV3 from @ai-sdk/provider, not LanguageModel from ai — the ai umbrella package is not a dependency; v3.0.x providers return LanguageModelV3 (plan Assumption A5)"
  - "Re-export AI_PROVIDERS/AiProvider from the schema into settings.ts so the enum has one source of truth"
  - "No model field in the user-facing schema; model is the hard-coded cheap DEFAULT_MODEL per provider (CLSAI-F2 deferred)"

patterns-established:
  - "Client/server lib split with the decrypted-key path quarantined behind import 'server-only'"
  - "BYOK provider factory: createGoogleGenerativeAI({apiKey})(model) / createAnthropic({apiKey})(model)"

requirements-completed: [BYOK-01, BYOK-04]

# Metrics
duration: ~6min
completed: 2026-06-18
status: complete
---

# Phase 14 Plan 03: lib/ai + schema layer Summary

**BYOK substrate: Zod provider/apiKey gate, client-safe provider registry, per-call gemini/claude factory, and a server-only decrypt DAL that is the app's sole handler of the plaintext key.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-18T20:59:00Z
- **Completed:** 2026-06-18T21:00:41Z
- **Tasks:** 3
- **Files modified:** 4 (all created)

## Accomplishments
- `aiSettingsSchema` closes the BYOK-01 gate: provider constrained to `{gemini, claude}` (deepseek/openai rejected by construction), apiKey trimmed + non-empty — Wave 0 schema test GREEN (5/5).
- `modelFor` (BYOK-04) maps both providers per-call and throws on unknown via an exhaustive `never` default — Wave 0 factory test GREEN (3/3).
- `settings.server.ts` is the ONLY module touching the decrypted key, guarded by `import 'server-only'` on line 1, reading the key via the `get_ai_api_key()` Vault RPC under the RLS cookie client; returns `null` on no-key (graceful pre-IA fallback).
- Client/server bundle partition verified: `settings.ts` transitively imports only `zod` (via the schema) — no path to the key DAL or supabase.

## Task Commits

1. **Task 1: aiSettingsSchema + client-safe registry** - `1e85c7a` (feat)
2. **Task 2: provider-factory modelFor** - `7649dfc` (feat)
3. **Task 3: server-only getDecryptedAiSettings DAL** - `a2c5b89` (feat)

_TDD GREEN: the Wave 0 RED scaffolds (schema + factory tests) were turned GREEN by these implementation commits. No separate RED commits — the failing tests were pre-existing Wave 0 scaffolds._

## Files Created/Modified
- `src/lib/schemas/ai-settings.ts` - Zod `aiSettingsSchema` (provider enum + apiKey), `AI_PROVIDERS`, inferred `AiProvider`/`AiSettingsInput` types.
- `src/lib/ai/settings.ts` - Client-safe registry: re-exports `AI_PROVIDERS`/`AiProvider`, `PROVIDER_LABEL`, `DEFAULT_MODEL` (gemini-2.5-flash-lite / claude-haiku-4-5). No key access, no server-bundle guard.
- `src/lib/ai/provider-factory.ts` - `modelFor(provider, model, apiKey)`: gemini→`createGoogleGenerativeAI`, claude→`createAnthropic`, exhaustive `never` default throws.
- `src/lib/ai/settings.server.ts` - `import 'server-only'`; `getDecryptedAiSettings()` reads `ai_settings` row + `get_ai_api_key` RPC in parallel under the RLS client, returns `null` on no-key.

## Decisions Made
- **Return type `LanguageModelV3` from `@ai-sdk/provider`** instead of `LanguageModel` from `ai`: the `ai` umbrella package is not a dependency of this project (only `@ai-sdk/google` + `@ai-sdk/anthropic`), and both v3.0.x providers return `LanguageModelV3`. The plan's `import type { LanguageModel } from 'ai'` would not resolve. Plan Assumption A5 explicitly sanctions adapting to the installed signature.
- Re-exported `AI_PROVIDERS`/`AiProvider` from the schema into `settings.ts` to keep one source of truth for the enum.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Provider factory return type sourced from @ai-sdk/provider**
- **Found during:** Task 2 (provider-factory)
- **Issue:** Plan specified `import type { LanguageModel } from 'ai'`, but the `ai` umbrella package is not installed (only the two `@ai-sdk/*` provider packages). The import would fail to resolve and break `tsc`.
- **Fix:** Imported `LanguageModelV3` from `@ai-sdk/provider` — the actual return type of `createGoogleGenerativeAI(...)(model)` and `createAnthropic(...)(model)` in v3.0.x. Documented inline.
- **Files modified:** src/lib/ai/provider-factory.ts
- **Verification:** Factory test GREEN (3/3); `tsc --noEmit` clean for this file.
- **Committed in:** 7649dfc (Task 2 commit)

**2. [Rule 1 - Bug] Reworded client-registry doc comment to avoid literal "server-only"**
- **Found during:** Task 1 (settings.ts)
- **Issue:** The doc comment referenced the literal string `server-only`, which tripped the plan's automated guard `! grep -q "server-only" src/lib/ai/settings.ts` (a false positive — the comment, not an import).
- **Fix:** Reworded the comment ("server-bundle guard" / "server-bundle-guarded DAL") so the literal `server-only` appears only in the actual server module.
- **Files modified:** src/lib/ai/settings.ts
- **Verification:** `grep -q "server-only" src/lib/ai/settings.ts` now returns no match; the client/server partition intent is unchanged.
- **Committed in:** 1e85c7a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug/false-positive guard).
**Impact on plan:** Both necessary for correctness/verification. No scope creep — same architecture, adapted to installed package realities.

## Issues Encountered
None beyond the deviations above.

## Verification Evidence
- `npx vitest run src/lib/schemas/ai-settings.test.ts src/lib/ai/provider-factory.test.ts` → 8 passed (8). GREEN.
- `head -1 src/lib/ai/settings.server.ts` → `import 'server-only'`; `settings.ts` contains no `server-only`.
- `npx tsc --noEmit` → only remaining error is `src/actions/ai-settings.test.ts` cannot find `@/actions/ai-settings` — the expected RED that Wave 3 (14-04) turns GREEN. All four files in this plan type-check cleanly.

## Scope Fence Honored
- Did NOT wire the real classification call into `suggestCategory()` (Phase 15).
- Did NOT touch the review grid (Phase 16).
- No DeepSeek provider added/imported.

## Next Phase Readiness
- Plan 14-04 (actions): `getDecryptedAiSettings()`, `modelFor`, and `aiSettingsSchema` are ready to consume; the actions test is the next RED to turn GREEN.
- Plan 14-05 (RSC/form): `PROVIDER_LABEL` + `DEFAULT_MODEL` ready for the Select; key write-only path confirmed by the partition.
- No blockers.

## Self-Check: PASSED
All 4 created files exist on disk; all 3 task commits (1e85c7a, 7649dfc, a2c5b89) present in git log.

---
*Phase: 14-key-storage-byok-settings*
*Completed: 2026-06-18*
