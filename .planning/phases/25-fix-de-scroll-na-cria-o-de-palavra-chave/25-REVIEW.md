---
phase: 25-fix-de-scroll-na-cria-o-de-palavra-chave
reviewed: 2026-06-21T17:57:42Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/actions/category-keywords.ts
  - src/actions/category-keywords.test.ts
  - src/components/import-review-table.tsx
  - src/components/import-review-table.test.tsx
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-06-21T17:57:42Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Adversarial review of the scroll-jump fix (Plan 25-01 helper extraction +
`addKeywordInline`; Plan 25-02 inline caller swap + live `reclassifyRowsWithKeyword`).

I verified the load-bearing claims by diffing against `543a229^`:

- **Helper parity (BLOCKER-class concern) — PASS.** The original `addKeyword`
  body was moved into the private `insertKeyword` verbatim: same four guards in
  the same order, same pt-BR messages, the `getClaims()` owner gate, the
  `maybeSingle` duplicate pre-check, the `insert`, and the `23505` race
  backstop are byte-identical. The only change is `revalidatePath` lifted out
  into `addKeyword`'s `'ok' in result` branch.
- **Revalidate scoping — PASS.** `addKeyword` revalidates `/categorias` ONLY on
  `{ok}`, matching the original (where `duplicate`/`error` returned before the
  revalidate call). `addKeywordInline` never revalidates. The `/categorias`
  refresh contract is preserved; `approveKeywordSuggestions` and `removeKeyword`
  still revalidate. Verified by the SC1-vs-SC3 contrast test.
- **Override policy — PASS.** `reclassifyRowsWithKeyword` returns `origin ===
  'manual'` rows by the SAME reference before any match (explicit user intent
  never overridden), targets only `category_id === null` / `memória` /
  `palavra-chave`, sets matched rows to `origin: 'palavra-chave'` with no
  `confidence`, leaves `suggestion` intact, and no-ops on a degenerate
  (`compileRule === null`) keyword. Pure, returns a new array, preserves
  referential identity for untouched rows.
- **RLS / owner gate — PASS.** `user_id` always comes from
  `getClaims().claims.sub`, never the client; `idSchema` uuid guard intact;
  `confirmImport` re-checks category ownership (`assertOwnedCategories`) at
  persist, so the client-side reclassify cannot escalate into a foreign
  category.
- **Normalized-key consistency — PASS.** The client passes `normalizeKeyword(
  value.trim())` to `onPersisted`, which equals the server-stored keyword
  (`keywordSchema` trims, then `normalizeKeyword`), so the reclassify match key
  agrees with the persisted keyword.

All 78 tests in the two suites pass. No blockers found. Remaining findings are a
client-side specificity divergence and minor quality items.

## Warnings

### WR-01: Live reclassify uses single-rule matching, diverging from the upload pipeline's most-specific-wins precedence

**File:** `src/components/import-review-table.tsx:322-339`
**Issue:** `reclassifyRowsWithKeyword` compiles ONLY the newly-created keyword
into a single rule and applies it to every eligible row (`category_id === null`
OR `origin ∈ {memória, palavra-chave}`). This is NOT how `matchKeyword` works in
the upload pipeline, which evaluates the FULL rule set with most-specific-wins
(higher literal-count, substring-over-glob, lower sort, lower categoryId). A row
that is already `origin: 'palavra-chave'` because a longer/more-specific keyword
matched it earlier will be silently re-pointed to the new (possibly less
specific) keyword's category in client state. Example: a row classified by
existing keyword `uber eats` (literals 8) gets re-pointed if the user now adds
the shorter `uber` (literals 4) to a different category — the upload matcher
would keep `uber eats` as the winner, but the inline reclassify overrides it.
Data impact is bounded because `confirmImport` persists the client `category_id`
verbatim (after an owner re-check), so the divergent client state is what
actually lands — it does not silently disagree with what the user sees, but it
DOES disagree with the deterministic matcher the rest of the app trusts.
**Fix:** Re-run the full rule set for the affected rows instead of the single new
rule. Either thread the current keyword set into the reclassify, or restrict the
override to rows that the new rule wins under `matchKeyword`'s precedence — e.g.
collect all in-state rules (existing keywords + the new one) and call
`matchKeyword(r.descriptor_norm, allRules)` per row, only re-pointing when the
result is the new rule's category. At minimum, document that the inline reclassify
intentionally last-write-wins on `palavra-chave` rows and add a test pinning the
chosen behavior for the "shorter keyword added after a longer one" case (no test
currently covers competing keywords).

