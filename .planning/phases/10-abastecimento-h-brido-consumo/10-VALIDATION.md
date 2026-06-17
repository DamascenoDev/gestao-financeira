---
phase: 10
slug: abastecimento-h-brido-consumo
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 10 — Validation Strategy

> Abastecimento log + hybrid cost + consumption (CAR-03/04). Existing vitest suite (~664) is the regression gate. Security-critical: XOR cost source (DB CHECK + server), carro_id sync on link + ownership of BOTH carro_id and transaction_id, partial-unique 1:1 link. Correctness-critical: the consumption view math (km/l full-tank intervals, negative/zero km_rodados → null & excluded, R$/km) — proven by an integration test against the local stack. Migration 0028 applied + types no-drift.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16 + jsdom |
| **Quick run** | `npm test -- <file>` |
| **Full suite** | `npm test` (baseline ~664 green) |
| **Type/build/types** | `npx tsc --noEmit` · `npm run build` · `npm run gen:types` (no drift) |

Local Supabase stack UP for action/view/RLS integration tests.

---

## Sampling Rate
- After each task commit: `npm test -- <touched>` + `npx tsc --noEmit`.
- After wave: `npm test` (≥664) + `npm run build`.
- Before verify: full suite green + build + types no-drift + consumption-view test green.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 10-01-T1 | 01 | 1 | CAR-04 | Migration + types | `supabase migration up && npm run gen:types && git diff --quiet src/types/database.types.ts` | ⬜ pending |
| 10-01-T2 | 01 | 1 | CAR-04 | Integration (view) | `npm test -- carro-consumo.test.ts` | ⬜ pending |
| 10-02-T1 | 02 | 2 | CAR-03 | Unit (Zod) | `npm test -- abastecimento.test.ts` | ⬜ pending |
| 10-02-T2 | 02 | 2 | CAR-03/04 | Unit (action + helper) | `npm test -- abastecimentos.test.ts consumo.test.ts` | ⬜ pending |
| 10-02-T3 | 02 | 2 | CAR-03 | Integration (action) | `npm test -- abastecimento-action.test.ts` | ⬜ pending |
| 10-03-T1 | 03 | 3 | CAR-03 | Type/compile | `npx tsc --noEmit` | ⬜ pending |
| 10-03-T2 | 03 | 3 | CAR-03/04 | Build | `npx tsc --noEmit && npm run build` | ⬜ pending |
| 10-03-T3 | 03 | 3 | CAR-03/04 | Human-verify | manual (form flow + averages, light/dark) | ⬜ pending |

---

## Wave 0 Requirements
- [ ] **Consumption-view integration test** (`tests/carro-consumo.test.ts`, 10-01-T2): full-tank km/l (km_rodados/Σlitros), negative/zero km_rodados → null + EXCLUDED from v_carro_resumo averages, R$/km, preco_litro derived (never stored). Migration 0028 applied locally + `gen:types` no-drift (10-01-T1) is the precondition.
- [ ] **Abastecimento action integration test** (`tests/abastecimento-action.test.ts`, 10-02-T3): XOR both/neither reject (no row); from-fatura links own unlinked tx + sets carro_id on it; dual IDOR — linking another user's tx returns { error } + writes nothing + leaves the foreign tx carro_id null; 1:1 already-linked rejected; manual path writes amount_cents with transaction_id null.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Abastecimento form look/flow + cost-source toggle + history table→card + average numbers, light/dark | CAR-03/CAR-04 | Visual layout, segmented-toggle UX, mobile card collapse, and light↔dark identity cannot be asserted by unit tests; the calc is automated in Wave 0 | 10-03-T3 checkpoint: open /carros/[id], add a manual + a from-fatura abastecimento, confirm carro_id appears on the linked lançamento in the extrato, confirm km/l + R$/km numbers, resize to mobile, flip light/dark |

---

## Validation Sign-Off
- [ ] Every task has automated verify or Wave 0 dependency
- [ ] XOR cost + 1:1 link + dual ownership (carro_id + transaction_id) tested
- [ ] Consumption math (full-tank km/l + negative-km guard + R$/km) proven by integration test
- [ ] Migration 0028 applied locally + types no-drift
- [x] `nyquist_compliant: true` when map filled

**Approval:** pending
