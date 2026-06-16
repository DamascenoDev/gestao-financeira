-- 0021_merchant_patterns.sql
-- merchant_patterns: the classification MEMORY. One mapping per (user_id,
-- descriptor_norm) — an O(1) point-read on the unique key is how a known merchant
-- is auto-classified with ZERO external calls (CLS-01/04). The pattern is keyed by
-- category_id (a stable uuid), never by name, so renaming a category does NOT
-- rewrite history (CLS-05 discipline); reserva_id is the learned reserva for
-- merchant→reserva auto-suggest (RSV-06), nullable (most merchants are not reservas).
--
-- Learned ONLY on a human confirm in confirmImport (Plan 03) — never from an
-- unconfirmed/AI guess (no memory poisoning). hit_count / last_used_at support a
-- future "most-used" surfacing; both optional.
--
-- Same uniform RLS shape + grants + user_id index. (CLS-01/03/04 / RSV-06 / threat T-04-01)

create table if not exists public.merchant_patterns (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  descriptor_norm text not null,
  category_id     uuid not null references public.categories(id) on delete cascade,
  reserva_id      uuid references public.reservas(id) on delete set null,  -- RSV-06 learned reserva
  hit_count       int not null default 0,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, descriptor_norm)             -- O(1) point-read; one mapping per merchant
);

create index if not exists merchant_patterns_user_idx on public.merchant_patterns (user_id);

alter table public.merchant_patterns enable row level security;

grant select, insert, update, delete on public.merchant_patterns to authenticated, service_role;

drop policy if exists "own merchant_patterns" on public.merchant_patterns;
create policy "own merchant_patterns" on public.merchant_patterns
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
