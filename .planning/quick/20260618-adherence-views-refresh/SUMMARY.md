---
status: complete
date: 2026-06-18
type: quick
subsystem: db/adherence-views
tags: [migration, supabase, adherence, G-03, remote-stale-view]
---

# Quick Task: Refresh adherence views (G-03 remote stale view) — Summary

DROP+CREATE migration `0030_adherence_views_refresh.sql` recreates
`public.v_adherence_month` and `public.v_adherence_ytd` with the current
income-driven bodies (copied byte-for-byte from 0014, `security_invoker = true`
preserved on both) so `supabase db push` refreshes the stale spend-driven view on
the remote and zero-spend teto rows materialize again (G-03).

## What was done

- Read `0014_adherence_views.sql` in full — authoritative current DDL for both views.
- Created `supabase/migrations/0030_adherence_views_refresh.sql`:
  - `drop view if exists` + `create view ... with (security_invoker = true)` for each
    view (NOT `create or replace` — old remote column set may differ).
  - NO CASCADE — confirmed leaf views: only 0014 defines them; 0026 references
    `v_adherence_*` solely in a header comment (verified, not a SQL dependency).
  - `grant select ... to authenticated` on both.
  - Header comment documenting the no-op-locally / fix-remote rationale and the
    required `supabase db push`.
- Updated `.planning/phases/12-produ-o-live-verify/12-VERIFICATION.md`: G-03 →
  "REOPENED → fixed by migration 0030" with corrected root cause and remaining action.

## Root cause

0014 was created spend-driven (`bd768f0`) then revised income-driven (`fabc0a4`).
The remote applied 0014 at the OLD spend-driven state; `db push` never re-runs an
already-applied migration, so prod still serves the stale view. Repo + local are
correct. A new, higher-numbered migration is the only thing `db push` will apply.

## Gate results

- `npx supabase db reset` — applied 0001..0030 with NO error.
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` — 756 passed (756), 89 files GREEN.
- `npx tsc --noEmit` — clean (exit 0).

## Follow-up (user action required)

Run against the REMOTE: `supabase db push`

DB-only change — no app redeploy needed.
