-- 0009_income_amount_positive.sql
-- HG-03: align the income money CHECK with transactions.amount_cents > 0.
-- 0004_incomes.sql used `amount_cents >= 0`, which ACCEPTS R$ 0,00 — a zero-value
-- receita/template is not a real domain case (it silently materializes a zero
-- occurrence every month and pollutes v_income_month / "receita líquida do mês").
-- This tightens both income columns to STRICTLY POSITIVE so the rule is consistent
-- across every money table and the friendly "Valor monetário inválido." path
-- (mapped from 23514 in the actions) fires uniformly.
--
-- Idempotent: drop the old constraint if present, then add the strict one.

alter table public.income_templates
  drop constraint if exists income_templates_amount_cents_check;
alter table public.income_templates
  add constraint income_templates_amount_cents_check check (amount_cents > 0);

alter table public.income_occurrences
  drop constraint if exists income_occurrences_amount_cents_check;
alter table public.income_occurrences
  add constraint income_occurrences_amount_cents_check check (amount_cents > 0);
