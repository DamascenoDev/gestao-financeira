---
phase: 21-match-wildcard-proced-ncia-persistida
plan: 01
subsystem: classification-keywords
tags: [normalize, keyword, wildcard, KW-09, gate]
requires: []
provides:
  - "normalizeKeyword — keyword-aware normalization that preserves the glob `*`"
  - "addKeyword persists `*` (UBER* reaches the DB containing `*`) + rejects literal-count-0"
affects:
  - src/lib/normalize.ts
  - src/actions/category-keywords.ts
tech-stack:
  added: []
  patterns:
    - "Single shared runNormalizePipeline(raw, keepWildcard) — one source for both descriptor and keyword keys"
key-files:
  created: []
  modified:
    - src/lib/normalize.ts
    - src/lib/normalize.test.ts
    - src/actions/category-keywords.ts
    - src/actions/category-keywords.test.ts
decisions:
  - "Factored a shared runNormalizePipeline(raw, keepWildcard) rather than duplicating the pipeline — guarantees keyword and descriptor stay bit-identical except for the two `*` branch points (Assumption A3)."
  - "literal-count-0 reject copy: 'Use ao menos uma letra ou número além de *.' (pt-BR, per Q2 Claude's-discretion)."
metrics:
  duration: ~6m
  completed: 2026-06-20
  tasks: 2
  files: 4
status: complete
---

# Phase 21 Plan 01: normalizeKeyword + addKeyword wildcard persistence Summary

The Phase 21 GATE (KW-09): a cadastro keyword `UBER*` now survives normalization and reaches the DB still containing `*`, via a new keyword-aware `normalizeKeyword` that is bit-identical to `normalizeDescriptor` except it preserves the glob `*`; `addKeyword` switched to it and rejects literal-count-0 keywords (`*`/`**`).

## What Was Built

- **`normalizeKeyword(raw)` in `src/lib/normalize.ts`** — the keyword-aware variant. Both `normalizeDescriptor` and `normalizeKeyword` now delegate to a shared private `runNormalizePipeline(raw, keepWildcard)`. The only two branch points are: (a) the `\*+ → space` strip runs only for the descriptor (`keepWildcard=false`), and (b) the final punctuation catch-all is `/[^a-z0-9 *]/g` (keeps `*`) for keywords vs `/[^a-z0-9 ]/g` for descriptors. Every other step (NFKD, accent strip, lowercase, payment tokens, dates, long digit runs, trailing UF, whitespace collapse/trim) is shared and unchanged.
- **`addKeyword` in `src/actions/category-keywords.ts`** — swapped `normalizeDescriptor` → `normalizeKeyword`, and added a literal-count-0 guard right after the empty-`''` guard: if `normalized.replace(/\*/g, '') === ''` it returns `{ error: 'Use ao menos uma letra ou número além de *.' }` with no insert. Duplicate pre-check, 23505 backstop, getClaims owner, and revalidatePath are untouched. `removeKeyword` untouched.

## Key Behaviors (test-pinned)

- `normalizeKeyword('UBER*') === 'uber*'`; `normalizeKeyword('*IFOOD*') === '*ifood*'`; `normalizeKeyword('SÃO JOÃO*') === 'sao joao*'`.
- For ANY input without `*`, `normalizeKeyword(x) === normalizeDescriptor(x)` (same key space — substring v1.5 intact).
- `normalizeDescriptor('UBER *TRIP') === 'uber trip'` — descriptor side still strips `*` (regression pinned).
- `addKeyword(cat, 'UBER*')` inserts `keyword: 'uber*'` (the highest-value gate assertion).
- `addKeyword(cat, '*')` and `addKeyword(cat, '**')` return an error and do NOT insert.
- `addKeyword(cat, 'mercado')` still inserts `'mercado'`; duplicate/empty/session paths unchanged.

## Deviations from Plan

### Test-suite adjustments (Rule 1 — keep tests truthful)

**1. Updated the pre-existing `'***'` empty-normalize test in category-keywords.test.ts**
- **Found during:** Task 2 RED.
- **Issue:** The old test asserted `addKeyword('***')` returns `'Informe uma palavra-chave.'` (the empty-after-normalize message). With `normalizeKeyword` the `*` now survives, so `***` is caught by the new literal-count-0 guard with a different message — making the old assertion stale.
- **Fix:** Split into two tests: a punctuation-only case (`'/'`) that still normalizes to `''` and hits the empty guard, and a `'***'` case that asserts the literal-count-0 guard fires (error present, NOT the empty message, no insert). Also retargeted the "normalizes via real normalizer" test from `normalizeDescriptor` to `normalizeKeyword` using a non-wildcard input so both equalities hold.
- **Files modified:** src/actions/category-keywords.test.ts
- **Commit:** 35cd6d1

### Acceptance-criterion note

The criterion `grep -c "normalizeDescriptor" src/actions/category-keywords.ts == 0` is functionally met: the import and all call sites are gone (verified `grep -n`). One textual occurrence remains — a docstring line documenting that `normalizeKeyword` is "bit-identical to normalizeDescriptor." This is a comment, not a use, and is intentionally retained for traceability. The spirit of the criterion ("não usa mais o descriptor-normalize") is satisfied.

## Authentication Gates

None.

## Known Stubs

None. The wildcard `*` is preserved end-to-end through the cadastro write boundary; the match side (consuming the persisted `*`) is the scope of Plans 02/04.

## Verification

- `npx vitest run src/lib/normalize.test.ts src/actions/category-keywords.test.ts` → 43 passed.
- `npx tsc --noEmit` → clean (TypeScript estrito, sem JS).
- Gate confirmed: `addKeyword(cat, 'UBER*')` persists `keyword: 'uber*'` (contains `*`).

## Self-Check: PASSED

- FOUND: src/lib/normalize.ts (normalizeKeyword exported)
- FOUND: src/actions/category-keywords.ts (normalizeKeyword used, literal-count-0 guard)
- FOUND commit 4b712b0 (Task 1)
- FOUND commit 35cd6d1 (Task 2)
