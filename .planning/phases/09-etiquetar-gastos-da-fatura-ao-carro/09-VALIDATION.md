---
phase: 9
slug: etiquetar-gastos-da-fatura-ao-carro
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-17
---

# Phase 9 — Validation Strategy

> Tagging seam (CAR-02). Existing vitest suite (~635) is the regression gate. New unit tests cover: carro_id write/clear on create+update, the bulkTagCarro action, carro_id persist through confirmImport, ownership re-derive (IDOR no-write on forged carro), and result shape. The D4 NON-DESTRUCTIVE invariant is the security-critical check — `tests/carro-tag-nondestructive.test.ts` proves tag+untag changes neither category_id/amount_cents/kind nor any metas-adherence aggregate (v_adherence_month / v_adherence_ytd / v_category_totals byte-identical) and perturbs no reserva_ledger row. RLS for carro_id is already covered by Phase-8 tests/carro-rls.test.ts.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16 + jsdom |
| **Quick run** | `npm test -- <file>` |
| **Full suite** | `npm test` (baseline ~635 green) |
| **Type/build** | `npx tsc --noEmit` · `npm run build` |

Local Supabase stack used by action/RLS/integration tests (must be UP for `tests/carro-tag-nondestructive.test.ts`).

---

## Sampling Rate
- After each task commit: `npm test -- <touched>` + `npx tsc --noEmit`.
- After wave: `npm test` (≥635) + `npm run build`.
- Before verify: full suite green + build clean + D4 non-destructive test green.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 09-01-T1 | 01 | 1 | CAR-02 | unit (action) | `npm test -- src/actions/transactions.test.ts` | ✅ green |
| 09-01-T2 | 01 | 1 | CAR-02 | unit (action) | `npm test -- src/actions/transactions.test.ts` | ✅ green |
| 09-01-T3 | 01 | 1 | CAR-02 | integration (local stack) — Wave 0 | `npm test -- tests/carro-tag-nondestructive.test.ts` | ✅ green |
| 09-02-T1 | 02 | 2 | CAR-02 | type/build | `npx tsc --noEmit && npm run build` | ⬜ pending |
| 09-02-T2 | 02 | 2 | CAR-02 | type/build | `npx tsc --noEmit && npm run build` | ⬜ pending |
| 09-02-T3 | 02 | 2 | CAR-02 | type/build + full suite | `npx tsc --noEmit && npm run build && npm test` | ⬜ pending |
| 09-02-T4 | 02 | 2 | CAR-02 | human-verify (blocking) | manual — selector/row/bulk + D4 spot-check, light+dark | ⬜ pending |
| 09-03-T1 | 03 | 2 | CAR-02 | unit (action) | `npm test -- src/actions/import.test.ts` | ⬜ pending |
| 09-03-T2 | 03 | 2 | CAR-02 | type/build | `npx tsc --noEmit && npm run build` | ⬜ pending |
| 09-03-T3 | 03 | 2 | CAR-02 | human-verify (blocking) | manual — per-row review tag persists + D4 spot-check, light+dark | ⬜ pending |

---

## Wave 0 Requirements
- [x] `tests/carro-tag-nondestructive.test.ts` (09-01-T3, local stack): D4 non-destructive — tag then untag a transaction; assert category_id / amount_cents / kind / occurred_on / description AND the user's rows from v_adherence_month + v_adherence_ytd + v_category_totals are byte-identical before/after (only carro_id changes); assert no reserva_ledger row created/removed for that transaction; IDOR no-write — a forged cross-user carro_id tag writes 0 rows. **(09-01, 3 green)**
- [x] `src/actions/transactions.test.ts` extended (09-01-T1/T2): carro_id write/clear on create+update behind assertOwnedCarro tri-state; bulkTagCarro single-.in()-update shape; IDOR no-write on forged carro; carro_id-only payload (D4 field isolation). **(09-01, 43 green)**
- [ ] `src/actions/import.test.ts` extended (09-03-T1): carro_id persist through confirmImport; forged carroId rejects whole payload (no insert); no-carro parity.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Carro selector / row action / bulk control look-and-feel + light↔dark grammar | CAR-02 / UI | Visual fidelity to the locked Phase-7 grammar (no new primitives) can't be asserted by a unit test | 09-02-T4 checkpoint steps 1-6 |
| Per-row review carro tag persists end-to-end through a real import | CAR-02 (success #2) | End-to-end import→review→confirm→extrato flow over the local stack + UI; the action-level persist is unit-tested, this confirms the wired UX | 09-03-T3 checkpoint steps 1-6 |
| Dashboard metas unchanged after tagging (D4, UI-level) | CAR-02 / D4 | The query-level D4 is proven automated (09-01-T3); this is the human confirmation that the rendered dashboard numbers also do not move | 09-02-T4 step 5 / 09-03-T3 step 5 |

---

## Validation Sign-Off
- [ ] Every task has automated verify or a Wave 0 dependency (checkpoints back the automated D4/IDOR + tsc/build gates)
- [ ] D4 non-destructive proven by an automated test (no metas/category/amount change, no reserva_ledger perturbation, on tag/untag) — 09-01-T3
- [ ] IDOR no-write on forged carro_id tested — 09-01-T3 (RLS path) + 09-01-T2 / 09-03-T1 (action path)
- [x] `nyquist_compliant: true` — map filled

**Approval:** pending
