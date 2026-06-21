---
status: testing
phase: 24-ingest-o-robusta-pdf-em-prod-re-import
source: [24-VERIFICATION.md]
started: 2026-06-21T12:35:00Z
updated: 2026-06-21T12:35:00Z
---

## Current Test

number: 1
name: Apply 0037 + 0038 to PROD via supabase db push (credential gate)
expected: |
  Push lists 0037 then 0038 applied in order; `npm run gen:types` leaves `src/types/database.types.ts` diff empty; an `update public.statements set status='imported'` on PROD succeeds instead of raising SQLSTATE 23514.
awaiting: user response

## Tests

### 1. Apply 0037 + 0038 to PROD via `supabase db push` (credential gate)
expected: Run `supabase db push` against the LIVE PROD project (with `supabase login` / SUPABASE_ACCESS_TOKEN); it applies the still-pending `0037` and the new `0038` in order. Then `npm run gen:types` + `git diff --quiet src/types/database.types.ts` exits 0 (empty diff). After the push, an `update public.statements set status='imported'` on PROD succeeds (no SQLSTATE 23514).
result: [pending]

### 2. Live PDF upload in PROD parses (SC1 — PDF-06)
expected: After the PROD deploy, upload a real credit-card statement PDF in PROD `/importar`; the pdfjs worker resolves in the Vercel serverless bundle (no `Cannot find module '.../pdf.worker.mjs'`), and rows render in the review grid. Then re-upload a CONFIRMED file and confirm it returns "0 novas / já importado"; re-upload an UNCONFIRMED file and confirm it re-parses (IMP-07 live).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
