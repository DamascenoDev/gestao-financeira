---
phase: 03-metas-ader-ncia-e-reservas
plan: 05
subsystem: aporte-sub-flow
tags: [server-action, idor, reserva-ledger, aporte, allocation-grouping, progressive-disclosure, qual-reserva, is-reserva-flag, edit-undo, tdd, RSV]
requires:
  - 03-01 substrate (categories.is_reserva flag, reserva_ledger + unique(transaction_id) partial index, v_reserva_balance)
  - 03-02 Wave-0 tests (reserva-aporte pins aporte = alocação only / never consumo; reserva-idor pins ownership re-derive)
  - 03-04 reservas slice (ReservaForm EXPORTED + controlled, reservas action, /reservas + v_reserva_balance)
  - src/actions/transactions.ts (assertOwnedCategories IDOR pattern, createTransaction/updateTransaction/deleteTransaction wrappers, transactionSchema/getClaims/parseBRLToCents boilerplate)
  - src/actions/reservas.ts (assertOwnedReserva IDOR clone — re-derived in transactions.ts)
  - src/components/{transacao-form,extrato-table,reserva-form}.tsx + src/components/ui/{dialog,select,field}.tsx
provides:
  - src/actions/transactions.ts (createTransactionWithReserva RSV-02 + syncReservaLedgerForTransaction helper + isReservaCategory + assertOwnedReserva + aporte-undo in updateTransaction/deleteTransaction)
  - src/actions/transactions.test.ts (31 cases — +9 aporte/undo, existing 22 GREEN)
  - src/components/reserva-picker.tsx (ReservaPicker — "Qual reserva?" select + inline "+ Nova reserva" + empty-state)
  - src/components/transacao-form.tsx (conditional ReservaPicker when categoria is_reserva — progressive disclosure; routes to createTransactionWithReserva)
  - src/components/extrato-table.tsx (inline re-tag into Reserva opens a focused "Qual reserva?" dialog)
  - src/app/(app)/extrato/page.tsx (fetches categories.is_reserva + the user's reservas, passes both to the form + table)
affects:
  - 03-06 (human-verify walkthrough — log a Reserva transaction, confirm the picker appears + links the aporte, re-classify away + confirm the saldo re-derives)
tech-stack:
  added: []
  patterns:
    - "isReservaCategory keys off the categories.is_reserva FLAG (migration 0012), never the literal name — CAT-02 lets the user rename the Reserva category without breaking the aporte trigger (Open Question 2)"
    - "syncReservaLedgerForTransaction is ONE shared code path for create + edit (Open Question 3): delete-old (edit only) + (if is_reserva) require/own-check reservaId + insert a fresh 'in' entry linked by transaction_id; the partial unique(transaction_id) index makes the re-link idempotent — no orphan, no double-count"
    - "the aporte is kind:'in' in the reserva_ledger — it raises the saldo AND (via the alocação grouping in v_adherence_*) the investment allocation total, NEVER a consumo spend (RSV-03, pinned by reserva-aporte)"
    - "assertOwnedReserva re-derived in transactions.ts (verbatim clone of assertOwnedCategories applied to reservas) before any ledger FK write — FKs are not RLS-aware (Pitfall 6 / Phase-2 IDOR lesson)"
    - "createTransactionWithReserva re-checks reserva ownership BEFORE inserting the transaction (fail-fast) so a Reserva category without a valid reserva never leaves a dangling txn"
    - "deleteTransaction explicitly deletes the linked ledger entry first (the FK is ON DELETE SET NULL — it would otherwise unlink but keep the entry, leaving a phantom aporte in the saldo)"
    - "progressive disclosure: the ReservaPicker mounts as a CONDITIONAL field inside the SAME transacao-form dialog (no second modal); the Extrato inline re-tag — where there is no open dialog — opens a small focused dialog with just the picker"
key-files:
  created:
    - src/components/reserva-picker.tsx
  modified:
    - src/actions/transactions.ts
    - src/actions/transactions.test.ts
    - src/components/transacao-form.tsx
    - src/components/extrato-table.tsx
    - src/app/(app)/extrato/page.tsx
decisions:
  - "syncReservaLedgerForTransaction carries a `deleteOld` flag: the EDIT path (updateTransaction) passes true (drop any pre-existing linked entry first — the undo/re-link); the CREATE path passes false (a freshly-inserted txn has no entry, so the ledger is never touched on a non-Reserva create). This keeps the non-Reserva create path byte-identical to the old createTransaction and satisfies the 'no ledger write on a non-Reserva path' contract."
  - "createTransactionWithReserva is a NEW export; the original createTransaction stays exported and unchanged so existing callers/tests stay valid. transacao-form's create path now routes through createTransactionWithReserva (it falls back to plain-create behavior for a non-Reserva category), so there is one create entry point for the form."
  - "ReservaPicker opens the controlled ReservaForm (Plan 04) for '+ Nova reserva' and calls router.refresh() on close so a newly-created reserva appears in the server-fetched list. createReserva returns {ok:true} (no id), so the new reserva is NOT auto-pre-selected — the user picks it from the refreshed list. The UI-SPEC 'pre-selected' nicety would need createReserva to return the new id (a Plan-04 action change out of scope here); documented as a minor deviation."
  - "The Extrato focused re-tag dialog reuses ReservaPicker + updateTransaction (not a separate action) — re-tagging into Reserva sends the chosen reservaId through updateTransaction, which syncs the 'in' entry; re-tagging away uses the same updateTransaction, which now deletes the linked entry. One action, two directions, honest saldo re-derive."
  - "The reservas list for both the form and the table is read from v_reserva_balance (RLS-scoped, ordered by nome) in extrato/page.tsx — the same view the reservas screen uses — rather than a second reservas table read, so the picker shows the canonical reserva set."
metrics:
  duration: ~12 min
  completed: 2026-06-16
---

# Phase 3 Plan 05: Aporte "qual reserva?" Sub-flow Summary

The final functional slice that closes the reserva loop: when a transaction is classified into the seed Reserva category (keyed off the `is_reserva` FLAG, never the name), the flow asks WHICH reserva and the action writes both the transaction AND a linked `in` ledger entry — an aporte that raises the reserva saldo and the investment allocation total and NEVER a consumo spend (RSV-03). Ships `createTransactionWithReserva` + the `syncReservaLedgerForTransaction` shared helper (one code path for create + edit/undo) + `assertOwnedReserva`/`isReservaCategory` in `transactions.ts`, the aporte-undo wiring in `updateTransaction`/`deleteTransaction`, the `ReservaPicker` ("Qual reserva?" select + inline "+ Nova reserva" + empty-state), the conditional progressive-disclosure picker inside `transacao-form`, and the focused re-tag dialog in the Extrato. Delivers RSV-02 + RSV-03 end-to-end; Phase-3 success criteria 4 and 5 are now met.

## What Was Built

**Task 1 (TDD) — createTransactionWithReserva + syncReservaLedgerForTransaction + aporte-undo (RED commit 5134781, GREEN commit cb842da).**
- `src/actions/transactions.ts`:
  - `isReservaCategory(supabase, categoryId)`: reads `categories.is_reserva` under RLS via `.eq('id', id).maybeSingle()` → true only when the owned category's FLAG is set (Open Question 2 — survives CAT-02 rename; never name-match).
  - `assertOwnedReserva(supabase, id)`: verbatim clone of `assertOwnedCategories` applied to `reservas` (`select id where id=$1` under RLS, exactly 1 row ⇒ owned) — re-derived before any ledger FK write (Pitfall 6 / Phase-2 IDOR; mirrors `actions/reservas.ts`).
  - `syncReservaLedgerForTransaction(...)`: the ONE shared path (Open Question 3). Delete-old (edit only, via the `deleteOld` flag); then, if `is_reserva`, require + own-check `reservaId` (`Selecione uma reserva.` / `Reserva inválida.`) and insert a fresh `{ user_id, reserva_id, kind:'in', amount_cents, transaction_id, occurred_on }`. The partial `unique(transaction_id)` index makes the re-link idempotent.
  - `createTransactionWithReserva(formData)`: the existing Zod/parseBRLToCents/getClaims/assertOwnedCategories flow, then a fail-fast reserva own-check (so a Reserva category never leaves a dangling txn), then insert the transaction `.select('id').single()`, then `syncReservaLedgerForTransaction(..., deleteOld:false)`. Revalidates `/extrato` + `/reservas` + `/dashboard`. The non-Reserva path writes no ledger entry (identical to `createTransaction`).
  - `updateTransaction`: now reads `reservaId` from the FormData, fail-fast own-checks a Reserva re-classify, and calls `syncReservaLedgerForTransaction(..., deleteOld:true)` after the update — the edit/undo path (re-classify away deletes the entry; re-classify into re-links). Revalidates the same three paths.
  - `deleteTransaction`: explicitly deletes any linked `reserva_ledger` entry (`.eq('transaction_id', id)`) BEFORE the txn delete, so the saldo drops immediately (the FK is ON DELETE SET NULL — it would otherwise unlink but keep a phantom aporte). Revalidates the same three paths.
- `src/actions/transactions.test.ts`: +9 cases (the existing 22 stay GREEN). createTransactionWithReserva — aporte inserts txn + linked `in` entry, missing-reservaId rejection, forged-reservaId IDOR rejection, non-Reserva path writes no ledger, session gate. updateTransaction — undo (re-classify away deletes the entry, no re-insert), re-link into Reserva (delete-old + fresh insert), missing-reservaId-on-re-classify rejection. deleteTransaction — also deletes the linked entry. The mock was extended with `maybeSingle` (drives `is_reserva`) and a `reservas` ownership read.

**Task 2 — ReservaPicker + conditional disclosure in transacao-form + Extrato re-tag dialog (commit 9d992f7).**
- `reserva-picker.tsx` (ReservaPicker): a `select` of the user's reservas (by nome) with the accessible name "Qual reserva?", helper "Este lançamento será registrado como aporte nesta reserva.", and an inline "+ Nova reserva" affordance opening the controlled `ReservaForm` (Plan 04) — on close it `router.refresh()`es so the new reserva appears. When the user has no reservas yet, it shows an inline empty state with the same affordance. `aria-live="polite"` announces the conditional reveal; `aria-invalid` wires the parent's error.
- `transacao-form.tsx` (RSV-02): enriched `CategoryOption` with `isReserva`; new `reservaId` state; derives `isReservaCategory` from the chosen category's flag. When true, renders `<ReservaPicker>` as a CONDITIONAL field BELOW the categoria select (progressive disclosure, same dialog). `validate()` blocks submit when Reserva is chosen without a reservaId; `onSubmit` sends `reservaId` and routes the create path to `createTransactionWithReserva` (edit still via `updateTransaction`). Leaving a Reserva category clears the stale `reservaId`.
- `extrato-table.tsx`: `ExtratoCategory` gains `isReserva`; `InlineCategoryCell` now opens a small focused `Dialog` containing just the `ReservaPicker` when the inline re-tag selects a Reserva category, and on "Confirmar aporte" sends the chosen `reservaId` through `updateTransaction`. Re-tagging away from Reserva is the plain `updateTransaction` path (which now removes the linked entry). `ExtratoTable` accepts a `reservas` prop threaded into the cell.
- `extrato/page.tsx`: fetches `categories.is_reserva` and the user's reservas (from `v_reserva_balance`, RLS-scoped, ordered by nome) and passes both to the `TransacaoForm` and the `ExtratoTable`.

## Verification Results

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run transactions`: **31/31 GREEN** (22 existing + 9 new aporte/undo).
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run reserva-aporte allocation-grouping`: **2/2 GREEN** — the Plan-02 reserva-aporte / allocation-grouping contract (aporte raises alocação, every consumo total byte-identical) holds against this action's substrate.
- Full suite `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run`: **269 passed | 0 skipped** across **32 files** (up from the 260/32 baseline: +9 new transaction action tests). No regressions — the live Wave-0 reserva-idor / reserva-aporte / view-leak / rls-isolation integration tests all pass against the local stack.
- `npx tsc --noEmit`: clean (exit 0).
- `npx eslint` on the 5 touched source files: clean (0 errors; the sole warning is the pre-existing React-Compiler `useReactTable` note on a line predating this plan).
- `npm run build`: succeeds; `/extrato` compiles as a dynamic route.
- Greps: `ReservaPicker` in reserva-picker.tsx + transacao-form.tsx; `ReservaPicker`/`createTransactionWithReserva` in extrato-table.tsx.

## Deviations from Plan

### Plan-intent adjustments (no permission needed)

- **`syncReservaLedgerForTransaction` carries a `deleteOld` boolean [Rule 1 - correctness]:** the plan's behavior says the helper deletes-old then maybe-inserts. Calling delete-old unconditionally on the CREATE path would touch `reserva_ledger` even for a non-Reserva create (a no-op delete), violating the plan's explicit "the non-Reserva path behaves exactly like the existing createTransaction (no ledger entry)" / "no ledger write" contract. The flag makes create skip the (provably empty) delete so the non-Reserva path never touches the ledger; the edit path passes `true`. Same observable behavior the plan specifies, with the create-path no-touch guarantee preserved.

- **ReservaPicker does NOT auto-pre-select a newly-created reserva [scope]:** UI-SPEC §4 asks "return to the picker with the new reserva pre-selected". `createReserva` (Plan 04) returns `{ok:true}` with no id, so the picker `router.refresh()`es to surface the new reserva and the user selects it. Auto-pre-selection would require `createReserva` to return the new id — a Plan-04 action signature change, out of scope for this plan. The transação in progress is preserved (the form state is untouched by the refresh); the affordance works, just without the auto-select nicety.

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation note surfaced by `npm run build` (Phase-1 file convention, already logged across 02-0x and 03-0x) — unrelated to this plan.
- Pre-existing React-Compiler `useReactTable` eslint warning in extrato-table.tsx (the line predates this plan; TanStack's API is incompatible with memoization) — unrelated to this plan.

## Authentication Gates
None — the local Supabase stack was already running (03-04 left it up at `127.0.0.1:55321`, migrations 0001-0017). `vitest`, `tsc`, `eslint`, and `npm run build` all ran without an auth gate.

## Known Stubs
None. `createTransactionWithReserva` + `syncReservaLedgerForTransaction` are real and IDOR-checked; the ReservaPicker renders live reservas from `v_reserva_balance`; the conditional disclosure + the Extrato re-tag dialog write real linked aporte entries; edit/delete keep the ledger consistent (delete-old, maybe-re-link, explicit ledger delete on txn delete). The reservas list flows from the server-fetched view, not mock data.

## Threat Surface
No new surface beyond the plan's `<threat_model>`. T-03-05-01 (IDOR on `reserva_ledger.reserva_id` — `assertOwnedReserva` re-derive before the ledger write, pinned by the live `reserva-idor` test; createTransactionWithReserva re-checks ownership BEFORE the txn insert), T-03-05-02 (aporte double-count — the entry is `kind:'in'`; it lands ONLY in the alocação total via the view grouping, never a consumo line; pinned by `reserva-aporte`), T-03-05-03 (orphaned ledger entry on edit/undo — `syncReservaLedgerForTransaction` deletes-old + maybe-inserts; `deleteTransaction` explicitly deletes the linked entry; the partial `unique(transaction_id)` index keeps the re-link idempotent), and T-03-05-04 (name-match brittleness — `isReservaCategory` keys off the `is_reserva` FLAG, never the literal name) are all implemented as specified. T-03-05-SC: no new npm packages (reuses the Plan-04 ReservaForm + existing shadcn dialog/select/field).

## Requirements
- **RSV-02** (Reserva transaction → "qual reserva?" → linked ledger entry) — Complete: createTransactionWithReserva + the conditional ReservaPicker in transacao-form + the focused Extrato re-tag dialog; the aporte is a linked `in` entry keyed off the is_reserva flag.
- **RSV-03** (aporte = investment allocation, never consumption) — Complete: the entry is `kind:'in'`; via the 03-01 alocação grouping in `v_adherence_*` it raises the alocação total and never a consumo teto; pinned by the live `reserva-aporte` test (every consumo total byte-identical after an aporte).

## Local Stack
Left **running** for 03-06 human-verify — API at `http://127.0.0.1:55321` with migrations 0001-0017 applied and `database.types.ts` in sync. No remote push.

## Self-Check: PASSED
