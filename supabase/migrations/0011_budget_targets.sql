-- 0011_budget_targets.sql
-- One meta per category: a percent of net income + a direction. The direction
-- default (consumo→teto, alocacao→alvo) is a business rule applied in the action,
-- NOT a DB default, because it depends on the referenced category's kind. Same
-- uniform RLS shape as Phase 1/2: (select auth.uid()) = user_id USING+WITH CHECK,
-- TO authenticated, DML grants + a user_id index. category_id FK ON DELETE CASCADE:
-- removing a category legitimately removes its meta (a meta has no value without its
-- category — unlike a transaction, which must be preserved → RESTRICT). (BUD-01)

create table if not exists public.budget_targets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  -- Integer basis-points (3000 = 30.00%): exact, no float, consistent with the
  -- "no float in money" discipline. 0 < bp <= 10000 by domain rule.
  percent_bp   int  not null check (percent_bp > 0 and percent_bp <= 10000),
  direction    text not null check (direction in ('teto','alvo')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One meta per category per user (BUD-01). Upsert keys on this.
  unique (user_id, category_id)
);

create index if not exists budget_targets_user_idx on public.budget_targets (user_id);

alter table public.budget_targets enable row level security;

grant select, insert, update, delete on public.budget_targets to authenticated, service_role;

drop policy if exists "own budget_targets" on public.budget_targets;
create policy "own budget_targets" on public.budget_targets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
