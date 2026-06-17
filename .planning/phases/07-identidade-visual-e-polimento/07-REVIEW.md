---
phase: 07-identidade-visual-e-polimento
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - package.json
  - src/app/(app)/dashboard/loading.tsx
  - src/app/(app)/dashboard/page.tsx
  - src/app/(app)/extrato/loading.tsx
  - src/app/(app)/extrato/page.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/mei/loading.tsx
  - src/app/(auth)/layout.tsx
  - src/app/globals.css
  - src/app/icon.svg
  - src/app/layout.tsx
  - src/components/app-sidebar.tsx
  - src/components/auth-shell.tsx
  - src/components/bottom-nav.tsx
  - src/components/brand-mark.tsx
  - src/components/card-skeleton.tsx
  - src/components/category-distribution-chart.test.tsx
  - src/components/category-distribution-chart.tsx
  - src/components/chart-skeleton.tsx
  - src/components/extrato-table.tsx
  - src/components/import-review-table.tsx
  - src/components/nf-table.test.tsx
  - src/components/nf-table.tsx
  - src/components/receita-gasto-chart.test.tsx
  - src/components/receita-gasto-chart.tsx
  - src/components/table-skeleton.test.tsx
  - src/components/table-skeleton.tsx
  - src/components/theme-provider.tsx
  - src/components/theme-toggle.test.tsx
  - src/components/theme-toggle.tsx
  - src/components/ui/chart.tsx
  - src/components/user-menu.tsx
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Phase 7 is a navy+gold re-skin with dark-mode (next-themes), new Recharts dashboards, mobile table→card collapse, and loading/skeleton polish. Against the stated guardrails the work is mostly clean: the SSR/hydration pattern is correct (`suppressHydrationWarning` on `<html>`, mount-guarded `ThemeToggle`), the table re-skins preserve the TanStack row model / selection / sort / footer logic verbatim, money is still integer-cents formatted at the edge in the persisted paths, the auth/RLS guards in both layouts are untouched, and the brand SVG is token-driven so it re-themes.

The notable surface for defects is **the dashboard chart-data pipeline, which is genuinely new logic in a "re-skin only" phase** (the prior dashboard had no charts). It reads existing RLS-scoped views (`v_income_month`, `v_category_totals`) with no new secret — good — but it introduces fresh money aggregation that departs from the project's integer-cents-only convention (`Number()` sums), an empty-state coupling bug, and a couple of correctness/robustness gaps. None rise to BLOCKER (no data loss, no security regression, no incorrect persisted money), but several WARNINGs should be fixed before this ships.

## Warnings

### WR-01: Chart money aggregation uses lossy `Number()` instead of integer-cents/bigint

**File:** `src/app/(app)/dashboard/page.tsx:292-311, 317-328`
**Issue:** The new chart pipeline sums and carries money as JS `number` cents (`Number(r.total_cents ?? 0)`, `gastoByMonth.get(...) + Number(...)`, `receitaByMonth.set(key, Number(...))`). CLAUDE.md / MD-04 is explicit: money is integer cents, summed via `centsToBigInt`, never a lossy `Number()` cast — every sibling money path in this same file (`buildRows`, `incomeCentsForDialog`) and the tables (`nf-table`, `extrato`) already use `centsToBigInt`. The inline comment ("chart values stay within the safe integer range") is an assumption, not a guarantee, and it diverges from the convention the rest of the codebase enforces. Recharts ultimately needs `number`, so the safe pattern is to aggregate on `bigint` and cast to `Number` only at the final datum.
**Fix:**
```ts
// aggregate on bigint, cast only at the chart-datum boundary
const gastoByMonth = new Map<string, bigint>()
for (const r of categoryTotals) {
  if (!r.month_key) continue
  if (r.category_id && kindById.get(r.category_id) !== 'consumo') continue
  gastoByMonth.set(
    r.month_key,
    (gastoByMonth.get(r.month_key) ?? 0n) + centsToBigInt(r.total_cents),
  )
}
// ...
receita: Number(receitaByMonth.get(key) ?? 0n),
gasto: Number(gastoByMonth.get(key) ?? 0n),
```

### WR-02: Receita-vs-gasto empty state hides a half-populated chart

