---
phase: 22-sugest-o-de-palavra-chave-inline-batch
plan: 02
subsystem: categorias
tags: [keyword, suggestions, server-action, KW-08]
status: complete
requires:
  - compileRule / matchKeyword / KeywordRule (src/lib/classifier/keywords.ts) — pure matcher, reused verbatim
  - addKeyword per-item logic (src/actions/category-keywords.ts) — mirrored in the batch loop
  - keywordSchema + normalizeKeyword — validation/normalization boundary reused
  - idSchema (uuid) + CATEGORIAS_PATH — reused
provides:
  - getKeywordSuggestions() — RLS-scoped candidate feed (mine confirmed merchant_patterns, exclude already-covered, sort hit_count desc)
  - approveKeywordSuggestions(items) — batch-create behind one owner-gate + one revalidate, returns {created, skipped}
  - KeywordSuggestion + ApproveSuggestionsResult types
  - keywordSuggestionItemSchema (categoryId uuid + keyword) in the schema file
affects:
  - src/actions/category-keywords.ts
  - src/lib/schemas/category-keyword.ts
  - src/actions/category-keywords.test.ts
tech-stack:
  added: []
  patterns:
    - "Server-side candidate computation (raw merchant data never crosses to client)"
    - "Reuse pure matcher (compileRule/matchKeyword) as the single source of truth for 'covered'"
    - "Batch insert: one owner-gate + one revalidatePath, per-item validate/dedupe, single bad item -> skipped (never aborts)"
key-files:
  created: []
  modified:
    - src/actions/category-keywords.ts
    - src/lib/schemas/category-keyword.ts
    - src/actions/category-keywords.test.ts
decisions:
  - "getKeywordSuggestions does NOT re-normalize descriptor_norm — it is already the normalized match key (re-normalizing re-strips `*`, the documented landmine)"
  - "Any insert error (incl. 23505 race / RLS+FK-rejected foreign categoryId) is counted as a skip, never thrown/leaked — batch is resilient"
  - "Test harness extended additively: per-table readResults map + FIFO dup/insert queues; existing addKeyword/removeKeyword suites unaffected"
metrics:
  duration: ~12m
  completed: 2026-06-20
  tasks: 2
  files: 3
  tests: 30 (8 new)
---

# Phase 22 Plan 02: KW-08 Server Side (getKeywordSuggestions + approveKeywordSuggestions) Summary

Two new server actions in `src/actions/category-keywords.ts` deliver the KW-08 data + write contract for the batch-suggestion dialog (Plan 03): `getKeywordSuggestions()` mines the caller's confirmed `merchant_patterns` (RLS-scoped), excludes descriptors already covered by an existing keyword via the pure `compileRule`/`matchKeyword` matcher, and returns `{descriptorNorm, categoryId, categoryName, hitCount}` candidates sorted by `hit_count` desc; `approveKeywordSuggestions(items)` bulk-creates the chosen candidates as `category_keywords` behind one owner-gate + one `revalidatePath`, validating/normalizing/deduping each item exactly like `addKeyword` and counting a single invalid/duplicate item as `skipped` so one bad item never aborts the batch. ZERO migration / gen:types / new package.

## What Was Built

### Task 1 — schema + two actions (`feat`, d88fa59)
- `src/lib/schemas/category-keyword.ts`: added `keywordSuggestionItemSchema` (`categoryId` uuid + reused `keywordSchema`) + `KeywordSuggestionItem` type. Existing `keywordSchema` untouched.
- `src/actions/category-keywords.ts`:
  - `getKeywordSuggestions()` — owner-gate via `getClaims`, three RLS-scoped reads (`merchant_patterns`, `category_keywords`, `categories` filtered `is_archived=false`) via `Promise.all`, builds `sortById`/`nameById` Maps + a precompiled `KeywordRule[]` (dropping nulls), excludes any pattern where `matchKeyword(descriptor_norm, rules) !== null`, maps to the candidate shape, sorts by `hitCount` desc. No `revalidatePath` (read).
  - `approveKeywordSuggestions(items)` — early `{created:0,skipped:0}` on empty, one owner-gate, per-item four-guard mirror of `addKeyword` (`idSchema` → `keywordSchema` → `normalizeKeyword` → reject `''` → reject literal-count-0), `maybeSingle` dup pre-check, insert carrying `user_id` from claims, any insert error → `skipped++; continue`, ONE `revalidatePath('/categorias')` after the loop.
  - Exported `KeywordSuggestion` + `ApproveSuggestionsResult` types.

### Task 2 — extended action tests (`test`, ce9ef48)
- Harness extended additively: per-table `readResults` map (resolves each select to its table's data, falling back to prior shared behavior for unmapped tables/writes) + FIFO `dupPreCheckQueue`/`insertResultQueue` for per-item divergence in batch tests. All three reset in `beforeEach`.
- `getKeywordSuggestions` (3 cases): already-covered exclusion via the REAL `matchKeyword` + candidate shape; `hit_count`-desc sort; session gate (no revalidate).
- `approveKeywordSuggestions` (5 cases): two valid → `created:2` with `user_id` + one revalidate; dup pre-check → `skipped` while sibling inserts; 23505 race → `skipped` while sibling inserts; invalid (bad uuid + `*`) → `skipped:2`, valid still `created:1`; empty array → no DB/no revalidate; session gate → writes nothing.
- 30 tests green (22 existing + 8 new); existing `addKeyword`/`removeKeyword` suites unaffected.

## Deviations from Plan

None — plan executed exactly as written. (Note: the plan's Task 2 spec listed both a "duplicate item" and a "23505 race" path; both were implemented as separate cases for full coverage of the skip-on-any-error contract, which is additive to the plan's ≥5-case minimum.)

## Verification

- `npx vitest run src/actions/category-keywords.test.ts` — 30 passed.
- `npx tsc --noEmit` — clean (no errors anywhere).
- `git diff --stat HEAD~2 -- supabase/migrations/ src/types/database.types.ts` — empty (no schema, no gen:types), as required.

## Threat Mitigations Applied

- **T-22-03 (Info Disclosure):** `getKeywordSuggestions` owner-gates before any read; three reads are RLS-scoped with NO manual `user_id` filter; only the computed candidate shape crosses to the client (never raw merchant rows).
- **T-22-04 (Tampering / edited term):** every batch item re-runs `keywordSchema` (max60) + `normalizeKeyword` + literal-count-0 reject server-side — the client's edited term is never trusted.
- **T-22-05 (Elevation / foreign categoryId):** `idSchema` uuid per item + RLS `with check` + FK; a foreign/garbage id inserts nothing (counted skipped). `user_id` comes only from `getClaims`.
- **T-22-06 (catch-all `*`/`**`):** per-item literal-count-0 reject; `compileRule`/`matchKeyword` also skip zero-literal rules (defense-in-depth).
- **T-22-SC (package legitimacy):** ZERO packages installed this plan.

## Known Stubs

None.

## Self-Check: PASSED
- src/actions/category-keywords.ts — FOUND (getKeywordSuggestions + approveKeywordSuggestions exported)
- src/lib/schemas/category-keyword.ts — FOUND (keywordSuggestionItemSchema)
- src/actions/category-keywords.test.ts — FOUND (30 tests green)
- Commit d88fa59 — FOUND
- Commit ce9ef48 — FOUND
