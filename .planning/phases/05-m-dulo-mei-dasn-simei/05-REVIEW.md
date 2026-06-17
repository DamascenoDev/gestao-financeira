---
phase: 05-m-dulo-mei-dasn-simei
reviewed: 2026-06-17T02:39:38Z
depth: deep
files_reviewed: 28
files_reviewed_list:
  - src/lib/mei/rules.ts
  - src/lib/mei/limit.ts
  - src/lib/mei/status.ts
  - src/lib/mei/csv.ts
  - src/lib/mei/presentation.ts
  - src/actions/mei.ts
  - src/lib/ownership.ts
  - src/lib/schemas/mei.ts
  - src/lib/month.ts
  - src/lib/money.ts
  - supabase/migrations/0025_mei.sql
  - supabase/migrations/0026_mei_views.sql
  - src/app/(app)/mei/page.tsx
  - src/app/(app)/mei/notas/page.tsx
  - src/app/(app)/mei/relatorio/page.tsx
  - src/app/(app)/mei/configuracoes/page.tsx
  - src/app/(app)/mei/layout.tsx
  - src/components/dasn-report-view.tsx
  - src/components/export-csv-button.tsx
  - src/components/limite-gauge.tsx
  - src/components/limite-status-badge.tsx
  - src/components/mei-disclaimer.tsx
  - src/components/nf-form.tsx
  - src/components/nf-table.tsx
  - src/components/mei-settings-form.tsx
  - src/components/year-selector.tsx
  - src/components/atividade-badge.tsx
  - src/components/print-button.tsx
findings:
  critical: 0
  high: 0
  medium: 1
  low: 3
  total: 4
status: fixed
fixed_at: 2026-06-16
fix_commits:
  MD-01: 2725480
  LR-02: f7e4b3f
  LR-03: 1f1c011
  LR-01: 03e4323
---

# Phase 5: Code Review Report — Módulo MEI / DASN-SIMEI

**Reviewed:** 2026-06-17T02:39:38Z
**Depth:** deep (cross-file: SQL view ↔ TS oracle parity, RLS/IDOR call chains, money-discipline convention)
**Files Reviewed:** 28
**Status:** findings (1 MEDIUM, 3 LOW; no CRITICAL/HIGH)

## Summary

Phase 5 is a strong, security-conscious slice. The two highest-risk surfaces for a fiscal
app — **fiscal-limit correctness** and **multi-tenant isolation** — are well-handled and
well-tested. Findings are confined to one money-discipline convention regression (MEDIUM)
and three LOW edge/robustness notes. None block ship.

What was verified clean and is worth recording:

- **Fiscal math (the core risk).** `applicableLimitCents` (limit.ts) and the SQL `lim` CTE
  (0026) implement the *same* formula: 0 before opening year, `675000 × (12 − openingMonth + 1)`
  proportional in the opening year (opening month counts FULL), `8100000` thereafter. The 20%
  band is recomputed proportionally off the applicable limit (`× 12000 / 10000`) — NOT a static
  full-year R$97.200 in the opening year (Pitfall 12-14 avoided). Integer/truncation semantics
  match between `Math.floor((x*12000)/10000)` and Postgres `x*12000/10000`. `ratio_bp` guards
  /0. `mei-report.test.ts` asserts SQL↔TS parity at the *data* level including the
  `comercio + servicos === gross` split invariant. Active-month counting, gross-not-net
  (`amount_cents` documented as receita bruta + `CHECK > 0`), and year-boundary safety
  (`issued_on` is a civil `date`, view groups via `to_char(...,'YYYY')` → no UTC slip) are correct.
- **Never-hardcode.** Fiscal numbers live only in `rules.ts`; `rules.test.ts` greps the SQL
  literals for parity and greps `src/` for stray fiscal digits. Independent grep confirmed zero
  leaked literals outside `rules.ts`.
- **RLS / isolation.** All three tables: `ENABLE ROW LEVEL SECURITY` + `USING` + `WITH CHECK`
  `auth.uid() = user_id` + grants + `user_id` index. `v_mei_year_summary` is `security_invoker = true`
  (proved by `mei-view-leak.test.ts`).
- **IDOR.** `updateMeiInvoice`/`deleteMeiInvoice` re-derive ownership via `assertOwnedMeiInvoice`
  BEFORE the `.eq('id', id)` write; settings/year-flag upserts take `user_id` from `getClaims()`
  (never client input) and are scoped via `onConflict`. UUID validated before reaching the DB.
- **DASN report integrity + CSV.** Split sums to gross by construction (`activity_type` CHECK
  constrains to exactly the two buckets the view filters on). CSV uses a code-generated UTF-8 BOM,
  `;` delimiter (Excel pt-BR), `formatCents` money; zero-revenue year still emits a valid row.

## Medium

### MD-01: NfTable footer sums `bigint` money via raw `+ 0`, bypassing the `centsToBigInt` convention

