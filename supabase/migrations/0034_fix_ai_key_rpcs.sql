-- 0034_fix_ai_key_rpcs.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION EXISTS (PROD hotfix for BYOK save/test failing in production):
--
-- 0033 shipped the `ai_settings` table + the three Vault RPCs. During Phase 14 an
-- EARLY (buggy) version of `save_ai_api_key()` was applied to the PRODUCTION database
-- via `supabase db push` BEFORE the rotation-collision fix (`92ccbf4`) landed in the
-- repo. Because `supabase db push` skips any migration version already present on the
-- remote (0033 was already there), the CORRECTED function body never reached PROD —
-- so PROD ran the buggy `create-secret-BEFORE-delete` body. On a RE-SAVE that collides
-- with the still-present old secret on the UNIQUE `vault.secrets.name` index
-- (`secrets_name_idx`), the RPC aborts → the Settings UI shows "Não foi possível
-- salvar." LOCAL was always correct (the fix was applied there), which is why LOCAL
-- worked and PROD did not.
--
-- This migration re-applies the THREE RPCs via `create or replace` (idempotent) so the
-- PROD function bodies match the verified-working LOCAL ones byte-for-byte. It is a
-- NO-OP where the corrected bodies are already present. It also re-asserts the Vault
-- extension + the execute grants (defense-in-depth — harmless if already set).
--
-- NON-DESTRUCTIVE: only `create extension if not exists` + `create or replace function`
-- + `revoke`/`grant`. No table/data/RLS change. Re-runnable.
--
-- ACTION REQUIRED AFTER MERGE: run `supabase db push` (applies 0034 to the linked PROD
-- project — it is a NEW version, so it WILL apply) and to LOCAL. DB-only — no app
-- redeploy. After pushing, retry saving the key at /conta/configuracoes-ia in PROD.
--
-- If save STILL fails after this, the cause is a Vault availability/permission issue on
-- the PROD project (not the function body) — check the Supabase Postgres logs for the
-- exact error from `save_ai_api_key` (e.g. "permission denied for schema vault" or
-- "function vault.create_secret does not exist").
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists supabase_vault with schema vault;

-- ── get_ai_api_key() — server-only decrypt, filtered by auth.uid() ────────────
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

-- ── save_ai_api_key() — write + ROTATE (delete-then-create) ───────────────────
-- The corrected body: drop the OLD ciphertext BEFORE creating the new secret so a
-- same-provider re-save does not collide with the stable secret name on the UNIQUE
-- vault.secrets.name index. Safe inside one txn (rolls back on later error).
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

  if old_sid is not null then
    delete from vault.secrets where id = old_sid;   -- rotate: drop the old ciphertext
  end if;

  new_sid := vault.create_secret(p_key, 'ai_key:' || uid::text || ':' || p_provider);

  insert into public.ai_settings (user_id, provider, model, key_secret_id, updated_at)
  values (uid, p_provider, p_model, new_sid, now())
  on conflict (user_id) do update
    set provider      = excluded.provider,
        model         = excluded.model,
        key_secret_id = excluded.key_secret_id,
        updated_at    = now();
end;
$$;
revoke all on function public.save_ai_api_key(text, text, text) from public, anon;
grant execute on function public.save_ai_api_key(text, text, text) to authenticated;

-- ── remove_ai_api_key() — delete row + secret ─────────────────────────────────
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
