---
phase: 11-detalhe-do-carro-gr-fico-de-consumo
verified: 2026-06-17T17:10:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  note: initial verification
---

# Phase 11: Detalhe do carro + gráfico de consumo — Verification Report

**Phase Goal:** Usuário abre `/carros/[id]` e vê KPIs (km/l médio, R$/km, gasto total manutenção+combustível), gasto por categoria, histórico de abastecimentos, e a curva de consumo (km/l no tempo); a lista `/carros` mostra gasto+km/l por carro. Capstone de apresentação. (CAR-05)
**Verified:** 2026-06-17T17:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth (Success Criterion)                                                                                                    | Status     | Evidence |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 1   | `/carros/[id]` mostra cabeçalho (apelido/modelo/placa/ano) + KPIs km/l médio, R$/km e gasto total                            | ✓ VERIFIED | `page.tsx:280-332` — 3 KPI cards (`kmPerLitroLabel`, `reaisPerKmLabel`, `formatCents`/`gastoOrNull`), mono tabular-nums, `'—'` for null; header at :289-304 |
| 2   | Detalhe mostra gasto por categoria dos lançamentos `carro_id`-tagged; lista `/carros` mostra gasto total + km/l médio        | ✓ VERIFIED | Detail: inline RLS aggregation `page.tsx:147-178` → `CarroCategoriaBars` :338. List: `carros/page.tsx:56-89` reads `v_carro_resumo` → `CarroCard` KPI strip `carro-card.tsx:152-167` |
| 3   | Histórico de abastecimentos em tabela (data/odômetro/litros/R$/km-l/vínculo) com colapso table→card mobile (Phase 7)         | ✓ VERIFIED | Phase-10 `AbastecimentoHistory` integrated `page.tsx:364-371`; `abastecimento-history.tsx:241` `Table className="hidden md:table"` + :299 `ul md:hidden` card stack |
| 4   | Gráfico de consumo (recharts via shadcn chart) plota km/l no tempo, token-aware, tooltip pt-BR                               | ✓ VERIFIED | `carro-consumo-chart.tsx` — recharts `LineChart`, `var(--color-kmPorLitro)`→`--chart-1`, `consumoTooltipFormatter` pt-BR via `kmPerLitroLabel`, null/0-drop :53-55, `<2` points → empty copy |
| 5   | Empty/loading/error states seguem padrão Phase 7 (skeletons, nunca spinner; valores pt-BR `R$`)                              | ✓ VERIFIED | List empty `carros/page.tsx:105-120` (Empty + Car icon), error :101-104 inline `text-destructive`; chart empty :62-71; bars empty `carro-categoria-bars.tsx:24-29`; all values via `formatCents`/labels (pt-BR `R$`) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/components/carro-consumo-chart.tsx` | recharts km/l line, token-aware, pt-BR tooltip, null-drop, empty | ✓ VERIFIED | 101 lines; imports `@/components/ui/chart` + `kmPerLitroLabel`; substantive |
| `src/components/carro-categoria-bars.tsx` | magnitude bars, valor-desc, formatCents mono, empty | ✓ VERIFIED | 74 lines; bigint money (WR-01), `formatCents`, neutral `bg-muted-foreground` fill |
| `src/components/carro-card.tsx` | additive KPI strip (gasto total + km/l médio, `'—'` null) | ✓ VERIFIED | KPI `<dl>` :152-167; identity/actions intact; `kmPorLitroKpiLabel` + `formatCents` |
| `src/app/(app)/carros/page.tsx` | RSC reads `v_carro_resumo`, passes KPIs per carro | ✓ VERIFIED | `v_carro_resumo` read :56-58; `gastoOrNull` mapping :64-73 |
| `src/app/(app)/carros/[id]/page.tsx` | KPI cards + inline aggregation + bars + chart + Phase-10 history | ✓ VERIFIED | All composed; uuid-validated id (WR-02); read-only (D4 safe) |
| `src/lib/carro/resumo.ts` | shared `gastoOrNull` coalesce (WR-03) | ✓ VERIFIED | Pure helper, single home for 0/missing→null rule; used by both pages |
| `src/components/carro-consumo-chart.test.tsx` | data/empty/null/pt-BR assertions | ✓ VERIFIED | 5 tests pass (located in `src/components/`, not `tests/` as PLAN frontmatter declared — path deviation, tests present) |
| `src/components/carro-categoria-bars.test.tsx` | render/magnitude/empty | ✓ VERIFIED | 5 tests pass |
| `src/components/carro-card-kpis.test.tsx` | format/null discipline/identity | ✓ VERIFIED | 3 tests pass |
| `tests/carro-categoria-aggregation.test.ts` | sums + RLS isolation + D4 non-destructive | ✓ VERIFIED | 3 tests pass against local stack |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `carro-consumo-chart.tsx` | `ui/chart.tsx` | `ChartContainer`/`ChartTooltip` | ✓ WIRED | imported + rendered :73-97 |
| `carro-consumo-chart.tsx` | `lib/carro/consumo.ts` | `kmPerLitroLabel` | ✓ WIRED | tooltip formatter :11,45-48 |
| `carro-categoria-bars.tsx` | `lib/money.ts` | `formatCents` | ✓ WIRED | mono label :50,56 |
| `carros/page.tsx` | `v_carro_resumo` | `.from('v_carro_resumo')` RLS-scoped | ✓ WIRED | :56-58 |
| `carros/[id]/page.tsx` | `carro-consumo-chart.tsx` | import + render with `v_abastecimento_consumo` series | ✓ WIRED | :17,347 |
| `carros/[id]/page.tsx` | `carro-categoria-bars.tsx` | import + render inline aggregation | ✓ WIRED | :13,338 |
| `carros/[id]/page.tsx` | transactions | `.eq('carro_id', id)` RLS aggregation | ✓ WIRED | :147-150 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Detail KPI cards | `resumo` | `v_carro_resumo` (security_invoker) `.eq('carro_id', id)` | Yes — real view | ✓ FLOWING |
| `CarroCategoriaBars` (detail) | `categoriaData` | inline `transactions` `.eq('carro_id', id)` + `categories(name)` embed | Yes — RLS-scoped DB read | ✓ FLOWING |
| `CarroConsumoChart` (detail) | `consumoSeries` | `v_abastecimento_consumo` `.eq('carro_id', id)`, null/0 dropped, chrono-sorted | Yes — real view | ✓ FLOWING |
| `AbastecimentoHistory` (detail) | `abastecimentoRows` | `abastecimentos` + linked `transactions` + `kmPorLitroById` map | Yes | ✓ FLOWING |
| `CarroCard` KPI strip (list) | `kpiByCarro` | `v_carro_resumo` (no `.eq` — RLS scopes) | Yes — real view | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chart/bars/card grammar (data/empty/null/pt-BR) | `vitest run` 3 component suites | 12/12 passed | ✓ PASS |
| Inline aggregation sums + RLS isolation (user B = 0) + D4 non-destructive | `vitest run tests/carro-categoria-aggregation.test.ts` | 3/3 passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |

### Probe Execution (SEC-01 bundle-secret audit)

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| SEC-01 bundle secret audit | `bash scripts/check-bundle-secrets.sh .next/static` | `no secret markers (pass)`, exit 0 | PASS |
| New client components secret grep | `grep service_role/secret carro-consumo-chart/categoria-bars/card.tsx` | clean | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CAR-05 | 11-01/02/03/04 | Detalhe do carro: gasto total + histórico abastecimentos + gráfico consumo km/l (recharts) | ✓ SATISFIED | All 5 ROADMAP success criteria verified; chart/bars/KPIs wired with real data flow; human visual sign-off complete (11-04) |

**Note on REQUIREMENTS.md:** CAR-05 is still marked `[ ]` (unchecked) at `REQUIREMENTS.md:121`, and the traceability table (:220) shows "In progress". This is a stale ledger entry — the implementation is complete and verified. The orchestrator should flip CAR-05 to `[x]` / Complete on phase close. Not a blocking gap (the checkbox is documentation lag, not missing code).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in any modified file | — | None |
| `carros/[id]/page.tsx` | 37 | Stale JSDoc comment: "NO chart / rich KPI layout — those are Phase 11" | ℹ️ Info | Cosmetic — header doc not updated after enrichment; code below it IS the Phase-11 layout. No functional impact. |
| `carros/[id]/page.tsx` | — | No `.insert/.update/.delete/.upsert`; reads only transactions + views | — | D4 confirmed: pure-presentation, non-destructive to metas/accounting |

### Human Verification Required

None outstanding. The one class of verification jsdom cannot observe (recharts SVG, computed token colors, light↔dark flip, tooltip appearance, responsive layout) was the 11-04 `checkpoint:human-verify` blocking gate. Per 11-04-SUMMARY, the user signed off "aprovado" across all 8 capstone checks in light AND dark, desktop AND mobile. No deferred end-of-phase `<human-check>` blocks exist on auto tasks.

### Deferred / Out-of-Scope (not gaps)

- **`v_abastecimento_consumo` same-odometer double-count** (the "WR-02" in 11-04-SUMMARY note — distinct from the code-review WR-02 which WAS fixed). The view is owned by migrations `0027/0028` (Phase 8), NOT touched in Phase 11 (no migration in any phase-11 plan). It is a degenerate odometer shape partly mitigated by the `km≤0` guard, carried as an optional future `0029` refinement. Out of scope for this pure-presentation phase.
- **`tests/reserva-saida.test.ts` transient parallel-config flake** — pre-existing test-harness concurrency issue (Phase-10 class), passes in isolation; unrelated to Phase-11 components.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria are observably achieved in the codebase:
- Detail page composes header → 3 KPI cards → gasto-por-categoria bars → consumo line chart → integrated Phase-10 history, in the UI-SPEC section order.
- List page carries gasto total + km/l médio per card from `v_carro_resumo`.
- All data flows from real RLS-scoped views/tables (Level 4 FLOWING on all five dynamic artifacts).
- Code-review warnings WR-01 (bigint money), WR-02 (uuid validation), WR-03 (shared `gastoOrNull`), WR-04 (multi-year labels) are all present in the actual code.
- D4 non-destructiveness confirmed (read-only RSC; no writes to metas/accounting).
- SEC-01 re-audit exit 0; no secrets in the new chart client bundle.
- 18 targeted tests pass (12 component + 3 aggregation + tsc clean); human visual sign-off complete.

The only loose ends are documentation lag (CAR-05 checkbox in REQUIREMENTS.md, a stale JSDoc header comment) — neither blocks goal achievement.

---

_Verified: 2026-06-17T17:10:00Z_
_Verifier: Claude (gsd-verifier)_
