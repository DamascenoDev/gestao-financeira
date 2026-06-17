---
phase: 10-abastecimento-h-brido-consumo
plan: 02
subsystem: abastecimento-server-layer
tags: [zod, server-actions, idor, xor, carro-id-sync, consumo-helper, integration-test]
requires:
  - "src/lib/ownership.ts (assertOwnedCarro tri-state; assertOwnedStatement clone shape)"
  - "src/lib/schemas/carro.ts (the combustivel enum + shared Zod form/action pattern)"
  - "supabase migration 0027 (abastecimentos table + cost XOR CHECK + partial unique) + 0028, applied locally"
  - "local Supabase stack UP (action integration test)"
provides:
  - "src/lib/schemas/abastecimento.ts — abastecimentoSchema (cost-source XOR superRefine + field bounds), AbastecimentoInput"
  - "src/actions/abastecimentos.ts — createAbastecimento/updateAbastecimento/deleteAbastecimento ({ ok } | { error }, never throw) with dual IDOR + XOR + carro_id link sync"
  - "src/lib/ownership.ts — assertOwnedTransaction (transaction-ownership re-derive)"
  - "src/lib/carro/consumo.ts — precoLitroCents (derived, never stored) + kmPerLitroLabel/reaisPerKmLabel ('—' sentinel)"
  - "src/lib/schemas/carro.ts — exported COMBUSTIVEL_OPTIONS tuple + Combustivel type (single source for the fuel enum)"
affects:
  - "10-03 (UI wires the abastecimento-form + lançamento picker over this proven action contract; reads consumo.ts labels)"
  - "11 (carro detail + consumo chart consume the same actions/helpers)"
tech-stack:
  added: []
  patterns:
    - "Zod superRefine for an exclusive-pair (XOR) field constraint mirroring a DB CHECK (defense in depth)"
    - "dual ownership re-derive before FK writes: assertOwnedCarro (tri-state) + assertOwnedTransaction (boolean) + 1:1 link pre-check"
    - "carro_id sync on link — write ONLY carro_id onto the owned transaction (non-accounting tag, D4)"
    - "action integration test: mock @/lib/supabase/server to return the RLS-active userClient + stub getClaims() to decode the bearer JWT sub"
    - "shared const-tuple enum exported from one schema and reused by a sibling (no literal drift)"
key-files:
  created:
    - "src/lib/schemas/abastecimento.ts"
    - "src/lib/schemas/abastecimento.test.ts"
    - "src/actions/abastecimentos.ts"
    - "src/actions/abastecimentos.test.ts"
    - "src/lib/carro/consumo.ts"
    - "src/lib/carro/consumo.test.ts"
    - "tests/abastecimento-action.test.ts"
  modified:
    - "src/lib/ownership.ts"
    - "src/lib/schemas/carro.ts"
decisions:
  - "Combustivel enum extracted to COMBUSTIVEL_OPTIONS const-tuple in carro.ts and imported by abastecimento.ts — single source, the schema cannot drift from the carro's combustivel_padrao"
  - "Cost-source XOR enforced in the Zod superRefine (both/neither → one cost-source message on the amountCents path) AND backed by the DB CHECK (0027) — defense in depth"
  - "On the from-fatura path the action sets transactions.carro_id with a carro_id-only update payload (never category/amount) so fuel shows in the carro spend without touching accounting (D4)"
  - "Partial-unique insert race (23505) is mapped to the already-linked error and no carro_id sync is issued; a pre-check select catches the common case for a friendlier message"
  - "On delete of a linked abastecimento, the transaction's carro_id is left as-is (the additive non-accounting tag is harmless) — clearing it is OUT OF SCOPE for v1 per the plan"
  - "updateAbastecimento's 1:1 pre-check uses .neq('id', id) so an abastecimento re-saving its own existing link is not falsely flagged as already-linked"
metrics:
  duration: ~6 min
  tasks: 3
  files_created: 7
  files_modified: 2
  completed: 2026-06-17
---

# Phase 10 Plan 02: Abastecimento server layer (schema + actions + consumo helper) Summary

Built the typed, validated, security-proven server boundary for abastecimentos: a Zod schema enforcing the cost-source XOR, create/update/delete actions that re-derive ownership of BOTH the carro and the linked transaction before any FK write and stamp `carro_id` onto the linked transaction, and a pure helper deriving `preco_litro`/km-l/R$-km for display. The UI (10-03) is now pure wiring over a contract proven by unit mocks AND a local-stack integration test.

## What was built

