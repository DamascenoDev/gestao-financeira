-- 0025_mei.sql
-- MEI module substrate: three tables for the MEI annual revenue tracking + DASN-SIMEI
-- report. Same uniform Phase-1/2/3 RLS shape per table (USING + WITH CHECK
-- auth.uid()=user_id + grants + a user_id index — forgetting ENABLE ROW LEVEL
-- SECURITY is a silent leak, Pitfall 2). The module is ISOLATED: it does not touch
-- transactions/classification. (MEI-01/02/03)
--
-- Money is integer centavos and ALWAYS the GROSS receita bruta (never net) — the MEI
-- limit is computed on gross (Pitfall 12). issued_on is a civil date (no time) so an
-- NF issued late on 31-Dec never slips into the wrong year via UTC (Pitfall 4).

-- ── mei_settings ──────────────────────────────────────────────────────────────
-- One settings row per user: the MEI start date is single-valued per user (the
-- applicable-limit proportionality keys off its civil year/month). unique(user_id)
-- enforces the one-row-per-user invariant.
create table if not exists public.mei_settings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  mei_start_date date not null,
  created_at    timestamptz not null default now(),
  unique (user_id)
);

create index if not exists mei_settings_user_idx on public.mei_settings (user_id);

-- ── mei_year_flags ────────────────────────────────────────────────────────────
-- The DASN "houve empregado?" answer is per declaration year (a MEI can hire/fire
-- across years), so it is modelled per (user, year) — a small flag table, clean RLS,
-- clean join in the view, no JSON. (Open Question 1 resolved as a per-year table.)
create table if not exists public.mei_year_flags (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  year         int not null,
  has_employee boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (user_id, year)
);

create index if not exists mei_year_flags_user_idx on public.mei_year_flags (user_id);

-- ── mei_invoices ──────────────────────────────────────────────────────────────
-- One row per issued NF (nota fiscal). amount_cents is the GROSS billed amount —
-- receita bruta, nunca líquida (the MEI limit is computed on gross; never subtract
-- anything). activity_type carries the per-NF DASN split (comércio/indústria/transporte
-- com ICMS vs prestação de serviços com ISS) so the yearly report can produce the
-- declaration's two-line split. (MEI-01/03)
create table if not exists public.mei_invoices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  issued_on     date not null,                                      -- civil date, no time (Pitfall 4)
  amount_cents  bigint not null check (amount_cents > 0),           -- receita bruta, nunca líquida
  tomador       text not null,
  descricao     text not null default '',
  activity_type text not null check (activity_type in ('comercio_industria','servicos')),
  created_at    timestamptz not null default now()
);

create index if not exists mei_invoices_user_issued_idx
  on public.mei_invoices (user_id, issued_on);

-- ── RLS (non-negotiable, uniform 0013 shape) ─────────────────────────────────
alter table public.mei_settings   enable row level security;
alter table public.mei_year_flags enable row level security;
alter table public.mei_invoices   enable row level security;

grant select, insert, update, delete on public.mei_settings   to authenticated, service_role;
grant select, insert, update, delete on public.mei_year_flags to authenticated, service_role;
grant select, insert, update, delete on public.mei_invoices   to authenticated, service_role;

drop policy if exists "own mei_settings" on public.mei_settings;
create policy "own mei_settings" on public.mei_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own mei_year_flags" on public.mei_year_flags;
create policy "own mei_year_flags" on public.mei_year_flags
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own mei_invoices" on public.mei_invoices;
create policy "own mei_invoices" on public.mei_invoices
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
