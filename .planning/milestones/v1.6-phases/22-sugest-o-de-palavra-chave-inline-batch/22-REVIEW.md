---
phase: 22-sugest-o-de-palavra-chave-inline-batch
reviewed: 2026-06-20T18:00:00Z
depth: standard
iteration: 2
files_reviewed: 9
files_reviewed_list:
  - src/actions/category-keywords.ts
  - src/actions/category-keywords.test.ts
  - src/app/(app)/categorias/page.tsx
  - src/components/import-review-table.tsx
  - src/components/import-review-table.test.tsx
  - src/components/keyword-suggestions-dialog.tsx
  - src/components/keyword-suggestions-dialog.test.tsx
  - src/components/keyword-suggestions-launcher.tsx
  - src/lib/schemas/category-keyword.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 22: Code Review Report (Iteration 2 — fix verification)

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 9
**Status:** clean

## Summary

Re-review of Phase 22 (KW-07 inline `+ palavra-chave` + KW-08 batch-suggestion
dialog) after the iteration-1 fixes for WR-01, WR-02, IN-01, IN-02, IN-03 were
applied (commits `507288e`, `07f5d0e`, `a3e7405`). WR-03 and WR-04 were
intentionally accepted in iteration 1 as no-correctness-risk (degraded-but-safe /
currently-unreachable latent coupling) — both remain as-is and are acceptable.

**All four targeted fixes verified correct, no regressions introduced:**

- **WR-02 (archived-category candidate) — FIXED.** `getKeywordSuggestions` now runs
  `.filter((p) => nameById.has(p.category_id))` (`category-keywords.ts:177`) BEFORE
  the covered-exclusion `.filter((p) => matchKeyword(...) === null)`
  (`:181`). `nameById`/`sortById` are built only from `is_archived = false`
  categories (`:147-150`, `:162-165`), so a `merchant_patterns` row pointing at an
  archived category is dropped up front. Consequence: the `categoryName` fallback
  `?? p.category_id` (`:185`) can no longer surface a raw UUID for any emitted
  candidate, the dialog `Select` (page passes only active categories,
  `page.tsx:99-104`) always has a matching `SelectItem`, and approve can no longer
  persist a keyword on a hidden category. Correct.

- **IN-03 (swallowed read errors) — FIXED.** The three `Promise.all` reads now
  destructure `error` (`:139-141`) and short-circuit with
  `return { error: 'Não foi possível carregar as sugestões.' }` when any read fails
  (`:156-158`), so a transient DB failure reaches the dialog as the error toast
  (`keyword-suggestions-dialog.tsx:113-117`) instead of the false-empty "Nenhuma
  sugestão" state. Mirrors the Phase 21 swallowed-error fix. Correct.

- **WR-01 (over-reporting toast) — FIXED.** The success toast is now cause-neutral
  pt-BR: `` `${r.created} criadas · ${r.skipped} ignoradas.` ``
  (`keyword-suggestions-dialog.tsx:178`). "ignoradas" no longer asserts a specific
  cause (duplicate) for the multi-reason `skipped` bucket. Old "já cadastradas"
  copy fully removed (grep-confirmed). Correct.

- **IN-02 (frozen composite key) — FIXED.** `toCandidate` now keys on
  `descriptorNorm` alone (`key: s.descriptorNorm`, `:74`); `merchant_patterns` is
  unique on `(user_id, descriptor_norm)` so the key is collision-free and stable
  across an editable-`categoryId` change. Correct.

**Phase invariants re-confirmed intact:**

- **`confirmImport` / `import.ts` unmodified** — absent from the entire Phase 22
  changeset (git log `f5044dc..a3e7405`); `confirmImport` remains the sole
  transactions/merchant_patterns write path. Apply/inline/batch never auto-commit.
- **Both surfaces opt-in** — the inline popover is gated on
  `row.origin === 'manual' && row.category_id !== null`
  (`import-review-table.tsx:1033`); the batch dialog only loads on explicit open and
  only writes on an explicit Approve click. No keyword is ever written without a user
  action.
- **`approveKeywordSuggestions`** — ONE owner-gate (`getClaims()` once before the
  loop, `:208-210`), per-item validate/normalize/dedup identical to `addKeyword`
  with `user_id` always from `claims.sub` (never the client), each bad/duplicate/race
  item counted as `skipped` + `continue` (never aborts the batch, `:215-261`), and
  ONE `revalidatePath` after the whole loop (`:264`). Correct.
- **`getKeywordSuggestions`** — three RLS-scoped reads (no manual `user_id` filter),
  emits only the computed candidate shape (never raw merchant rows), and reuses the
  same `compileRule`/`matchKeyword` matcher as the upload pipeline for "covered."

**Verification:** All 9 files reviewed in context; the 51 tests across the three
phase test files pass (`vitest run`), and `tsc --noEmit` is clean for the changed
files. No BLOCKER, WARNING, or INFO-class correctness, security, or RLS defects
remain. Only the previously-accepted WR-03/WR-04-class items persist (both
documented as no-correctness-risk), which the iteration-2 brief explicitly deems
acceptable.

All reviewed files meet quality standards. No new issues found.

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard (iteration 2)_
