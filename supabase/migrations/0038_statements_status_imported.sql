-- 0038_statements_status_imported.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS MIGRATION EXISTS (IMP-07 — re-import de fatura não confirmada):
--
-- 0019_statements.sql:20-21 created `status` with an INLINE (unnamed) CHECK, so
-- Postgres auto-named it `statements_status_check`, with the value set
-- ('uploaded','parsing','parsed','failed'). confirmImport (import.ts:995-998)
-- marks a consumed statement `update({ status: 'imported' })`, but 'imported' is
-- NOT in that set, so the update fails the CHECK (SQLSTATE 23514) and is
-- logged-and-swallowed (import.ts:999-1004). Result: status never becomes
-- 'imported', and the "already confirmed → block re-review" FAST-PATH
-- (import.ts:323-330) is UNREACHABLE — while an UNCONFIRMED statement can already
-- be re-imported. This migration WIDENS the CHECK to include 'imported' so the
-- update succeeds and the fast-path activates.
--
-- Mirrors 0032_statements_format_pdf.sql exactly (same table, same drop-if-exists
-- + named-add pattern). NON-DESTRUCTIVE + IDEMPOTENT: the new value set is a strict
-- SUPERSET of the old one — every existing uploaded/parsing/parsed/failed row stays
-- valid — and the migration is re-runnable (drop-if-exists then add). NO backfill —
-- existing statements keep their status; only future confirmations write 'imported'.
--
-- Like 0031/0032/0037 this is part of the SCHEMA PUSH GATE: `npx tsc --noEmit` and
-- `npm run build` PASS without it (the generated `status` type is `string` —
-- untyped), so the gap only appears at runtime against the live constraint. It takes
-- effect only after `supabase db push`. The `npm run gen:types` diff is EMPTY
-- (text + CHECK widening leaves the generated type `string`, exactly as 0032 did for
-- `format`).
--
-- ACTION REQUIRED AFTER MERGE (human, autonomous:false — Task 4): run
-- `supabase db push` against the LIVE production project (needs interactive auth /
-- SUPABASE_ACCESS_TOKEN). The push replays ALL un-applied migrations in order, so it
-- applies the still-pending 0037 AND this 0038 in the same push.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the inline (auto-named) CHECK from 0019. Drop-if-exists keeps this
-- re-runnable and also covers a prior run of THIS migration's named-add below.
alter table public.statements drop constraint if exists statements_status_check;

-- Add the widened five-value CHECK under the same canonical name (so a future
-- migration can target it deterministically and a re-run drops it cleanly above).
-- Superset of the old constraint → non-destructive.
alter table public.statements
  add constraint statements_status_check
  check (status in ('uploaded', 'parsing', 'parsed', 'failed', 'imported'));
