---
phase: 14-key-storage-byok-settings
plan: 02
subsystem: data
tags: [supabase, vault, rls, security-definer, byok, migration, encryption]

# Dependency graph
requires:
  - phase: 14-key-storage-byok-settings
    provides: "14-01 Wave 0 RED scaffolds (BYOK schema/factory/error contracts) + installed AI providers"
provides:
  - "public.ai_settings table (user_id PK, provider, model, key_secret_id, timestamps — NO plaintext key column)"
  - "RLS (single for-all policy, using+with check on auth.uid()=user_id) isolating each user's row"
  - "get_ai_api_key() / save_ai_api_key() / remove_ai_api_key() SECURITY DEFINER RPCs (search_path='', revoked public/anon, granted authenticated)"
  - "supabase_vault enabled; decrypt reachable ONLY via the auth.uid()-filtered get_ai_api_key() trust boundary"
  - "Regenerated src/types/database.types.ts exposing ai_settings Row + the three RPCs"
affects: [14-03, 14-04, 14-05, phase-15-classification]

# Tech tracking
tech-stack:
  added:
    - "supabase_vault extension (encrypted secret storage; create_secret / decrypted_secrets)"
  patterns:
    - "Never-plaintext invariant is STRUCTURAL: no app column can hold a key; ciphertext lives only in Vault, table holds only key_secret_id (a UUID reference)"
    - "SECURITY DEFINER decrypt RPC filtered by auth.uid() is the trust boundary — authenticated role is never granted vault.decrypted_secrets directly"
    - "Rotate-then-create: delete the OLD Vault secret BEFORE create_secret so a same-provider re-save doesn't collide on the UNIQUE vault.secrets.name index"

key-files:
  created: []
  modified:
    - supabase/migrations/0033_ai_settings.sql
    - src/types/database.types.ts

key-decisions:
  - "Single for-all RLS policy (0025_mei shape) covers select/insert/update/delete with using+with check — not four separate policies"
  - "Vault secret name is stable per user+provider ('ai_key:<uid>:<provider>'); rotation deletes old secret first to avoid the secrets_name_idx unique collision"
  - "Provider CHECK locked to ('gemini','claude') — deepseek deferred, 'google'/'anthropic' intentionally not the stored values"
  - "PROD schema push DEFERRED to the user (dev server points at PROD per MEMORY) — LOCAL applied by orchestrator; analogous to prior phases' deferred deploy"

patterns-established:
  - "Cross-user decrypt smoke (user A saves → reads own key; user B reads null) is the canonical RLS+SECURITY-DEFINER verification for key storage"

requirements-completed: []  # BYOK-02/04/05 proven on LOCAL; turn fully GREEN in PROD once the user pushes 0033

# Metrics
duration: ~14min
completed: 2026-06-18
status: complete
---

# Phase 14 Plan 02: AI settings table + Vault key storage + RLS/decrypt RPCs Summary

**Authored and (LOCAL-)applied `0033_ai_settings.sql` — the encryption/storage root of the v1.4 BYOK chain: a Vault-backed `ai_settings` table that stores only a `key_secret_id` reference (never a plaintext key), RLS isolating each user's row, and three SECURITY DEFINER RPCs (get/save/remove) where decrypt is reachable only through an `auth.uid()`-filtered trust boundary. Regenerated `database.types.ts` and proved cross-user decrypt isolation, key rotation, and removal on the LOCAL stack.**

## Performance

- **Duration:** ~14 min
- **Completed:** 2026-06-18
- **Tasks:** 3 (Task 1 + Task 2 done in prior turns; Task 3 verification + bug fix this turn)
- **Files modified:** 2 (`0033_ai_settings.sql`, `src/types/database.types.ts`)

