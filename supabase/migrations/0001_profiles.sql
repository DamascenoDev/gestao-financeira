-- 0001_profiles.sql
-- profiles: 1:1 with auth.users. user_id mirrors id so the uniform RLS shape
-- (select auth.uid()) = user_id applies identically across every Phase-1 table.
-- Idempotent: create ... if not exists + drop policy if exists before create policy.
-- Security boundary (AUTH-03 / threats T-1-rls, T-1-check).

-- user_id is UNIQUE: enforces the documented 1:1 invariant with auth.users so a
-- later `.from('profiles').single()` can never throw PGRST116 on multiple rows
-- (HG-02). The UNIQUE constraint creates its own backing index, so a separate
-- `create index ... on (user_id)` would be redundant and is intentionally omitted.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Table-level privileges for the Supabase API roles. RLS is the row gate, but a
-- role must first hold table privileges to reach the table at all — without these
-- grants every access is denied at the privilege layer, masking whether RLS works
-- (a silent false-green; see PITFALLS Pitfall 2). service_role bypasses RLS and is
-- used by the local seed test's admin client.
grant select, insert, update, delete on public.profiles to authenticated, service_role;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
