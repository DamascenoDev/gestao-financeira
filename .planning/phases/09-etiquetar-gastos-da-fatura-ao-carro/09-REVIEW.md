---
phase: 09-etiquetar-gastos-da-fatura-ao-carro
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/lib/schemas/transaction.ts
  - src/actions/transactions.ts
  - src/actions/transactions.test.ts
  - src/lib/schemas/import.ts
  - src/actions/import.ts
  - src/actions/import.test.ts
  - src/components/carro-picker.tsx
  - src/components/transacao-form.tsx
  - src/components/extrato-table.tsx
  - src/components/selection-action-bar.tsx
  - src/components/import-review-table.tsx
  - src/app/(app)/extrato/page.tsx
  - src/app/(app)/importar/[statementId]/page.tsx
  - tests/carro-tag-nondestructive.test.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 9 adds an additive, non-destructive carro tag (`transactions.carro_id`) across the single-edit, bulk, and import-confirm paths. The security posture is strong: the IDOR re-derive (`assertOwnedCarro`) is correctly placed before every `carro_id` write on all four server paths (`createTransactionWithReserva`, `updateTransaction`, `bulkTagCarro`, `confirmImport`), the tri-state WR-04 handling is consistent, the bulk path is a single `.in('id', ids)` UPDATE scoped by RLS, the `__nenhum__`/`__none__` sentinels are correctly decoded to null and never persisted, the D4 invariant is proven at the DB level by the integration test, and `bulkTagCarro` writes a `carro_id`-only payload so no metas aggregate can move. The result shape `{ ok } | { error }` is honored throughout (no throws escape the boundary).

However, the **row-action edit path violates CAR-02 for the most important rows**: it re-sends the row's existing fields through `updateTransaction`, but it conditionally omits `categoryId` when the transaction is uncategorized, which makes the schema reject the carro-tag write entirely. Freshly imported, unclassified expenses (exactly the fuel/maintenance rows a user wants to tag to a car) cannot be tagged from the extrato row menu. This is the load-bearing weight-1 concern (D4 row-action path) failing in practice — classified as a BLOCKER. A related Reserva-category variant of the same root cause is flagged as a WARNING.

## Critical Issues

### CR-01: Row-menu "Vincular a carro" silently fails for uncategorized transactions

**File:** `src/components/extrato-table.tsx:267-286` (and the schema at `src/lib/schemas/transaction.ts:12`)

**Issue:** `RowActions.confirm()` builds the FormData re-sending the row's real fields so that `updateTransaction`'s `transactionSchema` validates on a carro-only change. But `categoryId` is set conditionally:

```ts
if (row.category_id) fd.set('categoryId', row.category_id)
```

`transactionSchema.categoryId` is a **required** `z.string().uuid('Selecione uma categoria')` (transaction.ts:12). When `row.category_id === null` — which is the normal state for an imported-but-unclassified expense (`confirmImport` persists `category_id: null` for memory-miss rows, import.ts:649) — the FormData has no `categoryId`, so `updateTransaction` returns `{ error: 'Selecione uma categoria' }` (transactions.ts:240-242) and **no carro tag is ever written**. The user sees an error toast about a category when they were only trying to attach a car.

This breaks the phase's core deliverable for precisely the rows that most need tagging: a just-imported fuel/parking/maintenance line that the user hasn't categorized yet. The integration test only exercises the raw DB UPDATE (which has no category requirement), and the action test only covers `updateTransaction` with a `categoryId` always present — so neither catches this.

**Fix:** Make the carro tag path independent of category, mirroring how the carro tag itself is treated as category-free. Cleanest option is a dedicated server action for the single-row carro tag that writes only `carro_id` after `assertOwnedCarro` (symmetric with `bulkTagCarro` but for one id), so it never re-validates unrelated accounting fields:

```ts
// transactions.ts — new action, carro-only, category-free
export async function tagCarro(
  id: string,
  carroId: string | null,
): Promise<ActionResult> {
  return bulkTagCarro([id], carroId) // single-id reuse: same RLS + ownership path
}
```

```ts
// extrato-table.tsx RowActions.confirm()
const carro = carroId === '' ? null : carroId
startTransition(async () => {
  const result = await tagCarro(row.id, carro)
  // …toast as before
})
```

This also strengthens D4 (the row tag can no longer perturb description/amount/date even by accident, since they are never re-sent) and removes the `centsToEditableBRL → parseBRLToCents` round-trip risk noted in WR-02.

## Warnings

### WR-01: Row-menu "Vincular a carro" also fails for Reserva-category transactions

**File:** `src/components/extrato-table.tsx:267-286`

**Issue:** Same root cause as CR-01, different trigger. When the row's category IS a Reserva category, `RowActions.confirm()` re-sends `categoryId` (the reserva category) but never sends `reservaId`. `updateTransaction` reaches the `isReservaCategory` branch (transactions.ts:272-277) and returns `{ error: 'Selecione uma reserva.' }`, so the carro tag is rejected. A user cannot tag a Reserva-classified expense to a car from the row menu, and the error message is misleading (it asks for a reserva when nothing about the reserva changed). The dedicated carro-only action proposed in CR-01 fixes this too.

**Fix:** Adopt the CR-01 fix (a `carro_id`-only `tagCarro` action). If the row-action path must keep routing through `updateTransaction`, it would additionally need to re-send the existing `reservaId`, which the row does not currently carry — another reason to prefer the dedicated action.

### WR-02: Row-action carro tag round-trips money through string parse, risking a spurious money error

**File:** `src/components/extrato-table.tsx:272`

