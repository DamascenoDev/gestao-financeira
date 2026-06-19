---
phase: 17-v1-3-debt-cleanup-isolated
plan: 04
status: deferred
requirements_pending_human: [DATA-02]
requirement: DEBT-05
autonomous: false
deferred_on: 2026-06-19
decision: user chose "Defer DATA-02" at the 17-04 checkpoint
---

# 17-04 — SC3 destructive throwaway-account delete — DEFERRED (user decision)

The destructive throwaway-account delete (DATA-02) is the only step in Phase 17 that requires a
hands-on human session against PRODUCTION. At the 17-04 checkpoint the user chose **Defer DATA-02**
(the runbook's and CONTEXT's explicitly-supported defer path).

## Status

- **Doc half of DEBT-05 — DONE** (plan 17-03): `17-SC3-DELETE-RUNBOOK.md` is written and committed,
  with all 5 ordered guard-rails (backup → throwaway user_id → double-confirm `APAGAR` gate →
  PROD-site-only/never dev-server → verify RLS cascade) + abort/rollback + defer path.
- **Execution half — DEFERRED**: the destructive delete (DATA-02) was NOT run. No agent ran it; the
  user deferred it to a later dedicated session.

## What this means for the phase

Per the runbook DEFER PATH and the CONTEXT "Deferred Ideas" decision, deferring SC3 leaves Phase 17
open **only** on **DATA-02 (destructive delete path)**. Everything else is complete and unaffected:

- SC1 / DEBT-03 — G-07/G-08 live in prod (deploy-ancestry) ✅ (17-02)
- SC2 / DEBT-04 — MEI dasn CSV content (BOM/`;`/pt-BR) ✅ (17-02)
- SC4 / DEBT-06 — 12-VALIDATION.md + 13-VALIDATION.md ✅ (17-01)
- DEBT-05 doc half — SC3 safety runbook ✅ (17-03)
- DATA-01 companion — LGPD export bundle structurally valid ✅ (17-02)

## To complete later

Follow `17-SC3-DELETE-RUNBOOK.md` end-to-end in a dedicated session (Supabase dashboard + a normal
browser on the live prod site). When done, record the CONFIRM 1–5 results and flip DATA-02 to verified.
No code change is required — this is purely the operational/destructive walkthrough.