## Accomplishments
- `ai_settings` table confirmed on LOCAL with columns `user_id, provider, model, key_secret_id, created_at, updated_at` — **no plaintext-key column** (BYOK-02 structural invariant).
- RLS enabled with the single `for all to authenticated` policy (`using` + `with check` on `(select auth.uid()) = user_id`).
- Three SECURITY DEFINER RPCs (`get_ai_api_key`, `save_ai_api_key`, `remove_ai_api_key`) present, each `search_path=''`, revoked from public/anon, granted to authenticated.
- `supabase_vault` enabled; `vault.create_secret` / `vault.decrypted_secrets` round-trip works locally.
- `src/types/database.types.ts` regenerated and committed — exposes the `ai_settings` Row plus the three RPC signatures (`save_ai_api_key{p_key,p_model,p_provider}`, `get_ai_api_key`, `remove_ai_api_key`).
- `npx tsc --noEmit` shows ONLY the 3 expected Wave-0 RED scaffold errors (missing `@/actions/ai-settings`, `@/lib/ai/provider-factory`, `@/lib/schemas/ai-settings`, plus the consequential unused-`@ts-expect-error` on provider-factory) — no new/unrelated type errors.
- Cross-user decrypt isolation smoke PASSED on LOCAL (see Verification below).

## Task Commits

1. **Task 1: Author 0033 migration (table + RLS + Vault + 3 RPCs)** — `f724541` (feat, prior turn)
2. **Task 2: [BLOCKING] schema push** — LOCAL applied by the orchestrator (`supabase migration up --local`) + `npm run gen:types`. PROD push DEFERRED to the user (see Deviations).
3. **Task 3: Confirm regenerated types + RLS/decrypt smoke (+ rotation bug fix)** — `92ccbf4` (fix)

## Files Created/Modified
- `supabase/migrations/0033_ai_settings.sql` — rotation-ordering bug fix (delete-old-then-create) + expanded WHY comment. The table/RLS/RPC structure from Task 1 is unchanged.
- `src/types/database.types.ts` — regenerated after 0033 applied to LOCAL; adds `ai_settings` Row/Insert/Update + `get_ai_api_key`/`save_ai_api_key`/`remove_ai_api_key` to the `Functions` block.

## Verification (LOCAL stack)

Confirmed directly against the running local Postgres (`auth.uid()` impersonated via `request.jwt.claims` as the `authenticated` role, each flow in one transaction):

- **Structure:** table exists, RLS enabled, columns = `user_id, provider, model, key_secret_id, created_at, updated_at` (no plaintext column).
- **User A** `save_ai_api_key('gemini',…,'KEY-A-V1')` → `get_ai_api_key()` returns `KEY-A-V1` (Vault decrypt via the SECURITY DEFINER boundary works).
- **Rotation, same provider** → `KEY-A-V2-ROTATED` returned; **exactly 1** Vault secret remains for A (no orphan — Pitfall 4 / threat T-14-04).
- **Rotation to a different provider** (`claude`) → `KEY-A-CLAUDE` returned.
- **User B** `get_ai_api_key()` → `<null>` and `select * from ai_settings` returns 0 rows for B (RLS blocks cross-user read — BYOK-04 / threat T-14-02).
- **No plaintext leak:** the full `ai_settings` row text never contains the key material — only the `key_secret_id` UUID reference (BYOK-02 / threat T-14-01).
- **`remove_ai_api_key()`** → ai_settings row deleted AND the Vault secret deleted; subsequent `get_ai_api_key()` returns null (BYOK-05).
- **Type compile:** `npx tsc --noEmit` clean except the 3 known Wave-0 RED scaffolds.

Test users/secrets created for the smoke were cleaned up; LOCAL left in its pre-smoke state.

