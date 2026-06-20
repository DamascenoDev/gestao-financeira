---
phase: 22-sugest-o-de-palavra-chave-inline-batch
fixed_at: 2026-06-20T17:37:00Z
review_path: .planning/phases/22-sugest-o-de-palavra-chave-inline-batch/22-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 5
skipped: 2
status: partial
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-06-20T17:37:00Z
**Source review:** .planning/phases/22-sugest-o-de-palavra-chave-inline-batch/22-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (fix_scope = all)
- Fixed: 5 (WR-01, WR-02, IN-01, IN-02, IN-03)
- Skipped: 2 (WR-03, WR-04 — reviewer-confirmed safe / no-change-required)

Verification: `npx tsc --noEmit` clean; affected vitest suites green
(`category-keywords.test.ts`, `keyword-suggestions-dialog.test.tsx`,
`import-review-table.test.tsx`) — 51/51 tests pass. Phase invariants preserved:
`confirmImport`/`import.ts` untouched; both keyword surfaces remain opt-in
(no auto-creation); `approveKeywordSuggestions` still one-owner-gate /
one-revalidate / never-aborts-on-bad-item.

## Fixed Issues

### WR-02: Edited candidate can target an archived category

**Files modified:** `src/actions/category-keywords.ts`
**Commit:** 507288e
**Applied fix:** In `getKeywordSuggestions`, added a leading
`.filter((p) => nameById.has(p.category_id))` to the candidate pipeline — runs
BEFORE the `matchKeyword` covered-exclusion filter — so any pattern pointing at
an archived/inactive category (absent from the `is_archived = false` `nameById`
map) is dropped. This prevents surfacing a raw-UUID `CategoryBadge` label, a
category `Select` with no matching item, and approving a keyword onto a hidden
category.

### IN-03: `getKeywordSuggestions` swallows read errors silently

**Files modified:** `src/actions/category-keywords.ts`
**Commit:** 507288e (shares commit with WR-02 — see note below)
**Applied fix:** Destructured `error` from each of the three `Promise.all` reads
(`patternsError`, `keywordsError`, `categoriesError`) and added a guard returning
`{ error: 'Não foi possível carregar as sugestões.' }` when any read fails. The
dialog already renders an error toast on the `{ error }` branch, so a transient
DB failure now surfaces as an error instead of an indistinguishable calm empty
state. Mirrors the Phase 21 swallowed-error pattern.

> Note: WR-02 and IN-03 both edit `getKeywordSuggestions` in
> `category-keywords.ts`. The commit tool (`query commit --files <path>`)
> re-stages the entire file path, so both hunks landed in a single commit
> (507288e) rather than two separate commits. Both fixes are present and
> verified; only the atomic-per-finding commit granularity was merged.

### WR-01: Batch-approve "já cadastradas" toast over-reports

**Files modified:** `src/components/keyword-suggestions-dialog.tsx`
**Commit:** 07f5d0e
**Applied fix:** Changed the skipped-count success toast from
`` `${r.created} criadas · ${r.skipped} já cadastradas.` `` to
`` `${r.created} criadas · ${r.skipped} ignoradas.` `` — cause-neutral pt-BR copy
that no longer asserts "duplicate" for items the server skipped for any of the
five reasons (bad uuid, Zod-invalid, normalize-empty, literal-count-0,
duplicate/insert-error).

### IN-02: Dialog `key` frozen at `toCandidate` time while `categoryId` editable

**Files modified:** `src/components/keyword-suggestions-dialog.tsx`
**Commit:** 07f5d0e (shares commit with WR-01 — same file)
**Applied fix:** Changed `key` from `` `${s.descriptorNorm}::${s.categoryId}` `` to
`s.descriptorNorm` alone. `merchant_patterns` is unique on
`(user_id, descriptor_norm)`, so each descriptor appears once — keying on the
descriptor makes the collision-free/uniqueness invariant explicit and removes the
stale dependency on the editable `categoryId`. Added a clarifying comment.

> Note: WR-01 and IN-02 both edit `keyword-suggestions-dialog.tsx` and landed in
> one commit (07f5d0e) for the same `--files`-re-stages-whole-path reason.

### IN-01: `KeywordInlineSuggest` `value` state never re-syncs

**Files modified:** `src/components/import-review-table.tsx`
**Commit:** a3e7405
**Applied fix:** Added a comment above
`const [value, setValue] = React.useState(row.descriptor_norm)` documenting that
`descriptor_norm` is row-stable (immutable for a parsed review row), so the lazy
seed never needs to re-sync from props. Documentation-only, per the reviewer's
"None needed; optionally add a comment" guidance.

## Skipped Issues

### WR-03: Inline keyword popover bypasses literal-count-0 / empty guards client-side

**File:** `src/components/import-review-table.tsx:1128-1147`
**Reason:** skipped — reviewer classified this as "Low priority … No correctness
risk" and a "degraded-but-safe path, not a data bug." The action
(`addKeyword`) already rejects `*`-only / normalize-empty terms server-side and
the popover stays open with the existing `FieldError`, which the reviewer
explicitly states is "acceptable." The suggested client-side pre-check is a pure
UX nicety with no behavioral/correctness gain; adding speculative client logic to
the invariant-sensitive inline control was judged higher risk than the
non-issue it addresses.
**Original issue:** The toast-echo `normalized` is computed but only consumed in
the success/duplicate branches; on the error branch the user sees a generic
server message without an inline indication that a `*`-only term was the cause.

### WR-04: `discard` button disabled during pending but state could drift if disable relaxed

**File:** `src/components/keyword-suggestions-dialog.tsx:159-185`
**Reason:** skipped — reviewer states "No change required today." The scenario is
currently unreachable: inputs are `disabled={isPending}` during the transition and
the footer approve button is guarded by `disabled={isPending || …}`, so a selected
row cannot be edited mid-flight. The finding is a latent-coupling note to preserve
the disable constraint, not an actual defect. The already-snapshotted
`{ categoryId, keyword }` payload at call time means the persisted term matches the
approved snapshot. No behavioral change applied.
**Original issue:** If the input-disable were ever relaxed, an edit to a selected
row during a pending transition could diverge the persisted term from the visible
one.

---

_Fixed: 2026-06-20T17:37:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
