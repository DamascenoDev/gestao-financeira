-- 0014_adherence_views.sql
-- Adherence computed in SQL inside the RLS boundary. with (security_invoker = true)
-- is MANDATORY on BOTH views (PG 15+, confirmed PG 17 locally) — without it a view
-- runs as DEFINER and leaks every user's sums (view-leak.test.ts proves the fix).
-- (BUD-02/03/04, RSV-03)
--
-- CRITICAL alocação grouping (RSV-03, locked — Open Question 1 resolved IN THE VIEW):
-- realized cents for a kind='alocacao' meta is the SUM of ALL kind='alocacao' spend
-- in the period (Investimentos + Reserva together), so a reserva aporte counts as
-- investment allocation and NEVER as consumo spend. consumo (teto) realized cents are
-- strictly per-category (kind='consumo'). The grouping is done here so the invariant
-- lives in SQL inside the RLS boundary and the app stays a pure formatter.
--
-- Both views share: the SAME percent_bp, the SAME half-up rounding
-- ((income*bp + 5000)/10000), the SAME alocação grouping. ONLY the window differs
-- (civil month vs civil year) — this guarantees monthly↔YTD consistency (BUD-03).

-- ── Monthly ─────────────────────────────────────────────────────────────────
create or replace view public.v_adherence_month
  with (security_invoker = true) as
  with income as (
    select user_id, month_key, total_cents as income_cents
    from public.v_income_month
  ),
  -- Per-category realized cents for the period, carrying the category kind.
  spend_cat as (
    select ct.user_id, ct.month_key, ct.category_id, c.kind,
           ct.total_cents as cat_cents
    from public.v_category_totals ct
    join public.categories c on c.id = ct.category_id
  ),
  -- Alocação rolls up TOGETHER per (user, month): the realized number for any
  -- alocação meta is the sum of ALL kind='alocacao' spend that period.
  alloc_total as (
    select user_id, month_key, sum(cat_cents)::bigint as alloc_cents
    from spend_cat
    where kind = 'alocacao'
    group by user_id, month_key
  )
  select
    bt.user_id,
    coalesce(sc.month_key, at.month_key, i.month_key) as month_key,
    bt.category_id,
    c.kind,
    c.name as category_name,
    bt.percent_bp,
    bt.direction,
    coalesce(i.income_cents, 0)::bigint as income_cents,
    -- consumo (teto): per-category cents. alocação (alvo): the combined alocação total.
    case
      when c.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
      else coalesce(sc.cat_cents, 0)
    end::bigint as realized_cents,
    -- meta in cents = income × percent_bp / 10000, rounded HALF-UP once (Pitfall 1).
    (coalesce(i.income_cents, 0) * bt.percent_bp + 5000) / 10000 as meta_cents,
    -- adherence ratio in basis-points of the meta (realized ÷ meta), guarded /0.
    case
      when (coalesce(i.income_cents, 0) * bt.percent_bp) = 0 then null
      else (
        case when c.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
             else coalesce(sc.cat_cents, 0) end
        * 10000 * 10000
      ) / nullif(coalesce(i.income_cents, 0) * bt.percent_bp, 0)
    end as adherence_bp
  from public.budget_targets bt
  join public.categories c on c.id = bt.category_id
  -- consumo realized: this category's own per-month total.
  left join spend_cat sc
    on sc.user_id = bt.user_id and sc.category_id = bt.category_id and c.kind = 'consumo'
  -- alocação realized: the user's combined alocação total per month.
  left join alloc_total at
    on at.user_id = bt.user_id and c.kind = 'alocacao'
  -- income for whichever month_key this meta's spend lands in.
  left join income i
    on i.user_id = bt.user_id
   and i.month_key = coalesce(sc.month_key, at.month_key);

grant select on public.v_adherence_month to authenticated;

-- ── YTD (civil year) ────────────────────────────────────────────────────────
-- Same percent_bp, same rounding, same alocação grouping — only the window differs
-- (civil year via left(month_key,4) / to_char(occurred_on,'YYYY')). This guarantees
-- monthly↔YTD consistency: a single-month year yields identical adherence_bp (BUD-03).
create or replace view public.v_adherence_ytd
  with (security_invoker = true) as
  with year_income as (
    select user_id,
           left(month_key, 4) as year,
           sum(total_cents)::bigint as income_cents
    from public.v_income_month
    group by user_id, left(month_key, 4)
  ),
  spend_cat as (
    select t.user_id,
           to_char(t.occurred_on, 'YYYY') as year,
           t.category_id,
           c.kind,
           sum(t.amount_cents)::bigint as cat_cents
    from public.transactions t
    join public.categories c on c.id = t.category_id
    group by t.user_id, to_char(t.occurred_on, 'YYYY'), t.category_id, c.kind
  ),
  alloc_total as (
    select user_id, year, sum(cat_cents)::bigint as alloc_cents
    from spend_cat
    where kind = 'alocacao'
    group by user_id, year
  )
  select
    bt.user_id,
    coalesce(sc.year, at.year, yi.year) as year,
    bt.category_id,
    c.kind,
    c.name as category_name,
    bt.percent_bp,
    bt.direction,
    coalesce(yi.income_cents, 0)::bigint as income_cents,
    case
      when c.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
      else coalesce(sc.cat_cents, 0)
    end::bigint as realized_cents,
    (coalesce(yi.income_cents, 0) * bt.percent_bp + 5000) / 10000 as meta_cents,
    case
      when (coalesce(yi.income_cents, 0) * bt.percent_bp) = 0 then null
      else (
        case when c.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
             else coalesce(sc.cat_cents, 0) end
        * 10000 * 10000
      ) / nullif(coalesce(yi.income_cents, 0) * bt.percent_bp, 0)
    end as adherence_bp
  from public.budget_targets bt
  join public.categories c on c.id = bt.category_id
  left join spend_cat sc
    on sc.user_id = bt.user_id and sc.category_id = bt.category_id and c.kind = 'consumo'
  left join alloc_total at
    on at.user_id = bt.user_id and c.kind = 'alocacao'
  left join year_income yi
    on yi.user_id = bt.user_id
   and yi.year = coalesce(sc.year, at.year);

grant select on public.v_adherence_ytd to authenticated;
