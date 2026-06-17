---
phase: 11-detalhe-do-carro-gr-fico-de-consumo
fixed_at: 2026-06-17T17:04:00Z
review_path: .planning/phases/11-detalhe-do-carro-gr-fico-de-consumo/11-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-06-17T17:04:00Z
**Source review:** .planning/phases/11-detalhe-do-carro-gr-fico-de-consumo/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (all Warnings; 3 Info items out of `critical_warning` scope)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Inline categoria aggregation sums money as a JS float

**Files modified:** `src/app/(app)/carros/[id]/page.tsx`, `src/components/carro-categoria-bars.tsx`, `src/components/carro-categoria-bars.test.tsx`
**Commit:** ad7e42d
**Applied fix:** Widened `CarroCategoriaDatum.valorCents` to `bigint`. The per-category accumulation in the detail RSC now routes each addend through `centsToBigInt(tx.amount_cents)` and sums on `bigint` (`(prev?.valorCents ?? 0n) + ...`), matching the rest of the money path (`v_carro_resumo` sums in bigint) and removing the `formatCents` MAX_SAFE_INTEGER crash path. The sort comparators (page + component) were rewritten for bigint ordering. In the component, the bar-width ratio converts to `Number` only for the CSS `width` percentage (a presentation value, never money). Also replaced `Math.max(...sorted.map(...))` with `sorted[0]?.valorCents ?? 0n` (no argument-count spread; folds in IN-03 since it touched the same line). Component test data updated to bigint literals (`200000n`, etc.).

### WR-02: Raw route param interpolated into a PostgREST `.or()` filter string

**Files modified:** `src/app/(app)/carros/[id]/page.tsx`
**Commit:** a4c11c0
**Applied fix:** Added `z.string().uuid().safeParse(id)` validation at the very top of the handler (before any query), calling `notFound()` for a malformed id. This mirrors the `idSchema` in `src/actions/carros.ts` and makes the `.or('carro_id.eq.' + id)` interpolation safe by construction rather than relying positionally on the downstream `.eq('id', id)` guard — defense-in-depth that survives future read reordering. Existing `notFound()` behavior for invalid/foreign ids is preserved.

### WR-03: List and detail pages apply inconsistent "zero gasto → —" rules

**Files modified:** `src/lib/carro/resumo.ts` (new), `src/app/(app)/carros/page.tsx`, `src/app/(app)/carros/[id]/page.tsx`
**Commit:** fd85b7f
**Applied fix:** Created a single pure helper `gastoOrNull(value): number | null` in a new `src/lib/carro/resumo.ts` module (returns the cents only when strictly positive, else `null`). Both RSCs now call it — the list KPI strip (`kpiByCarro`) and the detail KPI card — so the "treat 0/missing as no-data → '—', never R$ 0,00" rule lives in exactly one place and the two pages cannot drift.

### WR-04: `consumoSeries` X-axis labels can collide across years (dd/MM only)

**Files modified:** `src/app/(app)/carros/[id]/page.tsx`, `src/components/carro-consumo-chart.tsx`
**Commit:** a4823b5
**Applied fix:** The chart label builder now detects whether the valid-point series spans more than one calendar year (`new Set(occurred_on.slice(0,4)).size > 1`). For multi-year histories it emits `dd/MM/aa` (2-digit year) so ticks like `01/03/25` vs `01/03/26` no longer collide; single-year histories keep the compact `dd/MM`. Date parts are read via positional `slice` (total, strict-mode safe) — still pt-BR, SP-pinned by construction, no new date library. Updated the `CarroConsumoDatum.data` doc comment to describe the dd/MM[/aa] format.

## Notes — Info findings (out of `critical_warning` scope)

These were not in scope for this fix run and were left unaddressed, with one incidental overlap:

- **IN-01** (`kmPorLitroById` built then series built separately) — not addressed (cosmetic/clarity).
- **IN-02** (duplicated `categories(name)` embed coercion across page and `tests/carro-categoria-aggregation.test.ts`) — not addressed. NOTE: WR-01 changed the page's accumulation to bigint; the integration test keeps its own `number`-based transcription of `aggregateByCategoria` (asserts `valorCents` as `number`). The two are independent code paths, so the test still passes against its own copy — this is exactly the drift IN-02 calls out and remains a documented Info-level item for a future extraction.
- **IN-03** (`Math.max(...spread)` on the category list) — incidentally resolved as part of WR-01 (the line was rewritten to `sorted[0]?.valorCents ?? 0n`).

## Verification

- `npx tsc --noEmit` — clean after each fix.
- Touched Phase 11 unit/component tests green: `carro-consumo-chart.test.tsx`, `carro-categoria-bars.test.tsx`, `carro-card-kpis.test.tsx`, `src/lib/carro/consumo.test.ts` (23 tests passed).
- Integration tests (`tests/carro-categoria-aggregation.test.ts`, etc.) require the local Supabase stack and were not run in this isolated worktree; they exercise their own query transcription and are unaffected by the bigint change to the page accumulation.

---

_Fixed: 2026-06-17T17:04:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
