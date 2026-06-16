-- 0016_register_reserva_saida.sql
-- Atomic, never-negative saída validation (RSV-04). A "read balance, then insert if
-- ok" in app code has a TOCTOU race (Pitfall 4); this RPC does the balance read +
-- the insert in ONE function-body transaction, mirroring reassign_and_delete_category.
--
-- SECURITY INVOKER so the balance read (from the security_invoker v_reserva_balance)
-- and the insert both run under the CALLER's RLS: a forged/foreign reserva_id sees no
-- row → balance null → aborts (IDOR-safe). search_path pinned.

create or replace function public.register_reserva_saida(
  p_reserva_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default ''
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_saldo   bigint;
  v_id      uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido' using errcode = 'P0001';
  end if;

  -- Ownership + current balance in one RLS-scoped read. A foreign/nonexistent
  -- reserva returns no row → treat as not-found and abort.
  select saldo_cents into v_saldo
  from public.v_reserva_balance
  where reserva_id = p_reserva_id and user_id = v_user_id;

  if v_saldo is null then
    raise exception 'Reserva inexistente ou sem permissão' using errcode = 'P0001';
  end if;
  if p_amount_cents > v_saldo then
    raise exception 'Saída maior que o saldo da reserva' using errcode = 'P0001';
  end if;

  insert into public.reserva_ledger
    (user_id, reserva_id, kind, amount_cents, occurred_on, note)
  values
    (v_user_id, p_reserva_id, 'out', p_amount_cents, p_occurred_on, coalesce(p_note, ''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.register_reserva_saida(uuid, bigint, date, text) to authenticated;
