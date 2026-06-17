---
phase: 11
slug: detalhe-do-carro-gr-fico-de-consumo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 11 — Validation Strategy

> Capstone presentation slice (CAR-05). Pure presentation over existing RLS-scoped views — no metas/accounting change (D4). Existing vitest suite (~720) is the regression gate. New unit/component tests: CarroConsumoChart (data + empty render, pt-BR tooltip via formatCents, null-km points omitted), CarroCategoriaBars (render + magnitude), CarroCard KPIs. The gasto-por-categoria aggregation (new view v_carro_categoria OR inline query) needs an integration test if it's a view (security_invoker, RLS isolation, sums match, non-destructive). Build + tsc + bundle-secret re-audit (SEC-01 non-regress after the new chart client component) are the gates. Planner fills the per-task map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16 + jsdom |
| **Quick run** | `npm test -- <file>` |
| **Full suite** | `npm test` (baseline ~720 green) |
| **Gates** | `npx tsc --noEmit` · `npm run build` · `bash scripts/check-bundle-secrets.sh .next/static` (SEC-01) · `npm run gen:types` (no drift, if a view is added) |

Local Supabase UP for any new-view integration test.

---

## Sampling Rate
- After each task commit: `npm test -- <touched>` + `npx tsc --noEmit`.
- After wave: `npm test` (≥720) + `npm run build`.
- Before verify: full suite green + build + secret-audit exit 0 + (types no-drift if view added).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| {planner fills} | | | CAR-05 | | | ⬜ pending |

---

## Wave 0 Requirements
- [ ] {planner: CarroConsumoChart + CarroCategoriaBars component tests (data + empty + pt-BR + null-omit); if v_carro_categoria view → integration test (security_invoker, RLS isolation, sums grouped by point-in-time category, non-destructive to metas)}

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {planner — chart colors + theme-flip + tooltip + layout, light/dark + mobile; recharts SVG not measurable in jsdom} | CAR-05 | jsdom has no rendering engine for recharts SVG/colors | human-verify checkpoint |

---

## Validation Sign-Off
- [ ] Every task has automated verify or Wave 0 dependency
- [ ] Chart/bars components tested (data + empty + pt-BR + null discipline)
- [ ] gasto-por-categoria aggregation tested (+ RLS/non-destructive if a view)
- [ ] SEC-01 bundle-secret re-audit green after chart client component
- [ ] `nyquist_compliant: true` when map filled

**Approval:** pending
