-- 0017_register_reserva_saida_lock.sql
-- HARDEN register_reserva_saida against concurrent overdraw (RSV-04, Pitfall 4).
--
-- 0016 read saldo_cents from v_reserva_balance and then inserted in the same
-- function body, but that "read balance → insert" pair is NOT serialized: two
-- near-concurrent saídas each read the SAME pre-insert balance (neither has
-- committed its 'out' row yet), both pass the `amount <= saldo` check, and both
-- insert — driving the balance negative. The Wave-0 reserva-saida concurrent test
-- (Promise.all of two oversized saídas) catches exactly this and asserts saldo
-- never < 0.
--
-- Fix: take a row-level lock on the OWNING reservas row (`select ... for update`)
-- BEFORE reading the balance. Per-reserva saídas now serialize: the second waits
-- for the first to commit, re-reads the now-reduced balance, and is rejected if it
-- no longer fits. The lock is scoped to the caller's RLS (a foreign reserva returns
-- no row → still aborts, IDOR-safe). search_path stays pinned; SECURITY INVOKER
-- unchanged.

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
  v_owned   uuid;
  v_saldo   bigint;
  v_id      uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido' using errcode = 'P0001';
  end if;

  -- Serialize concurrent saídas for THIS reserva: lock the owning row first. Under
  -- the caller's RLS a foreign/nonexistent reserva returns no row → abort (IDOR-safe).
  select id into v_owned
  from public.reservas
  where id = p_reserva_id and user_id = v_user_id
  for update;

  if v_owned is null then
    raise exception 'Reserva inexistente ou sem permissão' using errcode = 'P0001';
  end if;

  -- Now the balance read is stable for the duration of this transaction: any other
  -- saída for this reserva is blocked on the row lock above until we commit.
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
