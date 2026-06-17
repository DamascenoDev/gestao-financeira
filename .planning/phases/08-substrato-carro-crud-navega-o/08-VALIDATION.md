---
phase: 8
slug: substrato-carro-crud-navega-o
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract. Substrate + CRUD phase: existing vitest suite (~599) is the regression gate; new unit tests cover carro actions/schema/components; RLS isolation of `carros`/`abastecimentos`/`transactions.carro_id` is the security-critical check (2-user style, mirrors SEC-01); `next build` + `tsc` + `supabase gen types` (no drift) are the substrate gates. Per-task map filled below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16 + jsdom |
| **Config file** | repo vitest config (`npm test` → `vitest run`) |
| **Quick run command** | `npm test -- <file>` |
| **Full suite command** | `npm test` (baseline ~599 green) |
| **Estimated runtime** | ~30-60s full; <10s single file |

Build gate: `npm run build`. Type gate: `npx tsc --noEmit`. Types regen: `npm run gen:types` (`supabase gen types typescript --local`) → no drift in `src/types/database.types.ts`. RLS: 2-user isolation test for `carros`/`abastecimentos`/`transactions.carro_id` (mirror existing isolation tests). View-leak: security_invoker proof for the two new views (mirror mei-view-leak).

---

## Sampling Rate

- **After every task commit:** `npm test -- <touched>` + `npx tsc --noEmit`.
- **After every plan wave:** `npm test` (full ≥599 green) + `npm run build`.
- **Before verify:** full suite green + build clean + types no-drift + RLS isolation + view-leak green.
- **Max feedback latency:** ~60s.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 08-01 T1 (migration 0027) | 08-01 | 1 | CAR-01/06 | grep gate (SQL structure) | `grep` XOR + security_invoker + carro_id SET NULL + 2 tables in `0027_carros.sql` | ✅ green |
| 08-01 T2 (apply + types) | 08-01 | 1 | CAR-01/06 | type gate + no-drift grep | `grep carros/abastecimentos/carro_id/v_abastecimento_consumo` + `npx tsc --noEmit` | ✅ green |
| 08-01 T3 (Wave-0 RLS + view-leak) | 08-01 | 1 | CAR-01/06 | integration (local stack) | `npm test -- tests/carro-rls.test.ts tests/carro-view-leak.test.ts` | ✅ green |
| 08-02 T1 (schema + assertOwnedCarro) | 08-02 | 2 | CAR-01 | type gate + grep | `npx tsc --noEmit` + `grep assertOwnedCarro/carroSchema` | ⬜ pending |
| 08-02 T2 (carros actions) | 08-02 | 2 | CAR-01 | action unit | `npm test -- src/actions/carros.test.ts` + `npx tsc --noEmit` | ⬜ pending |
| 08-03 T1 (nav entries) | 08-03 | 3 | CAR-06 | grep + type gate | `grep /carros + Car` in sidebar/bottom-nav + `npx tsc --noEmit` | ⬜ pending |
| 08-03 T2 (CarroForm + CarroCard) | 08-03 | 3 | CAR-01 | type gate + grep (no-money) | `npx tsc --noEmit` + `grep` actions wired + `grep -L AmountCell/formatCents` in card | ⬜ pending |
| 08-03 T3 (list + detail + loading) | 08-03 | 3 | CAR-01/06 | type + build + grep | `npx tsc --noEmit` + `npm run build` + `grep from('carros')/notFound/empty copy` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/carro-rls.test.ts` — 2-user RLS isolation across `carros`, `abastecimentos`, and `transactions.carro_id` (User B reads zero), PLUS the DB-level constraint negatives: cost XOR CHECK (both/neither rejected) and the partial unique index on `transaction_id` (double-link rejected). [Plan 08-01 Task 3] ✅ green (7 tests)
- [x] `tests/carro-view-leak.test.ts` — security_invoker proof for `v_abastecimento_consumo` + `v_carro_resumo` (User A sees own rows, User B reads zero). [Plan 08-01 Task 3] ✅ green (4 tests)
- [ ] `src/actions/carros.test.ts` — action unit tests (Zod gate, session gate, IDOR no-write on forged id, { ok } | { error } shape). [Plan 08-02 Task 2]

*Existing infra reused:* the `tests/helpers/local-supabase.ts` harness (readLocalConfig/serviceClient/userClient/createUser) covers the local-stack lifecycle; the mei-invoice-rls / mei-view-leak tests are the clone templates. The ~599 existing suite is the regression gate.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none required this phase) | CAR-01/06 | All behaviors are automatable via unit/integration tests + build/tsc gates; visual identity is the frozen Phase-7 system (no new visual primitives) | — |

> No `checkpoint:human-verify` task is included this phase: there is no new visual primitive (Phase-7 design system is reused verbatim) and every behavior has an automated gate. A human-verify walkthrough can be added at end-of-milestone if desired, but is not a phase blocker.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] RLS isolation test covers the 3 new schema objects (carros, abastecimentos, transactions.carro_id) + view-leak covers both views
- [x] Types regenerate with no drift (08-01 Task 2 gate)
- [x] `nyquist_compliant: true` set when planner completes the map

**Approval:** ready (planner-filled 2026-06-17). `wave_0_complete` flips true when 08-01 Task 3 + 08-02 Task 2 tests land green.