### WR-02: Reclassified rows can leave the `onlyUnclassified` filter mid-interaction with no feedback

**File:** `src/components/import-review-table.tsx:528-537`, `417-424`
**Issue:** When the "Mostrando apenas não classificadas" filter is active
(`onlyUnclassified === true`), `visibleRows` shows only `category_id === null`
rows. A live reclassify after an inline keyword persist flips matching
unclassified rows to a non-null `category_id`, so they vanish from the filtered
view immediately on save. The toast says `"… adicionada a {categoria}"` but the
rows that just disappeared from the visible list are not called out, which can
read as rows being deleted rather than classified. This is a UX robustness gap,
not a data bug (the rows remain in `rows` state and in the confirm payload).
**Fix:** Acceptable to leave as-is if intended, but consider surfacing how many
rows were reclassified (e.g. extend the success toast with a count, mirroring the
bulk-apply toast `applyAllSuggestions` already emits), so the disappearance from
the filtered view is explained. Add a test for the filter-active reclassify path
to lock whichever behavior is chosen.

## Info

### IN-01: `onPersisted` fires on the duplicate path, triggering a full-grid map even when nothing new was learned

**File:** `src/components/import-review-table.tsx:1236-1247`
**Issue:** On `{ duplicate: true }` the control still calls `onPersisted(...)`,
which runs `reclassifyRowsWithKeyword` over every row. This is intentional and
documented ("the keyword exists either way"), and is the correct behavior for
making the grid consistent. Noting only that it is an unconditional O(rows) pass
on a no-op-ish branch. Not in scope to optimize (performance is out of v1 scope)
and correctness is fine — recorded for awareness.
**Fix:** None required.

### IN-02: `value.trim()` is normalized twice for the toast/persist vs the action

**File:** `src/components/import-review-table.tsx:1226`, `1230`, `1246`
**Issue:** `onSubmit` computes `normalized = normalizeKeyword(value.trim())` for
the toast and `onPersisted`, while separately passing the raw `value` to
`addKeywordInline`, which re-trims (`keywordSchema`) and re-normalizes
server-side. The two normalizations agree (verified: `normalizeKeyword` is
idempotent over its own trim/collapse and `keywordSchema.trim()` matches
`value.trim()`), so there is no drift. Slight duplication of the normalize call
on the client vs server; harmless and arguably the documented intent (echo the
display key without trusting the client to compute the stored key).
**Fix:** None required; optionally add a one-line comment that the client
`normalized` is display/match-only and the server is the source of truth for the
stored value (the surrounding JSDoc already implies this).

### IN-03: `reclassifyRowsWithKeyword` rebuilds the rule and re-checks `manual` order; comment vs code ordering is fine but worth a guard test

**File:** `src/components/import-review-table.tsx:329-338`
**Issue:** The function checks `r.origin === 'manual'` BEFORE the `isTarget`
computation, which is correct (manual is excluded even though a manual row also
fails the `isTarget` test, because a manual row has a non-null `category_id` and
a non-`memória`/`palavra-chave` origin). The guard is therefore redundant with
`isTarget` for the current `origin` union — a `manual` row is already not a
target. The explicit early-return is defensible as intent-documentation and is
covered by the "NEVER touches a manual row" test, but the redundancy means a
future change to the `isTarget` set (e.g. adding `manual` to targets) would be
silently neutralized by this earlier guard.
**Fix:** None required. If the explicit `manual` skip is meant as the single
source of truth for the override policy, keep it and leave `isTarget` as the
positive filter — the current arrangement is correct.

---

_Reviewed: 2026-06-21T17:57:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
