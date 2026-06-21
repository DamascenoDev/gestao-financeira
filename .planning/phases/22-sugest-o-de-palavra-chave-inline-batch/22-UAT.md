---
status: complete
phase: 22-sugest-o-de-palavra-chave-inline-batch
source: [22-VERIFICATION.md]
started: 2026-06-20T21:00:00Z
updated: 2026-06-21T13:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Inline keyword persists end-to-end from the import review grid
expected: On the import review grid, hand-classify a row (pick a category so origin becomes 'manual'), click '+ palavra-chave', edit/confirm the term, click Salvar; the popover flips to 'criada ✓'; then open /categorias and confirm the keyword now appears under that category (RLS-scoped to the user).
result: pass

### 2. Batch panel mines real merchant_patterns and persists approvals
expected: On /categorias, click 'Sugerir palavras-chave'; the dialog lists candidates mined from your confirmed merchant_patterns with a suggested category; select a few, edit a term, click 'Aprovar selecionadas (N)'; approve toasts the created/skipped count and removes approved rows; approved keywords persist under their categories; descriptors already covered by an existing keyword do NOT appear as candidates; discard removes a row with no persistence side-effect.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
