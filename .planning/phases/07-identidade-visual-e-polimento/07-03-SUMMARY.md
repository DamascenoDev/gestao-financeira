---
phase: 07-identidade-visual-e-polimento
plan: 03
subsystem: data-viz
tags: [recharts, charts, dashboard, react-is-override, re-skin, token-aware]
requires:
  - "07-01 navy+gold token substrate (--income/--consumption/--chart-1..5 already re-tuned + @theme inline mirrors)"
  - "Existing security_invoker views v_income_month + v_category_totals (RLS-scoped)"
  - "src/lib/money.ts formatCents + src/lib/month.ts shiftMonthKey/monthLabel"
provides:
  - "recharts 3.8.0 runtime dep + overrides.react-is 19.2.4 (Recharts-3↔React-19 reconciliation)"
  - "src/components/ui/chart.tsx vendored (ChartContainer/ChartTooltip/ChartTooltipContent/ChartConfig)"
  - "ReceitaGastoChart — monthly receita(--income) vs gasto(--consumption) bars, token-aware, formatCents"
  - "CategoryDistributionChart — donut over the --chart-1..5 categorical ramp, formatCents total+legend"
  - "Dashboard data-viz block (UI-04/05) fed by existing-view reads only — no new query/view/migration"
affects:
  - "src/app/(app)/dashboard/page.tsx (RSC gains chart-data derivation + 2-col chart grid above adherence)"
  - "package.json (recharts dep + overrides key created)"
tech-stack:
  added:
    - "recharts 3.8.0 (via npx shadcn add chart) — the only new runtime dep this phase"
    - "overrides.react-is 19.2.4 (matches installed React 19.2.4)"
  patterns:
    - "shadcn ChartContainer + ChartConfig satisfies → color: var(--token); --color-{key} auto-themes via .dark"
    - "Charts are pure-data client components; the RSC derives series from existing RLS-scoped views"
    - "Recharts mocked to inert passthroughs in jsdom tests (ResponsiveContainer needs absent ResizeObserver)"
key-files:
  created:
    - src/components/ui/chart.tsx
    - src/components/receita-gasto-chart.tsx
    - src/components/receita-gasto-chart.test.tsx
    - src/components/category-distribution-chart.tsx
    - src/components/category-distribution-chart.test.tsx
  modified:
    - package.json
    - package-lock.json
    - src/app/(app)/dashboard/page.tsx
decisions:
  - "Gauge/adherence re-skin = NO code change: the 07-01 token swap already made --income/--consumption/--destructive/meiStatusTokens/adherenceTokens direction-aware, so the existing fills follow the new palette. Touching fill/clamp/aria was prohibited; the optional radial/arc treatment was deliberately skipped to keep the behavior tests green and the logic untouched (UI-06 satisfied by the substrate)."
  - "gasto per month = Σ consumo-category totals only; alocação rows are transfers/savings (RSV-03 locked) and are excluded from the spending series + distribution."
  - "Category names+kind read for ALL categories (incl. archived) — historical transactions reference archived categories; the non-archived MetaDialog query would mislabel them."
  - "Distribution donut uses the categorical --chart-1..5 ramp (repeating), never the money tokens, so a slice never reads as 'income' (UI-SPEC collision rule)."
metrics:
  duration: ~7 min
  completed: 2026-06-17
  tasks: 3
  files: 5 created / 3 modified
---

# Phase 7 Plan 03: Dashboard Data-Viz (recharts) + Gauge/Adherence Re-skin Summary

Added the dashboard's two graphical charts — `ReceitaGastoChart` (monthly receita-vs-gasto bars in `--income`/`--consumption`) and `CategoryDistributionChart` (a donut over the `--chart-1..5` categorical ramp) — by installing `recharts` with the mandatory `react-is` 19.2.4 override, vendoring shadcn's `chart.tsx`, and feeding both charts from EXISTING RLS-scoped views the RSC already had access to, with zero new query/view/migration and the gauge/adherence logic left untouched.

## What Was Built

**Task 1 (commit `a6174cb`, chore):** `npx shadcn add chart` vendored `src/components/ui/chart.tsx` (exports `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartConfig`, `ChartLegend`, `ChartLegendContent`) and installed `recharts@3.8.0`. Created the `overrides` key in `package.json` (`"react-is": "19.2.4"`, matching the installed React 19.2.4) and re-ran `npm install` — confirmed `react-is` re-resolved from the transitive `16.13.1` to `19.2.4` (`node -e require('react-is/package.json').version` → 19.2.4). Gates: `tsc` clean, `npm test` 587 passed (≥559 baseline held), `npm run build` exit 0 with no react-is/`isFragment` error, `scripts/check-bundle-secrets.sh .next/static` exit 0 (recharts is client-only viz; no service-role secret reached the bundle — SEC-01 holds).

