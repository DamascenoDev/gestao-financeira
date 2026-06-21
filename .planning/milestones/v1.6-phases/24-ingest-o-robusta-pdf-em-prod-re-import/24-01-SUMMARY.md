---
phase: 24
plan: 01
subsystem: ingestion
status: complete
tags: [migration, check-constraint, pdf, re-import, supabase, vitest]
requires:
  - "0019_statements.sql (inline statements_status_check)"
  - "0032_statements_format_pdf.sql (drop-if-exists + named-add template)"
  - "import.ts:323-330 fast-path + import.ts:995-998 status update (pre-existing)"
provides:
  - "supabase/migrations/0038_statements_status_imported.sql (widened status CHECK incl. 'imported')"
  - "SC2-locking generic PDF degradation assertion in pdf.test.ts"
affects:
  - "src/actions/import.ts (re-import fast-path now reachable once 0038 is pushed)"
tech-stack:
  added: []
  patterns:
    - "CHECK-widening migration mirroring 0032 (drop-if-exists canonical name, named-add superset)"
    - "Local replay validation via `supabase migration up --local` + psql UPDATE proof"
key-files:
  created:
    - supabase/migrations/0038_statements_status_imported.sql
  modified:
    - src/lib/parsers/pdf.test.ts
decisions:
  - "Re-used canonical constraint name statements_status_check (symmetric drop/add, matches 0037) over a 0032-style descriptive name"
  - "Kept text+CHECK (no Postgres enum) to preserve the zero-diff invariant on database.types.ts"
  - "Replay path: LOCAL stack was up -> applied 0038 via `supabase migration up --local` and proved UPDATE->'imported' returns UPDATE 1 (was 23514)"
  - "PROD `supabase db push` of 0037+0038 deferred (Task 4, autonomous:false) — no SUPABASE_ACCESS_TOKEN in this environment"
metrics:
  duration_sec: 257
  tasks_completed: 3
  tasks_deferred: 1
  files_created: 1
  files_modified: 1
  completed: 2026-06-21
---

# Phase 24 Plan 01: Ingestão robusta (PDF em PROD + re-import) Summary

One migration (`0038`) widens the `statements.status` CHECK to include `'imported'` so `confirmImport`'s status update stops failing SQLSTATE 23514 and the re-import fast-path becomes reachable; the generic PDF-degradation test is strengthened to lock SC2 (no-throw + honest counts); the PROD `supabase db push` (bundling the still-pending 0037) is deferred as a human-action gate.

## What Was Built

