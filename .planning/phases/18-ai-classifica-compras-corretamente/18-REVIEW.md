---
phase: 18-ai-classifica-compras-corretamente
reviewed: 2026-06-19T15:20:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/lib/ai/classify.ts
  - src/lib/classifier/suggest.ts
  - src/actions/import.ts
  - src/lib/ai/classify.test.ts
  - src/lib/classifier/suggest.test.ts
  - tests/pii-guard.test.ts
  - src/actions/import.test.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-06-19T15:20:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 18 (CLSAI-09) adds a kind-aware AI classification prompt plus a defense-in-depth
code gate that nulls any LLM suggestion whose owned category `kind !== 'consumo'`. The
diff is small (30 added lines across 3 source files) and the load-bearing invariants
all hold:

- **Kind gate is correct and ordered right.** `validateSuggestion` (enum gate over
  owned ids) runs FIRST → `gatedId` is either an owned id or `null`; the kind lookup
  `categories.find((c) => c.id === gatedId)?.kind` then admits ONLY `kind === 'consumo'`.
  Both `'alocacao'` and `undefined` (id already nulled by the enum gate, since
  `c.id === null` matches nothing) resolve to `null`. A prompt-injected allocation id
  cannot slip through: a real owned alocação id is enum-passed then kind-nulled; a
  fabricated id is enum-nulled. Confidence is preserved in both null cases (harmless —
  `import.ts` PASS 2 only attaches `row.suggestion` when `categoryId !== null`).
- **Single-descriptor path inherits the gate.** `suggestCategory` delegates to
  `classifyDescriptors([descriptorNorm], …)`; the gate lives inside the batch, so there
  is exactly one gate, no duplicate, no missing path. Confirmed: the only runtime callers
  are `suggestCategory` → batch and `import.ts` → batch; no stale 2-field callers remain.
- **No PII regression (SEC-03 / LGPD).** The new `(kind)` tag emits only the literal
  `consumo` / `alocação` strings — never amount/date/raw descriptor. `pii-guard.test.ts`
  and the `classify` SEC-03 test both stay green. The ASCII enum (`'alocacao'`) drives
  logic; the accented `'alocação'` is display-only — consistent.
- **Output schemas unchanged.** `classifyResultSchema` and `JSON_SCHEMA` are byte-for-byte
  identical to the prior version; `kind` is input context only, never model output. Verified.
- **TS-strict.** `tsc --noEmit` exits 0. `CategoryKind` is imported from
  `@/lib/schemas/category` (not re-declared) in all three files.
- **Tests.** 68/68 pass across the four test files.

The findings below are quality/robustness concerns, not correctness or security defects
in the shipped behavior. There are no BLOCKERs.

## Warnings

### WR-01: Unchecked `as CategoryKind` cast narrows DB `string` without runtime guard

**File:** `src/actions/import.ts:431`
**Issue:** `database.types` types `categories.kind` as `string` (NOT NULL); the new
mapping casts each row with `kind: c.kind as CategoryKind`. The DB CHECK constraint
currently restricts values to `'consumo' | 'alocacao'`, so the cast is sound *today* —
but it is an unverified assertion, exactly the "no `any`/unsafe cast" pattern CLAUDE.md
warns against. If a future migration widens the constraint (e.g. adds a third kind), this
cast silently mislabels that value as `CategoryKind` with no compile-time or runtime
signal. The kind GATE in `classify.ts` is safe-by-default for this (strict
`=== 'consumo'`), so the failure mode is mislabeling in the prompt, not a wrong gate.
**Fix:** Narrow with the existing schema enum instead of asserting, dropping any row
whose kind is not a known member:
```ts
import { CATEGORY_KINDS } from '@/lib/schemas/category'
const isKind = (k: string): k is CategoryKind =>
  (CATEGORY_KINDS as readonly string[]).includes(k)
const categoryList = (categories ?? [])
  .filter((c) => isKind(c.kind))
  .map((c) => ({ id: c.id, name: c.name, kind: c.kind as CategoryKind }))
```

### WR-02: `buildUserText` label ternary diverges from the strict gate for any non-`consumo` kind

**File:** `src/lib/ai/classify.ts:93`
**Issue:** The category line builds its tag as
`c.kind === 'consumo' ? 'consumo' : 'alocação'`. This collapses every non-`consumo`
value to the label `alocação`. The gate at line 141 uses the opposite default
(`kind === 'consumo' ? gatedId : null`). The two are consistent for the two kinds that
exist today, but they encode opposite assumptions: the label treats "unknown" as
allocation, the gate treats "unknown" as reject. Combined with WR-01's cast, a future
third kind would be *labeled* allocation to the model yet *gated* to null — an internal
inconsistency that is hard to reason about. Prefer rendering the kind value directly so
the label can never silently misrepresent an unmodeled kind.
**Fix:**
```ts
.map((c) => `${c.id}: ${c.name} (${c.kind === 'alocacao' ? 'alocação' : c.kind})`)
```
(or render the accented form only for the exact two known members, else fall through to
the raw value), keeping label and gate aligned on an explicit allow-list.

### WR-03: Archived categories egress to the LLM and can be suggested as targets

**File:** `src/actions/import.ts:422-432`
**Issue:** The categories pre-fetch (`from('categories').select('id, name, kind')`) has no
`is_archived = false` filter. Archived categories (hidden from the pickers everywhere else
in the app — see `categories.ts:158-171`) are therefore sent to the model as valid
classification targets and can be returned, enum-gated through (they ARE owned), and
attached as a `row.suggestion`. The user then sees a suggestion pointing at a category the
UI otherwise hides, with no picker entry to confirm it cleanly. This is PRE-EXISTING (the
prior `select('id, name')` also lacked the filter), so it is not a Phase 18 regression —
flagged because the changed query is the natural place to fix it and it degrades
suggestion correctness.
**Fix:**
```ts
const { data: categories } = await supabase
  .from('categories')
  .select('id, name, kind')
  .eq('is_archived', false)
```

## Info

### IN-01: Kind gate does a second linear scan over `categories` per result

**File:** `src/lib/ai/classify.ts:140`
**Issue:** `categories.find((c) => c.id === gatedId)` re-scans the category list for every
result row, after `validateSuggestion` already scanned it to build the enum. For a
personal app with a handful of categories this is negligible (and performance is explicitly
out of v1 review scope), but a `Map<id, kind>` built once before the loop would make the
gate O(1) per result and read more clearly as "resolve the owned id's kind". Optional
clean-up, not a defect.
**Fix:**
```ts
const kindById = new Map(categories.map((c) => [c.id, c.kind]))
// inside the loop:
const categoryId = kindById.get(gatedId ?? '') === 'consumo' ? gatedId : null
```

---

_Reviewed: 2026-06-19T15:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
