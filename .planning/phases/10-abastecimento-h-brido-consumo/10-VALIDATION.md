---
phase: 10
slug: abastecimento-h-brido-consumo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 10 — Validation Strategy

> Abastecimento log + hybrid cost + consumption (CAR-03/04). Existing vitest suite (~664) is the regression gate. Security-critical: XOR cost source (DB CHECK + server), carro_id sync on link + ownership of BOTH carro_id and transaction_id, partial-unique 1:1 link. Correctness-critical: the consumption view math (km/l full-tank intervals, negative/zero km_rodados → null & excluded, R$/km) — proven by an integration test against the local stack. Migration 0028 applied + types no-drift. Planner fills the per-task map.

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
| {planner fills} | | | CAR-03/04 | | | ⬜ pending |

---

## Wave 0 Requirements
- [ ] {planner: abastecimento action tests (XOR both/neither reject, carro+transaction ownership, carro_id sync on link, manual cost path); consumption-view integration test (full-tank km/l, negative/zero km_rodados → null + excluded from averages, R$/km, preco_litro derived); migration 0028 applied + gen:types no-drift}

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {planner — abastecimento form look/flow + cost-source toggle + history display, light/dark; most calc is automatable} | | | |

---

## Validation Sign-Off
- [ ] Every task has automated verify or Wave 0 dependency
- [ ] XOR cost + 1:1 link + dual ownership (carro_id + transaction_id) tested
- [ ] Consumption math (full-tank km/l + negative-km guard + R$/km) proven by integration test
- [ ] Migration 0028 applied locally + types no-drift
- [ ] `nyquist_compliant: true` when map filled

**Approval:** pending
