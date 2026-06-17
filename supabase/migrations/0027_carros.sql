-- 0027_carros.sql
-- Carro module substrate (Phase 8, Plan 01): the two tables `carros` and
-- `abastecimentos`, the nullable additive tag `transactions.carro_id`, and the two
-- consumption views — plus uniform RLS / grants / indexes following the repo shape
-- from 0005/0025/0026. Idempotent (create table if not exists, add column if not
-- exists, drop policy / create or replace view). (CAR-01 / CAR-06)
--
-- INVARIANTS pinned in SQL from the first byte:
--   * Money is integer CENTAVOS (bigint), ALWAYS positive — never floats, never net.
--   * `litros` is `numeric(7,3)` — it is a VOLUME, NOT money; never store it as cents.
--   * `with (security_invoker = true)` is MANDATORY on both views: a DEFINER view runs
--     as its owner and bypasses the caller's RLS, leaking EVERY user's rows
--     (tests/carro-view-leak.test.ts proves the fix; Pitfall 6 / T-08-02).
--   * `transactions.carro_id` is a NON-ACCOUNTING additive tag (D4): it never alters a
--     lançamento's category/metas accounting; no policy/view keys budget off it.
--     ON DELETE SET NULL so deleting a carro UNLINKS its lançamentos, never deletes them.
--   * Cost XOR CHECK (D2): an abastecimento's cost comes from EXACTLY ONE source —
--     a linked `transaction_id` OR a manual `amount_cents` — never both, never neither.
--     A partial unique index keeps one lançamento linked to at most one abastecimento.

-- ── carros ──────────────────────────────────────────────────────────────────────
-- One row per vehicle. Supports N carros per user (D1) and is user_id-scoped from day
-- one (multi-user-ready like the rest of the app). apelido is the only required field;
-- modelo/placa/ano/combustivel_padrao are optional identity. is_archived is a soft
-- toggle (archived carros hidden by default in the list).
create table if not exists public.carros (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  apelido             text not null,
  modelo              text,
  placa               text,
  ano                 int,
  combustivel_padrao  text,
  is_archived         boolean not null default false,
  created_at          timestamptz not null default now()
);

create index if not exists carros_user_idx on public.carros (user_id);

-- ── abastecimentos ────────────────────────────────────────────────────────────
-- One row per fuel-up. litros is a VOLUME (numeric, NOT money). The cost is hybrid
-- (D2): either reused from a linked fatura lançamento (transaction_id) OR entered
-- manually (amount_cents, integer centavos) — exactly one, enforced by the XOR CHECK.
-- preco_litro is DERIVED (custo ÷ litros), never stored. tanque_cheio drives the
-- tanque-cheio consumption method (D3).
create table if not exists public.abastecimentos (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  carro_id        uuid not null references public.carros(id) on delete cascade,
  occurred_on     date not null,                                            -- civil date, pinned SP at app edge
  odometro_km     int not null check (odometro_km > 0),
  litros          numeric(7,3) not null check (litros > 0),                 -- VOLUME, not money
  tanque_cheio    boolean not null,                                         -- tanque-cheio method (D3)
  combustivel     text,
  transaction_id  uuid references public.transactions(id) on delete set null, -- optional fatura link (D2)
  amount_cents    bigint check (amount_cents is null or amount_cents > 0),  -- manual cost when unlinked; centavos
  note            text,
  created_at      timestamptz not null default now(),
  -- Cost XOR (D2): exactly one cost source, never both, never neither.
  constraint abastecimentos_cost_xor check (
    (transaction_id is not null and amount_cents is null)
    or (transaction_id is null and amount_cents is not null)
  )
);

-- One lançamento links to at most one abastecimento (partial: only enforced when set).
create unique index if not exists abastecimentos_transaction_uniq
  on public.abastecimentos (transaction_id) where transaction_id is not null;

create index if not exists abastecimentos_user_idx  on public.abastecimentos (user_id);
create index if not exists abastecimentos_carro_idx on public.abastecimentos (carro_id);

-- ── transactions.carro_id (additive non-accounting tag, D4) ─────────────────────
-- Nullable etiqueta linking a lançamento to a carro. ON DELETE SET NULL so deleting a
-- carro unlinks (never deletes) its lançamentos. Does NOT touch the existing 0005 RLS
-- policy (it already scopes the whole row including this new column) and never alters
-- category/metas accounting.
alter table public.transactions
  add column if not exists carro_id uuid references public.carros(id) on delete set null;

create index if not exists transactions_carro_idx on public.transactions (carro_id);

-- ── RLS (non-negotiable, uniform 0025 shape) ────────────────────────────────────
alter table public.carros         enable row level security;
alter table public.abastecimentos enable row level security;

grant select, insert, update, delete on public.carros         to authenticated, service_role;
grant select, insert, update, delete on public.abastecimentos to authenticated, service_role;

