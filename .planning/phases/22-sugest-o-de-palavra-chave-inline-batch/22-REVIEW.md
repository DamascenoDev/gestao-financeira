---
phase: 22-sugest-o-de-palavra-chave-inline-batch
reviewed: 2026-06-20T00:00:00Z
depth: standard
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
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the KW-07 (inline `+ palavra-chave` on `manual` review rows) and KW-08
(global batch-suggestion dialog) surfaces over the existing `category_keywords`
model. The phase invariants all hold on inspection:

- **No auto-creation** — both the inline popover and the batch dialog are explicit
  opt-in; nothing writes a keyword without a user click. `confirmImport` remains the
  sole transactions/merchant_patterns path.
- **`approveKeywordSuggestions` owner-gates once** (single `getClaims()` before the
  loop), validates/normalizes/dedupes each item exactly like `addKeyword`, counts a
  bad item as `skipped` + `continue` (never aborts the batch), and calls
  `revalidatePath` exactly once after the loop. `user_id` always comes from
  `claims.sub`, never the client.
- **`getKeywordSuggestions` is server-side only** — three RLS-scoped reads, no manual
  `user_id` filter, returns only the computed candidate shape (never raw merchant
  rows), and excludes already-covered descriptors via the SAME `compileRule`/
  `matchKeyword` matcher the upload pipeline uses.
- **The inline control is gated on `row.origin === 'manual'`** (`&& row.category_id !== null`).
- **`confirmImport`/`import.ts` is NOT modified** — confirmed via `git diff` over the
  phase range (the file is absent from the changeset).

No BLOCKER-class correctness, security, or owner-gate defects were found. The
findings below are robustness/UX-correctness gaps and minor quality items.

## Warnings

### WR-01: Batch-approve "já cadastradas" toast over-reports — `skipped` is not only duplicates

**File:** `src/components/keyword-suggestions-dialog.tsx:173-181`
**Issue:** The success toast branches on `r.skipped > 0` and renders
`` `${r.created} criadas · ${r.skipped} já cadastradas.` ``. But on the server
(`approveKeywordSuggestions`, `category-keywords.ts:200-246`) `skipped` is
incremented for FIVE distinct reasons: bad-uuid categoryId, Zod-invalid keyword,
normalize-to-empty, literal-count-0 (`*`/`**`), AND duplicate / insert error. Telling
the user "N já cadastradas" when those N were actually rejected as invalid/foreign is
misleading — a user who edited a term into something that normalizes empty is told it
already existed. The server cannot distinguish these (intentional: one bucket), but the
copy asserts a specific cause.
**Fix:** Make the toast cause-neutral, e.g.:
```tsx
if (r.skipped > 0) {
  toast.success(`${r.created} criadas · ${r.skipped} ignoradas.`)
}
```
or have the action return separate `duplicate`/`invalid` counts if the distinction
matters to the UX-SPEC.

### WR-02: Edited candidate can target an archived category → keyword created on a hidden category, broken Select label

**File:** `src/components/keyword-suggestions-dialog.tsx:241-267`, `src/actions/category-keywords.ts:166-172`
**Issue:** `getKeywordSuggestions` builds candidates from `merchant_patterns`, whose
`category_id` may point at an **archived** category (patterns are not deleted on
archive; `merchant_patterns` only FK-cascades on category *delete*). The candidate's
`categoryName` is resolved from `nameById`, which is built only from
`is_archived = false` categories (`category-keywords.ts:146-148`), so an archived
pattern yields `categoryName = p.category_id` — the raw UUID is then rendered as the
`CategoryBadge` label in the dialog (`keyword-suggestions-dialog.tsx:251-257`), and the
category `Select` has no matching `SelectItem` (the page passes only active categories,
`page.tsx:99-104`). The user sees a UUID, cannot re-pick cleanly, and approving sends
the archived `categoryId` — which RLS+FK accept, persisting a keyword on a category the
user can no longer see in `/categorias`.
**Fix:** Either exclude suggestions whose `category_id` is not in the active set in
`getKeywordSuggestions`:
```ts
.filter((p) => nameById.has(p.category_id))
.filter((p) => matchKeyword(p.descriptor_norm, rules) === null)
```
or, if archived-category suggestions are desired, surface them with a clear label and a
forced category re-pick before approve.

### WR-03: Inline keyword popover bypasses the literal-count-0 / empty guards client-side — silent no-flip on a confusing path

