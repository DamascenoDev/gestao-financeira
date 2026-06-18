---
phase: 14-key-storage-byok-settings
plan: 04
subsystem: ai-settings-actions
tags: [byok, server-actions, vault, ai-sdk, security]
requires:
  - "save_ai_api_key / get_ai_api_key / remove_ai_api_key RPCs (Plan 02, Vault)"
  - "@/lib/ai/settings.server getDecryptedAiSettings (Plan 03)"
  - "@/lib/ai/provider-factory modelFor (Plan 03)"
  - "@/lib/ai/settings DEFAULT_MODEL (Plan 03)"
  - "@/lib/schemas/ai-settings aiSettingsSchema (Plan 03)"
provides:
  - "saveAiSettings, testConnection, removeAiKey Server Actions"
  - "exported mapProviderError (provider-error → friendly pt-BR)"
affects:
  - "the BYOK settings form (Plan 05) — these are its only write/test/remove actions"
tech-stack:
  added: []
  patterns:
    - "mei.ts action grammar: 'use server' + Zod safeParse boundary → {error}|{ok:true} + getClaims owner + revalidatePath"
    - "LanguageModelV3.doGenerate direct call (ai umbrella package not installed; Plan 03 Assumption A5)"
    - "APICallError.isInstance guard from @ai-sdk/provider for statusCode narrowing"
    - "constant-output error mapping — fixed pt-BR strings, never echo raw provider text/key/stack"
key-files:
  created:
    - "src/actions/ai-settings.ts"
  modified: []
decisions:
  - "testConnection pings via LanguageModelV3.doGenerate (not generateText from 'ai') because the ai umbrella package is intentionally not a dependency — only @ai-sdk/google + @ai-sdk/anthropic (Plan 01/03)"
  - "Token cap option resolved to maxOutputTokens (LanguageModelV3CallOptions, @ai-sdk/provider@3.0.10); error guard resolved to APICallError.isInstance — RESEARCH Open Question 3 closed against installed types"
  - "Save error copy uses 14-UI-SPEC string 'Não foi possível salvar. Tente novamente.'; remove error uses the plan's 'Não foi possível remover a chave. Tente novamente.' (no dedicated UI-SPEC line)"
metrics:
  duration: "~4m"
  completed: "2026-06-18"
  tasks: 2
  files: 1
status: complete
---

# Phase 14 Plan 04: AI-settings Server Actions (BYOK save/test/remove) Summary

`src/actions/ai-settings.ts` — three `'use server'` actions (`saveAiSettings`, `testConnection`, `removeAiKey`) cloned from the `actions/mei.ts` grammar, plus an exported `mapProviderError`; the pasted BYOK key flows formData → `save_ai_api_key` Vault RPC and is never read back, the test-ping decrypts server-only and maps any failure to one of three fixed pt-BR strings, and removal returns the app to its pre-IA state.

## What Was Built