**Task 1 — `src/lib/schemas/abastecimento.ts` (+ test) (commit `c0beba4`, feat):**
`abastecimentoSchema` with `carroId` (uuid), `occurredOn` (yyyy-MM-dd), `odometroKm` (int>0), `litros` (numeric>0, a VOLUME never centavos), `tanqueCheio` (bool), `combustivel` (nullish enum), and the cost source as an exclusive pair `transactionId` XOR `amountCents` (positive int centavos). The XOR is a `.superRefine` that fails on both-present OR both-absent with the message "Informe exatamente uma fonte de custo: lançamento da fatura ou valor manual." The combustivel enum was extracted to a shared `COMBUSTIVEL_OPTIONS` const-tuple in `carro.ts` and imported, so the abastecimento fuel field cannot drift from the carro's `combustivel_padrao`. 15 unit cases (valid manual/from-fatura, XOR both/neither, field bounds).

**Task 2 — `src/actions/abastecimentos.ts` + `src/lib/carro/consumo.ts` (+ tests) + `ownership.ts` (commit `fd01a43`, feat):**
- `createAbastecimento`/`updateAbastecimento`/`deleteAbastecimento` — `ActionResult = { error } | { ok: true }`, never throw. Each: `abastecimentoSchema.safeParse` at the boundary → first-issue `{ error }`; `getClaims()` sub-gate → 'Sessão expirada.'.
- **DUAL ownership re-derive before any FK write:** (1) `assertOwnedCarro` tri-state — 'error' → generic retry, 'not-owned' → 'Carro inválido.'; (2) from-fatura only — new `assertOwnedTransaction` (clone of `assertOwnedStatement`) rejects a forged/foreign tx with no write, plus a `select abastecimentos where transaction_id` pre-check rejects an already-linked tx (1:1, defense over the partial unique index).
- **Write order (from-fatura):** insert the abastecimento (transaction_id set, amount_cents null), then update `transactions.carro_id = carroId` on the owned tx (carro_id-only payload, D4). A 23505 race on insert maps to the already-linked error with no carro_id sync.
- **Manual path:** insert with `amount_cents` (centavos), transaction_id null.
- `src/lib/carro/consumo.ts` — pure helpers: `precoLitroCents(custo, litros)` derives custo/litros (guard litros≤0/non-finite → null) — the ONLY place preco_litro is computed; `kmPerLitroLabel`/`reaisPerKmLabel` render the view numbers and fall back to the '—' sentinel for null/non-positive.
- 28 action unit cases (manual/from-fatura/XOR/dual-IDOR no-write/already-linked/race/session/update/delete) + 12 consumo cases.

**Task 3 — `tests/abastecimento-action.test.ts` (commit `2f7e427`, test):**
Wave-0 integration test driving the actions through their exported signatures against the local stack. Mocks `@/lib/supabase/server` to return the RLS-active `userClient` for the active session and stubs `getClaims()` to decode the bearer JWT's sub. Two users A/B + a carro each. Proves: from-fatura happy path (abastecimento persists transaction_id set / amount_cents null AND A's tx carro_id read back = A's carro); dual IDOR (A links B's tx → { error }, no abastecimento, B's tx carro_id stays null); XOR both/neither (no row); 1:1 already-linked rejected (no second link); manual path (amount_cents set, transaction_id null); owner delete. 7/7 green.

## Verification

- `npm test -- abastecimento.test.ts`: 15 passed.
- `npm test -- abastecimentos.test.ts consumo.test.ts`: 34 passed (28 action + 12 consumo + 15 schema matched by prefix — combined run reports 34 across the 3 prefix-matched files).
- `npm test -- abastecimento-action.test.ts`: 7 passed (local stack).
- Full suite `npm test`: **720 passed / 82 files** (baseline 670, +50 new).
- `npx tsc --noEmit`: clean (exit 0).
- `npm run build`: exit 0.

## Deviations from Plan

None — plan executed exactly as written.

Implementation note (within plan scope): the integration test authenticates the action by mocking `createClient` to return the RLS-active `userClient` and stubbing `getClaims()` to decode the bearer JWT's `sub` — a header-bearer client has no persisted session, so the real `getClaims()` returns no claims. This is the plan's "test harness's authenticated client injection pattern"; the underlying DB reads/writes still run under real RLS via the bearer token.

## Self-Check: PASSED

- FOUND: src/lib/schemas/abastecimento.ts
- FOUND: src/actions/abastecimentos.ts
- FOUND: src/lib/carro/consumo.ts
- FOUND: tests/abastecimento-action.test.ts
- FOUND commit: c0beba4 (schema)
- FOUND commit: fd01a43 (actions + consumo)
- FOUND commit: 2f7e427 (integration test)
