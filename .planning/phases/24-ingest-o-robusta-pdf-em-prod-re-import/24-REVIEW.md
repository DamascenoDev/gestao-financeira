---
phase: 24-ingest-o-robusta-pdf-em-prod-re-import
reviewed: 2026-06-21T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - supabase/migrations/0038_statements_status_imported.sql
  - src/lib/parsers/pdf.test.ts
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 24: Code Review Report

**Reviewed:** 2026-06-21
**Depth:** standard
**Files Reviewed:** 2
**Status:** clean

## Summary

Phase 24 IMP-07 ships one production schema change (`0038_statements_status_imported.sql`) plus a strengthened parser test (`pdf.test.ts`). Both were reviewed adversarially against the original `0019_statements.sql` CHECK, the `0032_statements_format_pdf.sql` template, and the consuming code in `src/actions/import.ts` / `src/lib/parsers/pdf.ts`.

**Verdict: clean.** No correctness, safety, or destructiveness defects found. All four verification points hold under tracing:

1. **Constraint name is correct.** `0019_statements.sql:20-21` defines `status` as an inline (unnamed) column-level CHECK. Postgres auto-names inline column CHECKs `{table}_{column}_check` → `statements_status_check`, which is exactly what `0038:37` drops and `0038:43` re-adds. This is the identical pattern `0032:32` used to drop the inline `format` CHECK (`statements_format_check`). A repo-wide grep confirms `statements_status_check` appears in no other migration, so there is no name collision and no risk of the drop silently no-op'ing.

2. **New value set is a strict superset.** Old: `('uploaded','parsing','parsed','failed')`. New: same four + `'imported'`. Every existing row remains valid; no row is invalidated; no backfill needed. Non-destructive confirmed.

3. **No unintended side effects.** The migration is two `ALTER TABLE` statements (drop-if-exists, then add). It touches no RLS policy, no grant, no enum/type, no data, and performs no `UPDATE`/`DELETE`/backfill. Idempotent and re-runnable: `drop constraint if exists` also covers a prior run of this migration's own named add.

4. **Test strengthen is sound, not weakened.** The new resilience block (`pdf.test.ts:116-130`) adds `.not.toThrow()` plus a full-shape assertion. Traced against `parseSantanderText` in `src/lib/parsers/pdf.ts`: the parser returns `{ rows, dropped, capped }` (pdf.ts:152). For empty input `''`, `split('\n')` yields `['']`, the `!l` guard (pdf.ts:126) skips it, so the result is exactly `{ rows: [], dropped: 0, capped: false }` — matching the exact-equality assertion (pdf.test.ts:119). The garbage-text case correctly uses `dropped: expect.any(Number)` rather than pinning a value, which is appropriate since non-matching lines `continue` without incrementing `dropped`. No pre-existing assertion was loosened or removed.

The runtime payoff is also verified end-to-end: with the widened CHECK in place, `confirmImport`'s `update({ status: 'imported' })` (import.ts:997) stops failing SQLSTATE 23514, which makes the `existing.status === 'imported'` fast-path (import.ts:323-330) reachable. Until `supabase db push` is run against PROD the gap persists at runtime only (the generated type stays `string`, so `tsc`/build pass regardless) — correctly called out in the migration header and tracked as the autonomous:false push task.

## Info

### IN-01: Migration relies on Postgres's implicit constraint-naming convention

**File:** `supabase/migrations/0038_statements_status_imported.sql:37`
**Issue:** The drop targets `statements_status_check`, which is correct *because* `0019` happened to leave the CHECK inline/unnamed and Postgres derived that exact name. This is verified-correct here, but it is an implicit dependency on Postgres's auto-naming algorithm rather than an explicit contract. Note that `0032` defended against exactly this fragility by dropping *both* the legacy auto-name and a prior explicit name (`0032:32-33`), then re-adding under a *new explicit* name (`statements_format_ofx_csv_pdf_check`). `0038` instead re-adds under the *same* auto-derived name `statements_status_check`.
**Fix:** No change required for correctness. Optionally, future status-CHECK migrations can follow the `0032` belt-and-suspenders style (drop legacy auto-name **and** any prior explicit name) so they remain robust even if an intermediate migration renamed the constraint. Current code is safe as written.

### IN-02: Garbage-text resilience test does not exercise the `dropped`-increment path

**File:** `src/lib/parsers/pdf.test.ts:122-129`
**Issue:** The "garbage text" case asserts `dropped: expect.any(Number)`, but the chosen fixture (`'total garbage\nno tx lines here\n'`) produces lines that fail the `TX` regex and are skipped via `continue` (pdf.ts:128) — they never increment `dropped`. So the actual value is `0`, and the test does not actually cover the per-line throw→`dropped += 1` branch (pdf.ts:148-150) or the `0,00`→`dropped` branch (pdf.ts:136-138) that the comment ("honest-counts") implies. The assertion is correct and not misleading, but its coverage is narrower than the comment suggests.
**Fix:** No change required — the assertion is honest. If broader coverage is desired later, add a fixture line that matches `TX` but carries a malformed/zero amount (e.g. a `0,00` line inside the `Detalhamento` window) and assert `dropped` is `> 0`, locking in the drop-counting behavior.

---

_Reviewed: 2026-06-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
