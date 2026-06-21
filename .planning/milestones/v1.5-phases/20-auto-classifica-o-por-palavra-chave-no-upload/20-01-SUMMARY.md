---
phase: 20-auto-classifica-o-por-palavra-chave-no-upload
plan: 01
subsystem: classifier / import-pipeline
tags: [keyword-matching, deterministic-classification, ai-batch, rls]
requires:
  - "Phase 19 category_keywords table (migration 0036, RLS-scoped)"
  - "src/lib/classifier/memory.ts (hit/null contract mirrored)"
  - "src/lib/normalize.ts (single shared normalizeDescriptor)"
provides:
  - "matchKeyword (pure, longest-wins + sort tie-break)"
  - "KeywordRule / KeywordMatch types"
  - "'palavra-chave' member of ClassificationSource"
  - "RLS-scoped category_keywords fetch + keyword pass in import.ts PASS 1"
affects:
  - "20-02 (consumes 'palavra-chave' ClassificationSource for the review-grid badge)"
tech-stack:
  added: []
  patterns:
    - "Deterministic in-memory match layer between memory lookup and the single batched AI call"
    - "Precedence (memória>palavra-chave>IA) falls out of control-flow placement — no ordering logic"
    - "One upfront RLS-scoped fetch (no per-row query)"
key-files:
  created:
    - src/lib/classifier/keywords.ts
    - src/lib/classifier/keywords.test.ts
  modified:
    - src/lib/parsers/types.ts
    - src/actions/import.ts
    - src/actions/import.test.ts
decisions:
  - "Embedded join categories(sort) typed as a single object (A1 resolved at write-time — no array fallback needed); tsc clean"
  - "reserva_id stays null on a keyword hit — category-only (CONTEXT.md); reserva tagging is manual"
  - "confirmImport untouched — its learn loop is category-gated and origin-agnostic (KW-05 needs zero confirm change)"
metrics:
  duration_min: 3
  completed: 2026-06-19
  tasks: 2
  files_created: 2
  files_modified: 3
status: complete
---

# Phase 20 Plan 01: Matcher + Pipeline Summary

Inserted a deterministic **palavra-chave** layer between the memory lookup and the single batched AI call in the upload pipeline: a memory-miss now tries `matchKeyword` (longest-keyword-wins, `categories.sort` tie-break) and a hit binds the row (`classification_source='palavra-chave'`) and is excluded from the AI batch — closing the memória → palavra-chave → IA pipeline (KW-02/03/04) with zero new ordering logic and no `confirmImport` change.

## What Was Built

**Task 1 — `matchKeyword` (commit 89ad760)**
- New pure, synchronous `src/lib/classifier/keywords.ts` mirroring `memory.ts`'s hit/null contract over a pre-fetched rule list (no per-row DB call).
- `matchKeyword(descriptorNorm, rules)`: substring `includes`, longest keyword wins, equal-length tie breaks by lower `categories.sort`. `'' ` descriptor and `'' ` keyword rule are both guarded (match nothing).
- `KeywordRule { categoryId, keyword, sort }` + `KeywordMatch { categoryId }` exported, fully typed, no `any`.
- 6 unit tests (substring, longest-wins, no-match, empty-descriptor, sort tie, empty-keyword guard) — all green.

**Task 2 — pipeline insertion (commit 55dc0a1)**
- `ClassificationSource` union extended with `'palavra-chave'` in `src/lib/parsers/types.ts`.
- `src/actions/import.ts`: one RLS-scoped `category_keywords` fetch (`select('category_id, keyword, categories(sort)')`) before PASS 1, mapped to `KeywordRule[]` with `k.categories?.sort ?? 0`. NO app-layer `user_id` filter — the 0036 RLS policy scopes the read.
- PASS 1 memory-miss `else`: `matchKeyword` hit sets `category_id` + `source='palavra-chave'` and is NOT added to `missNorms`; a true miss falls through to `missNorms.add` exactly as before. `reserva_id` stays null.
- PASS 2, `confirmImport`, and the line-791 transaction label all untouched — the `category_id !== null` gate already protects keyword rows from AI overwrite (keyword > IA for free).
- `import.test.ts`: `keywordRows` fixture + `category_keywords` branch in `makeBuilder.then`; 4 pipeline tests (ordering memória>keyword>IA + AI-batch exclusion, longest-wins end-to-end, keyword absent from AI batch, memória prevails).

## Verification

- `npx vitest run src/lib/classifier/keywords.test.ts` → 6 passed (KW-02/KW-04).
- `npx vitest run src/actions/import.test.ts` → 48 passed (44 existing + 4 new; no regression in PASS 2 / confirm).
- `npx vitest run src/lib/classifier src/actions/import.test.ts` (per-wave merge) → 63 passed.
- `npx tsc --noEmit` → clean (union extended, fetch typed, no `any`).

## Deviations from Plan

None — plan executed exactly as written. Assumption A1 (embedded join shape) resolved to a single object as the recommended path predicted; no array fallback (`?.[0]?.sort`) was needed.

## Threat Surface

No new surface beyond the threat model. The single new fetch reads the RLS-scoped `category_keywords` (T-20-01 mitigated by Postgres RLS, not app-code); the matcher is pure/deterministic and never touches the LLM (T-20-03), reducing the AI surface. No new packages (T-20-SC n/a).

## Notes for Downstream (20-02)

- `'palavra-chave'` is now a valid `ClassificationSource` and IS persisted on the parsed row by PASS 1.
- Per 20-RESEARCH Pitfall 1: the review-grid badge will NOT render until `page.tsx` origin derivation reads `classification_source` (currently hardcodes `'memória'`). That fix + the `ReviewRow.origin`/`OriginVariant` unions + badge branches are 20-02's job.

## Self-Check: PASSED

- FOUND: src/lib/classifier/keywords.ts
- FOUND: src/lib/classifier/keywords.test.ts
- FOUND: src/lib/parsers/types.ts (modified)
- FOUND: src/actions/import.ts (modified)
- FOUND: src/actions/import.test.ts (modified)
- FOUND commit: 89ad760 (Task 1)
- FOUND commit: 55dc0a1 (Task 2)