**Status:** FIXED (commit 2725480) — footer now sums via `centsToBigInt`/`0n`, `NfRow.amount_cents` widened to `number | bigint`, `notas/page.tsx` coerces at the data boundary, pinned by a string-input test.
**File:** `src/components/nf-table.tsx:176`
**Issue:** `const totalCents = rows.reduce((acc, r) => acc + r.amount_cents, 0)` sums a Postgres
`bigint` column directly. The codebase has an explicit, documented MD-04 invariant — *"carry
centavos as bigint, never via a lossy `Number()` cast"* — applied in every sibling money-sum
(`extrato/page.tsx:99-120`, `reserva-ledger-table.tsx`, `dashboard/page.tsx`, etc., 10 files use
`centsToBigInt`). `nf-table.tsx` is the only money table that breaks it. supabase-js may surface
a `bigint` column as a **string** at runtime (the generated type says `number`, but `money.ts`
itself documents this exact hazard). If it does, `acc + r.amount_cents` becomes **string
concatenation** ("0" + "100000" + "250000" → "0100000250000"), and the displayed "Receita bruta
no ano" total — the same headline number the dashboard hero shows — is silently corrupt. Even on
the number path, no `Number.isSafeInteger` guard is applied before `formatCents`. Magnitudes for a
single MEI year stay within safe-int range, so this is unlikely to fire today, but it is a
genuine money-discipline regression against an established invariant and a real corruption vector.
The `notas/page.tsx:45-52` mapper also passes `amount_cents` straight through, unlike
`extrato/page.tsx` which wraps each row in `centsToBigInt`.
**Fix:** Sum on bigint like the siblings, and coerce on the data boundary:
```ts
// nf-table.tsx
import { centsToBigInt, formatCents } from '@/lib/money'
const totalCents = rows.reduce((acc, r) => acc + centsToBigInt(r.amount_cents), 0n)
// ...
{formatCents(totalCents)}
```
Optionally also coerce in `notas/page.tsx` map (`amount_cents: centsToBigInt(r.amount_cents)`)
and widen `NfRow.amount_cents` to `number | bigint` to match `AmountCell`/`centsToEditableBRL`.

## Low

### LR-01: Exactly-at-limit (gross == applicable, ratio_bp == 10000) is labeled "Acima do limite"

**Status:** FIXED (commit 03e4323) — REQUIRES HUMAN VERIFICATION of product intent. Applied the review's recommended fix: `ratioBp <= BP_100 → 'ambar'` so exactly-at-limit is "within" (desenquadramento triggers only when gross *exceeds* the limit). Aligned `page.tsx` `overLimit` to strictly `> 10000` and re-pinned `status.test.ts`. Confirm the at-limit semantics are intended before ship.
**File:** `src/lib/mei/status.ts:29-32` (and pinned by `status.test.ts:24`)
**Issue:** At exactly 100% (`ratioBp === 10000`, i.e. gross == applicable limit to the centavo),
`meiStatus` falls past the `ratioBp < BP_100` branch into the band check and returns
`vermelho-banda` → the UI shows "Acima do limite — dentro da tolerância de 20%". Fiscally the MEI
ceiling (e.g. R$81.000,00) is a value the entrepreneur may *reach*; the desenquadramento
consequence triggers when gross **exceeds** the limit, not when it equals it. Treating exactly-at
as "above" is over-strict by one edge. It errs **conservatively** (warns slightly early, never
under-warns), so it is not a financial-loss bug — flagging as LOW. The test deliberately pins
this behavior, so confirm it is the intended product decision rather than an oversight.
**Fix (only if the product intent is "at-limit is still within"):** make the 100% comparison
inclusive of the limit:
```ts
if (ratioBp <= BP_100) return 'ambar' // ≤ 100% → still within / approaching
```
and update the corresponding `status.test.ts` expectation. (No SQL change needed — `status.ts`
consumes `ratio_bp`; the view is unaffected.)

### LR-02: `?ano` parsed with `Number(x) || currentYear` accepts non-integer / out-of-range values silently

**Status:** FIXED (commit f7e4b3f) — added `toYearOrCurrent` to `month.ts` mirroring `toMonthKeyOrCurrent` and wired it into all five `?ano` sites; pinned by a fixed-clock test.
**File:** `src/app/(app)/mei/page.tsx:45`, `notas/page.tsx:32`, `relatorio/page.tsx:24`,
`configuracoes/page.tsx:19`, `year-selector.tsx:21`
**Issue:** `const ano = Number(anoParam) || Number(currentYear())` coerces garbage to the current
year (safe), but also lets through non-integer/extreme values: `?ano=2026.5`, `?ano=1e9`,
`?ano=-5`. These flow into `.eq('year', ano)` (parameterized — **no injection**) and just match no
rows, so impact is cosmetic (a nonsense year header). Unlike the `month.ts` module, which has a
strict `isMonthKey` guard for exactly this class of crafted-searchparam input (MD-02), the year
path has no equivalent normalizer. Consistency + defensive-input hygiene gap, not a vulnerability.
**Fix:** add a small year normalizer mirroring `toMonthKeyOrCurrent` and use it everywhere:
```ts
// month.ts
export function toYearOrCurrent(value: unknown): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : Number(currentYear())
}
```

### LR-03: Pre-opening year with revenue renders "verde / Dentro do limite" despite recorded gross

**Status:** FIXED (commit 1f1c011) — added an info line (`preOpeningWithRevenue`) explaining that notes registered before the MEI start do not count toward the year's limit. Copy only, no math change.
**File:** `src/app/(app)/mei/page.tsx:90-97`, driven by `status.ts:27` and `0026:69`
**Issue:** If a user sets `mei_start_date` to a future year (e.g. 2027) but has NFs dated in an
earlier year (2026), the view computes `applicable_limit_cents = 0` → `ratio_bp = null` →
`meiStatus(null, …)` returns `verde`, so the dashboard shows revenue in the hero yet
"Dentro do limite". This is a defensible interpretation (revenue before MEI registration is not
MEI revenue), but the *messaging* is misleading — green/"within limit" alongside a non-zero gross.
Edge-only; LOW.
**Fix (optional polish):** when `ratioBp === null` but `grossCents > 0`, surface an info line such
as "Notas registradas antes do início do MEI não contam para o limite de {ano}." instead of the
plain verde state. No math change required.

---

_Reviewed: 2026-06-17T02:39:38Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
