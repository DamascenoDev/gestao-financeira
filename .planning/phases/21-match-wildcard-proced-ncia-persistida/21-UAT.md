---
status: complete
phase: 21-match-wildcard-proced-ncia-persistida
source: [21-VERIFICATION.md]
started: 2026-06-20T18:50:00Z
updated: 2026-06-20T19:05:00Z
---

## Current Test

number: —
name: all tests complete
awaiting: none

## Tests

### 1. Apply migration 0037 + live INSERT smoke
expected: `supabase db push` succeeds (0037 in linked history); `npm run gen:types` is a no-op diff; live INSERT of `classification_source='palavra-chave'` succeeds (no 23514); old set still accepted; bogus value rejected.
result: pass — owner applied 0037 to linked/PROD; gen:types no-op; INSERT of 'palavra-chave' succeeded (no 23514); old set still accepted (2026-06-20).

### 2. End-to-end PROD smoke: wildcard keyword → upload → confirm → persisted provenance
expected: In PROD — cadastrar the keyword `UBER*` on a category; upload a statement containing descriptor `UBER TRIP 123`; confirm the row; verify the persisted `classification_source` is `'palavra-chave'` (not coarse `'memória'`). Substring keywords (no `*`) still classify as before.
result: pass — `UBER*` matched `UBER TRIP 123` on upload (palavra-chave badge), confirm persisted `classification_source='palavra-chave'`; substring keywords unchanged (2026-06-20).

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None — all human-verification items passed live.