## Requirements Status (honest)
- **BYOK-02 (never-plaintext storage):** capability PROVEN on LOCAL (structural no-plaintext column + Vault-only ciphertext). DEFERRED for PROD until the user pushes 0033.
- **BYOK-04 (per-user decrypt isolation):** capability PROVEN on LOCAL (RLS + auth.uid()-filtered SECURITY DEFINER decrypt; user B cannot read user A's key). DEFERRED for PROD.
- **BYOK-05 (remove key → pre-IA state):** capability PROVEN on LOCAL (`remove_ai_api_key()` drops row + Vault secret). DEFERRED for PROD.

Not marking BYOK-02/04/05 as fully complete: the **deployed app needs 0033 on PROD** before BYOK works in production (the dev server points at PROD Supabase per project MEMORY). This is a deferred human deploy item, analogous to prior phases' deferred deploy plans — the orchestrator/user owns the PROD push.

## Deviations from Plan

### 1. [Process] Task 2 human-action push was SPLIT — LOCAL applied, PROD deferred
- **Plan expectation:** Task 2 pushes 0033 to LOCAL **and** PROD in one blocking human checkpoint, then regenerates types.
- **What happened:** the orchestrator applied 0033 to the LOCAL stack and ran `npm run gen:types`; the **PROD push is deferred to the user as a separate confirmation** (dev server points at PROD per MEMORY — pushing PROD requires the user's explicit credentials/confirmation).
- **Impact:** all Task 3 verification is against LOCAL. PROD remains un-migrated until the user runs `supabase db push` against the live project. Downstream plans (14-03/04/05 actions + UI) can be built and unit-verified against LOCAL/types, but BYOK will not function in the deployed app until the PROD push lands.
- **Tracked as deferred human item** (not a failure) — consistent with prior phases' deferred deploy pattern.

### 2. [Rule 1 - Bug] save_ai_api_key rotation collided on the Vault unique-name index
- **Found during:** Task 3 rotation smoke (same-provider re-save).
- **Issue:** the RPC called `vault.create_secret(p_key, 'ai_key:<uid>:<provider>')` **before** deleting the old secret. `vault.secrets` has a UNIQUE index on `name` (`secrets_name_idx`) and the secret name is stable per user+provider, so re-saving the SAME provider failed with `duplicate key value violates unique constraint "secrets_name_idx"` and aborted the whole transaction — key rotation (Pitfall 4 / threat T-14-04) was broken.
- **Fix:** reorder to **delete the old secret first, then create the new one** (safe: the caller already supplied the new plaintext, and the whole RPC is one transaction so any later failure rolls the delete back). Expanded the WHY comment to document the ordering constraint.
- **Files modified:** `supabase/migrations/0033_ai_settings.sql` (function body of `save_ai_api_key` only; table/RLS/other RPCs unchanged).
- **Re-verified on LOCAL** (the corrected `create or replace` was applied to the running stack): same-provider rotate, cross-provider rotate, cross-user isolation, and remove all pass; exactly one Vault secret per user after rotation (no orphans).
- **Commit:** `92ccbf4`
- **Scope note:** structural change considered against Rule 4 — it does NOT alter the schema, RLS shape, RPC signatures, security model, or Vault approach; it is a small ordering correction inside one function body, so it is a Rule 1 inline fix, not an architectural decision.

## Issues Encountered
- Initial smoke attempts ran each `psql` statement in its own implicit transaction, so `set local`/`set_config(..., is_local=true)` for `request.jwt.claims` did not persist into the RPC call ("not authenticated"). Resolved by wrapping each user's flow in an explicit `begin … commit;` block. Not a code issue — a test-harness detail (Supabase integration tests are env-flaky per project MEMORY; this was run deliberately as raw SQL).

## Known Stubs
None. This plan ships real, verified DB capability. No placeholder UI/data. The downstream consumers (decrypt DAL, Settings actions, Settings UI) are intentionally out of scope here and land in Plans 03/04/05.

## User Setup Required
- **PROD schema push (REQUIRED before BYOK works in the deployed app):** the user must run `supabase db push` against the LIVE production project (their credentials/confirmation required — dev server points at PROD per MEMORY), then confirm `ai_settings` + the three RPCs exist on PROD. DB-only change — no app redeploy needed. Until then, BYOK-02/04/05 are proven on LOCAL only.

## Next Phase Readiness
- `ai_settings` + Vault + the three RPCs are available on LOCAL and typed in `database.types.ts` — Plan 03 (server-only decrypt DAL / actions) and Plan 04 (Settings UI + test-connection) can build against them.
- The cross-user decrypt isolation invariant is verified — downstream code can rely on `get_ai_api_key()` returning only the caller's key.
- One open human gate carries forward: the **PROD push of 0033** (deferred, user-owned).

## Threat Flags
None. No new security surface beyond the plan's `<threat_model>` was introduced; the migration's mitigations for T-14-01..04 were all exercised by the LOCAL smoke (and the rotation fix closes the T-14-04 orphaned-secret path that was actually broken).

## Self-Check: PASSED

- Files verified present: `supabase/migrations/0033_ai_settings.sql`, `src/types/database.types.ts`
- `database.types.ts` verified to contain `ai_settings` Row + `get_ai_api_key`/`save_ai_api_key`/`remove_ai_api_key`
- Commits verified in git log: `f724541` (Task 1, feat), `92ccbf4` (Task 3 + rotation fix, fix)

---
*Phase: 14-key-storage-byok-settings*
*Completed: 2026-06-18*
