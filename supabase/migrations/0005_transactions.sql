-- 0005_transactions.sql
-- transactions: manual expense lançamentos (TXN-01..04). amount_cents is ALWAYS
-- positive (check > 0); the sign/effect derives from `kind`, never from a negative
-- value. category_id FK is ON DELETE RESTRICT so deleting a category referenced by
-- any transaction is blocked at the DB level (CAT-02 safety net — error code 23503);
-- the graceful archive/reassign path lives in the UI + the reassign RPC (0008).
--
-- Same uniform RLS shape as Phase 1 (USING + WITH CHECK, TO authenticated) + grants
-- + indexes. Idempotent. (TXN-01..04 / CAT-02 / threats T-02-RLS, T-02-FK, T-02-MONEY)

create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete restrict, -- BLOCK hard-delete (CAT-02)
  amount_cents  bigint not null check (amount_cents > 0),                 -- ALWAYS positive; sign from kind
  kind          text not null default 'expense' check (kind in ('expense')), -- expense only in P2
  occurred_on   date not null,
  description   text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists transactions_user_month_idx on public.transactions (user_id, occurred_on);
create index if not exists transactions_category_idx   on public.transactions (category_id);

alter table public.transactions enable row level security;

grant select, insert, update, delete on public.transactions to authenticated, service_role;

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
