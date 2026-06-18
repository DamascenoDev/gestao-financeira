-- 0031_transactions_kind_credit.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION EXISTS (PDF-05 / D-04 — estornos/créditos):
--
-- 0005_transactions.sql created `kind text not null default 'expense'
-- check (kind in ('expense'))` — "expense only in P2". Phase 13's PDF import
-- (confirmImport) persists credit-card ESTORNOS / CRÉDITOS as `kind='credit'`.
-- With the P2 single-value CHECK still in force, that insert fails at the DB with
-- a CHECK violation (SQLSTATE 23514). This migration WIDENS the constraint to
-- accept ('expense','credit') so the estorno persistence path is unblocked.
--
-- This is the ONE schema delta Phase 13 introduces (13-RESEARCH Pitfall 3 / the
-- Runtime State Inventory expected none) — and it is the mandatory SCHEMA PUSH
-- GATE: `npx tsc --noEmit` and `npm run build` PASS without it because the
-- generated `kind` type is `string` (untyped — types come from config, not the
-- live constraint). The constraint only takes effect after `supabase db push`.
--
-- NON-DESTRUCTIVE + IDEMPOTENT: this only DROPs the old single-value CHECK and
-- ADDs a wider one (a strict superset — every existing 'expense' row stays valid).
-- It is re-runnable (drop-if-exists then add). The `amount_cents > 0` invariant is
-- NOT touched — amount_cents is ALWAYS positive; the credit sign lives in `kind`,
-- never a negative value (mirrors the 0013 reserva_ledger in/out two-value
-- precedent and its "ALWAYS positive; sign from kind" comment).
--
-- ACTION REQUIRED AFTER MERGE: the user must run `supabase db push` against the
-- LOCAL stack AND the LIVE production project (Phase 12 / DEPLOY-01), then
-- `npm run gen:types`. DB-only change — NO app redeploy needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the P2 single-value CHECK. 0005 defined it inline (unnamed), so Postgres
-- auto-named it `transactions_kind_check`. Drop-if-exists keeps this re-runnable
-- and also covers a prior run of THIS migration's named-add below.
alter table public.transactions drop constraint if exists transactions_kind_check;
alter table public.transactions drop constraint if exists transactions_kind_expense_credit_check;

-- Add the widened two-value CHECK under an explicit name (so future migrations can
-- target it deterministically). Superset of the old constraint → non-destructive.
alter table public.transactions
  add constraint transactions_kind_expense_credit_check
  check (kind in ('expense', 'credit'));
