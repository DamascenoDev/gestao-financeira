-- 0030_adherence_views_refresh.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION EXISTS (G-03 — remote stale view):
--
-- 0014_adherence_views.sql was first authored SPEND-DRIVEN (git bd768f0), then
-- REVISED to the correct INCOME-DRIVEN definition (git fabc0a4). The user's remote
-- (pre-existing/legacy Supabase project) had 0014 applied at the OLD spend-driven
-- state. Because 0014 is already in the remote migration history, `supabase db push`
-- will NEVER re-run it — so production still serves the stale spend-driven views.
--
-- Symptom (confirmed live on prod): a teto (consumo) category with a meta set but
-- ZERO spend in the period does NOT materialize in the dashboard adherence list
-- (e.g. Transporte teto 10%, no spend → missing). The income-driven view should
-- emit that row at realized 0 / 0%.
--
-- This migration carries a HIGHER number, so `supabase db push` WILL apply it and
-- refresh the remote view to the current income-driven definition.
--
-- LOCAL = NO-OP: locally 0014 already created the income-driven views; this just
-- DROP+CREATE the identical bodies. REMOTE = THE FIX: replaces the stale views.
--
-- DROP VIEW + CREATE VIEW (NOT `create or replace`) is REQUIRED: the old remote
-- spend-driven views may expose a different column set, which makes `create or
-- replace` fail ("cannot change name of view column"). No CASCADE: these are leaf
-- views (only 0014 defines them; 0026 references them only in a comment). If a real
-- dependency ever appears, STOP — do not CASCADE-drop.
--
-- security_invoker = true is MANDATORY on BOTH views (RLS leak prevention; the
-- view-leak / carro-view-leak tests prove it). Bodies are copied BYTE-FOR-BYTE from
-- 0014 so monthly↔YTD consistency (same percent_bp, same half-up rounding, same
-- alocação grouping) is preserved.
--
-- ACTION REQUIRED AFTER MERGE: the user must run `supabase db push` against the
-- remote. DB-only change — NO app redeploy needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Monthly ─────────────────────────────────────────────────────────────────
-- MD-01: the period set is driven OFF INCOME, not off spend. Each meta is joined to
-- every (user, month_key) the user has income for, so a teto category with a meta but
-- ZERO spend this month still materializes as a row (realized 0 → 0% / "No limite")
-- instead of vanishing (the income mis-join previously left month_key NULL when there
-- was no spend row to carry the period key, and the dashboard's .eq('month_key', …)
-- then dropped the row entirely). Spend is left-joined ONTO that income period.
drop view if exists public.v_adherence_month;
create view public.v_adherence_month
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
  ),
  -- One row per (meta, income-period). Income always exists per user/month, so this
  -- guarantees a non-NULL month_key for every meta in every month the user has income.
  base as (
    select bt.user_id, bt.category_id, bt.percent_bp, bt.direction,
           c.kind, c.name as category_name,
           i.month_key, i.income_cents
    from public.budget_targets bt
    join public.categories c on c.id = bt.category_id
    join income i on i.user_id = bt.user_id
  )
  select
    b.user_id,
    b.month_key,
    b.category_id,
    b.kind,
    b.category_name,
    b.percent_bp,
    b.direction,
    b.income_cents::bigint as income_cents,
    -- consumo (teto): per-category cents. alocação (alvo): the combined alocação total.
    case
      when b.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
      else coalesce(sc.cat_cents, 0)
    end::bigint as realized_cents,
    -- meta in cents = income × percent_bp / 10000, rounded HALF-UP once (Pitfall 1).
    (b.income_cents * b.percent_bp + 5000) / 10000 as meta_cents,
    -- MD-02: ratio uses the SAME rounded meta_cents the user (and the dashboard
    -- combined-alocação line) sees, so threshold badges (80/100%) stay consistent.
    -- Guard meta_cents = 0 → null (matches the sem-receita semantics).
    case
      when (b.income_cents * b.percent_bp + 5000) / 10000 = 0 then null
      else (
        case when b.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
             else coalesce(sc.cat_cents, 0) end
        * 10000
      ) / ((b.income_cents * b.percent_bp + 5000) / 10000)
    end as adherence_bp
  from base b
  -- consumo realized: this category's own total for THIS income month.
  left join spend_cat sc
    on sc.user_id = b.user_id and sc.category_id = b.category_id
   and sc.month_key = b.month_key and b.kind = 'consumo'
  -- alocação realized: the user's combined alocação total for THIS income month.
  left join alloc_total at
    on at.user_id = b.user_id and at.month_key = b.month_key and b.kind = 'alocacao';

grant select on public.v_adherence_month to authenticated;

-- ── YTD (civil year) ────────────────────────────────────────────────────────
-- Same percent_bp, same rounding, same alocação grouping — only the window differs
-- (civil year via left(month_key,4) / to_char(occurred_on,'YYYY')). This guarantees
-- monthly↔YTD consistency: a single-month year yields identical adherence_bp (BUD-03).
drop view if exists public.v_adherence_ytd;
create view public.v_adherence_ytd
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
  ),
  -- MD-01 (YTD twin): drive the period off income so a zero-spend teto still
  -- materializes per income-year instead of vanishing.
  base as (
    select bt.user_id, bt.category_id, bt.percent_bp, bt.direction,
           c.kind, c.name as category_name,
           yi.year, yi.income_cents
    from public.budget_targets bt
    join public.categories c on c.id = bt.category_id
    join year_income yi on yi.user_id = bt.user_id
  )
  select
    b.user_id,
    b.year,
    b.category_id,
    b.kind,
    b.category_name,
    b.percent_bp,
    b.direction,
    b.income_cents::bigint as income_cents,
    case
      when b.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
      else coalesce(sc.cat_cents, 0)
    end::bigint as realized_cents,
    (b.income_cents * b.percent_bp + 5000) / 10000 as meta_cents,
    -- MD-02: ratio against the SAME rounded meta_cents (matches the monthly view).
    case
      when (b.income_cents * b.percent_bp + 5000) / 10000 = 0 then null
      else (
        case when b.kind = 'alocacao' then coalesce(at.alloc_cents, 0)
             else coalesce(sc.cat_cents, 0) end
        * 10000
      ) / ((b.income_cents * b.percent_bp + 5000) / 10000)
    end as adherence_bp
  from base b
  left join spend_cat sc
    on sc.user_id = b.user_id and sc.category_id = b.category_id
   and sc.year = b.year and b.kind = 'consumo'
  left join alloc_total at
    on at.user_id = b.user_id and at.year = b.year and b.kind = 'alocacao';

grant select on public.v_adherence_ytd to authenticated;
