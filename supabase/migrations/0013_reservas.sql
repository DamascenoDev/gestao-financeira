-- 0013_reservas.sql
-- reservas (named sinking funds, optional alvo) + reserva_ledger (append-only
-- in/out entries, ALWAYS positive amount, sign derives from kind). Balance is
-- NEVER a stored column — it is derived (Σ in − Σ out) in v_reserva_balance
-- (0015). Same uniform Phase-1/2 RLS shape per table. (RSV-01/02/04/05)

create table if not exists public.reservas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  alvo_cents  bigint check (alvo_cents is null or alvo_cents > 0),  -- OPTIONAL target
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists reservas_user_idx on public.reservas (user_id);

create table if not exists public.reserva_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  reserva_id     uuid not null references public.reservas(id) on delete cascade,
  kind           text not null check (kind in ('in','out')),
  amount_cents   bigint not null check (amount_cents > 0),   -- ALWAYS positive; sign from kind
  -- Links a "Reserva"-classified transaction to its aporte entry. ON DELETE SET NULL:
  -- if the source transaction is hard-deleted, the ledger entry survives but unlinks
  -- (the balance re-derives). (RSV-02 edit/undo)
  transaction_id uuid references public.transactions(id) on delete set null,
  occurred_on    date not null,
  note           text not null default '',
  created_at     timestamptz not null default now()
);

create index if not exists reserva_ledger_reserva_idx on public.reserva_ledger (reserva_id);
create index if not exists reserva_ledger_user_idx    on public.reserva_ledger (user_id);
-- One aporte entry per source transaction (idempotent re-link; an edit replaces it).
create unique index if not exists reserva_ledger_txn_uniq
  on public.reserva_ledger (transaction_id) where transaction_id is not null;

alter table public.reservas       enable row level security;
alter table public.reserva_ledger enable row level security;

grant select, insert, update, delete on public.reservas       to authenticated, service_role;
grant select, insert, update, delete on public.reserva_ledger to authenticated, service_role;

drop policy if exists "own reservas" on public.reservas;
create policy "own reservas" on public.reservas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own reserva_ledger" on public.reserva_ledger;
create policy "own reserva_ledger" on public.reserva_ledger
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