drop policy if exists "own carros" on public.carros;
create policy "own carros" on public.carros
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own abastecimentos" on public.abastecimentos;
create policy "own abastecimentos" on public.abastecimentos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── v_abastecimento_consumo (security_invoker = true) ───────────────────────────
-- Per carro, ordered by odometro_km, the tanque-cheio interval consumption (D3):
-- each tanque_cheio=true fuel-up closes an interval. km_rodados = odômetro atual −
-- odômetro do último abastecimento tanque-cheio (lag over tanque-cheio rows only);
-- litros_intervalo = Σ litros desde (exclusive) o último tanque cheio até este;
-- km_por_litro = km_rodados ÷ litros_intervalo (guard /0 → null, the 0014/0026
-- sem-receita pattern); custo_intervalo_cents = Σ coalesce(t.amount_cents,
-- a.amount_cents) over the interval (linked transaction cost when present, else the
-- manual cost); reais_por_km = custo_intervalo ÷ km_rodados (guard /0). user_id is
-- exposed so security_invoker scopes the view per caller.
create or replace view public.v_abastecimento_consumo
  with (security_invoker = true) as
  with fills as (
    select
      a.id,
      a.user_id,
      a.carro_id,
      a.occurred_on,
      a.odometro_km,
      a.litros,
      a.tanque_cheio,
      coalesce(t.amount_cents, a.amount_cents)::bigint as custo_cents,
      -- The previous FULL-tank odometer for this carro (interval lower bound).
      lag(a.odometro_km) filter (where a.tanque_cheio)
        over (partition by a.carro_id order by a.odometro_km) as prev_full_odometro,
      -- The previous FULL-tank occurred_on (interval lower time bound, for the litros sum).
      lag(a.occurred_on) filter (where a.tanque_cheio)
        over (partition by a.carro_id order by a.odometro_km) as prev_full_on
    from public.abastecimentos a
    left join public.transactions t on t.id = a.transaction_id
  ),
  intervals as (
    -- A consumption interval is closed at each tanque_cheio fill that has a prior
    -- tanque_cheio fill to measure against.
    select
      f.id,
      f.user_id,
      f.carro_id,
      f.occurred_on,
      f.odometro_km,
      (f.odometro_km - f.prev_full_odometro) as km_rodados,
      (
        select sum(s.litros)
        from public.abastecimentos s
        where s.carro_id = f.carro_id
          and s.odometro_km > f.prev_full_odometro
          and s.odometro_km <= f.odometro_km
      )::numeric as litros_intervalo,
      (
        select sum(coalesce(st.amount_cents, s.amount_cents))
        from public.abastecimentos s
        left join public.transactions st on st.id = s.transaction_id
        where s.carro_id = f.carro_id
          and s.odometro_km > f.prev_full_odometro
          and s.odometro_km <= f.odometro_km
      )::bigint as custo_intervalo_cents
    from fills f
    where f.tanque_cheio and f.prev_full_odometro is not null
  )
  select
    i.id,
    i.user_id,
    i.carro_id,
    i.occurred_on,
    i.odometro_km,
    i.km_rodados,
    i.litros_intervalo,
    i.custo_intervalo_cents,
    case
      when i.litros_intervalo is null or i.litros_intervalo = 0 then null
      else (i.km_rodados / i.litros_intervalo)
    end as km_por_litro,
    case
      when i.km_rodados is null or i.km_rodados = 0 then null
      else (i.custo_intervalo_cents::numeric / i.km_rodados)
    end as reais_por_km
  from intervals i;

grant select on public.v_abastecimento_consumo to authenticated;

-- ── v_carro_resumo (security_invoker = true) ────────────────────────────────────
-- Per carro consolidated row. The consumption averages are built OFF
-- v_abastecimento_consumo so the interval logic lives in ONE place (no SQL drift).
-- gasto_total_cents = Σ transactions.amount_cents where carro_id = carros.id (the
-- non-accounting tag total — manutenção + combustível tagged to the carro).
-- gasto_mes_corrente_cents = the same total filtered to the current SP calendar month.
-- user_id is exposed so security_invoker scopes the view per caller.
create or replace view public.v_carro_resumo
  with (security_invoker = true) as
  with consumo as (
    select
      c.carro_id,
      avg(c.km_por_litro) filter (where c.km_por_litro is not null) as km_por_litro_medio,
      avg(c.reais_por_km)  filter (where c.reais_por_km is not null) as reais_por_km_medio,
      -- preço médio/litro = Σ custo dos intervalos ÷ Σ litros dos intervalos (centavos).
      case
        when sum(c.litros_intervalo) is null or sum(c.litros_intervalo) = 0 then null
        else (sum(c.custo_intervalo_cents)::numeric / sum(c.litros_intervalo))
      end as preco_litro_medio_cents
    from public.v_abastecimento_consumo c
    group by c.carro_id
  ),
  gasto as (
    select
      t.carro_id,
      sum(t.amount_cents)::bigint as gasto_total_cents,
      coalesce(
        sum(t.amount_cents) filter (
          where t.occurred_on >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date
            and t.occurred_on <  (date_trunc('month', (now() at time zone 'America/Sao_Paulo')) + interval '1 month')::date
        ),
        0
      )::bigint as gasto_mes_corrente_cents
    from public.transactions t
    where t.carro_id is not null
    group by t.carro_id
  )
  select
    car.id as carro_id,
    car.user_id,
    cons.km_por_litro_medio,
    cons.reais_por_km_medio,
    cons.preco_litro_medio_cents,
    coalesce(g.gasto_total_cents, 0)::bigint        as gasto_total_cents,
    coalesce(g.gasto_mes_corrente_cents, 0)::bigint as gasto_mes_corrente_cents
  from public.carros car
  left join consumo cons on cons.carro_id = car.id
  left join gasto   g    on g.carro_id    = car.id;

grant select on public.v_carro_resumo to authenticated;
