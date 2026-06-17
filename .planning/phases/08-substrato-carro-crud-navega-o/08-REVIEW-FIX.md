---
phase: 08-substrato-carro-crud-navega-o
fixed_at: 2026-06-17T00:00:00Z
review_path: .planning/phases/08-substrato-carro-crud-navega-o/08-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 3
skipped: 3
status: partial
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-06-17
**Source review:** .planning/phases/08-substrato-carro-crud-navega-o/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical_warning): 6 warnings
- Fixed: 3 (WR-02, WR-03, WR-04)
- Skipped/deferred: 3 (WR-01, WR-05, WR-06 — deferred to Phase 10)
- Info items (IN-01..IN-04): out of scope (critical_warning scope)

All three in-place fixes verified with targeted tests + `npx tsc --noEmit` (clean),
and the full unit suite stays green: **635 passing** (was ~632; +3 new pinning tests).
Local Supabase stack was UP so the RLS/view integration tests ran too. No
`supabase db push` / `db reset` was run.

## Fixed Issues

### WR-02: `ano` parsing yields a misleading error for non-integer input

**Files modified:** `src/lib/schemas/carro.ts`, `src/lib/schemas/carro.test.ts`
**Commit:** 3a12508
**Applied fix:** Added invalid-number messages to the `ano` Zod chain
(`z.number({ message: 'Informe um ano válido' }).int('Informe um ano válido')`),
keeping `.min(1900)` / `.max(MAX_ANO)` on `'Ano inválido'`. Now `Number("abc")`
→ `NaN` and a decimal like `20.5` surface the friendly **"Informe um ano válido"**,
while genuine out-of-range INTEGERS (1899, year+2) keep **"Ano inválido"**. The
form's `buildInput()` still hands `Number(anoTrimmed)` to the schema, so junk and
decimals are now correctly labelled. Added a schema test pinning both the NaN and
decimal cases; the existing out-of-range test still asserts "Ano inválido".

### WR-03: List filtering happened in JS after fetching all rows

**Files modified:** `src/app/(app)/carros/page.tsx`
**Commit:** e0f24bb
**Applied fix:** Pushed the `is_archived` predicate into the Supabase query —
`if (!showArchived) query = query.eq('is_archived', false)` — and dropped the JS
`.filter((c) => showArchived || !c.is_archived)`. Archived identity rows now never
leave the DB on the default view. RLS still scopes to the owner; `.order('apelido')`
preserved. `tsc` confirms the builder reassignment type-checks; no page test
referenced the old shape.

### WR-04: `assertOwnedCarro` treated a query error identically to "not owned"

**Files modified:** `src/lib/ownership.ts`, `src/actions/carros.ts`, `src/actions/carros.test.ts`
**Commit:** ad9f384
**Applied fix:** Changed `assertOwnedCarro` from `Promise<boolean>` to a tri-state
`Promise<OwnershipResult>` (`'owned' | 'not-owned' | 'error'`): `if (error) return 'error'`,
else `data?.length === 1 ? 'owned' : 'not-owned'`. Updated both carro call sites
(`updateCarro` and the shared `setArchived` used by archive/unarchive) to map
`'error'` → generic **"Não foi possível atualizar o carro. Tente novamente."** and
`'not-owned'` → **"Carro inválido."**. Both non-owned outcomes remain fail-safe (no
write issued). Scope deliberately localized to the carro path: the sibling boolean
helpers (`assertOwnedReserva` / `assertOwnedStatement` / `assertOwnedMeiInvoice` /
`assertOwnedCategories`) were left untouched to avoid regressing other modules, per
the orchestrator's narrowed scope. Added two action tests pinning the transient-error
path (update + archive) returns the retry message and issues no write.

**Note (logic verification):** WR-04 is a behavioral change to error mapping. It is
mechanically verified by the new tests and the full green suite; the routing of the
two error classes was confirmed against the existing forged-id tests
(`{ data: [], error: null }` → `'not-owned'` → "Carro inválido.", unchanged).

## Skipped Issues

### WR-01: DB has no CHECK on `combustivel_padrao` / `ano` — only Zod guards them

**File:** `supabase/migrations/0027_carros.sql:32-33`
**Reason:** skipped (deferred to Phase 10). Touches the migration; per orchestrator
triage these SQL constraints will be added in Phase 10 (the abastecimento/consumption
owning phase) alongside the related fuel-enum alignment, with real data to test
against. Adding a throwaway 0028 migration now then another in Phase 10 is wasteful
churn. Migration intentionally NOT touched.

### WR-05: `v_abastecimento_consumo` interval logic non-deterministic on tied odometers

**File:** `supabase/migrations/0027_carros.sql:123,151-166`
**Reason:** skipped (deferred to Phase 10). The consumption view has ZERO rows until
Phase 10 builds the abastecimento log; the tie-break window fix belongs with that work
where it can be tested against real data. Migration intentionally NOT touched.

### WR-06: `reais_por_km` guards zero but not a negative `km_rodados`

**File:** `supabase/migrations/0027_carros.sql:151,179-186`
**Reason:** skipped (deferred to Phase 10). Same rationale as WR-05 — the negative
`km_rodados` guard lives in the consumption view, which is latent until Phase 10
populates it. Fix it in its owning phase to avoid migration churn. Migration
intentionally NOT touched.

---

_Fixed: 2026-06-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
