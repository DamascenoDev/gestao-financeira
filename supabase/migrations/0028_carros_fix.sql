-- 0028_carros_fix.sql
-- FIX-ONLY migration for the deferred Phase-8 review items (WR-01, WR-05, WR-06).
-- It touches NOTHING structural from 0027: no table/column/RLS/grant/index changes.
-- It only (a) adds two CHECK constraints to `carros` and (b) `create or replace`s the
-- `v_abastecimento_consumo` view with corrected interval math. `v_carro_resumo` is
-- intentionally left as-is — its averages are `avg(...) filter (where ... is not null)`
-- so the now-null/excluded bad intervals drop out of the averages automatically; the
-- interval logic lives in ONE place (this view). (CAR-04; closes WR-01/05/06.)
--
-- INVARIANTS preserved from 0027:
--   * `with (security_invoker = true)` is MANDATORY on the view — a DEFINER view runs
--     as its owner and bypasses the caller's RLS, leaking EVERY user's consumption rows
--     (tests/carro-view-leak.test.ts + tests/carro-consumo.test.ts; Pitfall 6 / T-08-02).
--   * `preco_litro` is NEVER a stored column — the view derives custo ÷ litros only.
--   * Money is integer CENTAVOS (bigint); `litros` is a VOLUME (numeric), never money.

-- ── WR-01: CHECK constraints on public.carros ────────────────────────────────────
-- The application (src/lib/schemas/carro.ts) already restricts these in Zod; pin the
-- same invariants in SQL so NO write path (direct insert, future action, or a test)
-- can persist an out-of-range ano or an off-enum combustivel_padrao. Idempotent: drop
-- if exists then add. The ano upper bound is the FIXED literal 2100 (NOT
-- extract(year from now()), which would drift at year rollover — 08-REVIEW WR-01 note).
-- Existing rows (ano null / in range, combustivel_padrao null / in enum) satisfy both.
alter table public.carros drop constraint if exists carros_ano_chk;
alter table public.carros
  add constraint carros_ano_chk
  check (ano is null or (ano between 1900 and 2100));

alter table public.carros drop constraint if exists carros_combustivel_padrao_chk;
alter table public.carros
  add constraint carros_combustivel_padrao_chk
  check (combustivel_padrao is null
         or combustivel_padrao in ('Flex','Gasolina','Etanol','Diesel','GNV'));

-- ── WR-05 + WR-06: v_abastecimento_consumo (security_invoker = true) ──────────────
-- Re-issued from 0027 with two corrections:
--   WR-05 (deterministic tie-break): the full_fills lag() now orders by
--     (odometro_km, occurred_on, created_at, id) so two tanque_cheio fills with the
--     SAME odometro_km resolve deterministically instead of a random window order.
--   WR-06 (non-positive km_rodados guard): the intervals CTE drops any interval whose
--     odometer delta is <= 0 (a rolled-back / mistyped reading) via the WHERE clause,
--     AND the km_por_litro / reais_por_km CASE branches guard km_rodados <= 0 → null.
--     A bad interval therefore never produces a negative km/l or R$/km and never
--     reaches the v_carro_resumo averages.
create or replace view public.v_abastecimento_consumo
  with (security_invoker = true) as
  -- Postgres does NOT support FILTER on window functions (SQLSTATE 0A000), so we
  -- isolate the tanque_cheio fills into their own CTE first, then lag() over THAT set
  -- to get the previous full-tank odometer (the interval lower bound).
  with full_fills as (
    select
      a.id,
      a.carro_id,
      a.occurred_on,
      a.odometro_km,
      lag(a.odometro_km) over (
        partition by a.carro_id
        order by a.odometro_km, a.occurred_on, a.created_at, a.id
      ) as prev_full_odometro
    from public.abastecimentos a
    where a.tanque_cheio
  ),
  fills as (
    select
      a.id,
      a.user_id,
      a.carro_id,
      a.occurred_on,
      a.odometro_km,
      a.litros,
      a.tanque_cheio,
      coalesce(t.amount_cents, a.amount_cents)::bigint as custo_cents,
      ff.prev_full_odometro
    from public.abastecimentos a
    left join public.transactions t on t.id = a.transaction_id
    left join full_fills ff on ff.id = a.id
  ),
  intervals as (
    -- A consumption interval is closed at each tanque_cheio fill that has a prior
    -- tanque_cheio fill to measure against AND a strictly positive odometer delta
    -- (WR-06: a non-positive delta is a bad reading and is excluded outright).
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
