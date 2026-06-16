-- 0012_categories_is_reserva.sql
-- Open Question 2 → stable handle for the seed "Reserva" category. The aporte
-- sub-flow (Plan 05) must fire on a STABLE marker, never the literal name, because
-- CAT-02 lets the user rename the category. We add an is_reserva boolean flag,
-- backfill it true on the existing seed "Reserva" row, and update handle_new_user()
-- so every new signup seeds the flag explicitly per row.

alter table public.categories
  add column if not exists is_reserva boolean not null default false;

-- One-time backfill against existing rows: the seed "Reserva" (kind='alocacao').
update public.categories
   set is_reserva = true
 where name = 'Reserva' and kind = 'alocacao';

-- Re-seed signup: copy the 0002 body verbatim and add is_reserva to the column
-- list, true ONLY for the 'Reserva' row, false for the other 10. ASCII enum values
-- unchanged. The aporte trigger (Plan 05) keys off this flag, never the name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, user_id) values (new.id, new.id);

  insert into public.categories (user_id, name, kind, sort, is_reserva) values
    (new.id, 'Moradia',        'consumo',   1, false),
    (new.id, 'Alimentação',    'consumo',   2, false),
    (new.id, 'Transporte',     'consumo',   3, false),
    (new.id, 'Saúde',          'consumo',   4, false),
    (new.id, 'Educação',       'consumo',   5, false),
    (new.id, 'Lazer',          'consumo',   6, false),
    (new.id, 'Vestuário',      'consumo',   7, false),
    (new.id, 'Assinaturas',    'consumo',   8, false),
    (new.id, 'Investimentos',  'alocacao',  9, false),
    (new.id, 'Reserva',        'alocacao', 10, true),
    (new.id, 'Outros',         'consumo',  11, false);
  return new;
end;
$$;
