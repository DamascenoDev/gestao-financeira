---
status: testing
phase: 21-match-wildcard-proced-ncia-persistida
source: [21-VERIFICATION.md]
started: 2026-06-20T18:50:00Z
updated: 2026-06-20T18:50:00Z
---

## Current Test

number: 1
name: Apply migration 0037 to the linked/PROD Supabase then run a live INSERT smoke
expected: |
  `supabase db push` succeeds (0037 appears in the linked migration history); `npm run gen:types`
  is a no-op (or cosmetic-only) diff on src/types/database.types.ts; a live INSERT of
  transactions.classification_source='palavra-chave' SUCCEEDS (no SQLSTATE 23514); the old set
  ('memória','manual','sugerida',null) is still accepted; a bogus value is still rejected.
awaiting: user response

## Tests

### 1. Apply migration 0037 + live INSERT smoke
expected: `supabase db push` succeeds (0037 in linked history); `npm run gen:types` is a no-op diff; live INSERT of `classification_source='palavra-chave'` succeeds (no 23514); old set still accepted; bogus value rejected.
result: [pending]

### 2. End-to-end PROD smoke: wildcard keyword → upload → confirm → persisted provenance
expected: In PROD — cadastrar the keyword `UBER*` on a category; upload a statement containing descriptor `UBER TRIP 123`; confirm the row; verify the persisted `classification_source` is `'palavra-chave'` (not coarse `'memória'`). Substring keywords (no `*`) still classify as before.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
