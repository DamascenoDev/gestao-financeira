---
phase: 07-identidade-visual-e-polimento
plan: 06
subsystem: ui-polish
tags: [skeleton, loading-states, empty-states, error-grammar, micro-interactions, UI-08, tdd]
requires:
  - "07-03 dashboard data-viz (ReceitaGastoChart/CategoryDistributionChart — ChartSkeleton mirrors their footprint)"
  - "src/components/ui/skeleton.tsx (shadcn Skeleton primitive — animate-pulse rounded-md bg-muted)"
  - "src/components/ui/empty.tsx (Empty grammar already adopted across ~8 routes)"
  - "07-01 token substrate (--ring gold focus ring; tw-animate-css already a dep)"
provides:
  - "TableSkeleton — table loading placeholder mirroring the extrato column widths (w-10 select / w-16 Data / Descrição / Categoria / Valor)"
  - "CardSkeleton — card-grid loading placeholder (count prop)"
  - "ChartSkeleton — fixed-aspect (h-[240px]) plot-box + legend strip placeholder"
  - "Per-segment loading.tsx for the heavy routes (dashboard, extrato, mei) — App Router streams the RSC with the layout chrome visible"
affects:
  - "src/app/(app)/dashboard/loading.tsx (new)"
  - "src/app/(app)/extrato/loading.tsx (new)"
  - "src/app/(app)/mei/loading.tsx (new)"
  - "src/app/(app)/extrato/page.tsx (error copy standardized to the UI-SPEC recovery path)"
tech-stack:
  added: []
  patterns:
    - "Skeletons wrap the shadcn Skeleton primitive (never a spinner); motion-reduce:animate-none yields opacity-only under prefers-reduced-motion"
    - "Per-segment loading.tsx reproduces the page h1 chrome + skeletons the body; the (app)/layout.tsx chrome (sidebar/header/bottom-nav) stays visible during the RSC stream"
key-files:
  created:
    - src/components/table-skeleton.tsx
    - src/components/card-skeleton.tsx
    - src/components/chart-skeleton.tsx
    - src/components/table-skeleton.test.tsx
    - src/app/(app)/dashboard/loading.tsx
    - src/app/(app)/extrato/loading.tsx
    - src/app/(app)/mei/loading.tsx
  modified:
    - src/app/(app)/extrato/page.tsx
decisions:
  - "Empty/error grammar sweep = confirmation, not change: all 8 Empty-using routes already adopt the Empty primitive (icon + Title + Description + one gold CTA via --primary tokens), every error block already renders the inline text-destructive recovery copy, and there are zero spinners anywhere in (app). The only substantive edit was the Extrato error block, which was missing the UI-SPEC generic recovery sentence 'Tente recarregar a página.' (Rule 2 — consistency)."
  - "Micro-interactions (150ms / focus gold / reduced-motion) were verified at the primitive layer, not rewritten: the shadcn Button carries transition-all + focus-visible:ring-ring (gold --ring), the Sidebar carries scoped transition-[...] duration utilities, and Tailwind v4's default transition duration is 150ms. The vendored ui/* primitives are intentionally frozen; the new skeletons add motion-reduce:animate-none so the pulse degrades to opacity-only."
  - "loading.tsx replaces the whole page body during the RSC stream, so each one reproduces only the static page h1 (page chrome), not the layout chrome — the (app)/layout.tsx header/sidebar/bottom-nav are outside the Suspense boundary and stay visible by construction."
metrics:
  duration: ~5 min
  completed: 2026-06-17
  tasks: 2
  files: 7 created / 1 modified
---

# Phase 7 Plan 06: Loading/Empty/Error Polish (UI-08) Summary

Closed the polish requirement (UI-08): built three consistent skeleton components (`TableSkeleton`, `CardSkeleton`, `ChartSkeleton`) on top of the shadcn `Skeleton` primitive (skeletons, never spinners), installed per-segment `loading.tsx` for the three heavy routes (dashboard, extrato, mei) so the App Router streams each RSC with the layout chrome visible, and verified the empty/error/micro-interaction grammar across the ~20 routes — which was already consistent, requiring only one error-copy standardization.

## What Was Built