**Issue:** `RowActions.confirm()` sets `fd.set('amount', centsToEditableBRL(row.amount_cents))`, and `updateTransaction` re-parses it via `parseBRLToCents`, which **throws on zero or negative cents** (money.ts:34, `cents <= 0`). A carro tag is meant to be non-destructive, yet it forces the amount through a parser that rejects an amount of 0. While `amount_cents > 0` is a DB invariant today, coupling a pure carro-tag write to money re-validation is fragile and contradicts D4's "never re-touch accounting fields" intent. Any row whose amount ever fails the round-trip (encoding edge, future zero-allowed kind) would have its carro tag silently blocked. The CR-01 dedicated action removes this coupling entirely.

**Fix:** Use the `carro_id`-only `tagCarro` action (CR-01) so the amount is never re-sent or re-parsed on a tag.

### WR-03: `confirmImport` carro ownership errors are not de-duplicated against repeated reads

**File:** `src/actions/import.ts:564-570`

**Issue:** The carro ownership re-derive loops `for (const carroId of carroIds)` and calls `assertOwnedCarro` once per unique carro id — correct for ownership. But note the asymmetry with reservas: this is fine functionally. The real concern is that a transient `'error'` from `assertOwnedCarro` on ANY single carro id aborts the WHOLE confirm with a retry message even when other carros are owned — acceptable fail-safe behavior, but the user gets no indication which tag failed. This is a minor robustness/UX gap, not a correctness defect; the whole-payload rejection is the documented and desired IDOR behavior.

**Fix:** Acceptable as-is for v1. If desired, surface the count of distinct carros being validated or batch the ownership check into one `.in('id', carroIds)` read (mirroring `assertOwnedCategories`) to reduce N serial round-trips and make the failure atomic rather than first-error-wins.

### WR-04: Two divergent "Nenhum" sentinels for the same concept

**File:** `src/components/carro-picker.tsx:25` (`__none__`), `src/components/selection-action-bar.tsx:20` (`__none__`), `src/components/import-review-table.tsx:88` (`__nenhum__`)

**Issue:** The carro "clear" sentinel is `__none__` in `CarroPicker` and `SelectionActionBar`, but `__nenhum__` in `ImportReviewTable`'s local `InlineReviewCarroCell`. Both decode correctly to null within their own files, so there is no persisted-value bug today (verified: each `onChange` maps its own sentinel back to null/`''`). But two literals for one concept is a latent footgun — a future refactor that shares a value or copies a handler across these files could mismatch the sentinel and silently persist the literal string as a (non-UUID) carro id, which the server would then reject as `'Carro inválido.'`. The divergence is also explicitly intentional per the file-disjoint Plan 02/03 split, so this is a maintainability note, not a defect.

**Fix:** Once the parallel-plan constraint is lifted, hoist a single shared `CARRO_NONE` constant (e.g. into a small `lib/carro.ts`) and import it in all three sites so the sentinel cannot drift.

## Info

### IN-01: Duplicated `CarroOption` type instead of a shared import

**File:** `src/components/import-review-table.tsx:85` vs `src/components/carro-picker.tsx:19`

**Issue:** `ImportReviewTable` redefines `export type CarroOption = { id: string; apelido: string }` locally rather than importing from `carro-picker.tsx`, by deliberate Plan 02/03 file-disjointness. Harmless now; consolidate later for a single source of truth.

**Fix:** After the parallel-plan window, import `CarroOption` from `carro-picker.tsx` everywhere.

### IN-02: `confirmImport` re-reads `isReservaCategory` per row twice

**File:** `src/actions/import.ts:615-623` and `691-710`

**Issue:** `isReservaCategory(supabase, r.categoryId)` is queried once in the WR-03 precondition loop and again in the aporte-insert loop for the same category ids. Out of v1 perf scope, but a small redundant-query smell; a `Set<string>` of reserva category ids computed once would remove the duplicate reads and keep the two loops consistent.

**Fix:** Compute the reserva-category set once (e.g. reuse the owned-category list with an `is_reserva` select) and test membership in both loops.

### IN-03: `decodeCarroId` cannot represent "no change"; create/update always write `carro_id`

**File:** `src/actions/transactions.ts:58-61`

**Issue:** `decodeCarroId` collapses both "absent" and "empty string" to null, so any `updateTransaction` call that omits `carroId` will still write `carro_id: null` and clear an existing tag. The schema comment (transaction.ts:16-17) says "absent / undefined means no change to carro on this path," but the action does not honor that — it always sets `carro_id` in the UPDATE payload. Today every caller (`TransacaoForm`, `RowActions`) always sends `carroId`, so there is no live bug, but the action's behavior contradicts its documented contract and is a trap for a future caller that edits a transaction without resending the carro field (it would silently untag).

**Fix:** Either document that callers MUST always send `carroId` on the edit path, or make `updateTransaction` omit `carro_id` from the payload when `formData.get('carroId')` is entirely absent (distinguish missing key from empty string) to match the schema's stated "no change" semantics.

### IN-04: `applyBulkCarro` toast pluralization can mislabel a partial RLS result

**File:** `src/components/extrato-table.tsx:498-511`

**Issue:** The success toast reports `n = selectedIds.length` vinculadas, but `bulkTagCarro`'s RLS-scoped UPDATE may touch fewer rows than `n` if some selected ids are not the caller's (forged/stale selection). The toast would then overstate how many rows were tagged. Low impact for a single-user app where the selection always reflects own rows, but the count is not authoritative. (Same pattern exists for `applyBulk`/`bulkReclassify`, pre-existing.)

**Fix:** Return the affected-row count from `bulkTagCarro` (e.g. `.select('id')` on the update) and report that, or soften the copy to not assert an exact count.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
