-- 0040_categorias_combustivel.sql
-- Add a default "Combustível" category (kind `consumo`). Fuel spend is its own first-
-- class budget bucket — the carro/abastecimento flow needs a sensible category target,
-- and giving the enum a dedicated 'Combustível' slot stops fuel purchases landing in
-- generic 'Transporte' or being misfiled by the classifier.
--
-- Two parts: (1) re-seed handle_new_user() so every NEW signup gets it (slotted at
-- sort 4, right after Transporte, shifting Saúde→Marketplace down — Outros stays last);
-- (2) an idempotent backfill so EXISTING accounts get it too without a manual UI add.
-- Pure data + trigger redef — no schema change, so database.types.ts is unaffected.

-- (1) Re-seed signup. Copy of the 0035 body with 'Combustível' inserted at sort 4.
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
    (new.id, 'Combustível',    'consumo',   4, false),
    (new.id, 'Saúde',          'consumo',   5, false),
    (new.id, 'Educação',       'consumo',   6, false),
    (new.id, 'Lazer',          'consumo',   7, false),
    (new.id, 'Vestuário',      'consumo',   8, false),
    (new.id, 'Assinaturas',    'consumo',   9, false),
    (new.id, 'Marketplace',    'consumo',  10, false),
    (new.id, 'Investimentos',  'alocacao', 11, false),
    (new.id, 'Reserva',        'alocacao', 12, true),
    (new.id, 'Outros',         'consumo',  13, false);
  return new;
end;
$$;

-- (2) Idempotent backfill for existing users: add 'Combustível' to any account that
-- does not already have a category by that name (skips users who added it via the UI).
-- Insert-only — existing categories are NOT renumbered (parity with 0035; the sort-4
-- tie with an existing 'Saúde' is a cosmetic display-order tie, categories.sort has no
-- unique constraint).
insert into public.categories (user_id, name, kind, sort, is_reserva)
select p.user_id, 'Combustível', 'consumo', 4, false
  from public.profiles p
 where not exists (
   select 1 from public.categories c
    where c.user_id = p.user_id
      and c.name = 'Combustível'
 );
