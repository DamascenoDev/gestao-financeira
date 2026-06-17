---
phase: 9
slug: etiquetar-gastos-da-fatura-ao-carro
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 9 — Validation Strategy

> Tagging seam (CAR-02). Existing vitest suite (~635) is the regression gate. New unit tests cover: carro_id write/clear on create+update, bulk-tag action, ownership re-derive (IDOR no-write on forged carro), result shape. The D4 NON-DESTRUCTIVE invariant is the security-critical check — a test must prove tagging/untagging changes neither category_id/amount_cents nor any metas-adherence aggregate. RLS for carro_id covered by Phase-8 carro-rls.test.ts. Planner fills the per-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16 + jsdom |
| **Quick run** | `npm test -- <file>` |
| **Full suite** | `npm test` (baseline ~635 green) |
| **Type/build** | `npx tsc --noEmit` · `npm run build` |

Local Supabase stack used by action/RLS tests (must be UP).

---

## Sampling Rate
- After each task commit: `npm test -- <touched>` + `npx tsc --noEmit`.
- After wave: `npm test` (≥635) + `npm run build`.
- Before verify: full suite green + build clean + D4 non-destructive test green.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| {planner fills} | | | CAR-02 | | | ⬜ pending |

---

## Wave 0 Requirements
- [ ] {planner: carro_id write/clear + bulk-tag + IDOR action tests; D4 non-destructive assertion (category/amount/metas-agg unchanged after tag/untag)}

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {planner — most automatable; dashboard before/after for D4 can be a query-level test} | | | |

---

## Validation Sign-Off
- [ ] Every task has automated verify or Wave 0 dependency
- [ ] D4 non-destructive proven by an automated test (no metas/category/amount change on tag/untag)
- [ ] IDOR no-write on forged carro_id tested
- [ ] `nyquist_compliant: true` when map filled

**Approval:** pending