### Task 1 — `0038_statements_status_imported.sql` (IMP-07) — commit `cbe9c9b`
New migration mirroring `0032_statements_format_pdf.sql` exactly:
- `alter table public.statements drop constraint if exists statements_status_check;` (re-runnable defensive drop; covers a divergent live name and a prior run of this migration's own add).
- `alter table public.statements add constraint statements_status_check check (status in ('uploaded', 'parsing', 'parsed', 'failed', 'imported'));` — a strict 5-value **superset** of the old 4-value set, so non-destructive (every existing row stays valid) with NO backfill.
- Touches ONLY the CHECK — no `alter policy`, no `grant`, no `disable row level security`, no index change (the `"own statements"` RLS from 0019:33-37 is provably preserved; negative-grep clean). T-24-01 mitigation satisfied.
- Header comment block documents why it exists (swallowed 23514 → unreachable fast-path), the schema-push gate, the empty gen:types diff, and the deferred PROD push bundling 0037.
- Verify printed `MIGRATION_OK`.

### Task 2 — Strengthen generic PDF degradation test (PDF-07 / SC2) — commit `983d3c7`
- `src/lib/parsers/pdf.test.ts`: the existing garbage-text case now asserts `.not.toThrow()` AND the full shape `toEqual({ rows: [], dropped: expect.any(Number), capped: false })`, pinning "no silently-wrong rows" across rows AND dropped AND capped (matching the empty-text case's rigor). `it(...)` title renamed to note it locks SC2 generic degradation.
- PDF-06 confirmed by source assertion only (no rebuild): `next.config.ts` still contains `outputFileTracingIncludes`, `pdf.worker.mjs`, and `serverExternalPackages: ["pdf-parse"]`.
- `git diff --quiet src/types/database.types.ts` exits 0 — the text+CHECK widening leaves the generated type `string` (byte-identical); no gen:types no-op committed.
- `import.test.ts` NOT modified.
- `npx vitest run src/lib/parsers/pdf.test.ts` → 16 passed. Verify printed `PDF_VERIFY_OK`.

### Task 3 — Local replay validation + re-import mock contract (DB-side proof of IMP-07)
- **Replay path taken: LOCAL stack (it was up).** `supabase status` succeeded (API at 127.0.0.1:55321). Ran `supabase migration up --local` — clean exit; it applied 0037 (local was also behind) then 0038 in order.
- **DB-side proof (observed result `UPDATE 1`):** before applying, the live local constraint was the 4-value set `('uploaded','parsing','parsed','failed')`. After 0038 the constraint reads `('uploaded','parsing','parsed','failed','imported')`. In a rolled-back transaction, inserting a throwaway statement (`status='parsed'`) then `update public.statements set status='imported'` returned **`UPDATE 1`** — exactly the case that raised `ERROR 23514 check constraint "statements_status_check"` before 0038. The transaction was `ROLLBACK`ed, so no test data persists in the local DB.
- Re-import + PDF mock contracts stayed green: `alreadyImported`, `RE-PARSES`, `image-only`, `0 matching` each pass (1 passed). Verify printed `IMPORT_CONTRACT_OK`.

### Wave / phase gate
- `npm test` (full suite): **917 passed / 100 files**, 0 failures.
- `git diff --quiet src/types/database.types.ts`: empty (exit 0).
- Migration negative-greps clean (no `alter policy` / `disable row level security` / `create type ... as enum`).

## Deviations from Plan

None — plan executed exactly as written. Tasks 1–3 completed autonomously; Task 4 deferred per its `autonomous:false` / `blocking-human` gate (see below).

## Deferred Human Items

### Task 4 — PROD `supabase db push` of 0037 + 0038 (autonomous:false, blocking-human) — NOT ATTEMPTED
This step cannot run autonomously — `supabase db push` against the LIVE production project needs interactive auth / `SUPABASE_ACCESS_TOKEN`, which is not present in this environment (credential gate, not an implementation gap). It was halted and recorded, not attempted.

To complete (with PROD credentials at hand):
1. Ensure `SUPABASE_ACCESS_TOKEN` is set OR run `supabase login`.
2. `supabase db push` — replays ALL un-applied migrations in order, so it applies **both the still-pending 0037 AND the new 0038** in one push (do NOT push 0038 alone — PROD would drift behind the repo; Pitfall 4 / T-24-02). Confirm the output lists 0037 then 0038.
3. `npm run gen:types`, then `git diff --quiet src/types/database.types.ts` MUST exit 0 (text+CHECK widening → type stays `string`; pre-commit hook should leave it byte-identical).
4. (Optional PROD sanity) `update public.statements set status='imported'` on any statement now succeeds instead of raising 23514.

### SC1 — Live PDF upload in PROD after deploy (human-verify UAT)
PDF-06's "works in PROD" is a deferred human-verify item (like Phase 22): upload a real PDF in PROD post-deploy to confirm the pdfjs worker resolves. Not a code gate.

## Self-Check: PASSED
- FOUND: supabase/migrations/0038_statements_status_imported.sql
- FOUND: src/lib/parsers/pdf.test.ts (strengthened)
- FOUND commit cbe9c9b (Task 1 migration)
- FOUND commit 983d3c7 (Task 2 test)
