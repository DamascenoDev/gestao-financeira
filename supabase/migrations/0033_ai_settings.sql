-- 0033_ai_settings.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION EXISTS (BYOK-02 / BYOK-04 / BYOK-05 — the encryption/storage
-- root of the v1.4 AI chain):
--
-- This is "storage + encryption BEFORE any AI call". Nothing downstream (the
-- server-only decrypt DAL, the Settings actions, the Settings UI, Phase 15's real
-- classification) can exist without this table + Vault + the three RPCs. It stands
-- up the SECURE KEY SUBSTRATE only — it does NOT wire any AI call.
--
-- One row per user holds the chosen provider + a cheap default model + a REFERENCE
-- (`key_secret_id`) to a Supabase Vault secret — NEVER the plaintext key. The
-- never-plaintext invariant (BYOK-02) is structural: there is NO column on this
-- table that can hold a key; the key lives only inside Vault's encrypted storage.
--
-- RLS (the single `for all` policy = the 0025_mei shape, covering
-- select/insert/update/delete with `using` + `with check` on auth.uid()=user_id)
-- isolates each user's row (BYOK-04). The authenticated role is NEVER granted direct
-- access to `vault.decrypted_secrets`; decrypt happens ONLY via the SECURITY DEFINER
-- `get_ai_api_key()` RPC, which is the trust boundary — it filters by auth.uid() via
-- the app-owned `ai_settings` row, so the plain RLS cookie client can read its OWN
-- key and never another user's (BYOK-04). `search_path = ''` hardens every RPC
-- against search-path hijacking (all object refs are schema-qualified).
--
-- `save_ai_api_key()` ROTATES (deletes the caller's OLD Vault secret after creating
-- the new one) so switching provider / changing the key never orphans decryptable
-- ciphertext (Pitfall 4). `remove_ai_api_key()` drops the row + the Vault secret so
-- the app returns to the pre-IA state without breaking (BYOK-05).
--
-- IDEMPOTENT / RE-RUNNABLE: `create extension if not exists`, `create table if not
-- exists`, `drop policy if exists` + `create policy`, and `create or replace
-- function` throughout — safe to apply more than once.
--
-- LOCAL VAULT VERIFIED (2026-06-18, RESEARCH Open Question 1 / Assumptions A1/A2):
-- against the running local stack the API surface is
--   vault.create_secret(new_secret text, new_name text, new_description text default,
--                        new_key_id uuid default) returns uuid
--   vault.decrypted_secrets (view; decrypts by id)
-- and there is NO vault.delete_secret helper — the delete/rotation path is
--   delete from vault.secrets where id = ...
-- A round-trip (create → decrypt → delete) was confirmed working locally. The SQL
-- below is corrected to that exact API (2-arg create_secret call; delete-from-secrets).
--
-- ACTION REQUIRED AFTER MERGE: the user must run `supabase db push` against the LOCAL
-- stack AND the LIVE production project (Phase 12 / DEPLOY-01 — dev server points at
-- PROD per project MEMORY, so this requires the user's credentials/confirmation), then
-- `npm run gen:types`. DB-only change — NO app redeploy needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- Supabase Vault ships as the `supabase_vault` extension; idempotent enable so the
-- migration is self-contained on a stack where Vault is not yet present.
create extension if not exists supabase_vault with schema vault;

-- ── ai_settings ────────────────────────────────────────────────────────────────
-- One provider config per user (user_id is the PK → exactly one active provider per
-- user; switching provider = UPDATE in place, not a new row). `key_secret_id` is a
-- REFERENCE to vault.secrets.id — it is NOT the key and is never returned to the
-- client. provider is constrained to the two launch providers ('gemini','claude');
-- 'deepseek' is deferred (CLSAI-F1) and 'google'/'anthropic' are intentionally NOT
-- the stored values (RESEARCH/CONTEXT lock 'gemini'/'claude').
create table if not exists public.ai_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  provider       text not null check (provider in ('gemini','claude')),
  model          text not null,
  key_secret_id  uuid not null,          -- → vault.secrets.id (a REFERENCE, NEVER the key)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── RLS (non-negotiable, uniform 0025_mei shape) ──────────────────────────────
-- ENABLE + grants + ONE `for all` policy. The single for-all policy covers
-- select/insert/update/delete and satisfies the "4 commands" RLS requirement; both
-- `using` and `with check` filter on auth.uid()=user_id so a user can neither read
-- nor write another user's row. Forgetting ENABLE or a WITH CHECK is a silent leak.
alter table public.ai_settings enable row level security;

grant select, insert, update, delete on public.ai_settings to authenticated, service_role;

drop policy if exists "own ai_settings" on public.ai_settings;
create policy "own ai_settings" on public.ai_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── get_ai_api_key() — the decrypt TRUST BOUNDARY ─────────────────────────────
-- SECURITY DEFINER so it can read vault.decrypted_secrets (service-role-only by
-- default) WITHOUT granting the authenticated role direct access to that view. It
-- filters by auth.uid() through the app-owned ai_settings row, so it returns ONLY
-- the caller's own key (or null if none set). search_path='' + schema-qualified refs
-- harden it against search-path hijacking.
create or replace function public.get_ai_api_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  k   text;
begin
  select key_secret_id into sid
    from public.ai_settings
   where user_id = (select auth.uid());
  if sid is null then
    return null;
  end if;
  select decrypted_secret into k
    from vault.decrypted_secrets
   where id = sid;
  return k;
end;
$$;
revoke all on function public.get_ai_api_key() from public, anon;
grant execute on function public.get_ai_api_key() to authenticated;

-- ── save_ai_api_key() — write + ROTATE ────────────────────────────────────────
-- SECURITY DEFINER write path. Plaintext arrives via the Server Action (p_key) and
-- is handed straight to Vault — it is NEVER persisted in an app column. Steps:
--   (a) guard: caller authenticated + provider is one of the two launch providers;
--   (b) read the caller's OLD key_secret_id (if any);
--   (c) vault.create_secret(p_key, <stable name>) → new_sid;
--   (d) upsert ai_settings (one row per user) pointing at new_sid;
--   (e) delete the OLD Vault secret if it existed — rotation, so no orphaned
--       decryptable ciphertext is left behind (Pitfall 4).
create or replace function public.save_ai_api_key(
  p_provider text,
  p_model    text,
  p_key      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := (select auth.uid());
  old_sid uuid;
  new_sid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_provider not in ('gemini','claude') then
    raise exception 'invalid provider';
  end if;

  select key_secret_id into old_sid from public.ai_settings where user_id = uid;

  -- 2-arg create_secret (secret, name): name is a stable, per-user+provider label.
  -- Verified local API: vault.create_secret(new_secret, new_name) returns uuid.
  new_sid := vault.create_secret(p_key, 'ai_key:' || uid::text || ':' || p_provider);

  insert into public.ai_settings (user_id, provider, model, key_secret_id, updated_at)
  values (uid, p_provider, p_model, new_sid, now())
  on conflict (user_id) do update
    set provider      = excluded.provider,
        model         = excluded.model,
        key_secret_id = excluded.key_secret_id,
        updated_at    = now();

  if old_sid is not null then
    delete from vault.secrets where id = old_sid;   -- rotate: drop the old ciphertext
  end if;
end;
$$;
revoke all on function public.save_ai_api_key(text, text, text) from public, anon;
grant execute on function public.save_ai_api_key(text, text, text) to authenticated;

-- ── remove_ai_api_key() — delete row + secret (BYOK-05) ───────────────────────
-- SECURITY DEFINER. Reads the caller's secret id, deletes the ai_settings row, then
-- deletes the Vault secret if present. After this the user has no key and the app
-- falls back to the pre-IA state (suggestCategory already null-tolerant).
create or replace function public.remove_ai_api_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  sid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  select key_secret_id into sid from public.ai_settings where user_id = uid;
  delete from public.ai_settings where user_id = uid;
  if sid is not null then
    delete from vault.secrets where id = sid;
  end if;
end;
$$;
revoke all on function public.remove_ai_api_key() from public, anon;
grant execute on function public.remove_ai_api_key() to authenticated;
