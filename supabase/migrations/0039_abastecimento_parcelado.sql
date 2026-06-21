-- 0039_abastecimento_parcelado.sql
-- Phase 26 (substrato-do-abastecimento-ponta-a-ponta), Plan 02 — the Wave 1 schema
-- substrate for parcelamento (FUEL-01). Relaxes the strict cost XOR to the attach-later
-- + parcelado truth table, adds the two parcelamento columns, creates the RLS-scoped
-- `abastecimento_parcelas` junction, and rewrites `v_abastecimento_consumo` (off the LIVE
-- 0029 body) so parcelado cost comes from `valor_total_cents` exactly ONCE — no
-- double-count, zero v1.2 à-vista regression. Fully replay-idempotent.
--
-- INVARIANTS pinned in SQL from the first byte (carried from 0027/0028/0029):
--   * Money is integer CENTAVOS (bigint), ALWAYS positive — never floats, never net.
--     `valor_total_cents` follows the same rule as `amount_cents` (> 0 or null).
--   * `litros` is a VOLUME (numeric), NOT money — never store it as cents.
--   * `with (security_invoker = true)` is MANDATORY on the view: a DEFINER view runs as
--     its owner and bypasses the caller's RLS, leaking EVERY user's rows (Pitfall 4 /
--     T-26-04; tests/carro-view-leak.test.ts proves the fix). `create or replace view`
--     resets the attribute to definer unless it is re-stated — so we re-state it.
--   * Cost-of-record (D-05): a PARCELADO fuel-up (parcelas_total > 1) carries its full
--     cost in `valor_total_cents` and NEVER uses `abastecimentos.transaction_id` /
--     `amount_cents` (the parcela transaction links live in `abastecimento_parcelas`).
--     An À-VISTA fuel-up keeps the v1.2 hybrid cost (transaction_id and/or amount_cents)
--     and NEVER carries `valor_total_cents`. The relaxed CHECK enforces this split.
--   * `abastecimentos_transaction_uniq` (0027 L67-68, the à-vista 1:1 partial index) is
--     PRESERVED untouched — it is the zero-regression guarantee for the v1.2 link path.
--
-- CROSS-ROW DOUBLE-LINK RESIDUAL (action-layer invariant, RESEARCH A1): a transaction
-- that is BOTH an à-vista `abastecimentos.transaction_id` AND a junction parcela on a
-- DIFFERENT abastecimento is NOT preventable by any single-row/single-table DB constraint
-- (it would need a cross-table trigger). The schema makes the common double-links
-- impossible (`abastecimentos_transaction_uniq` + `abastecimento_parcelas_transaction_uniq`),
-- and the relaxed CHECK keeps parcelado rows' `transaction_id` null so the two link paths
-- are structurally disjoint per abastecimento. The remaining cross-row reuse is enforced
-- in the Phases 27/28 action wiring (matching the existing `ALREADY_LINKED` precedent in
-- src/actions/abastecimentos.ts) — deliberately NOT a P26 DB constraint.
--
-- v_carro_resumo NOTE: per the 0028 L6-8 / 0029 L6-8 precedent, `v_carro_resumo` needs
-- NO structural change — it reads consumo averages OFF v_abastecimento_consumo (so the
-- new parcelado cost flows through automatically) and gasto OFF transactions.carro_id
-- (unchanged tag semantics). It is intentionally LEFT UNTOUCHED here to keep the interval
-- logic in ONE place, consistent with 0028/0029.

-- ── Sub-part B: parcelamento columns (D-04) ──────────────────────────────────────
-- Added FIRST so the relaxed CHECK below can reference them at compile time.
-- parcelas_total marks parcelado when > 1. valor_total_cents is the parcelado
-- cost-of-record in centavos (positive-or-null, mirroring amount_cents at 0027 L56).
alter table public.abastecimentos
  add column if not exists parcelas_total int;

alter table public.abastecimentos
  add column if not exists valor_total_cents bigint
    check (valor_total_cents is null or valor_total_cents > 0);

