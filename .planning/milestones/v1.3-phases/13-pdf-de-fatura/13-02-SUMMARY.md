---
phase: 13-pdf-de-fatura
plan: 02
subsystem: db
tags: [supabase, migration, check-constraint, schema-push, kind, format, credit, pdf, estorno]

# Dependency graph
requires: []
provides:
  - "migration 0031 widening transactions.kind CHECK to ('expense','credit') — applied LOCAL + PROD"
  - "migration 0032 widening statements.format CHECK to ('ofx','csv','pdf') — applied LOCAL + PROD (in-phase discovery)"
  - "live DB (local + production) accepts kind='credit' and format='pdf' inserts (no 23514)"
affects: [13-03, 13-04, ingest, confirmImport, statements-insert]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "named-constraint drop-then-add idempotent migration (drop auto-named + drop named, then add named) — re-runnable, non-destructive superset"
    - "amount_cents stays check (amount_cents > 0); the credit sign lives in kind, never a negative value (0013 reservas in/out precedent)"

key-files:
  created:
    - supabase/migrations/0031_transactions_kind_credit.sql
    - supabase/migrations/0032_statements_format_pdf.sql
  modified: []

key-decisions:
  - "0032 added mid-phase: the original plan only widened transactions.kind. Gate-2 testing surfaced that statements.format CHECK (0019) still allowed only ('ofx','csv'), so the statements insert for a PDF failed with 23514 BEFORE parsing ('Não foi possível registrar o arquivo'). 0032 widens it to ('ofx','csv','pdf'), mirroring 0031's idempotent named-constraint pattern."
  - "Schema push is the mandatory gate (autonomous:false): tsc/build PASS without it because generated kind/format types are string (untyped) — the constraint only bites at runtime. Push needs interactive supabase link + access token / DB password."

patterns-established:
  - "Any PDF-introduced column-value (kind='credit', format='pdf') needs a paired idempotent CHECK-widening migration before the live insert succeeds — code-level checks (tsc/build) cannot catch it (untyped string columns)."

requirements-completed: [PDF-05]

# Metrics
duration: 2-gate (migration authoring + user-run push local+prod)
completed: 2026-06-18
status: complete
---

# Phase 13 Plan 02: Schema Push Gate Summary

**Both CHECK constraints that block PDF persistence widened and pushed live: migration 0031 (`transactions.kind` → `('expense','credit')`, for estornos) and the in-phase discovery migration 0032 (`statements.format` → `('ofx','csv','pdf')`, for registering a PDF statement). Applied to the LOCAL stack and the LIVE PRODUCTION project; both constraints verified in `pg_constraint`.**

## Accomplishments
- **0031** — drops the P2 single-value `transactions_kind_check` and adds the named `transactions_kind_expense_credit_check` allowing `('expense','credit')`. Idempotent, non-destructive superset; `amount_cents > 0` untouched (credit sign in `kind`).
- **0032** (added during Gate-2) — drops the pre-Phase-13 `statements_format_check` and adds the named `statements_format_ofx_csv_pdf_check` allowing `('ofx','csv','pdf')`. Same idempotent pattern.
- **Push (Task 2 human gate):** applied to LOCAL via `supabase migration up --local` (both pending → applied; verified) and to PRODUCTION via the user's `supabase db push`. PDF upload then registers + persists estornos end-to-end (confirmed via MCP-driven prod test in 13-04).

## Task Commits
1. **Task 1: migration 0031 widening transactions.kind** — `e0e1091`
2. **0032 widening statements.format (Gate-2 discovery)** — `4cfea22`

(Task 2 = the `supabase db push` to local + prod — a DB-state change, no repo commit. `npm run gen:types` produces only the known harmless `__InternalSupabase` drift, unrelated to these constraints.)

## Files Created/Modified
- `supabase/migrations/0031_transactions_kind_credit.sql` — kind → ('expense','credit').
- `supabase/migrations/0032_statements_format_pdf.sql` — format → ('ofx','csv','pdf').

## Verification
- Local: `supabase migration up --local` applied 0031 + 0032; `pg_constraint` shows `transactions_kind_expense_credit_check` = `kind IN ('expense','credit')` and `statements_format_ofx_csv_pdf_check` = `format IN ('ofx','csv','pdf')`.
- Prod: user ran `supabase db push` (0031 + 0032). Confirmed live by the 13-04 end-to-end test — a real Santander PDF registered (`statements.format='pdf'` accepted) and 98 transactions (incl. `kind='credit'` estornos) persisted with no 23514.

## Issues Encountered
- **Two constraints, not one.** The plan anticipated only the `kind` widening (0031). The `statements.format` constraint (0019) was a second, un-anticipated blocker discovered when the real PDF upload failed at the statements insert during Gate-2. Both code-level gates (tsc/build) passed throughout because `kind`/`format` generate as untyped `string` — the classic schema-push false-positive this gate exists to catch. Fixed by 0032.

## Self-Check: PASSED
Both migration files exist on disk; commits `e0e1091` + `4cfea22` present; both constraints verified live in `pg_constraint` (local) and via the prod end-to-end persist.

---
*Phase: 13-pdf-de-fatura*
*Completed: 2026-06-18*
