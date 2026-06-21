# Phase 14 — Deferred / Out-of-Scope Items

Discoveries logged during execution that are outside the current plan's scope
(SCOPE BOUNDARY rule). Not fixed here.

## Stale pre-existing test guard: `tests/pii-guard.test.ts`

- **Discovered during:** Plan 14-04 (full-suite regression check)
- **Failing assertion:** `package.json has NO 'ai' and no '@ai-sdk*' dependency (CLS-02 stays deferred)` (line 26-30)
- **Why it fails:** Phase 14 Plan 01 deliberately installed `@ai-sdk/google` + `@ai-sdk/anthropic`
  (BYOK providers, user-approved legitimacy gate). The guard is a Phase 6 artifact (6-W0-08)
  that asserted the LLM seam stayed closed; that premise is now obsolete by design.
- **Status:** RED since Wave 1 (Plan 01), NOT caused by Plan 14-04. Plan 14-04 only creates
  `src/actions/ai-settings.ts` — it adds no dependency.
- **Recommended fix (out of scope here):** Update or retire this guard as part of Phase 14
  cleanup so it asserts the *new* invariant (providers present, but `suggestCategory()` still
  returns null + makes no network call — the other 3 assertions in the file already pass and
  remain the real LGPD/SEC-03 protection). Do NOT simply delete the network/null guards.
