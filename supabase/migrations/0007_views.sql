-- 0007_views.sql
-- Aggregate views for "receita líquida do mês" (INC-04) and per-category totals
-- (TXN-03). Money sums belong in SQL inside the RLS boundary, never JS reduce.
--
-- with (security_invoker = true) is MANDATORY (PG 15+, confirmed PG 17 locally):
-- without it a view runs with the DEFINER's privileges and silently bypasses RLS,
-- leaking every user's sums. view-leak.test.ts proves user B reads zero of user A's
-- totals. (INC-04 / TXN-03 / threat T-02-VIEW)

create or replace view public.v_income_month
  with (security_invoker = true) as
  select user_id,
         month_key,
         sum(amount_cents)::bigint as total_cents
  from public.income_occurrences
  group by user_id, month_key;

create or replace view public.v_category_totals
  with (security_invoker = true) as
  select t.user_id,
         to_char(t.occurred_on, 'YYYY-MM') as month_key,  -- date column: civil day already
         t.category_id,
         sum(t.amount_cents)::bigint as total_cents,
         count(*)::int as tx_count
  from public.transactions t
  group by t.user_id, to_char(t.occurred_on, 'YYYY-MM'), t.category_id;

grant select on public.v_income_month   to authenticated;
grant select on public.v_category_totals to authenticated;
