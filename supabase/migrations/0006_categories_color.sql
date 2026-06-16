-- 0006_categories_color.sql
-- Additive: an optional per-category color swatch key (UI-SPEC 8-swatch palette:
-- slate|red|amber|green|teal|blue|violet|pink). Nullable text, no data migration,
-- no touch to existing columns or the handle_new_user seed trigger. (CAT color decision)
--
-- Idempotent: add column if not exists.

alter table public.categories add column if not exists color text;