-- Positive-int guard on parcelas_total (>= 1 or null), mirroring the odometro_km style.
-- Drop-then-add for replay idempotency (constraints have no IF NOT EXISTS).
alter table public.abastecimentos drop constraint if exists abastecimentos_parcelas_total_chk;
alter table public.abastecimentos
  add constraint abastecimentos_parcelas_total_chk
  check (parcelas_total is null or parcelas_total >= 1);

-- ── Sub-part A: relaxed abastecimentos_cost_xor (D-01 attach-later + D-05 parcelado) ─
-- Replaces the strict XOR (0027 L60-63). Drop-then-add so it is replay-clean.
--   PARCELADO (parcelas_total > 1): cost is valor_total_cents ONCE; transaction_id and
--     amount_cents must both be null (links live in the junction).
--   À-VISTA (else): at least one of {transaction_id, amount_cents} present (attach-later
--     with BOTH present now passes; "neither" is still rejected), and valor_total_cents
--     must be null so the two cost models never bleed into each other.
alter table public.abastecimentos drop constraint if exists abastecimentos_cost_xor;
alter table public.abastecimentos
  add constraint abastecimentos_cost_xor check (
    case
      when parcelas_total is not null and parcelas_total > 1 then
        valor_total_cents is not null
        and transaction_id is null
        and amount_cents   is null
      else
        not (transaction_id is null and amount_cents is null)
        and valor_total_cents is null
    end
  );

-- ── Sub-part C: abastecimento_parcelas junction (D-03) ────────────────────────────
-- N:1 junction (one parcelado abastecimento → N parcela transactions), RLS-scoped like
-- every 0027/0025 table. unique(transaction_id) → a tx is at most ONE parcela.
-- unique(abastecimento_id, parcela_num) → no two "parcela 1" on the same abastecimento.
-- abastecimentos_transaction_uniq (0027) is PRESERVED — NOT touched here.
create table if not exists public.abastecimento_parcelas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id)            on delete cascade,
  abastecimento_id  uuid not null references public.abastecimentos(id) on delete cascade,
  transaction_id    uuid not null references public.transactions(id)   on delete cascade,
  parcela_num       int  not null check (parcela_num > 0),
  created_at        timestamptz not null default now(),
  -- A transaction is at most ONE parcela across the whole junction (no tx is two parcelas).
  constraint abastecimento_parcelas_transaction_uniq unique (transaction_id),
  -- Parcela numbers are unique within a given abastecimento (no two "parcela 1").
  constraint abastecimento_parcelas_num_uniq unique (abastecimento_id, parcela_num)
);

create index if not exists abastecimento_parcelas_user_idx  on public.abastecimento_parcelas (user_id);
create index if not exists abastecimento_parcelas_abast_idx on public.abastecimento_parcelas (abastecimento_id);

alter table public.abastecimento_parcelas enable row level security;
grant select, insert, update, delete on public.abastecimento_parcelas to authenticated, service_role;

