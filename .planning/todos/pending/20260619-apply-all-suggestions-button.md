---
created: 2026-06-19
title: Review grid — "Aplicar todas as sugestões" bulk action
area: ui / import review grid
severity: enhancement (feature request)
found_by: quick-task 260619-d68 (user request after AI smoke went green)
files:
  - src/components/import-review-table.tsx
---

# Bulk "Aplicar todas as sugestões" button

## Problem

With AI classification live, an upload can produce many rows carrying a `row.suggestion`
(gold "IA" chip). Applying each one individually via the per-row "Aplicar sugestão" chip
is tedious. User asked for a one-click bulk apply.

## Solution (sketch)

Add a grid-level action ("Aplicar todas as sugestões") that, for every row where
`category_id === null` AND a `suggestion` exists, applies the suggested category to the
**client state only** — identical non-binding fill to the per-row chip (`onClassify`),
NO DB write, `confirmImport` still the sole `merchant_patterns`/auto-commit path
(preserve CLSAI-05). Consider scoping options:
- apply all, or
- apply only suggestions with `confidence >= LOW_CONFIDENCE` (0.6) to keep low-confidence
  rows for manual review (they already sort first).

Pure UI over the proven pipeline — mirrors the existing SuggestionSlot/onApply grammar.
Add to the component test (`import-review-table.test.tsx`): bulk apply fills eligible
rows, never fires `confirmImport`, never overwrites a memory hit.
