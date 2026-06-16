-- 0023_recurring_view.sql (CLS-06)
-- v_recurring_descriptors: the recurring-spend heuristic. A descriptor_norm that
-- appears in ≥3 DISTINCT civil months (YYYY-MM) is treated as recurring (a
-- subscription/assinatura). Threshold N=3 is a tunable heuristic [ASSUMED].
--
-- with (security_invoker = true) is MANDATORY (PG 15+): without it the view runs
-- with the DEFINER's privileges and silently BYPASSES RLS, leaking every user's
-- descriptors. The whole point of keeping the aggregation in SQL is that it runs
-- inside the caller's RLS boundary — pinned by the view-leak discipline (0007).
-- (CLS-06 / threat T-04-02)

create or replace view public.v_recurring_descriptors
  with (security_invoker = true) as
  select user_id,
         descriptor_norm,
         count(distinct to_char(occurred_on, 'YYYY-MM')) as month_count
  from public.transactions
  where descriptor_norm is not null
  group by user_id, descriptor_norm
  having count(distinct to_char(occurred_on, 'YYYY-MM')) >= 3;

grant select on public.v_recurring_descriptors to authenticated;
