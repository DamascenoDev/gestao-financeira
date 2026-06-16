---
phase: 03-metas-ader-ncia-e-reservas
plan: 03
subsystem: metas-dashboard-slice
tags: [server-action, idor, upsert, basis-points, adherence, dashboard, rsc, security-invoker, direction-aware-color, alocacao-grouping, ytd, alerts, meta-dialog, BUD]
requires:
  - 03-01 substrate (budget_targets table, v_adherence_month/_ytd security_invoker views, src/lib/adherence.ts status/token map, budgetTargetSchema, v_income_month)
  - 03-02 Wave-0 tests (budget-target-direction it.skip awaiting this plan's action; adherence math/consistency pinned)
  - src/actions/transactions.ts (Zod safeParse → {error} + getClaims + assertOwnedCategories IDOR pattern)
  - src/components/{category-badge,amount-cell}.tsx + src/lib/{money,month}.ts
  - src/components/ui/{tabs,switch,dialog,tooltip,empty,field,input}.tsx (vendored)
provides:
  - src/actions/budget-targets.ts (upsertBudgetTarget BUD-01 IDOR-checked + deleteBudgetTarget)
  - src/actions/budget-targets.test.ts (13 action-unit cases, mock-supabase)
  - src/lib/adherence.ts (EXTENDED: directionForKind pure business rule)
  - src/components/adherence-bar.tsx (custom direction-aware bar + meta tick + progressbar a11y)
  - src/components/adherence-row.tsx (AdherenceRow + AdherenceRowData shared type, 80/100 glyphs)
  - src/components/adherence-summary-strip.tsx (receita hero + estouradas/atingidas count)
  - src/components/meta-dialog.tsx (% input + Teto/Alvo switch + live R$ preview + teto-sum soft-warn)
  - src/components/period-tabs.tsx (Mensal/Anual client toggle wrapper)
  - src/app/(app)/dashboard/page.tsx (real RSC reading both adherence views — replaces placeholder)
affects:
  - 03-04 (reservas slice — reuses the action/IDOR pattern, the dashboard is the alert surface aportes feed)
  - 03-05 (aporte sub-flow — the combined alocação line on this dashboard is where aportes surface)
  - 03-06 (human-verify walkthrough — verifies this dashboard's direction color + alerts + tabs)
tech-stack:
  added: []
  patterns:
    - "upsertBudgetTarget mirrors transactions.ts verbatim: 'use server' + Zod safeParse → {error} + getClaims gate + category-ownership re-derive (FKs not RLS-aware) + supabase.upsert onConflict 'user_id,category_id' (one meta per category)"
    - "directionForKind(kind) is the ONE source of truth for the consumo→teto / alocacao→alvo default — shared by MetaDialog prefill, the dashboard meta-list, and the Wave-0 direction test (no DB default, no drift)"
    - "alocação grouping rendered as ONE combined line: every alocação meta row carries the same view-combined realized total, so the dashboard sums their percent_bp into one meta and recomputes adherence_bp against it (RSV-03 — aportes never touch a consumo line)"
    - "both adherence views mapped into one AdherenceRowData shape so Mensal and Anual tabs render byte-identically (BUD-03 consistency); rows ordered consumo-then-alocação, STABLE across tabs"
    - "the dashboard IS the alert surface (BUD-04): inline 80%/100% glyphs (triangle-alert ≥80, octagon-alert teto ≥100, check alvo ≥100) + the summary estouradas/atingidas count — no toast/notification system"
    - "division-by-zero guard surfaced as copy: adherence_bp===null (no receita) renders 'sem receita no período' / 'Sem receita líquida em {período}…', never NaN%"
key-files:
  created:
    - src/actions/budget-targets.ts
    - src/actions/budget-targets.test.ts
    - src/components/adherence-bar.tsx
    - src/components/adherence-row.tsx
    - src/components/adherence-summary-strip.tsx
    - src/components/meta-dialog.tsx
    - src/components/period-tabs.tsx
  modified:
    - src/lib/adherence.ts
    - src/app/(app)/dashboard/page.tsx
    - tests/budget-target-direction.test.ts
decisions:
  - "directionForKind moved into src/lib/adherence.ts (pure) rather than living inline in the action or MetaDialog: the consumo→teto / alocacao→alvo default is needed by the form prefill, the dashboard's MetaCategory mapping, AND the (now-GREEN) Wave-0 direction test — one exported helper keeps the three from drifting. The DB still has no default (the action persists whatever the form sends)."
  - "alocação rendered as a single combined line by SUMMING the alocação metas' percent_bp into one combined meta and recomputing adherence_bp against that combined meta over the view-supplied combined realized total. The view already collapses realized cents (alloc_total CTE); the app collapses the meta side. This makes 'Investimentos + Reserva somam JUNTAS na meta de investimento' (UI-SPEC §1, RSV-03) literal and keeps a reserva aporte off every consumo teto."
  - "Period tabs split into a thin client wrapper (period-tabs.tsx) with BOTH panels server-rendered and passed as children, so both v_adherence_month and v_adherence_ytd are read RLS-scoped on the server in one Promise.all; the client owns only the active-tab state (Mensal default)."
  - "MetaDialog re-seeds its per-row state in the open-change handler (not a useEffect) to satisfy the react-hooks/set-state-in-effect lint rule while still letting server-truth win over stale local edits each time the dialog opens."
metrics:
  duration: ~8 min
  completed: 2026-06-16
---

# Phase 3 Plan 03: Metas + Dashboard Slice Summary

The product's core-value screen, end-to-end: a user defines a per-category % meta with a direction and immediately sees their aderência. Ships `upsertBudgetTarget` (Zod + getClaims + category-ownership re-derive + unique-upsert on `(user_id, category_id)`) and `deleteBudgetTarget`; the `MetaDialog` (% input + Teto/Alvo switch defaulting from the category kind + live R$ preview + teto-sum soft-warn); the custom `AdherenceBar`/`AdherenceRow`/`AdherenceSummaryStrip` components (direction-aware semantic color, meta-marker tick, 80%/100% alert glyphs); and the real `/dashboard` RSC that reads `v_adherence_month` for the Mensal tab and `v_adherence_ytd` for the Anual tab — replacing the Phase-1 placeholder. Delivers BUD-01/02/03/04 as one vertical slice and turns the Plan-02 `budget-target-direction` action-default assertion GREEN.

## What Was Built

**Task 1 — budget-targets Server Action (BUD-01) with IDOR ownership + unique-upsert (commit d76de49).**
- `src/actions/budget-targets.ts`: `upsertBudgetTarget(input)` mirrors `transactions.ts` verbatim — `'use server'`, `budgetTargetSchema.safeParse` → `{error}` on failure, `getClaims()` → `userId` else `'Sessão expirada.'`, `assertOwnedCategory` (RLS-scoped `select id where id = $1`, exactly 1 row else `'Categoria inválida.'` — the carried Phase-2 IDOR fix, FKs are not RLS-aware), then `supabase.from('budget_targets').upsert({ user_id, category_id, percent_bp, direction, updated_at }, { onConflict: 'user_id,category_id' })` (one meta per category), `'Não foi possível salvar a meta.'` on DB error, `revalidatePath('/dashboard')`, `{ ok: true }`. `deleteBudgetTarget(categoryId)`: UUID guard + getClaims + RLS-scoped delete on `category_id`, `'Não foi possível remover a meta.'` on error.
- `src/lib/adherence.ts` (extended): `directionForKind(kind)` — the pure `consumo→teto` / `alocacao→alvo` default-from-kind rule, exported so MetaDialog, the dashboard, and the Wave-0 test share one source of truth.
- `src/actions/budget-targets.test.ts`: 13 action-unit cases using the `categories.test.ts` chainable-builder mock (`from().upsert()/select()/eq()/delete()` + `getClaims`), RFC-4122 v4 UUID fixtures. Covers the happy upsert (asserts `onConflict` key + payload), alvo direction, second-call-updates, foreign-category rejection (no write), non-uuid/percentBp-out-of-range/bad-direction Zod rejections, the session gate, the friendly upsert-error, and every delete path.
- `tests/budget-target-direction.test.ts` (flipped GREEN): the Plan-02 `it.skip('[03-03] …')` is now a real `it()` — imports `directionForKind`, asserts `consumo→teto` / `alocacao→alvo`, and round-trips a per-kind-default upsert for a fresh consumo + alocacao category against the live stack.

**Task 2 — AdherenceBar/Row/SummaryStrip + MetaDialog (commit ec5fea4).**
- `adherence-bar.tsx`: a custom `h-2` `bg-muted` track + a direction-aware fill (token from `adherenceTokens(adherenceStatus(...))`) whose width clamps at 100% while the % label may read >100%, + a meta-marker tick at the 100%-of-meta line. Exposes `role="progressbar"` + `aria-valuenow/min/max` + `aria-valuetext` ("{categoria}: {realizado} em relação ao teto/alvo de {meta}"). Hidden tick + empty track when `adherence_bp === null`.
- `adherence-row.tsx`: `AdherenceRow` + the shared `AdherenceRowData` type — `CategoryBadge` · `AdherenceBar` · realized `R$` (`AmountCell` neutral) · realized `%` (mono, status color) · `meta Y%` (muted) · status label + lucide glyph (`TriangleAlert` ≥80, `OctagonAlert` teto ≥100, `CheckCircle2` alvo ≥100 — BUD-04). Null `adherence_bp` renders "sem receita no período", never NaN%. The combined alocação row carries a `Tooltip` "Inclui aportes de reserva." (RSV-03).
- `adherence-summary-strip.tsx`: período label · receita líquida do período as a 28px mono `text-income` hero · the terse "{n} categorias estouradas · {m} metas atingidas" count.
- `meta-dialog.tsx`: per-category surface mirroring `transacao-form`'s manual-state + `useTransition` + `sonner` pattern — `CategoryBadge`, a % numeric input (0–100, one decimal → `percent_bp` on submit), a Teto↔Alvo `Switch` defaulting from kind via `directionForKind` (user-editable), a live `R$` preview = `formatCents(round(incomeCents × bp / 10000))`, a soft-warn (non-blocking) when `SUM(teto percent_bp) > 10000`. Save calls `upsertBudgetTarget`; clearing the % calls `deleteBudgetTarget`; toasts "Meta de {categoria} salva" / "removida". All copy pt-BR per the UI-SPEC Copywriting Contract.

**Task 3 — Real dashboard RSC reading the adherence views (commit 25dee70).**
- `src/app/(app)/dashboard/page.tsx`: replaces the placeholder. Reads `?mes` via `toMonthKeyOrCurrent` and the civil year via `currentYear()`. One `Promise.all` does four RLS-scoped reads — `v_adherence_month` (`month_key = ?mes`), `v_adherence_ytd` (`year = currentYear()`), the non-archived categories + their `budget_targets(percent_bp, direction)` for the MetaDialog prefill, and `v_income_month` for the dialog's live R$ preview. `buildRows` maps either view's rows into `AdherenceRowData[]`: consumo rows sorted by name, the alocação metas collapsed into one combined line (summed `percent_bp`, view-combined realized, recomputed `adherence_bp`), plus the estouradas/atingidas counts. `RowList` renders the summary strip + the per-category rows for each tab.
- `period-tabs.tsx`: the thin client Mensal/Anual toggle (`base-ui` `Tabs`), both panels server-rendered. Mensal default; the YTD window is labelled "Acumulado de {ano} (jan–{mês corrente})".
- **All four states** per UI-SPEC: empty-no-metas (`Empty` primitive + "Definir metas" CTA), empty-no-receita (the /0 guard as copy with a Receitas pointer, never NaN%), error (inline `text-destructive`), and the RSC's server-render (no client loading skeleton needed — data is awaited server-side).
- The `h1 "Metas e aderência"` + a teal "Definir metas" CTA opening the MetaDialog.

## Verification Results

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run budget-targets.test`: **13/13 GREEN** (action unit).
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run budget-target`: **23/23 GREEN** across 3 files — the Plan-02 `budget-target-direction` action-default assertion is now a passing `it()` (no longer skipped).
- Full suite `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run`: **235 passed | 0 skipped** across 31 files (up from the 221/1-skipped baseline: +13 new action tests, +1 formerly-skipped now-GREEN direction test, and the harness picking up the new files). No regressions.
- `npx tsc --noEmit`: clean (exit 0).
- `npx eslint` on all 9 touched source files: clean.
- `npm run build`: succeeds; `/dashboard` builds as a dynamic (server-rendered) route.
- Greps: `progressbar` present in adherence-bar, `upsertBudgetTarget` in meta-dialog, `AdherenceRow` in adherence-row, `v_adherence_month` + `v_adherence_ytd` in dashboard/page.

## Deviations from Plan

### Plan-intent adjustments (no permission needed)

- **`directionForKind` extracted into `src/lib/adherence.ts` [Rule 2 — shared-correctness]:** the plan implies the default-from-kind lives "in the action/form". Three consumers need it (MetaDialog prefill, the dashboard's MetaCategory mapping, and the now-GREEN Wave-0 direction test), so it is one exported pure helper rather than three inline copies that could drift. The DB still carries no default and the action persists whatever direction the form sends — the contract the plan describes is unchanged.
- **MetaDialog state re-seed via the open-change handler, not `useEffect` [Rule 1 — lint/correctness]:** an initial `useEffect(() => { if (open) setRows(...) })` tripped the `react-hooks/set-state-in-effect` rule (cascading renders). Moved the re-seed into `handleOpenChange` so server-truth still wins each time the dialog opens, without the effect.

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation note surfaced by `npm run build` (Phase-1 file convention, already logged in 02-01/03 and 03-01) — unrelated to this plan.

## Authentication Gates
None — the local Supabase stack was already running (03-02 left it up at `127.0.0.1:55321`, migrations 0001-0017). `vitest`, `tsc`, and `npm run build` all ran without an auth gate.

## Known Stubs
None. `upsertBudgetTarget`/`deleteBudgetTarget` are real and IDOR-checked; the four components render live data; the dashboard reads both real views RLS-scoped. The combined alocação line is wired to the view's grouped totals (not a placeholder). The single `placeholder="0"` in MetaDialog is the HTML input attribute, not a stub.

## Threat Surface
No new surface beyond the plan's `<threat_model>`. T-03-03-01 (IDOR on `budget_targets.category_id` — `assertOwnedCategory` re-derive before the FK write, pinned by `budget-targets.test` + the live `reserva-idor` analog), T-03-03-02 (`v_adherence_month/_ytd` read RLS-scoped under the user's JWT; views are security_invoker from 03-01, view-leak test from 03-02), T-03-03-03 (NaN%/Infinity% guarded — view `nullif`/`case` + `adherence.ts` null→'sem-receita' + the dashboard copy), and T-03-03-04 (aporte never in a consumo line — the combined alocação line carries only `kind='alocacao'` realized cents) are all implemented as specified. T-03-03-SC: no new npm packages (lucide + vendored shadcn reused).

## Local Stack
Left **running** for 03-04 — API at `http://127.0.0.1:55321` with migrations 0001-0017 applied and `database.types.ts` in sync. No remote push.

## Self-Check: PASSED
- Files: all 9 created/modified files present on disk (verified).
- Commits: d76de49, ec5fea4, 25dee70 all in `git log` (verified).
