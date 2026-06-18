---
phase: 11-detalhe-do-carro-gr-fico-de-consumo
plan: 03
subsystem: ui
tags: [carro, carros-detail, kpi, recharts, gasto-por-categoria, rsc, supabase-rls, pt-BR, sec-01]

# Dependency graph
requires:
  - phase: 11-detalhe-do-carro-gr-fico-de-consumo
    plan: 01
    provides: "CarroConsumoChart (km/l line, null-drop, empty state) + CarroCategoriaBars (magnitude bars) + CarroConsumoDatum/CarroCategoriaDatum prop contracts"
  - phase: 11-detalhe-do-carro-gr-fico-de-consumo
    plan: 02
    provides: "CarroCard KPI strip + v_carro_resumo gasto_total_cents/km_por_litro_medio read pattern; [id]/page.tsx null-fill hand-off"
  - phase: 10-abastecimento-h-brido-consumo
    provides: "v_abastecimento_consumo (occurred_on + km_por_litro per interval), v_carro_resumo, AbastecimentoHistory + AbastecimentoForm, kmPerLitroLabel/reaisPerKmLabel"
  - phase: 07-identidade-visual-e-polimento
    provides: "ui/chart token-aware grammar, ChartSkeleton, empty/loading/error grammar, recharts + react-is override"
provides:
  - "Enriched /carros/[id]: header + 3 KPI cards (km/l médio · R$/km · gasto total) + gasto-por-categoria bars + km/l consumo line chart + integrated Phase-10 AbastecimentoHistory, in UI-SPEC section order"
  - "Inline RLS-scoped gasto-por-categoria aggregation (no new view): per-category integer-cent sums by point-in-time category_id, untagged excluded, D4 non-destructive"
  - "consumoSeries builder: chronological km/l series with null-km/l intervals dropped, dd/MM civil-date labels (no new date lib)"
  - "SEC-01 bundle-secret re-audit GREEN against a fresh build with the new chart client component in the bundle"
