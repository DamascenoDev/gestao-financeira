---
phase: 11-detalhe-do-carro-gr-fico-de-consumo
plan: 02
subsystem: ui
tags: [carro, carro-card, v_carro_resumo, rsc, supabase-rls, pt-BR, kpi]

# Dependency graph
requires:
  - phase: 08-substrato-carro-crud-navega-o
    provides: "CarroCard identity card (apelido link · modelo·placa·ano · combustível/Arquivado badges · Editar/Arquivar dropdown), /carros list RSC + archived filter"
  - phase: 07-identidade-visual-e-polimento
    provides: "ReceitaGastoChart labeled-total dl grammar (text-muted-foreground label over font-mono font-semibold tabular-nums value)"
  - phase: 10-abastecimento-h-brido-consumo
    provides: "src/lib/carro/consumo.ts (kmPerLitroLabel + '—' sentinel), v_carro_resumo (security_invoker) gasto_total_cents + km_por_litro_medio"
provides:
  - "CarroCardData extended with gastoTotalCents + kmPorLitroMedio (number | null)"
  - "CarroCard additive two-up KPI strip (gasto total + km/l médio, mono tabular-nums, '—' null sentinel)"
  - "/carros RSC reads v_carro_resumo RLS-scoped and passes KPIs per carro (0-gasto coalesce → null → '—')"
affects: [11-03, carros-list, carro-card]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive view-KPI read in an RSC: a second security_invoker read joined into the existing card map by id; read failure degrades to null KPIs, never fails the page"
    - "Coalesce-to-null at the mapping edge: the view coalesces gasto_total_cents to 0, the RSC remaps 0 → null so the card renders '—' (D4 no-fake-zero discipline)"
    - "Component-local unit label (kmPorLitroKpiLabel) appends ' km/l' to the frozen kmPerLitroLabel output only for real numbers, leaving the '—' sentinel bare"

key-files:
  created:
    - src/components/carro-card-kpis.test.tsx
  modified:
    - src/components/carro-card.tsx
    - src/app/(app)/carros/page.tsx
    - src/app/(app)/carros/[id]/page.tsx

key-decisions:
  - "Test placed at src/components/carro-card-kpis.test.tsx (the frozen component-test convention) not the plan's tests/*.tsx — vitest include matches src/**/*.test.{ts,tsx} but only tests/**/*.test.ts (no .tsx); the planned path would never run (same correction as Plan 01)"
  - "km/l value renders via a component-local kmPorLitroKpiLabel that appends ' km/l' to the frozen kmPerLitroLabel ('12,4'), keeping the '—' sentinel bare — the shared helper (used by AbastecimentoHistory/detail KPIs) is untouched"
  - "[id]/page.tsx null-fills the two new CarroCardData fields (gastoTotalCents/kmPorLitroMedio = null) — the detail-page KPIs are Plan 03's job; this keeps the build coherent without claiming detail-page work"

requirements-completed: [CAR-05]

# Metrics
duration: 6min
completed: 2026-06-17
status: complete
---

# Phase 11 Plan 02: CarroCard KPIs + /carros RSC Wiring Summary

**The /carros list now shows real gasto total + km/l médio per card, read from the existing `v_carro_resumo` (RLS-scoped), with the `—` sentinel for no-data — completing the deferred Phase-8 identity-only card promise without touching its identity/actions.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-17T19:26:17Z
- **Completed:** 2026-06-17T19:31:55Z
- **Tasks:** 2 (Task 1 TDD)
- **Files:** 1 created (test), 3 modified

