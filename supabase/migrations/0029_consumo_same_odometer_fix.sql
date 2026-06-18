-- 0029_consumo_same_odometer_fix.sql
-- FIX-ONLY migration for the deferred Phase-8/10 review item WR-02 (DEBT-01).
-- It touches NOTHING structural: no table/column/RLS/grant/index changes. It only
-- `create or replace`s the `v_abastecimento_consumo` view with corrected interval
-- membership. `v_carro_resumo` is intentionally left untouched — it reads OFF this
-- view (`avg(...) filter (where ... is not null)`), so the corrected interval rows
-- flow through automatically; the interval logic must live in ONE place (this view),
-- per the 0027/0028 precedent and the retrospective Key Lesson 2. (closes WR-02.)
--
-- INVARIANTS preserved from 0027/0028:
--   * `with (security_invoker = true)` is MANDATORY on the view — a DEFINER view runs
--     as its owner and bypasses the caller's RLS, leaking EVERY user's consumption rows
--     (tests/carro-view-leak.test.ts + tests/carro-consumo.test.ts; Pitfall 6 / T-08-02).
--   * `preco_litro` is NEVER a stored column — the view derives custo ÷ litros only.
--   * Money is integer CENTAVOS (bigint); `litros` is a VOLUME (numeric), never money.
--   * WR-05 deterministic tie-break order is (odometro_km, occurred_on, created_at, id).
--   * WR-06 non-positive km_rodados guard: the intervals WHERE drops km_rodados <= 0,
--     and the km_por_litro / reais_por_km CASE branches guard km_rodados <= 0 → null.

-- ── WR-02: id-anchored interval lower bound ───────────────────────────────────────
-- THE BUG (0028): each interval's litros_intervalo / custo_intervalo_cents subquery
-- bounded membership on the bare odometer — `s.odometro_km > prev_full_odometro AND
-- s.odometro_km <= f.odometro_km`. When two tanque_cheio fills share the EXACT same
-- odometro_km (e.g. 30000 → 30500 → 30500), the closing fill of the 30000→30500
-- interval (= 30500) sweeps in the SIBLING fill that ALSO sits at 30500: its liters
-- inflate litros_intervalo (understating km/l) and its cost inflates
-- custo_intervalo_cents (overstating R$/km). The km_rodados>0 guard drops the
-- zero-length 30500→30500 interval but does NOT stop the sweep-in into 30000→30500.
--
-- THE FIX: anchor each interval's membership on the prior full-tank fill's IDENTITY,
-- not its odometer. We carry the prior full-tank fill's FULL ordering tuple
-- (prev_full_odometro, prev_full_occurred, prev_full_created, prev_full_id) into the
-- intervals CTE via lag() over the SAME deterministic order used for WR-05, then make
-- the subqueries compare each candidate row on the full tuple
-- (odometro_km, occurred_on, created_at, id) using Postgres row-value comparison
-- (lexicographic): strictly AFTER the prior full fill and up to/including the closing
-- fill. Two rows at the same odometro now land deterministically on exactly one side of
-- the boundary — the closing fill's own liters/cost count toward its interval, the next
-- (sibling) fill's do NOT.
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
      coalesce(t.amount_cents, a.amount_cents)::bigint as custo_cents,
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
        select sum(coalesce(st.amount_cents, s.amount_cents))
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
