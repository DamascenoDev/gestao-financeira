---
phase: 09-etiquetar-gastos-da-fatura-ao-carro
plan: 01
requirements_completed: [CAR-02]
subsystem: transactions / carro-tagging server contract
tags: [CAR-02, server-action, IDOR, D4, carro_id, wave-0]
requires:
  - "transactions.carro_id column + carros table (Phase 8, migration 0027)"
  - "assertOwnedCarro tri-state (src/lib/ownership.ts, Phase 8)"
provides:
  - "optional nullable carroId in transactionSchema"
  - "carro_id write/clear in createTransactionWithReserva + updateTransaction"
  - "bulkTagCarro(ids, carroId | null) action"
  - "Wave-0 D4/IDOR integration proof (tests/carro-tag-nondestructive.test.ts)"
affects:
  - "Plan 02 (extrato + transação-form UI) consumes carroId + bulkTagCarro"
  - "Plan 03 (import-review UI) consumes the carro_id persist path"
tech-stack:
  added: []
  patterns:
    - "Zod nullable-optional field for explicit-clear vs no-change semantics"
    - "tri-state assertOwnedCarro re-derive (WR-04) before every carro_id FK write"
    - "single RLS-scoped .update().in('id', ids) bulk tag (bulkReclassify analog)"
    - "carro_id-only write payload (D4 field isolation)"
key-files:
  created:
    - "tests/carro-tag-nondestructive.test.ts"
  modified:
    - "src/lib/schemas/transaction.ts"
    - "src/actions/transactions.ts"
    - "src/actions/transactions.test.ts"
decisions:
  - "Carro tag decoded from FormData like reservaId ('' / absent → null); free of category"
  - "bulkTagCarro revalidates /extrato ONLY (tagging never touches metas — D4)"
  - "Integration IDOR proof uses the RLS-read-zero premise (FKs are not RLS-aware) instead of expecting a DB FK rejection"
metrics:
  duration: "~6 min"
  completed: "2026-06-17"
  tasks: 3
  files: 4
---

# Phase 9 Plan 01: Carro-tagging server contract Summary

CAR-02's accounting-safe substrate: `createTransactionWithReserva` / `updateTransaction` accept and persist an optional `carro_id` (with explicit clear-to-null), plus a new `bulkTagCarro(ids, carroId | null)` tagging many own rows in one RLS-scoped `.in('id', ids)` update — every write gated by the Phase-8 tri-state `assertOwnedCarro` re-derive, touching ONLY `carro_id` (D4 non-destructive lens), proven by unit + Wave-0 integration tests.

## What Was Built

- **`transactionSchema.carroId`** — `z.string().uuid().nullable().optional()`: nullable so the form can send an explicit clear ("Nenhum"), optional so an absent value means "no change". Mirrors `confirmImportRowSchema`'s nullable-optional categoryId.
- **`createTransactionWithReserva` + `updateTransaction`** — decode `carroId` from FormData exactly like `reservaId` (`''`/absent → null), re-derive ownership via `assertOwnedCarro` (WR-04 tri-state: `'error'` → generic retry string, `'not-owned'` → `'Carro inválido.'`, only `'owned'` proceeds) when carroId is a non-null uuid, then include `carro_id` in the insert / update payload. Clearing (null) needs no ownership check. The reserva-ledger sync path is untouched (D4).
- **`bulkTagCarro(ids, carroId | null)`** — modeled verbatim on `bulkReclassify`: empty-ids guard, per-id `idSchema` (WR-06), session gate, the target carro validated ONCE for the whole batch, then a single `update({ carro_id }).in('id', ids)`. Payload is carro_id-only (no category_id key). Revalidates `/extrato` only.
- **Wave-0 integration test** — `tests/carro-tag-nondestructive.test.ts`: D4 (tag→untag leaves the accounting fields + `v_adherence_month`/`v_adherence_ytd`/`v_category_totals` byte-identical, no reserva_ledger perturbation) and IDOR no-write (user B forging A's carro_id onto A's tx touches 0 rows under RLS).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Accept + write/clear carro_id on single-transaction actions (TDD) | b86579d | transaction.ts, transactions.ts, transactions.test.ts |
| 2 | bulkTagCarro action (single .in() update, carro_id-only) (TDD) | 8c9e365 | transactions.ts, transactions.test.ts |
| 3 | Wave-0 D4 non-destructive + IDOR integration test | fda2dae | tests/carro-tag-nondestructive.test.ts |

