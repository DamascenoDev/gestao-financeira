-- 0004_incomes.sql
-- income_templates + income_occurrences: the receitas substrate (INC-01..04).
-- A recurring template stores the "intent"; one materialized occurrence per civil
-- month stores the "actual". Editing one month edits only that occurrence (INC-02).
-- Avulsas (INC-03) are occurrences with template_id NULL.
--
-- Same uniform RLS shape as Phase 1 (profiles/categories): (select auth.uid()) = user_id
-- USING + WITH CHECK, TO authenticated, DML grants + user_id index. Idempotent:
-- create ... if not exists + drop policy if exists before create policy.
-- (INC-01..04 / threat T-02-RLS, T-02-MONEY)

create table if not exists public.income_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  source        text not null,                              -- free text: Salário, Pensão, Outros
  amount_cents  bigint not null check (amount_cents >= 0),  -- integer centavos; never float
  day_of_month  int  not null check (day_of_month between 1 and 31),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists income_templates_user_id_idx on public.income_templates (user_id);

create table if not exists public.income_occurrences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  template_id   uuid references public.income_templates(id) on delete set null, -- null = avulsa (INC-03)
  source        text not null,                              -- snapshot of source (rename-safe history)
  amount_cents  bigint not null check (amount_cents >= 0),
  month_key     text not null check (month_key ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM' civil Sao_Paulo
  occurred_on   date not null,
  created_at    timestamptz not null default now(),
  -- One materialized occurrence per template per month → makes the materialize-on-read
  -- upsert idempotent (INC-02). Postgres treats NULLs as distinct in a unique index, so
  -- multiple avulsas (template_id IS NULL) in the same month are still allowed (INC-03).
  unique (user_id, template_id, month_key)
);

create index if not exists income_occurrences_user_month_idx
  on public.income_occurrences (user_id, month_key);

-- RLS — identical shape to Phase 1. The grants are mandatory: without table-level
-- privileges every access is denied at the privilege layer, masking whether RLS works.
alter table public.income_templates  enable row level security;
alter table public.income_occurrences enable row level security;

grant select, insert, update, delete on public.income_templates  to authenticated, service_role;
grant select, insert, update, delete on public.income_occurrences to authenticated, service_role;

drop policy if exists "own income_templates" on public.income_templates;
create policy "own income_templates" on public.income_templates
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own income_occurrences" on public.income_occurrences;
create policy "own income_occurrences" on public.income_occurrences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
