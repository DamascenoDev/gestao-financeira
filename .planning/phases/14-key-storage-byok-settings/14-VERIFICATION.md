---
phase: 14-key-storage-byok-settings
verified: 2026-06-18T21:30:00Z
status: passed
closed_by: quick-task 260619-d68 (PROD live smoke, 2026-06-19)
score: 5/5 must-haves verified (capability proven on LOCAL + PROD live smoke)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "PROD schema push of migration 0033_ai_settings.sql"
    expected: "Run `supabase db push` against the LIVE production Supabase project (the corrected post-92ccbf4 version with the rotate-then-create fix), then `npm run gen:types`; confirm `ai_settings` table + the three RPCs (get/save/remove_ai_api_key) + RLS exist on PROD. DB-only change — no app redeploy needed."
    why_human: "Dev server points at PROD Supabase (project MEMORY); pushing PROD requires the user's credentials/explicit confirmation. LOCAL is applied + proven; PROD is un-migrated, so BYOK does not yet function in the deployed app. Analogous to prior milestones' deferred deploy gates."
---

# Phase 14: Key Storage + BYOK Settings Verification Report

**Phase Goal:** Usuário configura seu provedor de IA (Gemini/Claude) e cola a própria chave numa tela de Settings; a chave é criptografada at-rest (Supabase Vault), escopada por `user_id` + RLS, nunca volta ao client, e pode ser testada/removida — raiz da cadeia de dependência do v1.4.
**Verified:** 2026-06-18T21:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The full BYOK key-storage substrate is built, substantive, wired, and proven end-to-end on the LOCAL stack. All five success criteria hold against the codebase. The phase is NOT `passed` only because one human deploy action remains open: the PROD push of migration `0033` (consistent with prior milestones' deferred-deploy pattern). The capability is complete; production activation is the outstanding human gate.

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Settings UI: pick provider (Gemini/Claude) + paste own key (write-only), save → "Chave configurada ✓", never the key back | ✓ VERIFIED | `src/components/ai-settings-form.tsx` — `Input type="password"` with `value={apiKey}` (own typed input only, no stored-key seed); on save `setApiKey('')` + badge flips to "Chave configurada ✓"; Select over `AI_PROVIDERS`. RSC `page.tsx` seeds `provider`+`hasKey` only. Human-verify (14-05 Task 4) PASSED live. |
| 2 | Key encrypted at-rest in Vault; row holds only `key_secret_id`+provider+model; client gets `has_key`+`provider` only | ✓ VERIFIED | Migration `0033` — `ai_settings` has NO plaintext column (`key_secret_id uuid` is a Vault reference); `supabase_vault` enabled. RSC selects `provider, key_secret_id` and projects only `provider` + `hasKey=!!key_secret_id`. Bundle grep `.next/static` for `AIzaSy`/`sk-ant-` → **0 matches**. LOCAL Vault round-trip (create→decrypt) proven (14-02). |
| 3 | "Testar conexão" — cheap ping validates key+provider before trusting config | ✓ VERIFIED | `src/actions/ai-settings.ts::testConnection` — `getDecryptedAiSettings()` (server-only) → `modelFor(...).doGenerate({ maxOutputTokens: 1 })` ~1-token ping; total try/catch → `mapProviderError` (3 fixed pt-BR strings). Form wires `onTest`→inline result. Unit test 5/5 GREEN (incl. no-leak). |
| 4 | RLS (4 commands) + `with check` + server-only SECURITY DEFINER decrypt RPC filtered by auth.uid() | ✓ VERIFIED | Migration `0033` — single `for all to authenticated` policy with `using` + `with check` on `(select auth.uid()) = user_id` (covers select/insert/update/delete — see note). 3 RPCs `security definer` + `search_path=''`, `revoke all from public, anon`, `grant execute to authenticated`. `get_ai_api_key` filters by `auth.uid()`; authenticated never granted `vault.decrypted_secrets`. Cross-user decrypt isolation smoke PASSED on LOCAL (user B reads null). |
| 5 | Remove/swap key → app returns to pre-IA state (manual pick) without breaking | ✓ VERIFIED | `removeAiKey` → `remove_ai_api_key` RPC drops row + Vault secret; form `onConfirmRemove` flips badge + clears state via AlertDialog. `suggestCategory()` (`src/lib/classifier/suggest.ts`) still returns `null` for every input — pre-IA fallback structurally intact. Save rotation (delete-then-create) fixes the orphan/collision bug (LOCAL re-verified). |

**Score:** 5/5 truths verified (0 present, behavior-unverified). All proven on LOCAL; PROD activation pending (human item below).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `supabase/migrations/0033_ai_settings.sql` | Table (no plaintext) + RLS + Vault + 3 SECURITY DEFINER RPCs | ✓ VERIFIED | 204 lines; structural no-plaintext invariant; rotate-then-create fix present (lines 155-164). |
| `src/lib/schemas/ai-settings.ts` | Zod closed provider enum + non-empty apiKey | ✓ VERIFIED | `AI_PROVIDERS=['gemini','claude']`, deepseek/openai rejected by construction. |
| `src/lib/ai/settings.ts` | Client-safe registry (no key path) | ✓ VERIFIED | Only `PROVIDER_LABEL`/`DEFAULT_MODEL`; no supabase/no key import. |
| `src/lib/ai/settings.server.ts` | Server-only decrypt DAL | ✓ VERIFIED | `import 'server-only'` line 1; sole handler of decrypted key; returns null on no-key. |
| `src/lib/ai/provider-factory.ts` | Per-call BYOK `modelFor` | ✓ VERIFIED | gemini→Google / claude→Anthropic; exhaustive `never` default throws. |
| `src/lib/ai/map-provider-error.ts` | Constant-output pt-BR error mapper | ✓ VERIFIED | 3 fixed strings; never echoes key/stack/raw message. |
| `src/actions/ai-settings.ts` | save/test/remove `'use server'` actions | ✓ VERIFIED | Zod boundary + getClaims owner check + Vault RPCs; no app column holds key. |
| `src/app/(app)/conta/configuracoes-ia/page.tsx` | RSC projecting provider+hasKey only | ✓ VERIFIED | Selects `provider, key_secret_id`; passes `provider`+`hasKey` only. |
| `src/components/ai-settings-form.tsx` | Write-only client form | ✓ VERIFIED | Password input never seeded from stored key; save/test/remove wired. |
| `src/types/database.types.ts` | Regenerated types | ✓ VERIFIED | `ai_settings` Row + 3 RPCs present (lines 104, 858, 872-873). |
| Conta entry card | Link to `/conta/configuracoes-ia` | ✓ VERIFIED | `conta/page.tsx` lines 119-133 — Card + Link, no new sidebar item. |

### Key Link Verification

| From | To | Via | Status |
| --- | --- | --- | --- |
| `ai-settings-form.tsx` | `src/actions/ai-settings.ts` | imports `saveAiSettings`/`testConnection`/`removeAiKey`, called in transitions | ✓ WIRED |
| `actions/ai-settings.ts` | `save/remove_ai_api_key` RPC | `supabase.rpc('save_ai_api_key'/'remove_ai_api_key')` | ✓ WIRED |
| `actions/ai-settings.ts::testConnection` | `settings.server.ts` + `provider-factory.ts` | `getDecryptedAiSettings()` → `modelFor().doGenerate()` | ✓ WIRED |
| `settings.server.ts` | `get_ai_api_key` RPC (Vault) | `supabase.rpc('get_ai_api_key')` under RLS client | ✓ WIRED |
| `configuracoes-ia/page.tsx` | `ai-settings-form.tsx` | `<AiSettingsForm provider hasKey />` (no key prop) | ✓ WIRED |
| `conta/page.tsx` | `/conta/configuracoes-ia` | `<Link href>` | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Type safety | `npx tsc --noEmit` | exit 0, clean | ✓ PASS |
| Full test suite | `npm test` (vitest run) | 94 files / 797 tests passed | ✓ PASS |
| BYOK + pii-guard tests | `npx vitest run tests/pii-guard.test.ts src/lib/schemas/ai-settings.test.ts src/lib/ai/provider-factory.test.ts src/actions/ai-settings.test.ts` | 17/17 passed | ✓ PASS |
| Client bundle key leak | `grep -rI "AIzaSy\|sk-ant-" .next/static` | 0 matches | ✓ PASS |
| suggestCategory pre-IA seam | read `src/lib/classifier/suggest.ts` | returns `null` for all input, no LLM call | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
| --- | --- | --- | --- |
| BYOK-01 | Choose provider (Gemini/Claude) in Settings | ✓ SATISFIED | Closed enum schema + Select; truth #1 |
| BYOK-02 | Paste/update key, encrypted at-rest, never shown back | ✓ SATISFIED (LOCAL) | No-plaintext column + Vault; write-only form; truths #1,#2 — PROD activation pending |
| BYOK-03 | Test connection (cheap ping) | ✓ SATISFIED | `testConnection` 1-token ping; truth #3 |
| BYOK-04 | Key scoped user_id + RLS, never reaches client, decrypt server-only | ✓ SATISFIED (LOCAL) | RLS + SECURITY DEFINER + server-only DAL + bundle grep clean; truths #2,#4 — PROD activation pending |
| BYOK-05 | Remove/swap → pre-IA state without breaking | ✓ SATISFIED | `remove_ai_api_key` + null seam; truth #5 |

All 5 BYOK requirements mapped to Phase 14 are covered. No orphaned requirements.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
| --- | --- | --- | --- |
| — | No `TBD`/`FIXME`/`XXX` in any modified file | — | None. `FUTURE`/`CLSAI-F2 deferred` comments are forward-design notes referencing formally-deferred requirements, not debt markers. |

### Resolved Contradiction (SUMMARY vs deferred-items.md)

`deferred-items.md` describes `tests/pii-guard.test.ts` as RED (asserting NO `@ai-sdk` dependency, broken by the Plan-01 install). The 14-05 SUMMARY claims `npm test` 797/797 GREEN. **Verified resolved in-phase:** commit `89d6ee6 test(14): update pii-guard for v1.4 BYOK` rewrote the guard to assert the new invariant (`aiDeps).toEqual(['@ai-sdk/anthropic', '@ai-sdk/google'])`). The file now passes; the LGPD/SEC-03 network/null protections are retained. `deferred-items.md` is stale, not an open gap. Full suite re-run here confirms 797/797.

### Note on Success Criterion #4 ("quatro políticas")

SC#4 literally says "as quatro políticas (`select/insert/update/delete`)". The implementation uses a single `for all to authenticated` RLS policy with both `using` and `with check` on `auth.uid()=user_id`. This is the project's established `0025_mei` shape and is **semantically equivalent** — a `for all` policy applies to all four commands. The intent (every command isolated by user, plus `with check` on writes) is fully satisfied. Not a gap; the "four policies" wording describes coverage, not a literal count of `create policy` statements.

### Human Verification Required

**1. PROD schema push of migration `0033`**

- **Test:** Run `supabase db push` against the LIVE production Supabase project, then `npm run gen:types`. Confirm `ai_settings` + the three RPCs + RLS exist on PROD.
- **Expected:** The corrected `0033` (post-`92ccbf4`, with the rotate-then-create fix) is applied to PROD; `get/save/remove_ai_api_key` callable, RLS enforced. DB-only — no app redeploy.
- **Why human:** Dev server points at PROD Supabase (project MEMORY); the PROD push requires the user's credentials and explicit confirmation. LOCAL is applied + fully proven; until PROD is migrated, BYOK works on LOCAL but not in the deployed app. Consistent with prior milestones' deferred-deploy gates — a pending human action, NOT a failure.

### Gaps Summary

No gaps. The BYOK key-storage substrate is complete, substantive, correctly wired, and proven end-to-end on the LOCAL stack (structural no-plaintext storage, Vault encryption, RLS + SECURITY DEFINER decrypt isolation, write-only form, test-connection ping, graceful removal). `tsc` clean, 797/797 tests GREEN, client bundle free of key material, and the `suggestCategory()` pre-IA seam intact.

The single outstanding item is the **PROD push of `0033`** — a deferred human deploy action (user's credentials required; dev points at PROD), exactly analogous to prior milestones. That is why the status is `human_needed` rather than `passed`: the capability is built and verified; production activation awaits one human action.

---

_Verified: 2026-06-18T21:30:00Z_
_Verifier: Claude (gsd-verifier)_

---

## Live Smoke Closure — 2026-06-19 (quick-task 260619-d68)

**Status flipped `human_needed → passed`.** The deferred PROD push of `0033` is confirmed live: on a fresh PROD account, saving a BYOK key at `/conta/configuracoes-ia` returned **"Chave configurada ✓"** and **"Testar conexão" → "Conexão ok"** — the `save_ai_api_key` / `get_ai_api_key` Vault RPCs executed against PROD, proving `ai_settings` + the three RPCs + RLS are live (migrations `0033`/`0034` pushed). No app redeploy was needed for the DB; the key round-trips through Vault and never returns to the client.

Verified live in the browser by the user against `https://gestao-financeira-ebon-mu.vercel.app`.
