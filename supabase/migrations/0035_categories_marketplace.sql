-- 0035_categories_marketplace.sql
-- Add a default "Marketplace" category (Shopee, AliExpress, Shein, Mercado Livre,
-- Amazon, …). The AI classifier was misfiling marketplace purchases (e.g. AliExpress /
-- Mercado Livre → 'Investimentos') because there was no good shopping bucket to pick
-- from. A first-class 'consumo' category gives the enum a sensible target.
--
-- Two parts: (1) re-seed handle_new_user() so every NEW signup gets it (slotted at
-- sort 9, shifting Investimentos/Reserva/Outros down — Outros stays last); (2) an
-- idempotent backfill so EXISTING accounts get it too without a manual UI add. Pure
-- data + trigger redef — no schema change, so database.types.ts is unaffected.

-- (1) Re-seed signup. Copy of the 0012 body with 'Marketplace' inserted at sort 9.
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
    (new.id, 'Marketplace',    'consumo',   9, false),
    (new.id, 'Investimentos',  'alocacao', 10, false),
    (new.id, 'Reserva',        'alocacao', 11, true),
    (new.id, 'Outros',         'consumo',  12, false);
  return new;
end;
$$;

-- (2) Idempotent backfill for existing users: add 'Marketplace' to any account that
-- does not already have a category by that name (skips users who added it via the UI).
insert into public.categories (user_id, name, kind, sort, is_reserva)
select p.user_id, 'Marketplace', 'consumo', 9, false
  from public.profiles p
 where not exists (
   select 1 from public.categories c
    where c.user_id = p.user_id
      and c.name = 'Marketplace'
 );
