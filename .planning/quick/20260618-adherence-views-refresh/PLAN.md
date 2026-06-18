# Quick Task: Refresh adherence views (G-03 remote stale view)

**Date:** 2026-06-18
**Type:** quick (DB migration, sequential, main tree)

## Objective

Create migration `0030_adherence_views_refresh.sql` that recreates
`public.v_adherence_month` and `public.v_adherence_ytd` with the CURRENT
income-driven definition, so `supabase db push` to the remote refreshes the stale
(spend-driven) production view and zero-spend teto rows materialize again (G-03).

## Root Cause

`supabase/migrations/0014_adherence_views.sql` was created spend-driven (`bd768f0`)
then revised income-driven (`fabc0a4`). The remote applied 0014 at the OLD
spend-driven state; `db push` skips re-running an already-applied migration, so prod
serves the stale view. A NEW higher-numbered migration is the only thing `db push`
will apply.

## Task

1. Copy BOTH view bodies byte-for-byte from 0014.
2. Use `DROP VIEW IF EXISTS` + `CREATE VIEW ... with (security_invoker = true)`
   (NOT `create or replace`; NO CASCADE — leaf views, 0026 references only in a
   comment). `grant select ... to authenticated` on both.
3. Header comment explaining the no-op-locally / fix-remote rationale and the
   required `supabase db push`.

## Verify

- `npx supabase db reset` applies 0001..0030 clean.
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` GREEN (adherence + view-leak suites).
- `npx tsc --noEmit` clean.

## Follow-up

User must run `supabase db push` against the remote. DB-only — no app redeploy.