**File:** `src/app/(app)/dashboard/page.tsx:312-314, 370-372` and `src/components/receita-gasto-chart.tsx:36-45`
**Issue:** `hasReceitaGastoData` is `data.some(d => d.receita > 0 || d.gasto > 0)`. When false, the page passes `[]` to the chart, which renders "Sem dados para o gráfico". That is fine for the truly-empty case, but the inverse is the bug: the empty-state copy says "Lance receitas e gastos…", yet a user who has only receita (or only gasto) across all 12 months still sees a populated chart with a flat-zero series — which is acceptable — while a user with exactly zero of one series across the window is correctly handled. The real defect is subtler: a single nonzero month makes `hasReceitaGastoData` true, so the chart renders even when 11 of 12 months are all-zero, which is intended. No correctness break, but the empty-state threshold is an all-or-nothing gate that can surface a misleading "no data" message if, e.g., the only activity is an alocação (transfer) that is correctly excluded from gasto and there is no receita — the user has activity but sees "Sem dados". Confirm this is the desired UX; if not, base the empty state on whether any source rows existed, not on the post-filter gasto/receita sums.
**Fix:** Decide the empty-state contract explicitly. If "has any transaction this window" should suppress the empty copy, compute the gate from `incomeSeries.length || categoryTotals.length` rather than from the filtered `receita/gasto > 0` sums.

### WR-03: `confirmReserva` toggles `isSaving` synchronously around an async transition (no real disable)

**File:** `src/components/extrato-table.tsx:147-158`
**Issue:** `confirmReserva` does `setIsSaving(true); apply(...); setIsSaving(false); setPendingCategoryId(null)` all synchronously. `apply` only *schedules* a transition (`startTransition(async () => await updateTransaction(...))`) and returns immediately, so `isSaving` is flipped back to `false` in the same tick — the `disabled={isSaving}` on the "Confirmar aporte" button is effectively never on, and the dialog closes (`setPendingCategoryId(null)`) before the server action resolves. A user can double-submit the aporte by clicking fast, and there is no in-flight feedback. (The sibling `import-review-table` version is purely client-state so it does not have this hazard.)
**Fix:** Drive the disabled/closing state off the transition's pending flag instead of a synchronous boolean:
```ts
const [isPending, startTransition] = React.useTransition()
// in apply(): keep startTransition(async () => { const r = await updateTransaction(...); ... })
function confirmReserva() {
  if (!reservaId) { setReservaError('Selecione uma reserva.'); return }
  if (pendingCategoryId) {
    apply(pendingCategoryId, reservaId)
    setPendingCategoryId(null) // or close in a .then if you want to wait for success
  }
}
// <Button disabled={isPending}>
```

### WR-04: `runConfirm` leaves `isConfirming` stuck `true` after a successful import

**File:** `src/components/import-review-table.tsx:321-349`
**Issue:** On the success branch, `runConfirm` calls `router.push('/extrato')` but never resets `setIsConfirming(false)`. The button text stays "Importando…" and `disabled` stays true. This usually masks itself because the navigation unmounts the component — but `router.push` is a client-side soft navigation; if the push is slow, is intercepted, or the user navigates back to this still-mounted tree, the confirm button is permanently disabled with no path to recover except a full reload. The error/catch branches correctly reset it; only the happy path leaks the flag.
**Fix:** Reset before navigating (or in a `finally`):
```ts
toast.success(`${result.imported} ...`)
setIsConfirming(false)
router.push('/extrato')
```

### WR-05: Mobile/desktop dual-render duplicates interactive controls and emits duplicate accessible names

**File:** `src/components/extrato-table.tsx:375-485`, `src/components/import-review-table.tsx:385-493`, `src/components/nf-table.tsx:190-274`
**Issue:** The card-collapse pattern renders BOTH the `hidden md:table` desktop table and the `md:hidden` card list into the DOM simultaneously, hiding one via CSS only. This means every interactive control exists twice: two "Selecionar linha" checkboxes per row, two "Alterar categoria"/"Classificar" selects per row, two "Ações" menu triggers per NF, plus duplicated tooltip triggers and (for nf-table) two `formatCents` total nodes. Consequences: (a) assistive tech and keyboard tab order traverse both copies (the hidden copy is `display:none` for the responsive variant, so AT skips it — acceptable — but verify the breakpoint hide is `display:none`, not `visibility`/opacity); (b) the test files explicitly switched to `getAllByText(...).length > 0` because values now appear twice, which masks future single-render regressions; (c) any `id`-based control rendered in both branches risks duplicate DOM ids. This is inherent to the chosen collapse approach and is not a logic change, but it doubles the interactive surface and weakens the tests.
**Fix:** Prefer a single render that restyles per breakpoint (CSS grid/flex on the same nodes) over rendering two full trees; or, if keeping dual trees, confirm `md:table`/`md:hidden` resolve to `display:none` at the inactive breakpoint (they do in Tailwind) and add a lint/test guard that the hidden subtree carries no focusable duplicate-id controls. At minimum, document that the duplicated-name tests are intentional so a future single-render refactor updates them.

### WR-06: `ChartTooltipContent` formatter is invoked with raw cents; non-formatter fallback shows raw integer cents

