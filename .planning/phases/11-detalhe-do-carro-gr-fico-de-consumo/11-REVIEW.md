---
phase: 11-detalhe-do-carro-gr-fico-de-consumo
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/components/carro-consumo-chart.tsx
  - src/components/carro-consumo-chart.test.tsx
  - src/components/carro-categoria-bars.tsx
  - src/components/carro-categoria-bars.test.tsx
  - src/components/carro-card.tsx
  - src/components/carro-card-kpis.test.tsx
  - src/app/(app)/carros/page.tsx
  - src/app/(app)/carros/[id]/page.tsx
  - tests/carro-categoria-aggregation.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-06-17T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 11 is pure presentation over existing RLS-scoped, `security_invoker` views plus one
inline gasto-por-categoria aggregation on `/carros/[id]`. The core weighted concerns hold up
well under adversarial tracing:

- **Aggregation correctness & RLS (D4):** the inline categoria sum reads only `transactions`
  (`.eq('carro_id', id)` on a `notFound()`-guarded owned carro), groups by point-in-time
  `category_id` (never name), excludes untagged rows by virtue of the equality filter, and writes
  nothing. The integration test proves the per-category cents, untagged exclusion, cross-user
  isolation (user B sees 0 rows), and byte-identical `transactions`/`budget_targets` after the
  read. Non-destructive invariant verified.
- **SEC-01:** the new client chart component (`carro-consumo-chart.tsx`) imports only recharts,
  shadcn chart UI, and the pure `kmPerLitroLabel` helper. No `process.env`, no service-role key,
  no secret leaks into the client bundle. Confirmed by grep.
- **Null discipline:** `formatCents` / `kmPerLitroLabel` / `reaisPerKmLabel` all return the `—`
  sentinel for null/non-positive; the cards never render a fake `R$ 0,00` / `0 km/l`. The chart
  drops null/0/non-finite km/l points before plotting (no gap-filled zero).
- **Money:** all display goes through `formatCents`; `custo_cents` resolution uses `centsToBigInt`.

The findings below are correctness-adjacent quality issues, a money-discipline deviation, and a
fragile PostgREST interpolation — none rise to BLOCKER for this single-user, RLS-isolated v1.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Inline categoria aggregation sums money as a JS float, violating the project's "never compute money as a number" mandate

**File:** `src/app/(app)/carros/[id]/page.tsx:148-149`
**Issue:** The per-category sum accumulates raw `tx.amount_cents` (typed `number`) with `+`:
```ts
valorCents: (prev?.valorCents ?? 0) + tx.amount_cents,
```
CLAUDE.md is explicit: "Do math with `decimal.js`… never floats" and "Integer cents + `decimal.js`."
The codebase already provides `centsToBigInt` precisely so money never round-trips through a JS
number, and the SQL view (`v_carro_resumo`) sums in `bigint`. This aggregation diverges from that
discipline. Two concrete consequences:
1. The summed `valorCents` is later passed to `formatCents` (via `CarroCategoriaBars`), which
   **throws** `Centavos fora do intervalo inteiro seguro` if the per-category total ever exceeds
   `Number.MAX_SAFE_INTEGER` (~9.0e15 centavos). For personal finance this is far off, but it is a
   hard crash path rather than a graceful degrade, and it is the exact boundary `formatCents` was
   written to defend.
2. It is an inconsistency that invites the same pattern to be copied into a context where
   magnitudes are larger.
**Fix:** Accumulate the per-category sum as `bigint` to match the rest of the money path:
```ts
const prev = categoriaSums.get(key)
categoriaSums.set(key, {
  categoria: prev?.categoria ?? nome,
  valorCents: (prev?.valorCents ?? 0n) + centsToBigInt(tx.amount_cents),
})
```
and widen `CarroCategoriaDatum.valorCents` / the sort + width math in `carro-categoria-bars.tsx`
to accept `bigint` (or convert at the component edge). At minimum, route each addend through
`centsToBigInt` and convert once at the display boundary.

### WR-02: Raw route param interpolated into a PostgREST `.or()` filter string

**File:** `src/app/(app)/carros/[id]/page.tsx:173`
**Issue:**
```ts
.or(`carro_id.is.null,carro_id.eq.${id}`)
```
`id` is interpolated directly into a PostgREST filter expression rather than passed as a bound
value (as `.eq('carro_id', id)` would). In this file it happens to be safe today because the
earlier `.eq('id', id).maybeSingle()` + `notFound()` guard proves `id` is a real owned `carros.id`
(a malformed value would have failed the uuid comparison and short-circuited). But the safety is
**positional and implicit** — a future refactor that reorders or removes the guard, or reuses this
read elsewhere, re-exposes a filter-injection / query-corruption surface. Defense-in-depth for a
financial app should not rely on an upstream guard for input sanitization.
**Fix:** Express the "untagged OR tagged-to-this-carro" predicate without string interpolation, or
validate `id` as a uuid (e.g. Zod `z.string().uuid()`) at the top of the handler before any use.
Preferred — keep `id` out of the filter string:
```ts
.or('carro_id.is.null,carro_id.eq.' + id)  // still interpolation — avoid
// instead, split into a parameterized read or guard id as a uuid first:
const parsed = z.string().uuid().safeParse(id)
if (!parsed.success) notFound()
```

