---
phase: 16
plan: 01
subsystem: import-review-ui
tags: [review-grid, ai-suggestion, provenance-badge, confidence-tag, sort, CLSAI-07, CLSAI-08]
requires:
  - "ParsedReviewRow.suggestion (Phase 15 wire) persisted in statements.parsed_rows"
  - "SuggestionSlot chip component (suggestion-slot.tsx)"
  - "CategoryBadge / KindBadge pill markup (category-badge.tsx)"
provides:
  - "Rendered AI suggestion chip + IA provenance badge in the review grid (CLSAI-07)"
  - "memória provenance badge for memory-classified rows (CLSAI-07)"
  - "baixa confiança tag + low-confidence-first initial sort (CLSAI-08)"
  - "import-review-table.test.tsx — the grid's first component test"
affects:
  - "src/components/import-review-table.tsx"
  - "src/app/(app)/importar/[statementId]/page.tsx"
tech-stack:
  added: []
  patterns:
    - "vitest + @testing-library/react component render (br-date-field idiom)"
    - "module-const tunable threshold (LOW_CONFIDENCE = 0.6)"
    - "stable-partition comparator (lowConfidenceFirst) feeding the table memo, not state"
key-files:
  created:
    - "src/components/import-review-table.test.tsx"
  modified:
    - "src/components/import-review-table.tsx"
    - "src/app/(app)/importar/[statementId]/page.tsx"
decisions:
  - "Bridge keeps confidence/source OUT of the SuggestionSlot prop type (the slot stays {categoryId,name}); the cell computes badges/tags itself."
  - "Initial low-confidence lead is driven by the DATA array (lowConfidenceFirst in the visibleRows memo) + an empty initial column-sort state when AI suggestions exist — so the user can still column-sort, and the no-suggestion path keeps the v1.3 date-desc default byte-identical."
metrics:
  duration: "~7 min"
  completed: "2026-06-18"
  tasks: 3
  files: 3
status: complete
---

# Phase 16 Plan 01: Review-Grid Suggestion Affordances Summary

Rendered the Phase-15 `row.suggestion` AI guess into the existing review grid — the "Aplicar sugestão: {name}" chip, a mutually-exclusive provenance badge (neutral "memória" vs gold "IA"+Sparkles), a "baixa confiança" amber tag below `LOW_CONFIDENCE = 0.6`, and a low-confidence-first initial sort — as pure additive UI with NO auto-commit (the learn loop stays in the untouched `confirmImport`).

## What Was Built

- **Task 1 (RED + plumbing):** New `import-review-table.test.tsx` (the grid had no test) pinning the 7 VALIDATION edges via `@testing-library/react`, mocking `@/actions/import` + `next/navigation`. Added the optional `suggestion` field to `ReviewRow` and threaded `suggestion: r.suggestion` in the importar route's `reviewRows.map()` (it was previously dropped on the floor).
- **Task 2 (CLSAI-07):** Bridged `SuggestionSlot` — resolve `suggestion.categoryId` → category `name` from the in-grid `categories`, pass `{categoryId, name}`; null categoryId → inert "—" (v1.3). `onApply` → `onClassify(row.id, catId, null)` (client-state fill only, no DB write). Added `ProvenanceBadge` (neutral "memória" for memory-hits, gold "IA"+Sparkles for unapplied non-null suggestions) using the `KindBadge` pill markup; mutual exclusivity falls out of the `category_id === null` gate.
- **Task 3 (CLSAI-08):** `LOW_CONFIDENCE = 0.6` module const; `ConfidenceTag` amber "baixa confiança" pill shown only for unapplied AI suggestions with `confidence < 0.6` (never a number, never red); `lowConfidenceFirst` stable-partition comparator wired into the `visibleRows` memo, gated on `hasAiSuggestions`, with the initial column-sort set empty so the data lead survives while the user can still re-sort.

## Verification Results

- `npx vitest run src/components/import-review-table.test.tsx` — **7/7 GREEN** (chip-on-ai, no-chip-on-none-fits, memória-badge, low-confidence-tag, low-confidence-first-sort, no-suggestions-v1.3-identical, apply-no-commit).
- `npx tsc --noEmit` — **clean** (the new `suggestion` field is optional/back-compat).
- `npm run build` — **succeeds** (`/importar/[statementId]` route + component compile).
- `src/actions/import.test.ts` — **43/43 pass** (no-auto-commit pins unaffected).
- Scope fence: `git diff --name-only` lists ONLY the 3 planned files; no `import.ts`/`classify.ts`/`confirmImport`/migration/Settings touched.
- `merchant_patterns` write site unchanged — the single upsert stays in `import.ts:841` (confirmImport path).
- `npm test` full suite — **817 passed, 2 skipped, 1 file errored** (`tests/adherence-zero-spend.test.ts`, see Deferred Issues — pre-existing local-Supabase env dependency, not a regression).

## Deviations from Plan

None — plan executed exactly as written. The `ConfidenceTag` JSX was introduced in Task 2's cell structure (it shares the chip row) and the comparator wiring it depends on was completed in Task 3, matching the plan's task split; the `low-confidence-tag` case happened to go GREEN at the end of Task 2 because the tag render does not depend on the sort.

## Deferred Issues

- **`tests/adherence-zero-spend.test.ts` errors at setup** because it requires a running local Supabase (`supabase status` could not be read). This is a known env-flaky integration test (last touched in commit `fabc0a4`, unrelated to this plan's files) and is out of scope per the executor SCOPE BOUNDARY — not a regression from this work. All non-Supabase-dependent tests (817) pass.

## Known Stubs

None. The `placeholder=` occurrences in `import-review-table.tsx` are pre-existing Select UI placeholder props ("Classificar" / "Nenhum"), not data stubs.

## Self-Check: PASSED

- FOUND: src/components/import-review-table.test.tsx
- FOUND: src/components/import-review-table.tsx (modified)
- FOUND: src/app/(app)/importar/[statementId]/page.tsx (modified)
- FOUND commit 16f1040 (Task 1 RED)
- FOUND commit bcec85d (Task 2 GREEN)
- FOUND commit f690ba9 (Task 3 GREEN)
