---
phase: 12-produ-o-live-verify
plan: 09
subsystem: dashboard-adherence
tags: [bugfix, gap-closure, dashboard, adherence, ui, tdd]
requires:
  - "src/lib/adherence.ts (adherenceStatus/adherenceTokens/STATUS_TOKENS)"
  - "supabase/migrations/0014_adherence_views.sql (income-driven adherence views)"
provides:
  - "adherence.shouldRenderMetaRow predicate (a saved meta is visible when income exists, regardless of spend)"
  - "calm under-teto status copy 'Dentro' (was misleading 'No limite')"
  - "truncating CategoryBadge that no longer overlaps the AdherenceBar"
affects:
  - "src/app/(app)/dashboard/page.tsx (list-vs-empty decision)"
tech-stack:
  added: []
  patterns:
    - "Single tested rule (shouldRenderMetaRow) shared by the unit suite and the dashboard RSC"
    - "Tailwind truncation requires min-w-0 on every flex ancestor of the truncate node"
key-files:
  created: []
  modified:
    - "src/lib/adherence.ts"
    - "src/lib/adherence.test.ts"
    - "src/components/category-badge.tsx"
    - "src/app/(app)/dashboard/page.tsx"
key-decisions:
  - "G-04 relabel changes only the no-limite TOKEN label ('No limite' -> 'Dentro'); the status union member and fill/text tokens are untouched to avoid a needless ripple."
  - "G-03 needed NO migration: 0014 already drives the period set off income, so a zero-spend teto materializes locally. The dashboard now routes its list-vs-empty decision through the tested shouldRenderMetaRow rule."
requirements-completed: [BUD-02]
duration: 4 min
completed: 2026-06-18
status: complete
---

# Phase 12 Plan 09: Dashboard Adherence Gap-Closure (G-02 / G-03 / G-04) Summary

Closed three BUD-02 adherence-surface defects: a misleading under-teto status label is now a calm "Dentro" (G-04), a saved meta with zero realized spend stays visible whenever the user has income via a tested `shouldRenderMetaRow` rule (G-03), and a long category label truncates instead of overlapping the AdherenceBar (G-02).

- **Duration:** 4 min (start 2026-06-18T13:33:00Z → end 2026-06-18T13:36:26Z)
- **Tasks:** 2/2
- **Files changed:** 4

## Tasks

| Task | Name | Type | Commits | Files |
| ---- | ---- | ---- | ------- | ----- |
| 1 | RED→GREEN: relabel calm under-teto (G-04) + shouldRenderMetaRow predicate (G-03) | tdd | `1e3b368` (RED test), `e159d94` (GREEN impl) | src/lib/adherence.ts, src/lib/adherence.test.ts |
| 2 | Wire zero-spend-meta visibility (G-03) + truncate label (G-02) | auto | `512a682` | src/app/(app)/dashboard/page.tsx, src/components/category-badge.tsx |

## What changed

### G-04 — calm under-teto copy
`STATUS_TOKENS['no-limite'].label` changed from `"No limite"` (read as "at the cap") to `"Dentro"`. The `no-limite` status key, fill, and text tokens are unchanged — only the human-facing copy. JSDoc updated to "teto < 80% (calm, under cap)". A teto at 2,8% of a 30% cap now reads calmly.

### G-03 — zero-spend meta visibility
Added the exported pure predicate `shouldRenderMetaRow({ hasMeta, incomeCents })` (accepts `number | bigint` income): true iff the category has a meta AND there is income, regardless of realized spend. The dashboard's `RowList` list-vs-"sem receita" decision now routes through this single tested rule (`semReceita = !shouldRenderMetaRow({ hasMeta: rows.length > 0, incomeCents })`).

### G-02 — label truncation
`CategoryBadge` root span gained `min-w-0` (it was `inline-flex` without it, so the inner `truncate` span had no effect); the name span now carries `min-w-0 truncate`. The `adherence-row.tsx` column 1 is already `minmax(0,1fr)` with `min-w-0`, so the badge now clamps and a long label ("Alocação (investimentos + reserva)") no longer overflows into the bar column. No bar component or grid change needed.

## G-03 diagnosis outcome (explicit)

**Resolution: no code-logic/migration bug in the data path — the row was already correct locally; the dashboard now references the tested rule and the production miss was a stale remote view.**

- Migration `0014_adherence_views.sql` drives the period set OFF INCOME: the `base` CTE joins each `budget_target` to every income month (`join income i on i.user_id = bt.user_id`). A consumo teto with income but zero spend yields `realized_cents = 0` (LEFT join coalesced to 0) and a non-null `adherence_bp`, so the view materializes a realized-0 row.
- The dashboard `.eq('month_key', mes)` keeps it, and `buildRows` pushes EVERY `kind==='consumo'` row unconditionally (no realized-0 filter exists anywhere in the page mapping). Confirmed by reading the full page.
- The previous `semReceita` gate (`incomeCents <= 0n || rows.every(r => r.adherenceBp === null)`) already rendered the list for income + a zero-spend meta — but it was untested ad-hoc logic. It is now expressed as the unit-tested `shouldRenderMetaRow` predicate so the "a saved meta is always visible when there is income" invariant has a single tested source of truth.
- The local stack (migrations 0001-0029) renders the zero-spend row correctly; the production symptom was a stale remote view, resolved by the 12-02 db push in the live cycle. **No migration was added** (per the plan's "do NOT add a migration unless local repro proves the view drops the row").

## Deviations from Plan

None - plan executed exactly as written.

## Gate results (LOCAL acceptance)

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` → **GREEN: 87 files, 745 tests passed** (incl. 6 new adherence cases: G-04 label + G-03 predicate).
- `npx tsc --noEmit` → **clean (exit 0)**.
- `npm run build` → **succeeds (exit 0)**, all routes compiled incl. `/dashboard`.

RED was confirmed before implementation: the 6 new tests failed (`shouldRenderMetaRow is not a function` ×4; label assertions expected "Dentro" against "No limite" ×2) while the pre-existing 19 adherence tests stayed green.

## Self-Check: PASSED

- `src/lib/adherence.ts` — `grep "label: 'Dentro'"` and `grep 'shouldRenderMetaRow'` both match.
- `src/components/category-badge.tsx` — `grep 'min-w-0'` matches (root + name span).
- `src/app/(app)/dashboard/page.tsx` — `grep 'shouldRenderMetaRow'` matches (import + usage).
- Commits exist: `1e3b368` (test), `e159d94` (feat), `512a682` (fix) all present in `git log`.

## Next

Ready for the wave-4 dashboard re-verify. Phase 12 has further gap-closure plans (G-05, G-06, etc.) and verification remaining.
