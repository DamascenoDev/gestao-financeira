---
plan: 11-04
phase: 11-detalhe-do-carro-gr-fico-de-consumo
title: Phase gate + human-verify (capstone sign-off)
status: complete
requirements: [CAR-05]
completed: 2026-06-17
key_files:
  created: []
  modified: []
---

# 11-04 — Phase gate + human-verify

Verification + sign-off plan — **no production files changed**.

## Task 1 — Automated phase gate (all GREEN)
| Gate | Command | Result |
|------|---------|--------|
| Full suite | `npm test` | 735 passed / 86 files |
| Typecheck | `npx tsc --noEmit` | clean (exit 0) |
| Build | `npm run build` | exit 0 (`/carros` + `/carros/[id]` compile) |
| Secret audit (SEC-01) | `bash scripts/check-bundle-secrets.sh .next/static` | exit 0 — no secret markers after the chart client component |

## Task 2 — Human-verify (blocking checkpoint): **aprovado**
User signed off in light AND dark, desktop AND mobile, on the 8 capstone checks:
1. `/carros` cards show gasto total + km/l médio ("—" when no data, never R$ 0,00/0 km/l).
2. `/carros/[id]` section order: header → 3 KPI cards → gasto-por-categoria bars → consumo chart → integrated Phase-10 history.
3. KPI cards mono tabular-nums, gasto total neutral (not red).
4. Category bars neutral grey, largest→smallest, mono R$.
5. Consumo chart gold `--chart-1` line, pt-BR tooltip "12,4 km/l", invalid intervals omitted, <2 points → empty copy.
6. Theme flip light↔dark clean (no invisible line / broken contrast).
7. Mobile: KPI stack + chart full-width + Phase-7 table→card.
8. Empty states render (no zero bars, chart empty copy).

CAR-05 Complete. Phase 11 (capstone) closed — milestone v1.2 "Carro" phases 8-11 all executed.

## Note
WR-02 (same-odometer double-count in `v_abastecimento_consumo`) carried as a documented known limitation (11-03 SUMMARY) — a near-impossible degenerate odometer shape already partly covered by the `km≤0` guard; an optional `0029` view refinement can address it later if real data ever exhibits it.
