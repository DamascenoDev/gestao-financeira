-- 0026_mei_views.sql
-- v_mei_year_summary: the consolidated MEI yearly row per (user, year), computed in
-- SQL inside the RLS boundary (the repo's strong precedent: v_adherence_*,
-- v_reserva_balance). with (security_invoker = true) is MANDATORY — without it the
-- view runs as DEFINER and leaks every user's MEI revenue (mei-view-leak.test.ts
-- proves the fix; Pitfall 6 / T-05-01).
--
-- The applicable limit is computed off mei_start_date: proportional in the opening
-- calendar year (R$6.750 × active months, opening month counts FULL via
-- 12 - opening_month + 1), R$81.000 in full years thereafter, 0 before opening.
-- The band ceiling is applicable × 1.20 (integer math). ratio_bp is gross in basis
-- points of the applicable limit, guarding /0 (matches the 0014 sem-receita pattern).
--
-- The applicable-limit CASE is computed ONCE in a sub-CTE (lim) so the band/ratio
-- reuse it — no triple-repeated literal, no SQL drift.
--
-- MUST match src/lib/mei/rules.ts (asserted by src/lib/mei/rules.test.ts):
--   8100000  = MEI_ANNUAL_LIMIT_CENTS   (R$ 81.000,00, full calendar year)
--   675000   = MEI_MONTHLY_RATE_CENTS   (R$ 6.750,00 / active month, opening year)
--   12000    = 10000 + MEI_TOLERANCE_BP (×1.20 band numerator; 2000 bp tolerance)
-- A drift between these SQL literals and the constants fails rules.test.ts loudly.

create or replace view public.v_mei_year_summary
  with (security_invoker = true) as
  with by_year as (
    select
      i.user_id,
      to_char(i.issued_on, 'YYYY')::int as year,
      sum(i.amount_cents)::bigint as gross_cents,
      coalesce(sum(i.amount_cents) filter (where i.activity_type = 'comercio_industria'), 0)::bigint as comercio_cents,
      coalesce(sum(i.amount_cents) filter (where i.activity_type = 'servicos'), 0)::bigint as servicos_cents
    from public.mei_invoices i
    group by i.user_id, to_char(i.issued_on, 'YYYY')::int
  ),
  with_settings as (
    select
      b.*,
      extract(year  from s.mei_start_date)::int as opening_year,
      extract(month from s.mei_start_date)::int as opening_month
    from by_year b
    join public.mei_settings s on s.user_id = b.user_id
  ),
  -- Compute the applicable limit ONCE here so band + ratio reuse it (no literal drift).
  lim as (
    select
      w.*,
      coalesce(f.has_employee, false) as has_employee,
      case
        when w.year  < w.opening_year then 0
        when w.year  = w.opening_year then 675000 * (12 - w.opening_month + 1)  -- MEI_MONTHLY_RATE_CENTS
        else 8100000                                                            -- MEI_ANNUAL_LIMIT_CENTS
      end::bigint as applicable_limit_cents
    from with_settings w
    left join public.mei_year_flags f
      on f.user_id = w.user_id and f.year = w.year
  )
  select
    l.user_id,
    l.year,
    l.gross_cents,
    l.comercio_cents,
    l.servicos_cents,
    l.has_employee,
    l.applicable_limit_cents,
    -- band ceiling = applicable × 1.20 (integer math: × 12000 / 10000).
    (l.applicable_limit_cents * 12000 / 10000)::bigint as band_ceiling_cents,
    -- ratio in bp of the applicable limit; guard /0 (year before opening → null).
    case
      when l.applicable_limit_cents = 0 then null
      else (l.gross_cents * 10000) / l.applicable_limit_cents
    end as ratio_bp
  from lim l;

grant select on public.v_mei_year_summary to authenticated;