**Task 2 (commits `be89a7c` test-RED, `a17b4b3` feat-GREEN):** TDD.
- RED: `receita-gasto-chart.test.tsx` + `category-distribution-chart.test.tsx` assert (1) labeled totals/legend via `formatCents` accompany each chart (Pitfall 6 — never sole-carrier), (2) the exact pt-BR empty-state copy ("Sem dados para o gráfico" / "Nenhum gasto neste mês"), (3) the UI-SPEC `aria-label`s. `recharts` is mocked to inert passthroughs because `ResponsiveContainer` needs `ResizeObserver` (absent in jsdom). Failed at import-resolution (components missing) = clean RED.
- GREEN: `receita-gasto-chart.tsx` (`'use client'`) — `ChartContainer` + `ChartConfig satisfies` mapping `receita→var(--income)`, `gasto→var(--consumption)`; grouped `Bar`s on `var(--color-receita)`/`var(--color-gasto)`; `ChartTooltipContent` with a `formatCents` formatter; a `<dl>` totals legend; empty-state; `aria-label="Evolução de receita e gasto por mês"`. `category-distribution-chart.tsx` (`'use client'`) — donut `Pie` cycling the `var(--chart-1..5)` ramp (never money tokens); `formatCents` tooltip + month total + per-category legend; empty-state; `aria-label="Distribuição de gastos por categoria em {mês}"`. 6/6 tests GREEN, `tsc` clean.

**Task 3 (commit `54d5873`, feat):** `src/app/(app)/dashboard/page.tsx` gained chart-data derivation and mounting — **existing views only**. Two reads added to the `Promise.all`: `v_income_month` and `v_category_totals` filtered `.in('month_key', chartMonthKeys)` over a 12-month SP-pinned window (`shiftMonthKey(mes, i-11)`), plus a `categories(id,name,kind)` read (incl. archived) for classification. Built `{ mes, receita, gasto }[]` (gasto = Σ consumo-category totals; alocação excluded) and `{ categoria, cents }[]` for the selected month (consumo-only, name-resolved, sorted desc). Mounted both in a responsive `grid-cols-1 lg:grid-cols-2` of `Card`s above the adherence list. Gauge/adherence: re-skin satisfied by the 07-01 token swap — no code change, `role="progressbar"`/`aria-valuetext`/clamp untouched.

## Verification

- `npx tsc --noEmit` → clean (exit 0).
- `npm test` → **593 passed / 71 files** (587 baseline + 6 new chart tests; ≥559 held).
- `npm run build` → ✓ Compiled successfully (exit 0); no react-is/`isFragment` error.
- `scripts/check-bundle-secrets.sh .next/static` → exit 0 (no secret markers).
- Acceptance greps: `ReceitaGastoChart`/`CategoryDistributionChart` mounted (2 each); dashboard reads only `v_adherence_month`/`v_adherence_ytd`/`v_category_totals`/`v_income_month`; `.rpc(` count 0; `git status supabase/migrations/` clean (no migration); `limite-gauge.tsx`/`adherence-bar.tsx` unmodified, `role="progressbar"`+`aria-valuetext` present (4 each); receita-gasto uses `var(--income)`+`var(--consumption)`, distribution uses `var(--chart-1..5)` with 0 money tokens; `formatCents` present in both charts.

## Deviations from Plan

None — plan executed exactly as written. The only judgment call was the locked-in plan constraint itself: the gauge/adherence "re-skin" required no code edit because the 07-01 substrate already carries the direction-aware palette, and the plan explicitly forbade touching fill/clamp/aria. The optional radial/arc gauge treatment was deliberately not added (it is "at most" / optional in the plan and risks the frozen behavior tests).

## Self-Check: PASSED

- `src/components/ui/chart.tsx` — FOUND
- `src/components/receita-gasto-chart.tsx` — FOUND
- `src/components/receita-gasto-chart.test.tsx` — FOUND
- `src/components/category-distribution-chart.tsx` — FOUND
- `src/components/category-distribution-chart.test.tsx` — FOUND
- `src/app/(app)/dashboard/page.tsx` — FOUND (modified)
- Commit `a6174cb` — FOUND
- Commit `be89a7c` — FOUND
- Commit `a17b4b3` — FOUND
- Commit `54d5873` — FOUND
