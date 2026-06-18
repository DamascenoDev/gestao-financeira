---
phase: 09-etiquetar-gastos-da-fatura-ao-carro
fixed_at: 2026-06-17T14:39:00Z
review_path: .planning/phases/09-etiquetar-gastos-da-fatura-ao-carro/09-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 1
status: all_fixed
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-06-17T14:39:00Z
**Source review:** .planning/phases/09-etiquetar-gastos-da-fatura-ao-carro/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical_warning): 4 (CR-01, WR-01, WR-02, WR-04)
- Fixed: 4
- Skipped: 1 (WR-03 — reviewer-acknowledged "acceptable as-is for v1")

WR-03 is in the critical_warning scope band but the reviewer explicitly classified it
as "Acceptable as-is for v1 ... a minor robustness/UX gap, not a correctness defect."
The proposed change (batch the carro ownership check into one `.in()` read) is a
non-blocking optimization that does not affect correctness or security, so it is left
for a later pass and documented under Skipped.

## Fixed Issues

### CR-01 / WR-01 / WR-02: Row-menu "Vincular a carro" routed through a category-free action

**Files modified:** `src/actions/transactions.ts`, `src/components/extrato-table.tsx`, `src/actions/transactions.test.ts`
**Commit:** e966be3
**Applied fix:** These three findings share one root cause — the extrato row-menu carro
tag re-sent the row's accounting fields through `updateTransaction`, which re-validates
`categoryId` (rejecting `category_id === null` imported rows with "Selecione uma
categoria" — CR-01), re-validates `reservaId` for Reserva-category rows ("Selecione uma
reserva." — WR-01), and re-parses the amount through `parseBRLToCents` (which throws on
`cents <= 0` — WR-02). The fix:

- Added a dedicated `tagCarro(id, carroId | null)` server action in `transactions.ts`,
  symmetric with `bulkTagCarro` and implemented as a single-id reuse of it
  (`return bulkTagCarro([id], carroId)`). It writes **only** `carro_id` after the WR-04
  tri-state `assertOwnedCarro` re-derive, never touching category_id/amount_cents/kind/
  occurred_on/reserva_ledger (D4 field isolation). Returns `{ ok } | { error }`, never
  throws. RLS scopes the UPDATE to the caller's own row; a forged carro issues no write;
  a null carroId clears the tag.
- Rewired `RowActions.confirm()` in `extrato-table.tsx` to call
  `tagCarro(row.id, carroId === '' ? null : carroId)` instead of building FormData and
  calling `updateTransaction`. No accounting field is re-sent, so an unclassified or
  Reserva-category row now tags correctly.
- Added 7 `tagCarro` unit tests: carro_id-only payload (D4), tag an unclassified row
  with no category read (CR-01 core), tag a Reserva-category row with no reserva read
  (WR-01), untag (null) clears with no ownership read, IDOR forged-carro no-write,
  non-UUID tx id rejected (WR-06), absent-session gate.

Verified: `tsc --noEmit` clean; `src/actions/transactions.test.ts` 50/50 pass;
`tests/carro-tag-nondestructive.test.ts` 3/3 pass (D4 invariant intact, local Supabase
up); full suite 664/664; `next build` succeeds.

### WR-04: Unified the divergent carro "Nenhum" sentinels into a shared constant

**Files modified:** `src/lib/carro.ts` (new), `src/components/carro-picker.tsx`, `src/components/selection-action-bar.tsx`, `src/components/import-review-table.tsx`
**Commit:** 83ef29c
**Applied fix:** Created `src/lib/carro.ts` exporting a single `CARRO_NONE = '__none__'`
sentinel and imported it in all three sites. `CarroPicker` and `SelectionActionBar`
(both previously local `__none__`) now reference the shared constant; `ImportReviewTable`
(previously the divergent `__nenhum__`) now also references it, so the picker and the
import-review selector agree. The sentinel remains a pure UI token, never persisted —
every onChange still decodes it back to null/''.

Verified: `tsc --noEmit` clean; full suite 664/664; `next build` succeeds.

## Skipped Issues

### WR-03: `confirmImport` carro ownership errors are not de-duplicated against repeated reads

**File:** `src/actions/import.ts:564-570`
**Reason:** skipped — reviewer-acknowledged non-defect. The review text states "Acceptable
as-is for v1 ... This is a minor robustness/UX gap, not a correctness defect; the
whole-payload rejection is the documented and desired IDOR behavior." The suggested
change (batch the per-carro ownership check into a single `.in('id', carroIds)` read) is
a serial-round-trip optimization with no correctness or security impact, deferred to a
later pass.
**Original issue:** A transient `'error'` from `assertOwnedCarro` on any single carro id
aborts the whole confirm with a retry message even when other carros are owned;
acceptable fail-safe behavior, but the user gets no indication which tag failed.

### Info findings (IN-01..IN-04): out of scope

IN-01 (duplicated `CarroOption` type), IN-02 (`isReservaCategory` re-read per row),
IN-03 (`decodeCarroId` cannot represent "no change"), and IN-04 (`applyBulkCarro` toast
pluralization) are Info-tier and fall outside the critical_warning fix scope. Noted, not
fixed.

---

_Fixed: 2026-06-17T14:39:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