**Task 1 (commits `932e7ee` test-RED, `faf9b4a` feat-GREEN):** TDD Wave-0.
- RED: `table-skeleton.test.tsx` asserts (1) `TableSkeleton` renders a header region + N placeholder rows built on the `Skeleton` primitive (`data-slot="skeleton"`), row count driven by `rows`; (2) `CardSkeleton` renders `count` cards (smoke); (3) `ChartSkeleton` renders a placeholder box (smoke); (4) none of the three renders `.animate-spin`. Failed at import-resolution (components missing) = clean RED.
- GREEN: `table-skeleton.tsx` (`TableSkeleton({ rows = 8 })` — header + `rows` body rows, column widths mirroring the extrato header: `w-10` select / `w-16` Data / `flex-1` Descrição / `w-28` Categoria pill / `w-20` Valor), `card-skeleton.tsx` (`CardSkeleton({ count = 3 })` — responsive card grid), `chart-skeleton.tsx` (`ChartSkeleton()` — `h-[240px]` shimmer plot box + 2-item legend strip). All three wrap `<Skeleton>` from `ui/skeleton.tsx`, carry `motion-reduce:animate-none` (opacity-only under `prefers-reduced-motion`), and `aria-hidden="true"`. 6/6 GREEN, `tsc` clean.

**Task 2 (commit `f33e4a2`, feat):** Per-segment `loading.tsx` + polish sweep.
- `dashboard/loading.tsx`: page h1 + `ChartSkeleton` ×2 in the same `grid-cols-1 lg:grid-cols-2` of `Card`s the real charts use + `TableSkeleton rows={6}` for the adherence list.
- `extrato/loading.tsx`: page h1 + `TableSkeleton rows={10}` mirroring the extrato columns.
- `mei/loading.tsx`: page h1 + `CardSkeleton count={1}` for the gauge card.
- Polish sweep: verified all 8 `Empty`-using routes already follow the `Empty > EmptyHeader > EmptyTitle + EmptyDescription + EmptyContent` grammar with a gold CTA (via `--primary`), and every error block already renders the inline `text-destructive` recovery copy. Standardized the one outlier — the Extrato error block — to carry the UI-SPEC §Copywriting generic recovery sentence (`Tente recarregar a página.`). Inherited copy from phases 2–6 left verbatim.

## Verification

- `npx tsc --noEmit` → clean (exit 0).
- `npm test` → **599 passed / 72 files** (593 baseline + 6 new skeleton tests; ≥559 / ~591–593 baseline held). The `tests/mei-view-leak.test.ts` env-dependent case passed in this run.
- `npm test -- table-skeleton` → 6/6 GREEN.
- `npm run build` → ✓ Compiled successfully (exit 0); all 18 routes/icons emit, dashboard/extrato/mei compile.
- Acceptance greps: the 3 `loading.tsx` reference `ChartSkeleton`/`TableSkeleton`/`CardSkeleton`; `animate-spin` count in `src/app/(app)` == 0 and in the 3 skeleton components == 0; all 3 skeleton components import `@/components/ui/skeleton`; empty-states use the `Empty` primitive across 8 routes; error blocks use `text-destructive` with the recovery copy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical consistency] Standardized the Extrato error recovery copy**
- **Found during:** Task 2 (polish sweep)
- **Issue:** The Extrato error block read `"Não foi possível carregar o extrato."` — missing the UI-SPEC §Copywriting generic recovery sentence that every other route's error block carries (`"... Tente recarregar a página."`). The plan's action mandates standardizing inline error blocks to the generic recovery copy "onde faltar".
- **Fix:** Appended `Tente recarregar a página.` to the Extrato error `<p>`.
- **Files modified:** `src/app/(app)/extrato/page.tsx`
- **Commit:** `f33e4a2`

The micro-interaction "ensure 150ms / focus gold / reduced-motion onde faltar" portion required no edits to the frozen vendored `ui/*` primitives: Button already carries `transition-all` + `focus-visible:ring-ring` (gold `--ring`), the Sidebar already carries scoped `transition-[...] duration-200` utilities, Tailwind v4's default transition duration is 150ms, and the new skeletons add `motion-reduce:animate-none`. No spinners existed anywhere in `(app)` to convert.

## Self-Check: PASSED

- `src/components/table-skeleton.tsx` — FOUND
- `src/components/card-skeleton.tsx` — FOUND
- `src/components/chart-skeleton.tsx` — FOUND
- `src/components/table-skeleton.test.tsx` — FOUND
- `src/app/(app)/dashboard/loading.tsx` — FOUND
- `src/app/(app)/extrato/loading.tsx` — FOUND
- `src/app/(app)/mei/loading.tsx` — FOUND
- `src/app/(app)/extrato/page.tsx` — FOUND (modified)
- Commit `932e7ee` (test RED) — FOUND
- Commit `faf9b4a` (feat GREEN) — FOUND
- Commit `f33e4a2` (loading + error copy) — FOUND
