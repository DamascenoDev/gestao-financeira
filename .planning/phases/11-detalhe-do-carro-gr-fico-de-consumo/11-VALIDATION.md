---
phase: 11
slug: detalhe-do-carro-gr-fico-de-consumo
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 11 — Validation Strategy

> Capstone presentation slice (CAR-05). Pure presentation over existing RLS-scoped views — no metas/accounting change (D4). Existing vitest suite (~720) is the regression gate. New unit/component tests: CarroConsumoChart (data + empty render, pt-BR tooltip via kmPerLitroLabel, null-km points omitted), CarroCategoriaBars (render + order + magnitude ratio + empty), CarroCard KPIs (format + '—' null discipline). The gasto-por-categoria aggregation is an INLINE RSC query (no new view — one consumer, RLS-scoped, lighter; CONTEXT-sanctioned) verified by an integration test (sums by point-in-time category, untagged excluded, RLS isolation user B = zero, D4 non-destructive). Build + tsc + bundle-secret re-audit (SEC-01 non-regress after the new chart client component) are the gates. **WR-02 (same-odometer double-count in v_abastecimento_consumo) is NOT fixed — documented as a known limitation in 11-03-SUMMARY (CONTEXT: fix only if clean/safe/well-tested; it touches the load-bearing interval math for a near-impossible degenerate shape already partly covered by the km<=0 guard).**

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x + @testing-library/react 16 + jsdom |
| **Quick run** | `npm test -- <file>` |
| **Full suite** | `npm test` (baseline ~720 green) |
| **Gates** | `npx tsc --noEmit` · `npm run build` · `bash scripts/check-bundle-secrets.sh .next/static` (SEC-01) |
| **No gen:types gate** | No new view/migration this phase (inline aggregation) → no `gen:types` drift gate. |

Local Supabase UP for the gasto-por-categoria aggregation integration test (carro-categoria-aggregation.test.ts).

---

## Sampling Rate
- After each task commit: `npm test -- <touched>` + `npx tsc --noEmit`.
- After wave: `npm test` (≥720) + `npm run build`.
- Before verify (Plan 04 gate): full suite green + build + secret-audit exit 0.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 11-01 T1 CarroConsumoChart | 11-01 | 1 | CAR-05 | component (jsdom) | `npm test -- carro-consumo-chart` | ⬜ pending |
| 11-01 T2 CarroCategoriaBars | 11-01 | 1 | CAR-05 | component (jsdom) | `npm test -- carro-categoria-bars` | ⬜ pending |
| 11-02 T1 CarroCard KPIs | 11-02 | 1 | CAR-05 | component (jsdom) | `npm test -- carro-card` | ⬜ pending |
| 11-02 T2 /carros RSC KPI wiring | 11-02 | 1 | CAR-05 | build + tsc | `npx tsc --noEmit && npm run build` | ⬜ pending |
| 11-03 T1 gasto-por-categoria aggregation | 11-03 | 2 | CAR-05 | integration (local stack) | `npm test -- carro-categoria-aggregation` | ⬜ pending |
| 11-03 T2 detail layout compose | 11-03 | 2 | CAR-05 | build + tsc | `npx tsc --noEmit && npm run build` | ⬜ pending |
| 11-03 T3 SEC-01 bundle re-audit | 11-03 | 2 | CAR-05 | gate | `npm run build && bash scripts/check-bundle-secrets.sh .next/static` | ⬜ pending |
| 11-04 T1 phase gate | 11-04 | 3 | CAR-05 | gate | `npm test && npx tsc --noEmit && npm run build && bash scripts/check-bundle-secrets.sh .next/static` | ⬜ pending |
| 11-04 T2 human-verify visual | 11-04 | 3 | CAR-05 | manual (browser) | human checkpoint (light+dark+mobile) | ⬜ pending |

---

## Wave 0 Requirements
- [ ] `tests/carro-consumo-chart.test.tsx` — data render (no empty copy), empty-state (0 and 1 valid point), null-omit (mixed series → empty), pt-BR/null tooltip-formatter unit assertions (`kmPerLitroLabel(12.4) === '12,4 km/l'`, `kmPerLitroLabel(null) === '—'`).
- [ ] `tests/carro-categoria-bars.test.tsx` — render + valor-desc order, magnitude (100% / 50% fill-width ratio via `data-slot="categoria-fill"`), empty line "Nenhum gasto vinculado a este carro.".
- [ ] `tests/carro-card-kpis.test.tsx` — non-null format (formatCents + "12,4 km/l"), null `—` discipline (NO "R$ 0,00"/"0 km/l"), identity link intact.
- [ ] `tests/carro-categoria-aggregation.test.ts` — INLINE aggregation (no view): per-category sums by point-in-time `category_id` in integer cents, untagged transaction excluded, RLS isolation (user B sees ZERO), D4 non-destructive (transactions/budget_targets byte-identical after the read). Local Supabase stack.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Consumption chart SVG: gold `--chart-1` line, theme flip (light↔dark), pt-BR tooltip on hover, null intervals absent from the curve, <2-points empty copy | CAR-05.4 | recharts renders SVG with no rendering engine in jsdom — geometry/colors/tooltip not observable | 11-04 human-verify checks 5, 6 |
| Category bars: neutral grey fill (not gold/money colors), valor-desc visual order, magnitude proportional | CAR-05.2 | computed colors / visual proportion need a real renderer | 11-04 human-verify check 4 |
| KPI cards + list KPIs: mono `tabular-nums`, `—` for no-data, neutral foreground (gasto total not red), section order | CAR-05.1/.2 | visual layout + color semantics not measurable in jsdom | 11-04 human-verify checks 1, 2, 3 |
| Responsive: KPI grid stack, chart full-width, Phase-10 table→card collapse on mobile | CAR-05.3/.5 | viewport-dependent layout | 11-04 human-verify check 7 |
| Empty states render in-browser (no zero bars, chart empty copy) | CAR-05.5 | visual confirmation of the inherited empty grammar | 11-04 human-verify check 8 |

---

## Validation Sign-Off
- [x] Every task has automated verify or Wave 0 dependency (chart/bars/card via jsdom + formatter unit; aggregation via integration; layout/colors via human-verify)
- [x] Chart/bars/card components tested (data + empty + pt-BR + null/magnitude discipline)
- [x] gasto-por-categoria aggregation tested (inline query: sums + RLS isolation + D4 non-destructive)
- [x] SEC-01 bundle-secret re-audit green after chart client component (11-03 T3 + 11-04 gate)
- [x] `nyquist_compliant: true` (map filled)

**Approval:** planned
