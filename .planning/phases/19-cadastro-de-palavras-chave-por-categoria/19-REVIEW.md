---
phase: 19-cadastro-de-palavras-chave-por-categoria
reviewed: 2026-06-19T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - supabase/migrations/0036_category_keywords.sql
  - src/lib/schemas/category-keyword.ts
  - src/actions/category-keywords.ts
  - src/actions/category-keywords.test.ts
  - src/components/category-keywords-dialog.tsx
  - src/components/category-keywords-dialog.test.tsx
  - src/components/category-row-actions.tsx
  - src/app/(app)/categorias/page.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-06-19
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 19 (KW-01 + KW-06) adds a per-category keyword cadastro: a new RLS table, two server actions (`addKeyword`/`removeKeyword`), a controlled dialog, and the RSC grouped fetch on the Categorias page.

The PRIMARY security invariant (KW-06) holds. The `category_keywords` migration uses the exact uniform RLS shape as `0002_categories.sql` / `0021_merchant_patterns.sql`: RLS enabled, a single `for all to authenticated` "own" policy carrying BOTH `using` and `with check ((select auth.uid()) = user_id)`, plus matching grants. `addKeyword` sets `user_id` from `getClaims().claims.sub` (never client input), and `removeKeyword` relies on RLS to scope the `.eq('id', …)` delete — no service-role/admin client is used, so there is no IDOR. The WR-06 uuid guard fires before the DB on both id args. Normalization is correct: `normalizeDescriptor` is called exactly once on the insert path, the empty-after-normalize case is handled, and the duplicate path is a friendly no-op with a 23505 backstop that never leaks a raw DB error. No `any`, no hardcoded secrets, no injection surface.

The findings below are correctness/UX defects and quality nits — none are blockers.

## Warnings

### WR-01: Duplicate (and validation) toast shows the RAW input, not the normalized keyword that is actually stored/displayed

**File:** `src/components/category-keywords-dialog.tsx:88` (and `:76`)
**Issue:** The dialog submits `raw = value.trim()` and, on `{ duplicate: true }`, toasts ``"${raw}" já está cadastrada nesta categoria.`` But the server stores and the chips display `normalizeDescriptor(raw)`, which can differ substantially from `raw`. Example: the user types `Uber *TRIP` (normalizes to `uber trip`). If `uber trip` already exists, the chip shows `uber trip` but the toast claims `"Uber *TRIP"` is already registered — referencing a string that appears nowhere in the list. This is confusing and undermines the "memory-first, consistent key space" contract that KW-01 exists to make legible. The same mismatch affects the success case implicitly (user types `Uber *TRIP`, a chip named `uber trip` appears).
**Fix:** Either surface the normalized value in the toast, or have the action return the normalized keyword so the UI can echo it:
```ts
// action: return the canonical term
export type AddKeywordResult =
  | { ok: true; keyword: string }
  | { duplicate: true; keyword: string }
  | { error: string }
// ...
if (existing) return { duplicate: true, keyword: normalized }
// ...
return { ok: true, keyword: normalized }
```
```tsx
// dialog
if ('duplicate' in r) {
  toast.info(`"${r.keyword}" já está cadastrada nesta categoria.`)
  return
}
```

### WR-02: `maxLength={60}` is enforced on the RAW input, but the stored/normalized value can silently differ from what the user sees in the field

**File:** `src/components/category-keywords-dialog.tsx:150`; `src/lib/schemas/category-keyword.ts:13-17`
**Issue:** The schema (`max(60)`) and the input's `maxLength={60}` both bound the RAW string. After `normalizeDescriptor`, the stored term is a different string (segment-split on 2+ spaces, accent-stripped, payment tokens dropped, etc.). A user can type a 60-char descriptor and have only its first whitespace-gap segment persisted — silently dropping the city/UF tail. That is the intended normalization behavior, but the UI gives no signal that the saved term differs from the typed term, so a user pasting a full descriptor (`PADARIA SAO JOAO  SAO PAULO BR`) gets a chip reading only `padaria sao joao` with no explanation. Combined with WR-01, the add flow can feel like it "ate" the input.
**Fix:** Lowest-effort: keep behavior but make it legible by echoing the normalized term in the success toast (see WR-01 fix). If product wants stricter input, validate/preview the normalized form before submit so the chip never surprises the user.

### WR-03: Removing a keyword does not clear a stale inline validation error or pending add-field state

**File:** `src/components/category-keywords-dialog.tsx:64-70`
**Issue:** `handleRemove` and `onSubmit` share the same `isPending` from a single `useTransition`. If an add fails validation (`setError(...)` at :76) and the user then clicks a chip's X, the remove proceeds but the stale red `error` on the add field remains rendered (`data-invalid` / `aria-invalid` stay true) because `handleRemove` never resets `error`. The field looks broken even though the remove succeeded. Minor, but it is an incorrect UI state.
**Fix:** Clear transient add-field error at the start of `handleRemove`:
```ts
function handleRemove(kw: CategoryKeyword) {
  setError(null)
  startTransition(async () => { /* ... */ })
}
```

## Info

### IN-01: Removed keyword does not clear the add input on related actions; success path is fine but error path leaves stale value

**File:** `src/components/category-keywords-dialog.tsx:82-90`
**Issue:** On `{ error }` or `{ duplicate }`, `value` is intentionally retained (reasonable — lets the user fix/resubmit). This is acceptable, noted only for completeness: there is no auto-reset of `value`/`error` when the dialog re-opens for a different category, since the component is not remounted per category (it lives in `CategoryRowActions` and is controlled by `keywordsOpen`). If a user types into category A's dialog, closes without submitting, then opens category B's dialog, the half-typed value persists across categories.
**Fix (optional):** Reset `value`/`error` on close, e.g. wrap `onOpenChange` to clear state when `open` goes false, or key the dialog by `category.id`.

### IN-02: Page-level keyword fetch has no upper bound and no per-category ordering tiebreaker beyond `keyword`

**File:** `src/app/(app)/categorias/page.tsx:60-63`
**Issue:** The `category_keywords` select orders only by `keyword` ascending with no limit. For a single-user personal app this is fine, but the grouping `Map` build assumes the whole table fits in one response (Supabase default cap is 1000 rows). Not a correctness bug at expected scale; flagged so it is a conscious choice. Note: performance is explicitly out of v1 review scope — this is about silent truncation correctness, not speed.
**Fix (optional):** None required at current scale. If keyword volume ever grows, fetch per visible category or paginate.

### IN-03: `ActionResult` type is exported but unused by `addKeyword` (which uses `AddKeywordResult`)

**File:** `src/actions/category-keywords.ts:27`
**Issue:** `ActionResult` is the return type of `removeKeyword` only; `addKeyword` uses `AddKeywordResult`. Both are exported from a `'use server'` module. Type-only exports are erased and are legal here (no async-export violation), so this is purely a tidiness note — the dual result types are intentional and mirror `categories.ts`.
**Fix:** None required. Consider a short comment clarifying which action uses which result type (already partially covered by the file header).

---

_Reviewed: 2026-06-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
