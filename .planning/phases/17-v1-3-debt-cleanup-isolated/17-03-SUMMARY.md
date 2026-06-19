---
phase: 17-v1-3-debt-cleanup-isolated
plan: 03
subsystem: docs / operational-safety
status: complete
tags: [lgpd, destructive-delete, runbook, rls, production-safety, DEBT-05]
requires:
  - "12-07-SUMMARY.md (proven APAGAR gate mechanism + SEC-01 service-role server-side)"
  - "17-CONTEXT.md (locked five ordered guard-rails)"
provides:
  - "17-SC3-DELETE-RUNBOOK.md — exact ordered human-executable SC3 delete runbook"
affects:
  - "plan 17-04 (human execution against this runbook closes DATA-02)"
tech-stack:
  added: []
  patterns:
    - "Runbook-as-doc: agent authors, human executes destructive PROD step"
    - "Ordered guard-rails with per-step checkbox confirmation gates"
key-files:
  created:
    - ".planning/phases/17-v1-3-debt-cleanup-isolated/17-SC3-DELETE-RUNBOOK.md"
  modified: []
decisions:
  - "No fenced code blocks per plan — numbered prose + checkboxes only"
  - "Five guard-rails encoded in exact CONTEXT order, each gated by a tickable CONFIRM box"
  - "Explicit DEFER path: skipping SC3 leaves Phase 17 open only on DATA-02"
metrics:
  duration: "~1 min"
  completed: "2026-06-19"
  tasks: 1
  files: 1
---

# Phase 17 Plan 03: SC3 Destructive-Delete Safety Runbook Summary

Authored `17-SC3-DELETE-RUNBOOK.md` — an exact, ordered, human-executable runbook for the SC3
destructive throwaway-account delete against PRODUCTION, encoding all five mandatory guard-rails in
order with per-step checkbox confirmation gates. The agent authored the doc and NEVER runs the
delete (the doc half of DEBT-05; human execution is plan 17-04).

## What was built

- **`17-SC3-DELETE-RUNBOOK.md`** — a numbered runbook carrying:
  - A bold "THE AGENT NEVER RUNS THIS — the human executes each step" banner.
  - The exact PROD URL `https://gestao-financeira-ebon-mu.vercel.app/` and the exact gate string
    `APAGAR` at the top.
  - The five mandatory guard-rails IN ORDER, each a discrete numbered step with a tickable
    confirmation gate:
    1. **DB backup taken BEFORE** — capture + record a restorable Supabase backup id/timestamp.
    2. **Throwaway `user_id` created + confirmed** — sign up a fresh throwaway account, seed
       disposable rows, capture and compare throwaway vs personal UUIDs.
    3. **Double-confirm the type-to-`APAGAR` gate** — verify focus-on-Cancelar, disabled-on-empty,
       disabled-on-lowercase, enabled-only-on-exact-`APAGAR`; re-read consequences; confirm signed
       in as throwaway.
    4. **PROD-site-only, NEVER the dev server** — explicit warning that `npm run dev` points at the
       PROD Supabase, so the delete runs only via the live production UI; verify the address bar.
    5. **Verify the RLS-scoped cascade** — "Apagando…" → `/auth/login`; throwaway can no longer sign
       in; personal account signs in with all data intact; optional per-table `user_id`-scoped
       zero-row checks.
  - An **ABORT / ROLLBACK** section (restore from the Guard-rail 1 backup) and a **DEFER path**
    (deferring SC3 leaves Phase 17 open only on DATA-02, per CONTEXT Deferred Ideas).

## Deviations from Plan

None — plan executed exactly as written.

## Verification

Automated check from the plan passed:
- File exists; contains `APAGAR`; contains `gestao-financeira-ebon-mu.vercel.app` → `OK`.
- Five `## Guard-rail N` headings present in order (1→5).
- Zero fenced code blocks (plan required numbered prose + checkboxes only).

## Notes for downstream

- Plan **17-04** is the human execution against this runbook; passing it closes **DATA-02** and the
  remaining LGPD destructive-delete item from 12-07.
- The runbook intentionally requires the human to record backup ids, UUIDs, and post-delete
  verification inline before each CONFIRM gate.

## Self-Check: PASSED

- FOUND: `.planning/phases/17-v1-3-debt-cleanup-isolated/17-SC3-DELETE-RUNBOOK.md`
- FOUND commit: `77e5fab` (docs(17-03): author SC3 destructive-delete safety runbook)
