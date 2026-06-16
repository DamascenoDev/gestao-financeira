---
phase: 2
slug: receitas-categorias-e-lan-amentos-manuais
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-16
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit + RLS integration against local Supabase) — already installed (Phase 1) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** `npx vitest run`
- **After every plan wave:** `npx vitest run && npx tsc --noEmit`
- **Before verify:** Full suite green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Secure/Correct Behavior | Test Type | Automated Command | Status |
|---------|------|-------------|-------------------------|-----------|-------------------|--------|
| 2-W0-01 | 0 | INC-04 | `receita líquida do mês` = SUM of all month incomes; view is `security_invoker` (no cross-user leak) | integration | `npx vitest run income-month` | ⬜ |
| 2-W0-02 | 0 | INC-02 | Editing one month's occurrence does NOT change template or other months | integration | `npx vitest run income-occurrence` | ⬜ |
| 2-W0-03 | 0 | INC-03 | Multiple avulsas allowed in same month (template_id NULL) | integration | `npx vitest run income-adhoc` | ⬜ |
| 2-W0-04 | 0 | CAT-02 | Hard-delete of category WITH transactions is blocked (RESTRICT); archive/reassign works | integration | `npx vitest run category-delete` | ⬜ |
| 2-W0-05 | 0 | CAT-03 | Category kind toggle consumo↔alocação persists | unit/integration | `npx vitest run category-kind` | ⬜ |
| 2-W0-06 | 0 | TXN-01/02 | Transaction create/edit/delete; amount_cents positive bigint; RLS two-user isolation | integration | `npx vitest run transactions-rls` | ⬜ |
| 2-W0-07 | 0 | TXN-04 | Bulk re-classify updates N selected rows to one category in one action | integration | `npx vitest run bulk-reclassify` | ⬜ |
| 2-W0-08 | 0 | INC-04/TXN-03 | `v_category_totals` / month views are `security_invoker` — user B sees 0 of user A's totals | integration | `npx vitest run view-leak` | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/income-month.test.ts` — INC-04 sum + view leak
- [ ] `tests/income-occurrence.test.ts` — INC-02 occurrence-edit isolation
- [ ] `tests/category-delete.test.ts` — CAT-02 delete-block + reassign
- [ ] `tests/transactions-rls.test.ts` — TXN-01/02 CRUD + two-user RLS
- [ ] `tests/bulk-reclassify.test.ts` — TXN-04
- [ ] Reuse `tests/helpers/local-supabase.ts` (exists)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extrato month/category filters update list + URL | TXN-03 | Browser interaction | Change month + multi-select categories; confirm list + URL update |
| Bulk-select rows → SelectionActionBar → apply category | TXN-04 | UI selection interaction | Select several rows, apply a category, confirm all updated |
| INC-02 "só neste mês vs template" edit choice | INC-02 | UI dialog choice | Edit a recurring occurrence; pick "só este mês"; confirm template intact |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
