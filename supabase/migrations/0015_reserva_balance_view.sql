-- 0015_reserva_balance_view.sql
-- Derived reserva balance — NEVER a stored column (RSV-05). saldo = Σ(in) − Σ(out)
-- per reserva. with (security_invoker = true) is MANDATORY so the sums run under the
-- caller's RLS and never leak another user's balance. This view is also the
-- authoritative balance source read inside register_reserva_saida (0016).

create or replace view public.v_reserva_balance
  with (security_invoker = true) as
  select r.user_id,
         r.id   as reserva_id,
         r.nome,
         r.alvo_cents,
         coalesce(sum(case when l.kind = 'in'  then l.amount_cents else 0 end), 0)::bigint
         - coalesce(sum(case when l.kind = 'out' then l.amount_cents else 0 end), 0)::bigint
           as saldo_cents
  from public.reservas r
  left join public.reserva_ledger l on l.reserva_id = r.id
  group by r.user_id, r.id, r.nome, r.alvo_cents;

grant select on public.v_reserva_balance to authenticated;
