-- 0002_categories.sql
-- categories: per-user BR category set. Same uniform RLS shape as profiles
-- (USING + WITH CHECK, (select auth.uid()) = user_id, TO authenticated) + user_id index.
-- handle_new_user() is SECURITY DEFINER with a pinned search_path so it can insert
-- the caller's own profile + 11 BR categories at signup despite RLS, atomic with
-- auth.users creation. Investimentos + Reserva = 'alocacao'; the rest 'consumo'.
-- ASCII enum values ('consumo'/'alocacao'), no accent (RESEARCH assumption A5).
-- (AUTH-03 / CAT-01 / threats T-1-rls, T-1-check, T-1-defdef)

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('consumo','alocacao')),
  sort        int  not null default 0,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists categories_user_id_idx on public.categories (user_id);

alter table public.categories enable row level security;

-- Table-level privileges for the Supabase API roles (see 0001_profiles.sql).
-- RLS scopes rows; these grants let the role reach the table so RLS is the real
-- gate rather than a blanket privilege denial. service_role bypasses RLS.
grant select, insert, update, delete on public.categories to authenticated, service_role;

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Per-user seed: 1 profile + 11 BR categories at signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, user_id) values (new.id, new.id);

  insert into public.categories (user_id, name, kind, sort) values
    (new.id, 'Moradia',        'consumo',   1),
    (new.id, 'Alimentação',    'consumo',   2),
    (new.id, 'Transporte',     'consumo',   3),
    (new.id, 'Saúde',          'consumo',   4),
    (new.id, 'Educação',       'consumo',   5),
    (new.id, 'Lazer',          'consumo',   6),
    (new.id, 'Vestuário',      'consumo',   7),
    (new.id, 'Assinaturas',    'consumo',   8),
    (new.id, 'Investimentos',  'alocacao',  9),
    (new.id, 'Reserva',        'alocacao', 10),
    (new.id, 'Outros',         'consumo',  11);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
