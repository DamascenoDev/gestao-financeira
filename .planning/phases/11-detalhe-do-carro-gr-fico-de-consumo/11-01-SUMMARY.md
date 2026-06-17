---
phase: 11-detalhe-do-carro-gr-fico-de-consumo
plan: 01
subsystem: ui
tags: [recharts, shadcn-chart, react, tailwind, pt-BR, carro, data-viz]

# Dependency graph
requires:
  - phase: 07-identidade-visual-e-polimento
    provides: "ui/chart.tsx (ChartContainer/ChartTooltip/ChartTooltipContent), ReceitaGastoChart line/bar analog, AdherenceBar track/fill grammar, recharts + react-is override, token-aware --chart-1, ChartSkeleton"
  - phase: 10-abastecimento-h-brido-consumo
    provides: "src/lib/carro/consumo.ts (kmPerLitroLabel), v_abastecimento_consumo per-interval km/l, AbastecimentoHistory"
provides:
  - "CarroConsumoChart — pure-data client recharts km/l-over-time LineChart (token-aware --chart-1, pt-BR tooltip, null/0 drop, empty state)"
  - "consumoTooltipFormatter — appends the 'km/l' unit to the frozen kmPerLitroLabel output while preserving the '—' null sentinel"
  - "CarroCategoriaBars — pure-data magnitude bars (neutral bg-muted-foreground fill, valor-desc order, formatCents mono label, empty line)"
  - "CarroConsumoDatum / CarroCategoriaDatum prop types — the contract Plan 03's detail-page RSC wiring consumes"
affects: [11-02, 11-03, 11-04, carros-detail-page, carro-card]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-data presentation leaf: client/server component receives pre-aggregated, RLS-scoped props — no DB client, no env, no secret"
    - "Mirror-not-import for visual grammar: CarroCategoriaBars copies AdherenceBar's track/fill markup without importing its meta/progressbar semantics"
    - "Component-local tooltip formatter wraps a frozen lib helper to add a display unit without editing the shared helper"

key-files:
  created:
    - src/components/carro-consumo-chart.tsx
    - src/components/carro-categoria-bars.tsx
    - src/components/carro-consumo-chart.test.tsx
    - src/components/carro-categoria-bars.test.tsx
  modified: []

key-decisions:
  - "Tests placed in src/components/*.test.tsx (the frozen component-test convention) instead of the plan's tests/*.tsx — vitest include matches tests/**/*.test.ts (no .tsx) but src/**/*.test.{ts,tsx}; the planned path would never run"
  - "consumoTooltipFormatter added in-component: the frozen kmPerLitroLabel returns '12,4' (no unit), so the component appends ' km/l' for the tooltip rather than editing the shared, multi-consumer helper"
  - "CarroCategoriaBars is a server-renderable presentational component (no 'use client') — no interactivity needed"

patterns-established:
  - "Pure-data chart/bar leaf components define the prop contract (CarroConsumoDatum/CarroCategoriaDatum) that the RSC compose step fills"
  - "data-slot attributes (categoria-row / categoria-fill) make non-SVG magnitude geometry assertable in jsdom"

requirements-completed: [CAR-05]

# Metrics
duration: 12min
completed: 2026-06-17
status: complete
---

# Phase 11 Plan 01: CarroConsumoChart + CarroCategoriaBars Summary

**Two pure-data Phase-11 presentation leaves — a token-aware recharts km/l-over-time LineChart (pt-BR tooltip, null/0-interval drop, empty state) and a neutral gasto-por-categoria magnitude-bar list (valor-desc, formatCents mono label) — each behind a Wave-0-tested prop contract.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-17T19:16:00Z
- **Completed:** 2026-06-17T19:25:00Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 created (2 components, 2 test suites)

## Accomplishments
- `CarroConsumoChart`: client recharts `LineChart` mirroring `ReceitaGastoChart`'s structure (Bar→Line), token-aware `--chart-1` series via `ChartContainer`'s `--color-kmPorLitro`, pt-BR tooltip, filters to finite-positive points so a stray null never plots a gap-filled 0, and renders the exact pt-BR empty copy below 2 valid points.
- `CarroCategoriaBars`: neutral `bg-muted-foreground` magnitude bars (never gold, never the income/consumption/allocation semantic money tokens), one row per categoria ordered by valor desc, each with an accessible name + `formatCents` mono `tabular-nums` amount, and a single muted empty line.
- Wave-0 component tests green: data render, empty (0/1 point), null-omit→empty, pt-BR tooltip formatter (Task 1); render+order, magnitude 100%/50% width ratio, empty (Task 2).
- `tsc --noEmit` clean; full suite green at 729 (720 baseline + 9 new).

## Task Commits

Each task was committed atomically (TDD: RED test + GREEN impl in one commit per task):

1. **Task 1: CarroConsumoChart — km/l-over-time line** - `c68b631` (feat)
2. **Task 2: CarroCategoriaBars — gasto-por-categoria magnitude bars** - `46d8b93` (feat)

**Plan metadata:** see final docs commit.

