---
status: complete
phase: 24-ingest-o-robusta-pdf-em-prod-re-import
source: [24-VERIFICATION.md]
started: 2026-06-21T12:35:00Z
updated: 2026-06-21T13:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Apply 0037 + 0038 to PROD via `supabase db push` (credential gate)
expected: Run `supabase db push` against the LIVE PROD project (with `supabase login` / SUPABASE_ACCESS_TOKEN); it applies the still-pending `0037` and the new `0038` in order. Then `npm run gen:types` + `git diff --quiet src/types/database.types.ts` exits 0 (empty diff). After the push, an `update public.statements set status='imported'` on PROD succeeds (no SQLSTATE 23514).
result: pass

### 2. Live PDF upload in PROD parses (SC1 — PDF-06)
expected: After the PROD deploy, upload a real credit-card statement PDF in PROD `/importar`; the pdfjs worker resolves in the Vercel serverless bundle (no `Cannot find module '.../pdf.worker.mjs'`), and rows render in the review grid. Then re-upload a CONFIRMED file and confirm it returns "0 novas / já importado"; re-upload an UNCONFIRMED file and confirm it re-parses (IMP-07 live).
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
