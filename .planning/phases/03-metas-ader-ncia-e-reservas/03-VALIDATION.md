---
phase: 3
slug: metas-ader-ncia-e-reservas
status: wave-0-complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-16
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit + RLS integration against local Supabase) — installed |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` |
| **Full suite command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** quick run
- **After every plan wave:** full suite + tsc
- **Before verify:** full suite green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Secure/Correct Behavior | Test Type | Automated Command | Status |
|---------|------|-------------|-------------------------|-----------|-------------------|--------|
| 3-W0-01 | 0 | BUD-01 | budget_targets CRUD; direction defaults from kind (consumo→teto, alocacao→alvo); RLS isolation | integration | `npx vitest run budget-target` | ✅ (action-default it.skip → 03-03) |
| 3-W0-02 | 0 | BUD-02/03 | monthly adherence == YTD-consistent from same ledger; % of receita líquida exact (basis-points) | integration | `npx vitest run adherence-consistency` | ✅ |
| 3-W0-03 | 0 | RSV-03 | **aporte (Reserva tx) counts as investment ALLOCATION, never as consumption spend; alocação (Inv+Reserva) grouped** | integration | `npx vitest run reserva-aporte` | ✅ |
| 3-W0-04 | 0 | BUD-02 | adherence views are security_invoker — user B sees 0 of user A's adherence | integration | `npx vitest run view-leak` | ✅ |
| 3-W0-05 | 0 | RSV-05 | reserva balance = Σ in − Σ out (derived view), never a stored column | integration | `npx vitest run reserva-balance` | ✅ |
| 3-W0-06 | 0 | RSV-04 | saída validated ≤ saldo via atomic RPC; never leaves negative (incl. concurrent) | integration | `npx vitest run reserva-saida` | ✅ (fixed via 0017) |
| 3-W0-07 | 0 | RSV-02 | a transaction classified "Reserva" + chosen reserva creates a linked ledger 'in' entry | integration | `npx vitest run reserva-aporte` | ✅ |
| 3-W0-08 | 0 | RSV-04/RSV-02 | IDOR: a forged reserva_id from another user is rejected server-side before write | integration | `npx vitest run reserva-idor` | ✅ |
| 3-W0-09 | 0 | BUD-04 | alert flags at 80% (aproximando) and 100% (estourou/atingiu) per direction | unit | `npx vitest run src/lib/adherence.test.ts` | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/budget-target-crud.test.ts` + `tests/budget-target-direction.test.ts` — BUD-01 CRUD + direction (+ adherence-month/ytd for BUD-02/03 math) + RLS
- [x] `tests/adherence-consistency.test.ts` — BUD-02/03 monthly↔YTD same ledger
- [x] `tests/reserva-aporte.test.ts` — RSV-03 aporte = investment allocation (the #1 double-counting pitfall; allocation-grouping pinned here)
- [x] `tests/view-leak.test.ts` (extended) — security_invoker on adherence + balance views
- [x] `tests/reserva-balance.test.ts` — RSV-05 derived balance
- [x] `tests/reserva-saida.test.ts` — RSV-04 saída never negative (atomic RPC; concurrent TOCTOU fixed via 0017)
- [x] `tests/reserva-aporte.test.ts` — RSV-02 Reserva-tx creates linked ledger entry
- [x] `tests/reserva-idor.test.ts` — IDOR rejection on reserva_id (carry Phase 2 lesson)
- [x] `src/lib/adherence.test.ts` — BUD-04 unit: 80/100 thresholds per direction + percent never NaN%
- [x] Reuse `tests/helpers/local-supabase.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard mensal/anual tabs render adherence with correct semantic color | BUD-02 | Visual | Set targets, log data, view dashboard; confirm teto red-over / alvo green-at-target |
| "Qual reserva?" sub-flow inside transação dialog | RSV-02 | UI interaction | Log a "Reserva" transaction; confirm the reserva picker appears and links |
| Reserva progress bar appears only with alvo | RSV-01/05 | Visual | Create reserva with + without alvo; confirm bar shows only when alvo set |

*Core math (aporte grouping, derived balance, saída-never-negative, IDOR) is all automated; manual items are browser-render confirmations.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 35s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Wave-0 complete (03-02, 2026-06-16) — 9 integration tests + adherence unit authored, view-leak/rls-isolation extended, full suite 221 passed / 1 skipped (intentional 03-03 RED-pending), tsc clean. One RSV-04 TOCTOU bug found + fixed (migration 0017).
