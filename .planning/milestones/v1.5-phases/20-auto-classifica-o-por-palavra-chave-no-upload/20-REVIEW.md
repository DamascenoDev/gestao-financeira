---
phase: 20-auto-classifica-o-por-palavra-chave-no-upload
reviewed: 2026-06-19T17:35:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/lib/classifier/keywords.ts
  - src/lib/classifier/keywords.test.ts
  - src/actions/import.ts
  - src/lib/parsers/types.ts
  - src/app/(app)/importar/[statementId]/page.tsx
  - src/components/import-review-table.tsx
  - src/components/import-review-table.test.tsx
  - src/components/origin-badge.tsx
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: resolved
resolution: "WR-01 fixed (6697a10) + WR-02 documented; IN-01/02 noted, IN-03 closed by the WR-01 collision test"
---

> **Resolution (2026-06-19, commit `6697a10`):**
> - **WR-01 — FIXED**: `matchKeyword` gained a final stable tie-break on `categoryId`, so a same-keyword/same-`sort` collision across two categories resolves deterministically regardless of fetch/row order (no silent flip between uploads). New order-independence test added (closes **IN-03**, which noted the missing collision test). A defensive `.order()` on the fetch was dropped as redundant (the matcher is the single source of determinism; the test mock's select chain has no `.order()`).
> - **WR-02 — DOCUMENTED (intentional)**: `confirmImport` persists `classification_source` as the coarse `'memória'` for any classified row — the `transactions` CHECK (migration `0020`) doesn't permit `'palavra-chave'`. This pre-dates Phase 20 (already labels manual picks `'memória'`); `'palavra-chave'` is a review-time badge signal; widening the persisted enum is an out-of-scope migration + PROD push. KW-05 confirm-learn is unaffected (category-gated). Added an explicit code comment.
> - **IN-01** (unconditional keyword fetch) / **IN-02** (`categories(sort)` embed cardinality, masked by `?? 0`) — noted, negligible for this app; not changed.
> tsc clean; keywords + import + grid suites 66/66 green. All domain invariants (pipeline ordering, binding pre-fill, RLS, badge, confirmImport unchanged) verified correct by the reviewer.

# Phase 20: Code Review Report

**Reviewed:** 2026-06-19T17:35:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 20 inserts a deterministic keyword-matching pass (KW-02/03/04) between the
memory lookup and the AI batch in the upload pipeline, plus a `palavra-chave`
provenance badge (KW-05). I reviewed all 8 changed source files at standard depth,
cross-checked the embedded-join type against the generated `database.types.ts`, the
RLS migration (`0036`), and the `transactions.classification_source` CHECK
constraint (`0020`), and ran the typecheck + the three touched test suites.

**Verification performed:**
- `npx tsc --noEmit` → **0 errors** (TS-strict soundness holds, including the
  `k.categories?.sort` embed access and the union edits).
- `vitest run` on `keywords.test.ts`, `import.test.ts`, `import-review-table.test.tsx`
  → **65/65 pass**.

**Domain-invariant verdict (all PASS):**
- **Pipeline ordering (KW-03):** `matchKeyword` runs ONLY inside the memory-miss
  `else` (import.ts:491-504) → a memory hit always prevails and is never overwritten.
  A keyword hit sets `category_id` + `source='palavra-chave'` and is EXCLUDED from
  `missNorms` (the `else` branch only adds on a keyword miss, lines 500-503), so a
  keyword row never reaches the AI batch. Confirmed end-to-end by the new
  import.test.ts cases ("ordering memória>keyword>IA", "memória prevalece").
- **matchKeyword (KW-02/04):** substring `.includes` on already-normalized strings,
  longest-wins, tie→lower `sort`, `''` descriptor guard (line 36) AND `''` rule guard
  (line 39) both present. Logic is correct for the common case.
- **Binding + category-only:** a keyword hit sets `category_id` + source, leaves
  `reserva_id` null (import.ts:496-499) — binding pre-fill, not a non-binding
  suggestion. Correct.
- **KW-05 / confirmImport unchanged:** the git diff confirms `confirmImport` was NOT
  modified this phase. The category-gated learn loop still learns merchant→category
  for any classified row; no auto-commit before confirm; the Select flip → origin
  'manual' path (classifyRow, import-review-table.tsx:344-360) is intact.
- **page.tsx origin derivation:** reads `classification_source` (not just
  `category_id`) — a keyword row maps to `'palavra-chave'`, a memory row to
  `'memória'` (page.tsx:208-213). Correct.
- **RLS:** the `category_keywords` fetch (import.ts:444-446) runs under the caller's
  RLS session with NO app-layer `user_id` filter; migration 0036 enforces
  `auth.uid() = user_id` for all ops. Correct and secure.
- **Badge:** `palavra-chave` uses the neutral `bg-muted` token (NOT the gold IA
  `bg-primary` accent) with a distinct `Tags` icon (vs `Brain` for memória) and an
  always-present text label (origin-badge.tsx:35-39). Correct.

No Critical findings. Two Warnings (one determinism edge, one provenance-loss
behavior worth a deliberate confirm), three Info items.

## Warnings

### WR-01: matchKeyword tie-break is non-deterministic when two same-keyword rules share `sort`

**File:** `src/lib/classifier/keywords.ts:41-47`, `src/actions/import.ts:444-446`
**Issue:** The tie-break `rule.keyword.length === best.keyword.length && rule.sort < best.sort` is only deterministic when the two competing rules have **distinct** `sort` values. The DB allows two **different categories** to carry the **same keyword** (the unique constraint is `(user_id, category_id, keyword)` — migration 0036:16, NOT unique on keyword alone), and `categories.sort` has `default 0` with **no uniqueness constraint** (migration 0002:15). So a user who puts keyword `"uber"` on two categories that both have `sort = 0` produces an equal-length, equal-sort tie. In that case `rule.sort < best.sort` is false, `best` is never replaced, and the winner is whichever row the `category_keywords` query returned first. The query has no `ORDER BY`, so Postgres row order is unspecified — the classification of that descriptor can silently flip between uploads. This is the "deterministic" promise in the file header (lines 16-17, 29-30) not actually holding at the `sort`-collision boundary.
**Fix:** Add a final stable tie-break on a value that is unique among the rules (e.g. `categoryId`) so the outcome is reproducible regardless of DB row order:
```ts
if (
  best === null ||
  rule.keyword.length > best.keyword.length ||
  (rule.keyword.length === best.keyword.length && rule.sort < best.sort) ||
  (rule.keyword.length === best.keyword.length &&
    rule.sort === best.sort &&
    rule.categoryId < best.categoryId)
) {
  best = rule
}
```
Optionally also append `.order('category_id')` (or order by `categories(sort)`) on the fetch so the input order is itself stable. Either alone closes the gap; doing both is belt-and-suspenders. Add a unit case to `keywords.test.ts` with two same-keyword, same-`sort` rules asserting a fixed winner.

### WR-02: keyword provenance is silently rewritten to `'memória'` on confirm

**File:** `src/actions/import.ts:818`
**Issue:** `confirmImport` was (correctly, per KW-05) left unchanged, but its persist payload hardcodes `classification_source: r.categoryId ? 'memória' : null`. A row classified by the keyword layer (`'palavra-chave'` in the review grid) is therefore persisted into `transactions` as `'memória'`. This is partly forced by the `transactions.classification_source` CHECK constraint (migration 0020:25-27), which only permits `'memória' | 'manual' | 'sugerida' | null` and would REJECT a literal `'palavra-chave'` with a 23514. So the current code does not crash — but the provenance distinction the badge worked to surface in review is lost the moment the row lands, and a keyword-derived transaction is indistinguishable from a memory-derived one in `/extrato`. Whether that is acceptable is a product call; flagging it because the phase introduced a new provenance value that the persistence layer cannot represent, and the relabel is implicit (no comment at line 818 acknowledges the keyword case).
**Fix:** Decide explicitly. If keyword provenance should survive persist: widen the CHECK to include `'palavra-chave'` (new migration) and set `classification_source` from the authoritative `r.base.classification_source` instead of the hardcoded ternary. If the relabel is intentional (keyword hits are "owned/deterministic like memória"), leave the code but add a one-line comment at import.ts:818 stating that `'palavra-chave'` collapses to `'memória'` on persist by design, so a future reader does not file it as a bug. At minimum, do NOT leave it implicit.

## Info

### IN-01: `keywordRules` is fetched even when there are zero raw rows / zero keywords

**File:** `src/actions/import.ts:444-452`
**Issue:** The `category_keywords` fetch always runs, even when `rawRows` is empty (e.g. a text-present 0-row PDF parse) or the user has no keyword rules. It is one batched query (not the N-query anti-pattern, correctly), so the cost is negligible, but the fetch is unconditional. Minor.
**Fix:** Optional micro-optimization — guard with `if (rawRows.length > 0)` alongside the existing dedupe-key block, or accept as-is (the query is cheap and keeps the code linear). No action required.

### IN-02: PostgREST embed `categories(sort)` typed as object — verified, but fragile to a relationship-cardinality change

**File:** `src/actions/import.ts:446-451`
**Issue:** `k.categories?.sort` relies on the generated types resolving the `categories(sort)` embed to a single object (`{ sort: number } | null`) rather than an array. The typecheck passes today because the FK is a to-one relationship. If the `category_keywords_category_id_fkey` relationship metadata is ever regenerated as one-to-many (or the embed alias changes), `k.categories` would type as an array and `?.sort` would silently become `undefined`, falling through to `?? 0` and quietly breaking all tie-breaks (everything sorts as 0). The `?? 0` is a reasonable strict-null guard but also masks this failure mode.
**Fix:** No change needed now (types are correct). Note for future: the `npm run gen:types` regeneration after any migration touching this FK should be re-typechecked; the `?? 0` fallback will hide a cardinality regression rather than surface it.

### IN-03: test fixture omits the same-keyword/same-sort collision (the WR-01 gap)

**File:** `src/lib/classifier/keywords.test.ts:32-43`
**Issue:** The tie-break test (`equal-length tie → lower categories.sort wins`) uses two rules with **distinct** sorts (2 and 1), so it never exercises the equal-length **and** equal-sort case that WR-01 describes. The suite asserts determinism it does not actually prove at the true boundary.
**Fix:** Add a case with `[{ keyword: 'pao', sort: 0, categoryId: 'a' }, { keyword: 'pao', sort: 0, categoryId: 'b' }]` and assert a single fixed winner — which will fail until WR-01's final tie-break is added, then pin it.

---

_Reviewed: 2026-06-19T17:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