affects: [11-04, carros-detail-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline RSC aggregation over a new view: a single-consumer, RLS-scoped sum grouped in TypeScript by point-in-time category_id — lighter than a 0029 view, zero gen:types drift, sanctioned by CONTEXT"
    - "supabase-js embed (categories(name)) read as array-or-object: cast through unknown and handle both shapes (the generated relationship infers an array)"
    - "Reuse the frozen civil-date dd/MM split (no tz math on a yyyy-MM-dd day) instead of introducing a date lib for the chart X label"

key-files:
  created:
    - tests/carro-categoria-aggregation.test.ts
  modified:
    - src/app/(app)/carros/[id]/page.tsx

key-decisions:
  - "No new view / no migration 0029: gasto-por-categoria is an INLINE RSC aggregation (one consumer, RLS already scopes it). Keeps the phase pure-presentation with no gen:types drift gate (CONTEXT-sanctioned)."
  - "WR-02 (same-odometer double-count in v_abastecimento_consumo) NOT fixed this phase — documented as a known limitation (the km<=0 guard covers the common case; the fix touches load-bearing interval math for a near-impossible degenerate shape)."
  - "categories(name) embed handled as array-or-object via an unknown cast in both the page and the test — the generated FK relationship types the embed as an array, so a plain object cast (TS2352) was rejected."
  - "Consumo chart series built from a re-ordered copy of the existing v_abastecimento_consumo read (date-ascending), not a second query — the history read already pulls the rows; only occurred_on was added to the select."

requirements-completed: [CAR-05]

# Metrics
duration: 9min
completed: 2026-06-17
status: complete
---

# Phase 11 Plan 03: Enriched /carros/[id] Capstone + SEC-01 Re-audit Summary

**The `/carros/[id]` detail page is now the full CAR-05 capstone — header, 3 KPI cards (km/l médio · R$/km · gasto total), an inline RLS-scoped gasto-por-categoria magnitude-bar section, the km/l-over-time consumption line chart, and the integrated Phase-10 AbastecimentoHistory — in UI-SPEC section order, with the SEC-01 bundle-secret audit re-run GREEN against a fresh build now that a chart client component is in the bundle.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-17T19:37:53Z
- **Completed:** 2026-06-17T19:47:00Z
- **Tasks:** 3 (Task 3 verification-only)
- **Files:** 1 created (integration test), 1 modified (detail page)

## Accomplishments

- **Inline gasto-por-categoria aggregation (CAR-05.2):** the detail RSC reads `transactions.select('amount_cents, category_id, categories(name)').eq('carro_id', id)` — RLS-scoped to the owner, grouped in TypeScript by the **point-in-time `category_id`** (never by name; CLAUDE.md locked decision), summing `amount_cents` in integer cents, untagged transactions excluded, the display name resolved from the embedded `categories(name)` (fallback "Sem categoria"). The result is sorted valor-desc into `CarroCategoriaDatum[]`. The read touches only `transactions` — never `budget_targets`/adherence views — and writes nothing (D4 lente).
- **Integration test (`tests/carro-categoria-aggregation.test.ts`):** against the local `supabase start` stack — (a) per-category sums equal the seeded amounts grouped by `category_id` in integer cents (Manutenção 80000, Combustível 20000); (b) an untagged 99999-cent transaction is excluded; (c) RLS isolation — user B reading the same `carro_id` aggregation sees ZERO rows; (d) D4 non-destructive — `transactions` (category_id/amount_cents) AND `budget_targets` are byte-identical after the read. 3/3 green.
- **Enriched layout (CAR-05.1/.2/.4):** the page composes, in UI-SPEC top→bottom order — header (unchanged) → identity Card (unchanged) → **3 KPI stat cards** (`grid grid-cols-1 sm:grid-cols-3`, each a `Card`/`CardContent` with a `text-xs text-muted-foreground` label over a `text-xl font-mono font-semibold tabular-nums` value): km/l médio via `kmPerLitroLabel`, R$/km via `reaisPerKmLabel`, Gasto total via `formatCents(gasto_total_cents)` with `gasto_total_cents > 0 ? … : '—'` (neutral foreground, never red, no fake zero) → **Gasto por categoria** (`<CarroCategoriaBars data={categoriaData} />`) → **Consumo (km/l)** (a Card wrapping `<CarroConsumoChart data={consumoSeries} />`) → the **preserved Phase-10 Abastecimentos** section verbatim.
- **Consumo series:** built from a date-ascending copy of the existing `v_abastecimento_consumo` read (the select gained `occurred_on`), dropping null/non-positive km/l intervals (never a gap-filled 0), mapped to `{ data: 'dd/MM', kmPorLitro }` using the frozen civil-date split (no new date dependency). The component additionally guards <2 valid points → pt-BR empty copy.
- **SEC-01 re-audit (Task 3):** `npm run build` (fresh) + `bash scripts/check-bundle-secrets.sh .next/static` → **exit 0** — "no secret markers in .next/static (pass)". The new `CarroConsumoChart` client component carries no service-role/secret/env into the client bundle. SEC-01 does not regress.
- **Gates:** `npx tsc --noEmit` clean; `npm run build` exit 0 (`/carros/[id]` compiles); full suite **735 passed / 86 files** (732 baseline + 3 new aggregation tests).

## Task Commits

1. **Task 1: Inline gasto-por-categoria aggregation + integration test** — `b37f168` (feat)
2. **Task 2: Compose the enriched detail layout (KPI cards + bars + chart + Phase-10 history)** — `21fcd29` (feat)
3. **Task 3: SEC-01 bundle-secret re-audit** — no code change (verification-only; audit exit 0 recorded here).

**Plan metadata:** see final docs commit.

## Files Created/Modified

- `src/app/(app)/carros/[id]/page.tsx` (modified) — extended the `v_carro_resumo` select with `gasto_total_cents`; added the inline RLS-scoped gasto-por-categoria aggregation (group by point-in-time `category_id`, integer cents, untagged excluded) → `categoriaData`; extended the `v_abastecimento_consumo` read with `occurred_on` and built the date-ascending null-dropped `consumoSeries`; computed the 3 KPI label values; composed the KPI grid + Gasto-por-categoria + Consumo sections in UI-SPEC order, keeping the Phase-10 Abastecimentos section verbatim.
- `tests/carro-categoria-aggregation.test.ts` (created) — local-stack integration test: per-category sums (integer cents, by `category_id`), untagged excluded, RLS isolation (user B = zero), D4 non-destructive (transactions + budget_targets byte-identical after the read).

## Decisions Made

- **No new view / no migration 0029.** gasto-por-categoria is an inline RSC aggregation — one consumer, RLS already scopes it via the standard server client + `.eq('carro_id', id)` on the already-`notFound`-guarded owned carro. This keeps the phase pure-presentation with no `gen:types` drift gate (CONTEXT: "prefer the view ONLY if cleanly reusable; an inline RSC query is acceptable and lighter").
- **`categories(name)` embed read as array-or-object.** The generated FK relationship (`transactions_category_id_fkey` → `categories`) types the embed as an array, so a plain `as { name: string } | null` cast tripped TS2352. Both the page and the test cast through `unknown` and handle both shapes (`Array.isArray(embed) ? embed[0]?.name : embed?.name`).
- **Consumo series from a re-ordered copy, not a second query.** The existing `v_abastecimento_consumo` read (used for the history `kmPorLitroById` map) already pulls the rows; only `occurred_on` was added to its select. The chart series is a date-ascending, null-dropped projection of the same data — no extra round-trip.
- **Civil-date dd/MM split, no date lib.** The chart X label reuses the same tz-safe `yyyy-MM-dd` → `dd/MM` split AbastecimentoHistory uses (no UTC month-boundary risk on a civil day), honoring the UI-SPEC "do NOT introduce a new date lib" rule.

## Deviations from Plan

None — the plan executed as written. The two minor mechanical items (the `categories(name)` array-or-object cast and reusing the existing consumo read rather than issuing a second select) are implementation choices within the task's stated action, not behavioral deviations: the aggregation, KPIs, chart series, and section order all match the plan and UI-SPEC exactly.

## Known Limitations

- **WR-02 (same-odometer double-count in `v_abastecimento_consumo`) — NOT fixed this phase (deliberate).** Per CONTEXT, the fix touches the load-bearing interval math (`prev_full_odometro` window) for a near-impossible degenerate data shape (two tanque-cheio fills at the identical odometer), and the existing `km_rodados <= 0` guard already nulls the common pathological case. Fixing it would require a view refinement (`0029`) and a `gen:types` regen — out of scope for a pure-presentation phase. This is tracked here as a known limitation; if it ever surfaces in real data it is a Phase-10-view follow-up, not a detail-page bug.

## Issues Encountered

- None blocking. The full suite passed 735/735 this run (no recurrence of the Plan-01 `reserva-saida` parallel-contention flake).

## Known Stubs

None. The detail page is fully wired to real data: KPIs from `v_carro_resumo`, gasto-por-categoria from the inline aggregation, the chart from `v_abastecimento_consumo`, and the Phase-10 AbastecimentoHistory integrated verbatim. The Plan-02 null-fill placeholders in `[id]/page.tsx` are not touched by this surface — the header carro's `CarroCardData` `gastoTotalCents`/`kmPorLitroMedio` fields drive the `CarroCard` shape only on the list; the detail KPIs read directly from `resumo` and do not depend on those fields.

## Threat Flags

None. The only new surface is the inline `transactions` aggregation read via the standard RLS-scoped `createClient()` server client — never `admin.ts`, no service-role, no `process.env`, no new view, no migration. It matches the plan's `<threat_model>`: T-11-05 (Information Disclosure — `mitigate`, RLS-scoped + integration test proves user B = zero), T-11-06 (Tampering — `mitigate`, reads `transactions` only, never budget_targets, byte-identical after the read), T-11-01 (the chart client component — `mitigate`, SEC-01 audit exit 0 against a fresh build), T-11-SC (no new dependency — `accept`).

## SEC-01 Re-audit (gate result)

`npm run build` (fresh) + `bash scripts/check-bundle-secrets.sh .next/static` → **exit 0**: "check-bundle-secrets: no secret markers in .next/static (pass)". The `/carros/[id]` client bundle now includes `carro-consumo-chart.tsx`; no service-role/secret/env reached `.next/static`. SEC-01 holds (non-regress).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The CAR-05 capstone presentation surface is complete: the enriched `/carros/[id]` is the full detail (KPIs + category bars + consumption chart + integrated abastecimento history). Plan 11-04 (the human-verify checkpoint) can verify the rendered page against the UI-SPEC.
- No blockers. No new deps, no new tokens, no new view/migration, no `gen:types` drift.

## Self-Check: PASSED

- `src/app/(app)/carros/[id]/page.tsx` — FOUND (modified)
- `tests/carro-categoria-aggregation.test.ts` — FOUND (created)
- Commit `b37f168` (Task 1) — FOUND in git history
- Commit `21fcd29` (Task 2) — FOUND in git history

---
*Phase: 11-detalhe-do-carro-gr-fico-de-consumo*
*Completed: 2026-06-17*
</content>
</invoke>