- **`saveAiSettings(formData)`** (BYOK-02) — `aiSettingsSchema.safeParse` at the boundary → first-issue `{ error }`; `getClaims()` owner check (`{ error: 'Sessão expirada.' }` if absent); persists ONLY via `supabase.rpc('save_ai_api_key', { p_provider, p_model: DEFAULT_MODEL[provider], p_key })` — the model is the server-side hard-coded default, never user input; on rpc error returns the UI-SPEC copy `'Não foi possível salvar. Tente novamente.'`; on success `revalidatePath('/conta/configuracoes-ia')` + `{ ok: true }`. The key never touches an app column and is never returned.
- **`removeAiKey()`** (BYOK-05) — owner check → `supabase.rpc('remove_ai_api_key')` (drops row + Vault secret); error → `'Não foi possível remover a chave. Tente novamente.'`; success → revalidate + `{ ok: true }`. App returns to pre-IA state; `suggestCategory()` already returns null safely.
- **`testConnection()`** (BYOK-03) — total `try/catch`. `getDecryptedAiSettings()` (server-only); null → `{ error: 'Nenhuma chave configurada.' }`. Else `modelFor(...).doGenerate({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }], maxOutputTokens: 1 })` — a ~1-token ping. Success → `{ ok: true }`; any throw → `{ error: mapProviderError(e) }`. The decrypted key only ever exists inside the try and never leaves via the returned (constant) string, and is never logged.
- **`mapProviderError(e)`** (exported) — narrows via `APICallError.isInstance` (and a duck-typed `statusCode` fallback so the unit test's plain objects map too): 401/403 → invalid-key copy, 429 → no-credits copy, else/network/non-APICallError → generic copy. Output is a fixed constant — never embeds raw provider text, headers, a stack, or the key.

## Security Posture (threat register)

- **T-14-09 (key → app column):** mitigated — the only persistence path is the `save_ai_api_key` Vault RPC; no `.from('ai_settings').insert/update` with a key column exists.
- **T-14-08 (action without session):** mitigated — `getClaims()` owner check in `saveAiSettings` + `removeAiKey`; RLS + `auth.uid()`-filtered RPCs are the structural backstop.
- **T-14-07 (testConnection leak):** mitigated — total try/catch; `mapProviderError` returns only the three fixed pt-BR strings; the decrypted key and raw provider error are never logged or returned. Verified by the unit test's no-leak assertions (`sk-`/`AIza`/`stack` absent).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test-ping uses `LanguageModelV3.doGenerate`, not `generateText` from `'ai'`**
- **Found during:** Task 2
- **Issue:** The plan/RESEARCH assumed `import { generateText } from 'ai'`, but the `ai` umbrella package is intentionally NOT a dependency of this project (only `@ai-sdk/google` + `@ai-sdk/anthropic`; Plan 01/03, Assumption A5). The import would not resolve and `tsc` would fail.
- **Fix:** Called the provider's `LanguageModelV3.doGenerate(...)` directly (the type `modelFor` already returns), with a standardized `prompt` message array and `maxOutputTokens: 1`. Same one-call ping, no new dependency.
- **Files modified:** `src/actions/ai-settings.ts`
- **Commit:** ab0f6f0

**RESEARCH Open Question 3 closed:** token-cap option = `maxOutputTokens` (`LanguageModelV3CallOptions`), error guard = `APICallError.isInstance` — both verified against installed `@ai-sdk/provider@3.0.10` types, not guessed.

> Note: the Task 2 `<verify>` grep literally searches for `generateText`; the implementation satisfies the equivalent intent via `doGenerate` (the verify block's regex was written before the umbrella-package absence was confirmed). The `npx vitest run` + `npx tsc --noEmit` halves of both verify blocks pass exactly as written.

## TDD Gate Compliance

Task 2 is `tdd="true"`. The RED gate is the Wave 0 scaffold `src/actions/ai-settings.test.ts` (committed earlier in the phase, failing because `mapProviderError` had no target). This plan supplied the GREEN implementation, turning it 5/5. No REFACTOR commit was needed.

## Verification

- `npx vitest run src/actions/ai-settings.test.ts` → **5/5 GREEN** (error mapping + no-leak).
- `npx tsc --noEmit` → **fully clean, zero errors**.
- Grep gates: `'use server'`, `rpc('save_ai_api_key'`, `rpc('remove_ai_api_key')`, `getClaims`, `export function mapProviderError`, `doGenerate` all present.
- Full suite: `src/actions/ai-settings.test.ts` and the broader app tests pass; one pre-existing failure (`tests/pii-guard.test.ts`, asserts no `@ai-sdk*` dep) is out of scope — see Deferred Issues.

## Deferred Issues

- **`tests/pii-guard.test.ts` stale guard** — asserts `package.json` has no `@ai-sdk*` dependency, which Phase 14 Plan 01 deliberately violated by installing the BYOK providers. RED since Wave 1, NOT caused by this plan (14-04 adds no dependency). Logged to `deferred-items.md` for a Phase 14 cleanup to update the guard to its new invariant (providers present, but `suggestCategory()` still null + no network call). The other 3 assertions in that file pass and remain the real LGPD/SEC-03 protection.
- Supabase integration tests are env-flaky in this environment (non-deterministic pass/fail across runs); unrelated to this plan.

## Scope Fences Honored

No `suggestCategory()` wiring (Phase 15), no review-grid (Phase 16), no provider beyond Gemini + Claude, no UI/form (Plan 05). Saving is decoupled from a successful test, exactly as specified.

## Self-Check: PASSED

- FOUND: `src/actions/ai-settings.ts`
- FOUND commit: `333e79a` (saveAiSettings + removeAiKey)
- FOUND commit: `ab0f6f0` (testConnection + mapProviderError)