**File:** `src/components/ui/chart.tsx:215-261`, consumers `receita-gasto-chart.tsx:81-87`, `category-distribution-chart.tsx:76-83`
**Issue:** Both charts pass a `formatter={(value) => formatCents(Number(value))}` so the tooltip value renders as currency — correct. But the vendored `ChartTooltipContent` only uses `formatter` when `formatter && item?.value !== undefined && item.name` (line 215). If `item.name` is ever falsy (e.g. an unnamed series, or a Recharts payload shape where `name` is empty), it falls through to the default branch (line 255-261) which renders `item.value.toLocaleString()` — i.e. **raw integer cents** (e.g. "300.000" for R$ 3.000,00), silently mis-presenting money. The donut uses `nameKey="categoria"` and the bar chart relies on series names, so in practice `item.name` is set; this is a latent trap rather than an active bug, but it means money correctness in the tooltip depends on a Recharts-internal field always being truthy.
**Fix:** Make money formatting unconditional in the consumers' contract — either guarantee every series carries a `name`, or harden the fallback to never print raw cents (route the default value branch through the same `formatCents` when the config marks the series as money). Add a tooltip-rendering test that asserts the currency string, not just the legend.

## Info

### IN-01: `Select value={row.category_id ?? null}` passes `null` where the type likely expects `string | undefined`

**File:** `src/components/extrato-table.tsx:162`, `src/components/import-review-table.tsx:579`
**Issue:** `value={row.category_id ?? null}` feeds `null` to the controlled Select. This predates Phase 7 (confirmed against the pre-re-skin file) so it is not a regression, but a Radix/base-ui Select `value` is conventionally `string | undefined`; passing `null` to clear a controlled value is non-idiomatic and relies on the component coercing `null`→uncontrolled-ish behavior. Left as Info because behavior is unchanged from prior phases.
**Fix:** Prefer `value={row.category_id ?? undefined}` if the Select treats `undefined` as "no selection".

### IN-02: 12-month X-axis can show duplicate short labels across a year boundary

**File:** `src/app/(app)/dashboard/page.tsx:306-311`
**Issue:** `shortMonthLabel` is the 3-char slice of the pt-BR month name. The 12-month window starting 11 months before `mes` can span two calendar years, so e.g. "jun 2025" and "jun 2026" both render as "jun" on the X axis with no year disambiguation. Bars still map correctly (Recharts keys by array index), so it is cosmetic, but the axis is ambiguous near year boundaries.
**Fix:** Append a year hint when the window crosses a boundary (e.g. "jun/25" vs "jun/26"), or show the year on the first month of each year.

### IN-03: Favicon hex is a hand-maintained copy of the brand tokens (drift risk)

**File:** `src/app/icon.svg:5-8` vs `src/app/globals.css:67-68, 112-113` and `src/components/brand-mark.tsx`
**Issue:** `icon.svg` hardcodes `#1b2542` (navy) and `#c79a3a` (gold) as static equivalents of `--primary-foreground` / `--primary`. The comment acknowledges this is intentional (a favicon can't read CSS vars). It is correct today but will silently drift if the OKLCH brand tokens are re-tuned. Pure maintainability note.
**Fix:** Add a comment cross-link (or a tiny build step) tying the favicon hex to the token values so a future palette change updates both.

### IN-04: `useReactTable` data is `visibleRows` while confirm/payload uses `rows` — verify by design

**File:** `src/components/import-review-table.tsx:295-305, 323-332`
**Issue:** The table renders `data: visibleRows` (the unclassified-only filter) but `runConfirm`/`onConfirmClick`/`unclassifiedCount` operate on the full `rows`. This is correct and intended (you confirm everything, not just the filtered view), but it is a subtle dual-source-of-truth that is easy to break in a later edit — selection (`rowSelection`) is keyed by row id against `visibleRows`, while bulk `applyBulk` iterates `selectedIds` and `classifyRow` matches against full `rows`. Worth an explicit test that confirming while the unclassified filter is active still persists the classified rows.
**Fix:** None required; add a regression test for "filter active + confirm imports all rows".

### IN-05: `mei/loading.tsx` skeleton chrome diverges from the real MEI page heading

**File:** `src/app/(app)/mei/loading.tsx:11-15`
**Issue:** The loading boundary renders `<section className="flex flex-col gap-6">` + `<h1>MEI</h1>` + a single `CardSkeleton`. If the real MEI page wraps in a width-constrained container (like dashboard's `max-w-3xl` / extrato's `max-w-4xl`), the skeleton layout will jump on hydration (the polish goal of skeletons is no layout shift). The dashboard and extrato loading files mirror their pages' containers; the MEI one does not constrain width. Confirm it matches the real `mei/page.tsx` shell.
**Fix:** Match the MEI page's outer container/heading exactly in `loading.tsx`.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
