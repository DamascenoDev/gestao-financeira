-- 0036_category_keywords.sql
-- category_keywords: per-user manual keyword rules per category (KW-01/KW-06).
-- keyword is stored NORMALIZED (normalizeDescriptor / descriptor_norm key space) so
-- Phase 20's substring match against descriptor_norm is apples-to-apples. CRUD only;
-- NO matching/auto-classification here. Same uniform RLS shape + grants + indexes as
-- 0002_categories.sql + 0021_merchant_patterns.sql.
-- ON DELETE CASCADE on category_id: keywords are metadata owned by the category
-- (differs from transactions, which use RESTRICT + reassignment).

create table if not exists public.category_keywords (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  keyword     text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, category_id, keyword)        -- no dup term in the same category
);

create index if not exists category_keywords_user_id_idx
  on public.category_keywords (user_id);
create index if not exists category_keywords_category_id_idx
  on public.category_keywords (category_id);

alter table public.category_keywords enable row level security;

-- Table-level privileges for the Supabase API roles (RLS is the real gate;
-- service_role bypasses RLS).
grant select, insert, update, delete
  on public.category_keywords to authenticated, service_role;

drop policy if exists "own category_keywords" on public.category_keywords;
create policy "own category_keywords" on public.category_keywords
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
