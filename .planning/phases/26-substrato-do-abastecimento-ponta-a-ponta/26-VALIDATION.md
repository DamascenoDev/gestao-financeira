---
phase: 26
slug: substrato-do-abastecimento-ponta-a-ponta
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Pure data-layer phase: every DB invariant is proven by **vitest integration tests against the local Supabase Docker stack** (no pgTAP in this repo). New assertions clone `tests/carro-consumo.test.ts` / `tests/carro-view-leak.test.ts` / `tests/abastecimento-action.test.ts` and use the `tests/helpers/local-supabase.ts` harness (`serviceClient`/`userClient`/`createUser`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.9 [VERIFIED: package.json] |
| **Config file** | `vitest.config.ts` [VERIFIED] |
| **Quick run command** | `npx vitest run tests/<file>.test.ts` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **DB stack** | local Supabase Docker (`supabase start`); clean replay via `npm run db:reset` |
| **Estimated runtime** | full suite ~ tens of seconds against the local stack |

---

## Sampling Rate

- **After every task commit:** Run the touched DB test, e.g. `npx vitest run tests/abastecimento-cost-check.test.ts`
- **After every plan wave:** Run `npm test` (full vitest suite against the local stack)
- **Before `/gsd-verify-work`:** `npm run db:reset` exits 0 (clean replay) → `npm run gen:types` → full suite green
- **Max feedback latency:** single-file test ~ a few seconds; full suite ~ tens of seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. This map keys verification by Success Criterion (SC1–SC5) + the cross-cutting view/security invariants. Each row becomes one or more `<automated>` verify blocks on the plan tasks that touch it.

| SC | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|----|-------------|-----------------|-----------|-------------------|-------------|--------|
| SC1 | FUEL-01 | "Combustível" (kind `consumo`, sort 4) present on NEW account via `handle_new_user`; backfilled idempotently on existing; **no `gen:types` diff** (data/trigger only) | integration + git assert | `npx vitest run tests/categorias-combustivel.test.ts` + `git diff --exit-code src/types/database.types.ts` after `gen:types` on the SEED migration | ❌ W0 | ⬜ pending |
| SC2 | FUEL-01 | Relaxed CHECK accepts attach-later (T+A, à-vista) & parcelado (V only); rejects "neither" & parcelado-with-tx/amount/no-V (`23514`) | integration (insert → expect `23514`) | `npx vitest run tests/abastecimento-cost-check.test.ts` (9-row truth table) | ❌ W0 | ⬜ pending |
| SC3 | FUEL-01 | `parcelas_total` + `valor_total_cents` persist; à-vista path (1:1 `transaction_id` + unique index) unchanged — no regression | integration | extend `tests/abastecimento-cost-check.test.ts` / `tests/abastecimento-action.test.ts` | ❌ W0 | ⬜ pending |
| SC4 | FUEL-01 | Re-link enabled at DB/contract: a tx links to a pre-existing abastecimento; junction `unique(transaction_id)` + `unique(abastecimento_id, parcela_num)` + double-link rejection + RLS isolation | integration | `npx vitest run tests/abastecimento-parcelas.test.ts` | ❌ W0 | ⬜ pending |
| SC5 | FUEL-01 | Migrations replay clean in order; `database.types.ts` regenerated showing ONLY new table + 2 columns | command + git assert | `npm run db:reset` (exit 0) → `npm run gen:types` → `git diff src/types/database.types.ts` scoped to new table + columns | ❌ W0 (CI/manual gate) | ⬜ pending |
| view | — | Parcelado consumo cost = `valor_total_cents` **once**; tagged parcela transactions don't inflate consumo (no double-count) | integration | extend `tests/carro-consumo.test.ts` with a parcelado fixture | ✅ (extend) | ⬜ pending |
| view | — | WR-02/05/06 still hold after `v_abastecimento_consumo` rewrite (regression) | integration | `npx vitest run tests/carro-consumo.test.ts` (same-odometer fixture) | ✅ exists | ⬜ pending |
| sec | — | Both rewritten views stay `security_invoker = true` (anti-leak) | integration | `npx vitest run tests/carro-view-leak.test.ts` (must stay green) | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### CHECK truth table (the deterministic SC2/SC3 assertions)

Let **P** = `parcelas_total > 1`, **T** = `transaction_id` not null, **A** = `amount_cents` not null, **V** = `valor_total_cents` not null. Each row is one insert assertion (expect success, or expect Postgres `23514` check_violation).

| Case | P | T | A | V | Expected |
|------|---|---|---|---|----------|
| à-vista manual (v1.2) | F | F | T | F | **PASS** |
| à-vista linked (v1.2) | F | T | F | F | **PASS** |
| attach-later (D-01) | F | T | T | F | **PASS** |
| à-vista neither | F | F | F | F | **REJECT** |
| à-vista with V leak | F | T/F | T/F | T | **REJECT** |
| parcelado valid (D-05) | T | F | F | T | **PASS** |
| parcelado + tx | T | T | F | T | **REJECT** |
| parcelado + amount | T | F | T | T | **REJECT** |
| parcelado no V | T | F | F | F | **REJECT** |

---

## Wave 0 Requirements

- [ ] `tests/abastecimento-cost-check.test.ts` — the 9-row CHECK truth table (SC2/SC3). New file; clone `abastecimento-action.test.ts` seeding helpers + `23514` rejection assertion pattern.
- [ ] `tests/abastecimento-parcelas.test.ts` — junction `unique(transaction_id)`, `unique(abastecimento_id, parcela_num)`, double-link rejection, RLS isolation (SC4). New file; clone `carro-rls.test.ts` shape.
- [ ] `tests/categorias-combustivel.test.ts` — new account has "Combustível" at sort 4 + backfill idempotency (SC1). New file.
- [ ] Extend `tests/carro-consumo.test.ts` — add a parcelado fixture asserting `custo_intervalo_cents == valor_total_cents` and that tagged parcela transactions don't inflate consumo (no double-count).
- [ ] No framework install needed — vitest + `tests/helpers/local-supabase.ts` harness already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `gen:types` diff scope (SC1 no-diff for seed; SC5 scoped diff for schema) | FUEL-01 | Diff inspection is a git/CI assertion, not a runtime test | After applying each migration run `npm run gen:types`; assert seed migration yields empty diff on `src/types/database.types.ts`, schema migration yields a diff scoped to the new table + 2 columns |

*Clean replay (`npm run db:reset` exit 0) is automatable in CI but runs as a phase-gate command, not a per-task unit test.*

---

## Deterministic vs Backstop

- **Deterministic (SQL/test assertions — gate the phase):** the full CHECK truth table (9 inserts), junction unique + double-link rejection, view `security_invoker` leak test, parcelado no-double-count fixture, clean replay exit code, `gen:types` diff scope.
- **Backstop:** none required — the state space is the finite truth table above; exhaustive enumeration **is** the test. No AI/non-determinism in this phase.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files + 1 extension)
- [ ] No watch-mode flags
- [ ] Feedback latency acceptable (single-file ~seconds)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