**File:** `src/components/import-review-table.tsx:1128-1147`
**Issue:** `onSubmit` computes `normalized = normalizeKeyword(value.trim())` purely for
the toast echo, then calls `addKeyword(row.category_id!, value)`. If the user clears the
prefill and types only `*` (or punctuation that normalizes to `''`), `addKeyword`
correctly returns `{ error: '…' }` and the popover stays open with the FieldError — so
no data corruption. That part is sound. The gap: the toast-echo `normalized` is computed
but only consumed in the success/duplicate branches; on the error branch the user sees a
generic server message with no indication that their `*`-only term was the cause, and the
input is not visibly marked. This is a degraded-but-safe path, not a data bug.
**Fix:** Low priority. Consider a client-side pre-check mirroring the action's
`normalized.replace(/\*/g, '') === ''` guard to give an immediate inline message before
the round-trip, or rely on the existing FieldError (acceptable). No correctness risk.

### WR-04: `discard` button is `disabled` during pending but `toggleAll`/per-row state can still drift the approved set

**File:** `src/components/keyword-suggestions-dialog.tsx:159-185`
**Issue:** `onApprove` snapshots `approvedKeys` at call time and, inside the transition,
removes exactly those keys on success (`183`). This is correct. However, while the
transition is pending the checkboxes and term/category inputs are `disabled={isPending}`
but the component does not block a re-entrant `onApprove` beyond the footer button's
`disabled={isPending || ...}`. The footer button guard is sufficient in practice, but
note that `setCategory`/`setTerm` edits made to a NON-selected row during pending are
preserved (good) while the approved snapshot used the pre-edit term — so if a user could
somehow edit a selected row mid-flight the persisted term would diverge from the visible
one. Inputs are disabled during pending, so this is currently unreachable; flagged as a
latent coupling to preserve if the disable is ever relaxed.
**Fix:** Keep the inputs disabled during pending (current behavior). If that constraint
is relaxed, snapshot the full `{ categoryId, keyword }` payload (already done at `165`)
AND guard against editing rows whose keys are in `approvedKeys` until the transition
resolves. No change required today.

## Info

### IN-01: `KeywordInlineSuggest` `value` state never re-syncs if the row's `descriptor_norm` changes

**File:** `src/components/import-review-table.tsx:1110`
**Issue:** `const [value, setValue] = React.useState(row.descriptor_norm)` seeds once.
`descriptor_norm` is effectively immutable for a parsed review row, so this is fine in
practice, but the lazy-init pattern hides the assumption.
**Fix:** None needed; optionally add a comment noting `descriptor_norm` is row-stable.

### IN-02: Dialog `key` is frozen at `toCandidate` time while `categoryId` is editable

**File:** `src/components/keyword-suggestions-dialog.tsx:68-78, 135-142`
**Issue:** `key = ${descriptorNorm}::${categoryId}` is computed once; `setCategory`
mutates `categoryId` without recomputing `key`. Because `merchant_patterns` is unique on
`(user_id, descriptor_norm)` each descriptor appears once, so no key collision can arise
even after a category edit, and the frozen key is still correct for removal-after-approve.
Works, but the key no longer reflects the candidate's current `(descriptorNorm,
categoryId)` — a reader could wrongly assume it does.
**Fix:** None required. If clarity is wanted, key on `descriptorNorm` alone (it is already
unique) to make the invariant explicit.

### IN-03: `getKeywordSuggestions` swallows read errors silently

**File:** `src/actions/category-keywords.ts:138-176`
**Issue:** The three `Promise.all` reads destructure only `data`; their `error` fields are
discarded. A failed read (e.g. transient DB error) yields `?? []`, producing an empty or
partial suggestion feed that the dialog renders as the calm "Nenhuma sugestão por
enquanto" Empty state — indistinguishable from a genuinely empty feed. Not a security
issue (RLS still enforced), but a real failure is presented as success. Mirrors the
swallow pattern called out and fixed for statement-persist in WR-02 of Phase 21.
**Fix:** Check the `error` of each read and return `{ error: 'Não foi possível carregar as
sugestões.' }` on failure so the dialog shows the error toast rather than a false-empty
state:
```ts
const [pRes, kRes, cRes] = await Promise.all([...])
if (pRes.error || kRes.error || cRes.error) {
  return { error: 'Não foi possível carregar as sugestões.' }
}
```

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