drop policy if exists "own abastecimento_parcelas" on public.abastecimento_parcelas;
create policy "own abastecimento_parcelas" on public.abastecimento_parcelas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Sub-part D: v_abastecimento_consumo (security_invoker = true) ─────────────────
-- Rewritten VERBATIM from the LIVE 0029 body (id-anchored interval tuple, WR-02/05/06),
-- changing ONLY the cost expression at the two sites (the fills CTE per-row cost and the
-- interval subquery sum): both become the parcelado-aware CASE so parcelado cost comes
-- from valor_total_cents ONCE and à-vista keeps coalesce(real, esperado) (D-02). The
-- per-parcela transactions feed v_carro_resumo.gasto_total_cents (the cash-flow tag total)
-- but NEVER inflate this view's cost — no double-count.
create or replace view public.v_abastecimento_consumo
  with (security_invoker = true) as
  -- Postgres does NOT support FILTER on window functions (SQLSTATE 0A000), so we
  -- isolate the tanque_cheio fills into their own CTE first, then lag() over THAT set
  -- to get the previous full-tank fill (the interval lower bound). We lag() the FULL
  -- ordering tuple (not just odometer) so the lower bound is identity-anchored (WR-02).
  with full_fills as (
    select
      a.id,
      a.carro_id,
      a.occurred_on,
      a.created_at,
      a.odometro_km,
      lag(a.odometro_km) over (
        partition by a.carro_id
        order by a.odometro_km, a.occurred_on, a.created_at, a.id
      ) as prev_full_odometro,
      lag(a.occurred_on) over (
        partition by a.carro_id
        order by a.odometro_km, a.occurred_on, a.created_at, a.id
      ) as prev_full_occurred,
      lag(a.created_at) over (
        partition by a.carro_id
        order by a.odometro_km, a.occurred_on, a.created_at, a.id
      ) as prev_full_created,
      lag(a.id) over (
        partition by a.carro_id
        order by a.odometro_km, a.occurred_on, a.created_at, a.id
      ) as prev_full_id
    from public.abastecimentos a
    where a.tanque_cheio
  ),
  fills as (
    select
      a.id,
      a.user_id,
      a.carro_id,
      a.occurred_on,
      a.created_at,
      a.odometro_km,
      a.litros,
      a.tanque_cheio,
      -- Cost CASE (D-05): parcelado → valor_total_cents ONCE; à-vista → real over esperado.
      (case
         when a.parcelas_total is not null and a.parcelas_total > 1 then a.valor_total_cents
         else coalesce(t.amount_cents, a.amount_cents)
       end)::bigint as custo_cents,
      ff.prev_full_odometro,
      ff.prev_full_occurred,
      ff.prev_full_created,
      ff.prev_full_id
    from public.abastecimentos a
    left join public.transactions t on t.id = a.transaction_id
    left join full_fills ff on ff.id = a.id
  ),
  intervals as (
    -- A consumption interval is closed at each tanque_cheio fill that has a prior
    -- tanque_cheio fill to measure against AND a strictly positive odometer delta
    -- (WR-06: a non-positive delta is a bad reading and is excluded outright).
    -- Membership is bounded on the FULL ordering tuple (WR-02): strictly AFTER the
    -- prior full-tank fill and up to/including this closing fill, so a sibling fill at
    -- the SAME odometro_km is NOT swept in.
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
          and (s.odometro_km, s.occurred_on, s.created_at, s.id)
                > (f.prev_full_odometro, f.prev_full_occurred, f.prev_full_created, f.prev_full_id)
          and (s.odometro_km, s.occurred_on, s.created_at, s.id)
                <= (f.odometro_km, f.occurred_on, f.created_at, f.id)
      )::numeric as litros_intervalo,
      (
        select sum(
          case
            when s.parcelas_total is not null and s.parcelas_total > 1 then s.valor_total_cents
            else coalesce(st.amount_cents, s.amount_cents)
          end
        )
        from public.abastecimentos s
        left join public.transactions st on st.id = s.transaction_id
        where s.carro_id = f.carro_id
          and (s.odometro_km, s.occurred_on, s.created_at, s.id)
                > (f.prev_full_odometro, f.prev_full_occurred, f.prev_full_created, f.prev_full_id)
          and (s.odometro_km, s.occurred_on, s.created_at, s.id)
                <= (f.odometro_km, f.occurred_on, f.created_at, f.id)
      )::bigint as custo_intervalo_cents
    from fills f
    where f.tanque_cheio
      and f.prev_full_odometro is not null
      and (f.odometro_km - f.prev_full_odometro) > 0
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
      when i.km_rodados is null or i.km_rodados <= 0
        or i.litros_intervalo is null or i.litros_intervalo = 0 then null
      else (i.km_rodados / i.litros_intervalo)
    end as km_por_litro,
    case
      when i.km_rodados is null or i.km_rodados <= 0 then null
      else (i.custo_intervalo_cents::numeric / i.km_rodados)
    end as reais_por_km
  from intervals i;

grant select on public.v_abastecimento_consumo to authenticated;