## Accomplishments
- `CarroCardData` gains `gastoTotalCents: number | null` + `kmPorLitroMedio: number | null`; `CarroCard` renders an additive two-up `dl` KPI strip below the identity/badges block, mirroring `ReceitaGastoChart`'s labeled-total grammar (`text-xs text-muted-foreground` label over `font-mono text-sm font-semibold tabular-nums` value), neutral foreground — no gold, never red.
- Null discipline enforced both at the component (null → `—`) and at the RSC mapping (view's coalesced `gasto_total_cents` of 0 → `null` → `—`): never `R$ 0,00`, never `0 km/l`.
- `/carros` RSC adds a second RLS-scoped `v_carro_resumo` read (`security_invoker`, no `.eq` needed), keys a `Map` by `carro_id`, and attaches KPIs per carro; a KPI read failure degrades to null KPIs (cards still render identity + `—`) and never fails the page. Archived filter, ordering, empty/error states unchanged.
- Identity (apelido link to `/carros/{id}`, modelo·placa·ano, combustível/Arquivado badges, Editar/Arquivar dropdown) left exactly as-is.
- Wave-0 `carro-card-kpis.test.tsx` green: non-null KPIs format (`formatCents` digits + `12,4 km/l`), null KPIs render two `—` with NO `R$ 0,00` / `0 km/l`, identity link intact.
- `tsc --noEmit` clean; `npm run build` exit 0 (`/carros` + `/carros/[id]` compile); full suite green at **732** (729 baseline + 3 new).

## Task Commits

1. **Task 1: Extend CarroCard with the additive KPI strip** (TDD RED+GREEN) — `58a0f2c` (feat)
2. **Task 2: Wire /carros RSC to read v_carro_resumo KPIs per carro** — `759a757` (feat)

**Plan metadata:** see final docs commit.

## Files Created/Modified
- `src/components/carro-card.tsx` (modified) — `CarroCardData` + 2 fields; `kmPorLitroKpiLabel` helper; additive `dl` KPI strip; docstring updated (KPIs no longer "deferred").
- `src/components/carro-card-kpis.test.tsx` (created) — Wave-0: non-null format, null `—` discipline (no `R$ 0,00`/`0 km/l`), identity link intact. Mocks `@/actions/carros`.
- `src/app/(app)/carros/page.tsx` (modified) — additive `v_carro_resumo` RLS-scoped read; `Map` join; 0-gasto → null remap; per-carro KPI attach.
- `src/app/(app)/carros/[id]/page.tsx` (modified) — null-fills the two new fields on the detail header carro (Plan 03 wires real detail KPIs).

## Decisions Made
- **Test location** at `src/components/carro-card-kpis.test.tsx` (not the plan's `tests/*.tsx`): `vitest.config.ts` `test.include` is `['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts']` — the `tests/**` glob matches only `.ts`, so a `.tsx` test under `tests/` would never be collected (the identical Plan-01 correction).
- **`kmPorLitroKpiLabel` in-component**: the frozen `kmPerLitroLabel(12.4)` returns `'12,4'` (no unit). For a standalone KPI value the unit must travel with the number, so the component appends `' km/l'` only for real values and leaves `'—'` bare — the shared, multi-consumer helper stays untouched.
- **`[id]/page.tsx` null-fill**: extending the shared `CarroCardData` type forced the detail-page header carro to supply the two new fields. Detail-page KPIs belong to Plan 03, so this passes `null` to keep the build green without doing Plan 03's work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test placed in src/components/ instead of tests/**
- **Found during:** Task 1
- **Issue:** Plan specified `tests/carro-card-kpis.test.tsx`, but the vitest `tests/**` glob matches only `.ts` (not `.tsx`); a `.tsx` test there would never run, so the planned verification could not pass.
- **Fix:** Created at `src/components/carro-card-kpis.test.tsx` (the established component-test convention). Coverage identical to the plan's spec.
- **Files modified:** src/components/carro-card-kpis.test.tsx
- **Verification:** Suite collected and green (3 tests); full suite green at 732.
- **Committed in:** `58a0f2c` (Task 1)

**2. [Rule 1 - Bug] Corrected the test's km/l + gasto assertions to the real helper/Intl output**
- **Found during:** Task 1
- **Issue:** The plan implied `kmPerLitroLabel(12.4) === '12,4 km/l'`, but the frozen helper returns `'12,4'` (no unit). Separately, `formatCents(324000)` emits a NBSP after `R$`, so a string-literal `'R$ 3.240,00'` (regular space) `.toBe` assertion fails on the space byte.
- **Fix:** The component supplies the `km/l` unit via `kmPorLitroKpiLabel` (so the visible value is `12,4 km/l`); the test asserts the visible `12,4 km/l` and matches the gasto with a whitespace-tolerant regex (`/R\$\s*3\.240,00/`) instead of a brittle literal. Frozen helper untouched.
- **Files modified:** src/components/carro-card.tsx, src/components/carro-card-kpis.test.tsx
- **Verification:** 3/3 tests pass; `tsc --noEmit` clean.
- **Committed in:** `58a0f2c` (Task 1)

**3. [Rule 3 - Blocking] Null-fill new CarroCardData fields in /carros/[id]/page.tsx**
- **Found during:** Task 1 (tsc)
- **Issue:** Extending the shared `CarroCardData` type with two required fields broke compilation of the detail-page header carro in `[id]/page.tsx`, which is outside this plan's two named files.
- **Fix:** Passed `gastoTotalCents: null, kmPorLitroMedio: null` on the detail header carro with a comment pointing to Plan 03 for the real detail KPIs. Minimal, additive, no behavior change to the detail page.
- **Files modified:** src/app/(app)/carros/[id]/page.tsx
- **Verification:** `tsc --noEmit` clean; build compiles `/carros/[id]`.
- **Committed in:** `58a0f2c` (Task 1)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All mechanical corrections to keep the planned behavior runnable against the repo's vitest glob, the frozen helper contract, and the shared type. No scope creep, no token/color drift — the card behavior matches the plan and UI-SPEC §2 exactly.

## Issues Encountered
- None. The full suite passed 732/732 this run (no recurrence of the Plan-01 `reserva-saida` parallel-contention flake).

## Known Stubs
None. The list KPIs are wired to real `v_carro_resumo` data. The `[id]/page.tsx` null-fill is an intentional, documented hand-off to Plan 03 (detail-page KPIs), not a stub on the `/carros` list surface this plan owns.

## Threat Flags
None. The only new surface is a second read of the existing `v_carro_resumo` (`security_invoker=true`, proven RLS-scoped by `tests/carro-view-leak.test.ts`) via the standard RLS-scoped `createClient()` server client — never `admin.ts`, no service-role, no `process.env`, no new view, no migration. Matches the plan's `<threat_model>` T-11-03 (`mitigate`) / T-11-04 (`accept`) dispositions.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- The `/carros` list half of CAR-05.2 (gasto total + km/l médio per card) is delivered. Plan 03's enriched `/carros/[id]` detail page is file-disjoint and can wire the detail KPIs from the same `v_carro_resumo` view, replacing the null-fill placeholders in `[id]/page.tsx`.
- No blockers. No new deps, no new tokens, no new view/migration.

## Self-Check: PASSED

All created/modified files exist on disk and both task commits (`58a0f2c`, `759a757`) are present in git history.

---
*Phase: 11-detalhe-do-carro-gr-fico-de-consumo*
*Completed: 2026-06-17*