## Verification

- `npm test -- src/actions/transactions.test.ts` → 43 passed (carro_id write/clear, bulkTagCarro shape, IDOR no-write, D4 field isolation).
- `npm test -- tests/carro-tag-nondestructive.test.ts` → 3 passed (D4 byte-identical metas + IDOR no-write against the local stack).
- `npx tsc --noEmit` → clean.
- `npm test` (full suite) → **654 passed** (≥635 baseline).
- `npm run build` → clean.

## TDD Gate Compliance

Tasks 1 and 2 followed RED → GREEN. RED was confirmed for Task 1 (8 new failing carro tests before implementation) and Task 2 (new bulkTagCarro describe block referencing an undefined export). GREEN reached with the schema + action changes. No separate refactor commit needed. Task 3 is an integration (Wave-0) proof, not a unit TDD cycle.

## Deviations from Plan

### Adjusted Integration-Test Assertion (test design, not a code bug)

**1. [Rule 1 - Bug in test expectation] A-tags-with-B's-carro assertion corrected to the RLS-read-zero premise**
- **Found during:** Task 3 (first run of the Wave-0 test).
- **Issue:** The initial assertion expected a raw `update({ carro_id: carroBId })` by user A to be rejected by the database. It was NOT — and that is correct Postgres behavior: foreign keys are NOT RLS-aware, so B's carro row exists globally and the FK is satisfied. This is the exact premise the whole IDOR mitigation rests on (the protection lives in the action's `assertOwnedCarro` re-derive, not in the FK).
- **Fix:** Re-expressed the assertion to prove the actual gate: under A's RLS-active client, a `select id from carros where id = carroB` returns ZERO rows, so `assertOwnedCarro` maps to `'not-owned'` and the action issues no write. Also avoids polluting the snapshot invariant by not performing the leaking raw write.
- **Files modified:** tests/carro-tag-nondestructive.test.ts
- **Commit:** fda2dae

No production-code deviations — Tasks 1 and 2 were implemented exactly as planned.

## Threat Model Coverage

- **T-09-01 (Elevation/IDOR):** mitigated — `assertOwnedCarro` re-derive before every carro_id FK write on create/update/bulk; tri-state `'error'`/`'not-owned'` issue no write; bulk validates the carro once then relies on the RLS-scoped `.in()` update. Proven by the unit IDOR-no-write cases + the Wave-0 forged-update-touches-0-rows assertion.
- **T-09-02 (Tampering/D4 integrity):** mitigated — every write payload contains ONLY carro_id; the reserva-ledger path is untouched; the metas views do not read carro_id. Proven byte-identical before/after by the Wave-0 test.
- **T-09-03 (Information disclosure):** accepted as planned — tri-state maps to generic `'Carro inválido.'` / retry strings; raw DB errors never returned.

No new threat surface introduced beyond the registered model.

## Known Stubs

None — the contract is fully wired; the UI surfaces that consume it ship in Plans 02 and 03.

## Self-Check: PASSED

- FOUND: src/lib/schemas/transaction.ts
- FOUND: src/actions/transactions.ts
- FOUND: src/actions/transactions.test.ts
- FOUND: tests/carro-tag-nondestructive.test.ts
- FOUND commit: b86579d
- FOUND commit: 8c9e365
- FOUND commit: fda2dae
