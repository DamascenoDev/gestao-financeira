---
phase: 25-fix-de-scroll-na-cria-o-de-palavra-chave
plan: 01
subsystem: actions/category-keywords
tags: [server-action, revalidatePath, scroll-fix, ux-01, tdd]
status: complete
requires:
  - "src/actions/category-keywords.ts (addKeyword, AddKeywordResult)"
provides:
  - "addKeywordInline — keyword cadastro Server Action WITHOUT revalidatePath (SC1 base for Plan 02)"
  - "insertKeyword — private shared core (4 guards + dup + 23505), no revalidate"
affects:
  - "addKeyword (now delegates to insertKeyword; revalidates /categorias only on ok)"
tech-stack:
  added: []
  patterns:
    - "Private shared-core helper + thin exported wrappers that differ only in revalidate behavior"
key-files:
  created: []
  modified:
    - "src/actions/category-keywords.ts"
    - "src/actions/category-keywords.test.ts"
decisions:
  - "revalidatePath fires ONLY on the {ok} branch of addKeyword — preserves prior behavior where duplicate/error returned before the revalidate call"
  - "insertKeyword is non-exported: the only observable difference between the two actions is whether the caller revalidates"
metrics:
  duration_min: 2
  completed: 2026-06-21
  tasks: 2
  files: 2
---

# Phase 25 Plan 01: Server-side addKeywordInline (no revalidate) Summary

Extracted the keyword-cadastro core into a private `insertKeyword` helper and added a second exported Server Action `addKeywordInline` that runs the helper WITHOUT `revalidatePath` — cutting the root cause of the scroll-jump (UX-01) on the server side. `addKeyword` is preserved as `insertKeyword` + `revalidatePath('/categorias')` on success, so the `/categorias` page refresh (SC3) is untouched.

## What was built

- **`insertKeyword(categoryId, keyword)`** — private (non-exported) shared core, bit-identical to the old `addKeyword` body: the same four guards in the same order with the same pt-BR messages (`idSchema` uuid → `keywordSchema` → `normalizeKeyword === ''` → literal-count-0 `*`-only), the `getClaims().claims.sub` owner gate (user_id never from the client), the `maybeSingle` duplicate pre-check, and the `23505` race backstop. Never calls `revalidatePath`.
- **`addKeyword`** — now `const result = await insertKeyword(...); if ('ok' in result) revalidatePath(CATEGORIAS_PATH); return result`. Still exported; still revalidates `/categorias` only on success (SC3 intact).
- **`addKeywordInline`** — exported; returns `insertKeyword(...)` directly with no revalidate (SC1 base for Plan 02's inline caller).
- **Tests** — new `describe('addKeywordInline', …)` block (15 cases) mirroring the `addKeyword` suite, each asserting `revalidatePath` NOT called, plus a direct SC1-vs-SC3 contrast test (addKeyword revalidates `/categorias`; addKeywordInline does not). All prior `addKeyword`/`removeKeyword`/`getKeywordSuggestions`/`approveKeywordSuggestions` asserts left byte-equivalent.

## TDD Gate Compliance

- RED gate: `test(25-01): add failing addKeywordInline parity + revalidate-contrast specs` — `543a229` (suite fails: `addKeywordInline` not yet exported).
- GREEN gate: `feat(25-01): extract insertKeyword helper + expose addKeywordInline` — `37cdfa5` (46/46 tests pass).
- REFACTOR: not needed — the helper extraction landed clean.

## Verification

- `npx vitest run src/actions/category-keywords.test.ts` → 46 passed (1 file).
- `npx tsc --noEmit` → no errors in `category-keywords` (clean overall).
- Inspection: `insertKeyword` non-exported and contains no `revalidatePath`; `addKeyword` revalidates only in the `{ok}` branch; `addKeywordInline` exported and never revalidates.
- No DB/schema delta — phase does not touch the database (`database.types.ts` unchanged).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/actions/category-keywords.ts (insertKeyword private, addKeywordInline exported)
- FOUND: src/actions/category-keywords.test.ts (addKeywordInline describe block)
- FOUND commit: 543a229 (RED)
- FOUND commit: 37cdfa5 (GREEN)
