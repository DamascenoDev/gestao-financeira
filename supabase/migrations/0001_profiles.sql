-- 0001_profiles.sql
-- profiles: 1:1 with auth.users. user_id mirrors id so the uniform RLS shape
-- (select auth.uid()) = user_id applies identically across every Phase-1 table.
-- Idempotent: create ... if not exists + drop policy if exists before create policy.
-- Security boundary (AUTH-03 / threats T-1-rls, T-1-check).

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create index if not exists profiles_user_id_idx on public.profiles (user_id);

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
