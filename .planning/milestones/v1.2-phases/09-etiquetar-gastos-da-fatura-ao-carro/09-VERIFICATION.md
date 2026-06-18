---
phase: 09-etiquetar-gastos-da-fatura-ao-carro
verified: 2026-06-17T14:45:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 9: Etiquetar gastos da fatura ao carro — Verification Report

**Phase Goal:** Usuário liga um gasto já lançado a um carro (manutenção/óleo) como lente puramente ADITIVA (lançamento continua na mesma categoria/valor/metas — D4), reusando "qual reserva?", no transacao-form, na linha do extrato (+ bulk) e na revisão de importação.
**Verified:** 2026-06-17T14:45:00Z
**Status:** passed
**Re-verification:** No — initial verification
**Mode note:** ROADMAP declares `Mode: mvp`. The phase goal is a capability statement, not the strict `As a…, I want to…, so that…` User Story form. Verification proceeds against the four ROADMAP Success Criteria (the binding contract), all of which are objectively codebase-verifiable, rather than refusing — the criteria provide the testable substance the MVP User Flow section would otherwise paraphrase.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria — the contract)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | No formulário de transação há um seletor opcional "Carro" que grava/limpa carro_id, livre de categoria | ✓ VERIFIED | `transacao-form.tsx:290` mounts `<CarroPicker>` UNCONDITIONALLY (outside the `isReservaCategory` branch); submit always `fd.set('carroId', carroId)` (line 161). Server `decodeCarroId` (transactions.ts:58-61) maps ''→null; `createTransactionWithReserva`/`updateTransaction` write `carro_id` (lines 196, 297). |
| 2 | Na linha do extrato (e revisão de importação) há ação "vincular a carro" que etiqueta um lançamento importado | ✓ VERIFIED | Extrato row action calls dedicated `tagCarro(row.id, carro)` (extrato-table.tsx:277); bulk via `bulkTagCarro` (line 499) through SelectionActionBar `onApplyCarro`. Import review: per-row `InlineReviewCarroCell` → `tagCarroRow` → `carroId` in confirm payload (import-review-table.tsx:312,370). |
| 3 | Etiquetar/desetiquetar NÃO altera categoria, valor, nem aderência às metas (D4) | ✓ VERIFIED | Write payloads are carro_id-only (`bulkTagCarro` transactions.ts:405; updateTransaction:297; confirmImport TxnInsert:660). Integration test `carro-tag-nondestructive.test.ts` proves tag→untag leaves `v_adherence_month`/`v_adherence_ytd`/`v_category_totals` + accounting fields byte-identical and no `reserva_ledger` perturbation (3 tests pass against local stack). |
| 4 | Servidor re-deriva posse de carro_id antes de gravar; carro alheio rejeitado; result shape {ok}\|{error}, nunca throw | ✓ VERIFIED | `assertOwnedCarro` re-derive before every FK write: create (transactions.ts:180), update (283), bulk (394, validated once), import confirm (565, whole-payload reject). All return `{ ok } \| { error }`. IDOR no-write proven by unit + integration tests. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/schemas/transaction.ts` | optional nullable carroId | ✓ VERIFIED | `carroId: z.string().uuid().nullable().optional()` (line 18) |
| `src/lib/schemas/import.ts` | optional carroId on confirmImport row | ✓ VERIFIED | `carroId: z.string().uuid().nullable().optional()` (line 45) |
| `src/actions/transactions.ts` | carro_id write/clear + bulkTagCarro + tagCarro | ✓ VERIFIED | All three present; carro_id-only payloads; assertOwnedCarro re-derive |
| `src/actions/import.ts` | carro_id persist + ownership re-derive | ✓ VERIFIED | IDOR re-derive #4 (line 564-569); whole-payload reject; carro_id on TxnInsert (660) |
| `src/lib/carro.ts` (WR-04) | shared CARRO_NONE sentinel | ✓ VERIFIED | `export const CARRO_NONE = '__none__'`; imported by all 3 UI sites |
| `src/components/carro-picker.tsx` | reusable optional selector + Nenhum | ✓ VERIFIED | CarroPicker; "Nenhum"→CARRO_NONE decoded to '' on change (line 59) |
| `src/components/transacao-form.tsx` | carro selector wired | ✓ VERIFIED | Unconditional mount; fd carroId on submit |
| `src/components/extrato-table.tsx` | row tagCarro + bulkTagCarro | ✓ VERIFIED | Row uses `tagCarro` (CR-01 fix), bulk uses `bulkTagCarro` |
| `src/components/selection-action-bar.tsx` | bulk carro control | ✓ VERIFIED | onApplyCarro + CARRO_NONE decode (line 81) |
| `src/components/import-review-table.tsx` | per-row carro selector | ✓ VERIFIED | InlineReviewCarroCell, local CarroOption, carroId in confirm payload |
| `src/app/(app)/extrato/page.tsx` | carros + carro_id wiring | ✓ VERIFIED | non-archived carros query (89), carro_id in select (102), passed to form+table |
| `src/app/(app)/importar/[statementId]/page.tsx` | carros wiring | ✓ VERIFIED | carros query (152), passed to ImportReviewTable |
| `src/actions/transactions.test.ts` | carro unit coverage | ✓ VERIFIED | tagCarro/bulkTagCarro/D4/IDOR/CR-01 describe blocks present |
| `src/actions/import.test.ts` | confirmImport carro coverage | ✓ VERIFIED | persist/forged-reject/parity cases (file passes) |
| `tests/carro-tag-nondestructive.test.ts` | D4 + IDOR integration proof | ✓ VERIFIED | v_adherence byte-identical + RLS no-write (3 tests pass) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| extrato-table row action | tagCarro | `tagCarro(row.id, carro)` | ✓ WIRED | extrato-table.tsx:277 (CR-01 fix — NOT updateTransaction) |
| extrato-table bulk | bulkTagCarro | `bulkTagCarro(selectedIds, carroId)` | ✓ WIRED | extrato-table.tsx:499 |
| transacao-form | create/update actions | `fd.set('carroId', carroId)` | ✓ WIRED | transacao-form.tsx:161 |
| transactions.ts | assertOwnedCarro | re-derive before FK write | ✓ WIRED | lines 180, 283, 394 |
| import-review-table | confirmImport | carroId in confirm payload | ✓ WIRED | import-review-table.tsx:370 |
| import.ts | assertOwnedCarro | re-derive every chosen carro_id | ✓ WIRED | import.ts:565 |
| extrato/page RSC | carros table | `from('carros').eq('is_archived', false)` | ✓ WIRED | extrato/page.tsx:89-92 |

### CR-01 Blocker Fix Verification

The code review found and FIXED a BLOCKER: the row "Vincular a carro" action originally routed through `updateTransaction`, which re-validated `categoryId` and rejected imported `category_id=null` rows ("Selecione uma categoria"). Verified the fix holds:

- A dedicated `tagCarro(id, carroId)` action (transactions.ts:427-431) is a single-id reuse of `bulkTagCarro` — writes carro_id ONLY, no category/amount/reserva re-validation.
- `RowActions.confirm()` (extrato-table.tsx:277) calls `tagCarro`, not `updateTransaction`.
- Unit test `'tags an UNCLASSIFIED row (no category context needed) — CR-01 core fix'` (transactions.test.ts:823) passes — tagging an imported unclassified row sets carro_id without a category.
- WR-04 fix verified: single shared `CARRO_NONE` sentinel in `lib/carro.ts`, imported by all three UI sites (previously divergent `__none__`/`__nenhum__`).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typecheck clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Carro action + integration tests | `npm test -- transactions.test.ts import.test.ts carro-tag-nondestructive.test.ts` | 3 files, 83 tests passed | ✓ PASS |
| Production build | `npm run build` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CAR-02 | 09-01/02/03 | Usuário etiqueta lançamento a um carro via form e ação de linha; não altera categoria nem metas (lente não-destrutiva) | ✓ SATISFIED | Form selector + extrato row/bulk + import review all wired; D4 non-destructive proven by automated test; server ownership re-derive verified |

No orphaned requirements — CAR-02 is the sole phase-9 requirement and is fully claimed by the three plans.

### Anti-Patterns Found

None. Scanned all 10 modified source files for TBD/FIXME/XXX/PLACEHOLDER/"not implemented" — zero matches.

### Human Verification Required

None outstanding. Both blocking human-verify checkpoints (09-02-T4 extrato UI; 09-03-T3 import review UI) were exercised and approved by the user ("aprovado"), per the SUMMARYs. The remaining D4/IDOR security-critical behaviors are proven by automated tests, so no new human verification is requested.

### Gaps Summary

No gaps. All four ROADMAP Success Criteria are codebase-verified, all artifacts exist/substantive/wired with real data flow, the CR-01 blocker fix is confirmed present and tested (unclassified-row tag works without a category via the dedicated `tagCarro` action), the WR-04 sentinel is unified and never persists (decoded to null/'' before reaching the server), the D4 invariant is automated-proven (metas/category/amount byte-identical on tag+untag, no reserva_ledger perturbation), IDOR no-write holds on single/bulk/import paths via `assertOwnedCarro` re-derive, and result shapes are `{ ok } | { error }`. tsc clean, 83 targeted tests pass, build green.

---

_Verified: 2026-06-17T14:45:00Z_
_Verifier: Claude (gsd-verifier)_