### WR-03: List and detail pages apply inconsistent "zero gasto → —" rules, producing divergent UI for the same carro

**File:** `src/app/(app)/carros/page.tsx:67-69` vs `src/app/(app)/carros/[id]/page.tsx:249-256`
**Issue:** Both pages read `gasto_total_cents` from the same view but coalesce differently:
- List: `r.gasto_total_cents !== null && r.gasto_total_cents > 0 ? ... : null` → strictly positive.
- Detail: `const gastoTotalCents = resumo?.gasto_total_cents ?? 0` then `gastoTotalCents > 0 ? formatCents(...) : '—'`.

These are *behaviorally* equivalent for the happy path, but the detail page introduces an
intermediate `gastoTotalCents = ... ?? 0` that is then re-compared `> 0`, which is the same logic
expressed twice in two different shapes. More importantly, the detail page also constructs
`carro.gastoTotalCents: null` (line 65) on the `CarroCardData` it builds, while the list page
populates it from the view — so the same `CarroCardData` type carries the KPI in one path and not
the other. This is a maintainability trap: the null-discipline rule ("0 → —") is duplicated and can
drift. A single shared helper (e.g. `gastoToCents(view.gasto_total_cents)`) would guarantee the
list KPI strip and the detail KPI card never disagree about whether a carro shows `R$ x` or `—`.
**Fix:** Extract the coalesce into one helper used by both pages:
```ts
// lib/carro/resumo.ts
export const gastoOrNull = (v: number | null | undefined): number | null =>
  v != null && v > 0 ? v : null
```
and call it in both RSCs so the "treat 0/missing as no-data" rule lives in exactly one place.

### WR-04: `consumoSeries` X-axis labels can collide across months/years (dd/MM only)

**File:** `src/app/(app)/carros/[id]/page.tsx:107-110`
**Issue:** The chart X label is built as `${d}/${m}` (day/month) only — the year is dropped:
```ts
const [, m, d] = c.occurred_on.split('-')
return { data: `${d}/${m}`, kmPorLitro: c.km_por_litro }
```
A carro with history spanning more than a year (e.g. fills on `2025-03-01` and `2026-03-01`) yields
two points with the identical `data: '01/03'` label. Recharts keys/labels by `dataKey="data"`, so
two same-labeled points render as ambiguous, indistinguishable ticks on the axis — the user cannot
tell which year a km/l value belongs to, and dense histories produce visually overlapping ticks.
This is a correctness-of-presentation issue for the chart's whole purpose (km/l *over time*).
**Fix:** Include enough granularity to disambiguate (e.g. `dd/MM/yy` for multi-year series, or
always carry an ISO `occurred_on` as a separate field for the tooltip while keeping a compact axis
tick). Even `${d}/${m}/${yy}` removes the collision without a date lib.

## Info

### IN-01: `kmPorLitroById` map is built but never used for the chart series

**File:** `src/app/(app)/carros/[id]/page.tsx:89-93`
**Issue:** `kmPorLitroById` is constructed from `consumoRows`, but the `consumoSeries` (lines
99-110) is built directly from `consumoRows` again, not via the map. The map is only consumed later
for `abastecimentoRows` (line 225). This is fine, but the two passes over `consumoRows` (one to
build the map, one to build the series) read slightly redundantly and could confuse a maintainer
into thinking the series flows through the map. Consider a brief comment clarifying the map serves
only the history rows, or derive both from a single pass.
**Fix:** Add a one-line comment, or build `series` and `byId` in one reduce. Non-blocking.

### IN-02: Duplicated `categories(name)` embed-shape coercion across page and test

**File:** `src/app/(app)/carros/[id]/page.tsx:139-144` and `tests/carro-categoria-aggregation.test.ts:73-77`
**Issue:** The `categories as unknown as { name } | { name }[] | null` normalization (handling
supabase-js returning the embed as object-or-array) is hand-copied verbatim into the test's
`aggregateByCategoria`. This is deliberate (the test mirrors the page's exact logic), but the two
copies can silently drift — if the page's coercion is fixed, the test still passes against its own
stale copy. Consider exporting the aggregation as a small pure function from a `lib/carro/*` module
so the page and the test exercise the *same* code, not a transcription.
**Fix:** Extract `aggregateCategoria(rows)` to `src/lib/carro/` and import it in both the RSC and
the test.

### IN-03: `Math.max(...sorted.map(...))` spread on category list

**File:** `src/components/carro-categoria-bars.tsx:32`
**Issue:** `Math.max(...sorted.map((d) => d.valorCents))` spreads the array into call arguments. For
a personal-finance carro the category count is tiny, so this is harmless, but for very large arrays
the spread can hit the JS argument-count limit. Since `sorted` is already valor-desc, the max is
simply `sorted[0].valorCents` — no spread needed.
**Fix:**
```ts
const maiorValor = sorted[0]?.valorCents ?? 0
```
(`sorted` is non-empty here because the `data.length === 0` early-return precedes this.)

---

_Reviewed: 2026-06-17T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
