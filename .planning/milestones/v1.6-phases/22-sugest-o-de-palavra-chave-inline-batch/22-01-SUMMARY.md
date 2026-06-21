---
phase: 22-sugest-o-de-palavra-chave-inline-batch
plan: 01
subsystem: import-review
tags: [keyword, import-review, inline, KW-07]
status: complete
requires:
  - addKeyword (src/actions/category-keywords.ts) — existing, reused verbatim
  - normalizeKeyword (src/lib/normalize.ts) — toast echo only
  - ui/popover, ui/field, ui/input — vendored primitives
provides:
  - Inline "+ palavra-chave" control (KW-07) on import review grid manual rows
affects:
  - src/components/import-review-table.tsx
tech-stack:
  added: []
  patterns:
    - "Base UI Popover render-prop trigger (mirrors category-filter.tsx)"
    - "Session-scoped Set<rowId> state for per-row UI flip"
    - "Reuse existing server action verbatim (no new server surface)"
key-files:
  created: []
  modified:
    - src/components/import-review-table.tsx
    - src/components/import-review-table.test.tsx
decisions:
  - "Inlined KeywordInlineSuggest as a local sub-component in import-review-table.tsx (Claude's discretion per CONTEXT) — no new file, keeps the plan file-disjoint."
  - "Gate is row.origin === 'manual' AND row.category_id !== null (a manual row always has a category, but the && narrows the non-null type so addKeyword(row.category_id!, …) is safe)."
metrics:
  duration: ~16m
  completed: 2026-06-20
  tasks: 2
  files: 2
---

# Phase 22 Plan 01: Sugestão de palavra-chave inline (KW-07) Summary

Opt-in "+ palavra-chave" pill on hand-classified import-review rows that turns the row's `descriptor_norm` into a `category_keywords` entry via the existing `addKeyword` action — no new server surface, no `confirmImport`/`transactions` write.

## What Was Built

**Task 1 — inline control (`feat`):** Added a `KeywordInlineSuggest` sub-component inside `import-review-table.tsx`, mounted on the existing chip row in `InlineReviewCategoryCell` (after `<ConfidenceTag>`), rendered ONLY when `row.origin === 'manual'`. It is a discreet neutral pill (`bg-muted text-muted-foreground`, `Tags` icon, `min-h-5` geometry — never the gold `--primary` IA treatment) wrapped as a `PopoverTrigger`. The popover (`w-72`) holds a single `Field` prefilled with the row's normalized `descriptor_norm` (editable, `maxLength={60}`), an optional helper line interpolating the category name, a `FieldError`, and a Cancelar/Salvar footer. Salvar mirrors `category-keywords-dialog.tsx`: `useTransition` → `addKeyword(row.category_id!, value)` → `error` keeps the popover open with the FieldError, `duplicate` → `toast.info`, `ok` → `toast.success`, both `ok`/`duplicate` flip the row to a disabled "criada ✓". The flip is tracked in a session-scoped `createdKeywordRows: Set<string>` in `ImportReviewTable` (immutable updates, not persisted), threaded down to both the desktop cell and the mobile card.

**Task 2 — tests (`test`):** Extended `import-review-table.test.tsx` with a `KW-07 inline keyword suggestion` describe block (5 cases): pill renders only on `manual`; absent on `memória`/`palavra-chave`/`não classificada`; Salvar calls `addKeyword('cat-transporte', 'uber trip 99')` (the un-re-normalized term + just-picked category) and flips to "criada ✓"; duplicate also flips (`toast.info`); error keeps the popover open with no flip. Added an `addKeyword` mock + a callable `sonner` mock.

## Verification

- `npx tsc --noEmit` — clean (no errors).
- `npx vitest run src/components/import-review-table.test.tsx` — 16/16 pass (11 prior + 5 new).
- Full unit suite — 895 pass, 2 skipped. The only failing file is `tests/bulk-reclassify.test.ts`, an environment-flaky Supabase integration test that requires a local Supabase instance (documented gotcha); unrelated to this plan.

## Acceptance Criteria

- `grep "row.origin === 'manual'"` returns the gate guarding the inline control. ✓
- `grep -c addKeyword` ≥ 1 (5 occurrences). ✓
- No new `confirmImport(` call introduced — the inline path never commits the import. ✓
- pt-BR strings "+ palavra-chave", "criada ✓", "Criar palavra-chave para esta categoria", "Salvar" present. ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `sonner` mock must be callable**
- **Found during:** Task 2 (test run)
- **Issue:** The plan-specified `vi.mock('sonner', () => ({ toast: { success, info, error } }))` broke the pre-existing `apply-all` test — `import-review-table.tsx` uses bare `toast('…')` (lines 409, 438) in `applyAllSuggestions`/`deleteRow`, not just `toast.success`. The object-only mock made `toast` non-callable → `TypeError: toast is not a function`.
- **Fix:** Made the mock `Object.assign(vi.fn(), { success, info, error })` so `toast` is callable with method spies attached.
- **Files modified:** src/components/import-review-table.test.tsx
- **Commit:** 341f466

**2. [Rule 1 - Bug] flip assertion needed async retry**
- **Found during:** Task 2
- **Issue:** The "criada ✓" flip happens inside `startTransition`; the plan's `await Promise.resolve()` double-flush did not reliably settle the React 19 transition commit + popover Portal teardown in jsdom, so `getAllByText(/criada/)` found nothing.
- **Fix:** Used `await screen.findAllByText(/criada/)` (retries past the commit) for the two flip assertions instead of the synchronous `getAllByText`.
- **Files modified:** src/components/import-review-table.test.tsx
- **Commit:** 341f466

### Gate adjustment (not a deviation, a type-narrowing refinement)
The gate is `row.origin === 'manual' && row.category_id !== null`. A `manual` row always carries a category (set together in `classifyRow`), so this never hides the control in practice; the `!== null` clause narrows the type so `addKeyword(row.category_id!, …)` is sound and the helper line resolves a real category name.

## Threat Surface

No new surface. The inline path writes ONLY `category_keywords` via the existing `addKeyword`, which already owner-gates (`getClaims().claims.sub`), validates (`idSchema` uuid + `keywordSchema`), normalizes (`normalizeKeyword`, literal-count-0 reject), and is RLS-scoped. T-22-01/T-22-02/T-22-SC accepted-already-mitigated per the plan threat model; this plan installed ZERO packages.

## Known Stubs

None.

## Self-Check: PASSED
- FOUND: src/components/import-review-table.tsx
- FOUND: src/components/import-review-table.test.tsx
- FOUND commit: 4b0275a (feat 22-01)
- FOUND commit: 341f466 (test 22-01)