## Files Created/Modified
- `src/components/carro-consumo-chart.tsx` - Client recharts km/l LineChart (token-aware `--chart-1`, pt-BR tooltip via `consumoTooltipFormatter`+`kmPerLitroLabel`, null/0 drop, pt-BR empty state). Exports `CarroConsumoChart`, `consumoTooltipFormatter`, `CarroConsumoDatum`.
- `src/components/carro-categoria-bars.tsx` - Server-renderable magnitude bars (categoria + `bg-muted` track + neutral `bg-muted-foreground` fill at `valor/maiorValor` + `formatCents` mono label + accessible name). Exports `CarroCategoriaBars`, `CarroCategoriaDatum`.
- `src/components/carro-consumo-chart.test.tsx` - Wave-0: data render (no empty copy), empty (0/1 point), null-omit→empty, pt-BR/null formatter (recharts mocked to inert passthroughs).
- `src/components/carro-categoria-bars.test.tsx` - Wave-0: render + names + amounts, valor-desc order, magnitude width ratio (100%/50%), empty line + no track.

## Decisions Made
- **Test location** moved to `src/components/*.test.tsx` (see Deviations — Rule 3). This is the established convention every prior component test (`receita-gasto-chart.test.tsx`, `category-distribution-chart.test.tsx`, etc.) follows.
- **`consumoTooltipFormatter`** added in-component because the frozen `kmPerLitroLabel` renders only the number (`'12,4'`), with the `km/l` unit supplied separately by surrounding UI (e.g. the `AbastecimentoHistory` `km/l` column header). For a standalone tooltip the unit must travel with the value, so the component wraps the helper rather than editing the shared, multi-consumer helper. The frozen helper is unchanged; the formatter preserves the `'—'` null sentinel bare.
- **`CarroCategoriaBars` is server-renderable** (no `'use client'`) — purely presentational, no interactivity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test files placed in src/components/ instead of tests/**
- **Found during:** Task 1 (and Task 2)
- **Issue:** The plan specified `tests/carro-consumo-chart.test.tsx` and `tests/carro-categoria-bars.test.tsx`, but `vitest.config.ts` `test.include` is `['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts']` — the `tests/**` glob matches only `.ts`, not `.tsx`. A `.tsx` test under `tests/` would never be collected or run, so the plan's verification (`npm test -- carro-consumo-chart`) could not pass as written.
- **Fix:** Created the suites at `src/components/carro-consumo-chart.test.tsx` and `src/components/carro-categoria-bars.test.tsx`, alongside the components and the frozen analog (`src/components/receita-gasto-chart.test.tsx`) — the established convention every existing component test follows. Behavior/coverage is identical to the plan's spec.
- **Files modified:** src/components/carro-consumo-chart.test.tsx, src/components/carro-categoria-bars.test.tsx
- **Verification:** Both suites are collected and pass (5 + 4 tests); full suite green at 729.
- **Committed in:** `c68b631` (Task 1), `46d8b93` (Task 2)

**2. [Rule 1 - Bug] Corrected the plan's tooltip-formatter assertion to match the frozen helper**
- **Found during:** Task 1
- **Issue:** The plan asserted `kmPerLitroLabel(12.4) === '12,4 km/l'`, but the frozen helper (`src/lib/carro/consumo.ts`, shipped Phase 10, used by `AbastecimentoHistory`/KPIs) returns `'12,4'` — it does not append the unit. Asserting the wrong return value, or editing the shared helper to satisfy it, would have broken the helper's existing consumers.
- **Fix:** Test asserts the real helper output (`kmPerLitroLabel(12.4) === '12,4'`, `kmPerLitroLabel(null) === '—'`) AND the new component-local `consumoTooltipFormatter(12.4) === '12,4 km/l'` / `consumoTooltipFormatter(null) === '—'`. The frozen helper is untouched; the `km/l` unit is added at the tooltip edge inside the new component.
- **Files modified:** src/components/carro-consumo-chart.test.tsx, src/components/carro-consumo-chart.tsx
- **Verification:** 5/5 tests pass; `tsc --noEmit` clean.
- **Committed in:** `c68b631` (Task 1)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both are mechanical corrections to keep the planned behavior runnable against the actual repo conventions (vitest include glob) and the frozen helper contract. No scope creep, no token/color drift — the component behavior matches the plan and UI-SPEC exactly.

## Issues Encountered
- During one FULL `vitest run`, `tests/reserva-saida.test.ts` failed in `readLocalConfig` (local Supabase CLI config read) under parallel contention — the same flake class as Phase 10's `lgpd-export` note. In isolation it passes 4/4 and a re-run of the full suite passed 729/729. Unrelated to these pure-presentation components (no Supabase import). Logged to `.planning/phases/11-detalhe-do-carro-gr-fico-de-consumo/deferred-items.md`. Not fixed (out of scope, pre-existing harness concurrency issue).

## Known Stubs
None — both components are fully implemented pure-data leaves. The RSC wiring that supplies real series/aggregates is intentionally deferred to Plan 03 (per the plan's objective: these define the contract the detail-page compose step fills).

## Threat Flags
None — both components are pure-data presentation leaves. No Supabase client, no `process.env`, no service-role import, no network endpoint, no new trust boundary. Matches the plan's `<threat_model>` (T-11-01/T-11-02 `mitigate` dispositions: pure-data props only). The full bundle-secret re-audit (SEC-01) runs in Plan 03 after the detail page imports these.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The two visual primitives + their `CarroConsumoDatum` / `CarroCategoriaDatum` prop contracts are ready for the Plan 03 `/carros/[id]` RSC compose step (drop null-km/l intervals upstream, aggregate gasto-por-categoria, pass the series).
- No blockers. recharts + react-is override + chart grammar all inherited and unchanged; no new deps, no new tokens.

## Self-Check: PASSED

All 4 created files exist on disk and both task commits (`c68b631`, `46d8b93`) are present in git history.

---
*Phase: 11-detalhe-do-carro-gr-fico-de-consumo*
*Completed: 2026-06-17*
