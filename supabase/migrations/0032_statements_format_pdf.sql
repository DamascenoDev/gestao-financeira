-- 0032_statements_format_pdf.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION EXISTS (PDF-01 / PDF-02 — registrar uma fatura em PDF):
--
-- 0019_statements.sql created `format text not null check (format in ('ofx','csv'))`
-- — "ofx/csv only" before Phase 13. Phase 13's PDF import wires `format: 'pdf'`
-- into the `statements` upsert in ingestStatement (13-03). With the old two-value
-- CHECK still in force, that insert fails at the DB with a CHECK violation
-- (SQLSTATE 23514), surfacing as "Não foi possível registrar o arquivo." — the
-- PDF never reaches the parse/review step. This migration WIDENS the constraint
-- to accept ('ofx','csv','pdf') so the PDF statement can be registered.
--
-- This is the SECOND (and final) schema delta Phase 13 introduces, the sibling of
-- 0031 (transactions.kind → 'credit'). Like 0031 it is part of the SCHEMA PUSH
-- GATE: `npx tsc --noEmit` and `npm run build` PASS without it (the generated
-- `format` type is `string` — untyped), so the gap only appears at runtime against
-- the live constraint. It takes effect only after `supabase db push`.
--
-- NON-DESTRUCTIVE + IDEMPOTENT: only DROPs the old two-value CHECK and ADDs a wider
-- one (a strict superset — every existing 'ofx'/'csv' row stays valid). Re-runnable
-- (drop-if-exists then add). Mirrors the 0031 named-constraint pattern.
--
-- ACTION REQUIRED AFTER MERGE: the user must run `supabase db push` against the
-- LOCAL stack AND the LIVE production project (Phase 12 / DEPLOY-01), then
-- `npm run gen:types`. DB-only change — NO app redeploy needed. Apply together
-- with 0031 in the same push.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the pre-Phase-13 two-value CHECK. 0019 defined it inline (unnamed), so
-- Postgres auto-named it `statements_format_check`. Drop-if-exists keeps this
-- re-runnable and also covers a prior run of THIS migration's named-add below.
alter table public.statements drop constraint if exists statements_format_check;
alter table public.statements drop constraint if exists statements_format_ofx_csv_pdf_check;

-- Add the widened three-value CHECK under an explicit name (so future migrations
-- can target it deterministically). Superset of the old constraint → non-destructive.
alter table public.statements
  add constraint statements_format_ofx_csv_pdf_check
  check (format in ('ofx', 'csv', 'pdf'));
