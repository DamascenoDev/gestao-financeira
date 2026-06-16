-- 0018_register_reserva_saida_overdraw_code.sql
-- LW-02: give the OVERDRAW rejection a dedicated SQLSTATE ('P0002') so the action can
-- branch on a STRUCTURED signal (error.code) instead of substring-matching the pt-BR
-- raise text ('saldo'). A copy/i18n change to the message previously downgraded the
-- precise "maior que o saldo" field error to the generic toast. All other raises stay
-- 'P0001' (generic). The lock/serialization, SECURITY INVOKER, and pinned search_path
-- from 0017 are unchanged — only the overdraw errcode is specialized.

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
    -- LW-02: dedicated SQLSTATE for the overdraw case — the action branches on this.
    raise exception 'Saída maior que o saldo da reserva' using errcode = 'P0002';
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
