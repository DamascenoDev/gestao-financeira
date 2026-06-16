---
phase: 03-metas-ader-ncia-e-reservas
reviewed: 2026-06-16T00:00:00Z
depth: deep
scope: Phase 3 diff (commits 7160e94..HEAD — plans 03-01..03-05)
files_reviewed: 28
files_reviewed_list:
  - supabase/migrations/0011_budget_targets.sql
  - supabase/migrations/0012_categories_is_reserva.sql
  - supabase/migrations/0013_reservas.sql
  - supabase/migrations/0014_adherence_views.sql
  - supabase/migrations/0015_reserva_balance_view.sql
  - supabase/migrations/0016_register_reserva_saida.sql
  - supabase/migrations/0017_register_reserva_saida_lock.sql
  - src/actions/budget-targets.ts
  - src/actions/reservas.ts
  - src/actions/transactions.ts
  - src/lib/adherence.ts
  - src/lib/month.ts
  - src/lib/money.ts
  - src/lib/schemas/budget-target.ts
  - src/lib/schemas/reserva.ts
  - src/app/(app)/dashboard/page.tsx
  - src/app/(app)/extrato/page.tsx
  - src/app/(app)/reservas/page.tsx
  - src/app/(app)/reservas/[id]/page.tsx
  - src/components/adherence-bar.tsx
  - src/components/adherence-row.tsx
  - src/components/adherence-summary-strip.tsx
  - src/components/meta-dialog.tsx
  - src/components/reserva-card.tsx
  - src/components/reserva-form.tsx
  - src/components/reserva-ledger-table.tsx
  - src/components/reserva-picker.tsx
  - src/components/reserva-progress.tsx
  - src/components/saida-form.tsx
  - src/components/selection-action-bar.tsx
  - src/components/extrato-table.tsx
findings:
  critical: 0
  high: 1
  medium: 2
  low: 3
  total: 6
status: fixed
fixes:
  HG-01: { status: fixed, commit: 779c65b }
  MD-01: { status: fixed, commit: fabc0a4 }
  MD-02: { status: fixed, commit: fabc0a4 }
  LW-01: { status: fixed, commit: 9e5f2af }
  LW-02: { status: fixed, commit: 12d687f }
  LW-03: { status: fixed, commit: 4f860f3 }
---

# Phase 3: Code Review Report — Metas, aderência e reservas

**Reviewed:** 2026-06-16
**Depth:** deep (cross-file, RLS/IDOR/reserva-integrity/money focus)
**Files Reviewed:** 28 source files (7 migrations + 3 actions + lib + pages + components)
**Status:** findings

## Summary

The RLS / isolation surface is solid. Every Phase-3 table (`budget_targets`,
`reservas`, `reserva_ledger`) has `enable row level security`, a uniform
`(select auth.uid()) = user_id` USING + WITH CHECK policy `for all to authenticated`,
DML grants, and a `user_id` index. Both adherence views and the balance view carry
`with (security_invoker = true)`, so the SQL aggregates run under the caller's RLS and
do not leak cross-tenant sums (pinned by `view-leak.test.ts`). The IDOR re-derive
discipline is applied consistently: `assertOwnedCategory`, `assertOwnedReserva`, and
`isReservaCategory` all run under the RLS client before any FK write in
`upsertBudgetTarget`, `registerSaida`, `createTransactionWithReserva`, and
`updateTransaction`. The saída RPC is genuinely race-safe — `0017` takes a
`select ... for update` row lock on the owning `reservas` row *before* reading the
derived balance, so concurrent oversized saídas serialize and the second re-reads the
reduced balance and is rejected (never-negative holds). Balance is always derived
(`v_reserva_balance`), never stored. Money is integer basis-points / centavos
throughout; `parseBRLToCents` rejects ambiguous grouping and non-positive amounts.

**One HIGH integrity defect:** the bulk-reclassify path (`bulkReclassify` +
`SelectionActionBar`) lets a user move transactions INTO or OUT of the Reserva
category WITHOUT syncing `reserva_ledger`, breaking the aporte/balance invariant in
both directions. Two MEDIUM correctness issues in the adherence view (a meta with zero
spend silently disappears; income mis-join on the `out`/no-spend path). Three LOW
items round it out.

---

## Narrative Findings (AI reviewer)

### HIGH

#### HG-01: Bulk-reclassify bypasses reserva-ledger sync in BOTH directions — phantom and missing aportes

> **FIXED (779c65b):** `bulkReclassify` now rejects an `is_reserva` target server-side
> (with the picker also hiding it in `extrato-table.tsx`) and sync-deletes any linked
> aportes when moving rows to a non-Reserva category, then revalidates `/reservas` +
> `/dashboard`. New `tests/bulk-reclassify-reserva.test.ts` proves saldo == ledger for
> bulk-into (blocked) and bulk-out (no phantom).

**Files:** `src/actions/transactions.ts:439-472` (`bulkReclassify`),
`src/components/extrato-table.tsx:254-257` (`selectCategories`),
`src/components/selection-action-bar.tsx:80-87`

**Issue:** `bulkReclassify` performs a bare
`update({ category_id }).in('id', ids)` and never calls
`syncReservaLedgerForTransaction`. The bulk target list is built from *all* active
categories (`extrato-table.tsx:254` maps every `categories` entry into
`selectCategories` with no `is_reserva` filter), so the Reserva category is a
selectable bulk target. Two integrity breaks result:

1. **Bulk INTO Reserva → missing aporte.** Selected transactions get
   `category_id = <Reserva>` but no `reserva_ledger` `'in'` entry is created (and no
   `reservaId` is even collected). The transactions now count toward the alocação
   adherence total (`v_adherence_*` rolls up all `kind='alocacao'` spend), yet the
   reserva balance (`v_reserva_balance` = Σ in − Σ out) does NOT reflect them. The
   `/reservas` saldo and the dashboard "Alocação" line disagree about the same money.

2. **Bulk OUT of Reserva → phantom aporte.** A transaction that previously had a linked
   `reserva_ledger` `'in'` row (created via `createTransactionWithReserva`) is
   reclassified away in bulk, but the ledger row is left untouched. The single-row
   inline edit path explicitly deletes it (`updateTransaction` → `deleteOld: true`); the
   bulk path does not. The orphaned `'in'` entry keeps inflating the reserva saldo even
   though no transaction sits in the Reserva category anymore — a phantom aporte / silent
   over-statement of the user's reserved money.

Because the single-row paths are carefully synced, this is a real and reachable
divergence the moment a user multi-selects in the Extrato and reclassifies. For a
financial app, a balance that disagrees with its own ledger is a HIGH integrity defect.

**Fix:** Exclude the Reserva category from the bulk target list AND reject it
server-side (the ledger sync needs a per-row `reservaId`, which bulk has no UI to
collect — so blocking is the correct contract). Also sync-delete linked ledger rows
when bulk-reclassifying away from Reserva:

```ts
// extrato-table.tsx — drop the is_reserva category from the bulk picker
const selectCategories: SelectionCategory[] = React.useMemo(
  () => categories.filter((c) => !c.isReserva).map((c) => ({ id: c.id, name: c.name })),
  [categories],
)
```

```ts
// transactions.ts bulkReclassify — server is authoritative
const { data: targetCat } = await supabase
  .from('categories').select('is_reserva').eq('id', parsed.data).maybeSingle()
if (targetCat?.is_reserva) {
  return { error: 'Use o lançamento individual para classificar como Reserva.' }
}
// ...after the update succeeds, drop any aporte linked to a now-non-Reserva txn:
const { error: ledgerError } = await supabase
  .from('reserva_ledger').delete().in('transaction_id', ids)
if (ledgerError) return { error: 'Não foi possível sincronizar a reserva.' }
revalidatePath(RESERVAS_PATH); revalidatePath(DASHBOARD_PATH)
```

---

### MEDIUM

#### MD-01: Consumo meta with zero spend in the month vanishes from the dashboard (income mis-join)

> **FIXED (fabc0a4):** both adherence views now drive the period off income (a `base`
> CTE joins each meta to every income period), so a zero-spend teto materializes at 0%
> with a non-NULL `month_key`/`year` instead of being dropped. Locked by
> `tests/adherence-zero-spend.test.ts`. (A meta with no income in the period now
> yields no row — there is no computable meta — per the income-driven contract;
> `adherence-month.test.ts` updated to assert this.)

**File:** `supabase/migrations/0014_adherence_views.sql:42, 68-76` (and the YTD twin
`:111, 133-139`)

**Issue:** In `v_adherence_month`, the output `month_key` is
`coalesce(sc.month_key, at.month_key, i.month_key)` and the income join is
`i.month_key = coalesce(sc.month_key, at.month_key)`. For a `kind='consumo'` meta with
**no spend** in a given month, the `spend_cat sc` left join produces NULL (no row), and
`alloc_total at` is irrelevant for a consumo row, so `coalesce(sc.month_key,
at.month_key)` is NULL → the income join matches nothing → `income_cents = 0` →
`meta_cents = 0` → `adherence_bp = null`. Worse, the row's own `month_key` resolves to
NULL, so the dashboard's `.eq('month_key', mes)` filter
(`dashboard/page.tsx:186`) drops the row entirely.

Net effect: a teto category the user has set a meta for but spent R$0 on this month
**disappears** from the Mensal tab (and shows as `sem-receita` if it ever surfaces),
even though the user has income. The correct behavior is a 0% / "No limite" row — a
zero-spend teto is the *best* possible adherence, and silently hiding it understates the
meta count. The income exists; the view just cannot attach it because there is no spend
row to carry the period key.

**Fix:** Drive the period off income (which always exists per user/month) rather than
off spend. Cross/left-join each meta to the user's income periods so a meta row always
materializes for every period the user has income, with `realized_cents` coalescing to
0 when there is no spend. E.g. derive the period set from `v_income_month` per user and
left-join spend onto it, so `month_key` is never NULL for a meta in an income month.

#### MD-02: Adherence ratio computed against the UN-rounded meta while `meta_cents` is rounded half-up — monthly↔YTD/preview can disagree by the rounding step

> **FIXED (fabc0a4):** `adherence_bp` in both views is now `realized * 10000 /
> meta_cents` against the SAME half-up rounded `meta_cents` the user and the dashboard
> combined-alocação line use (guarded `meta_cents = 0 → null`). Locked by the second
> case in `tests/adherence-zero-spend.test.ts`.

**File:** `supabase/migrations/0014_adherence_views.sql:54-64` (and `:122-130`);
cross-check `src/app/(app)/dashboard/page.tsx:92-98`

**Issue:** `meta_cents` is `(income*bp + 5000)/10000` (half-up, exposed to the user and
to the MetaDialog preview at `meta-dialog.tsx:181`). But `adherence_bp` is computed as
`realized * 10000 * 10000 / (income * bp)` — i.e. against the *un-rounded* meta
`income*bp/10000`, not against the rounded `meta_cents` the user sees. Separately, the
dashboard's combined-alocação line recomputes `adherenceBp` as
`Number((realized * 10000n) / metaCents)` against the **rounded** `metaCents`
(`dashboard/page.tsx:94-98`). So the same conceptual ratio is computed two different
ways (rounded vs un-rounded denominator), which can land on opposite sides of the
80%/100% status thresholds in `adherence.ts` for borderline values, producing an
inconsistent status badge / count between the per-category rows and the combined line.

The discrepancy is ≤ the rounding of one meta and only bites at exact threshold
boundaries, so it is MEDIUM, not HIGH — but in a "monthly↔YTD consistency is a locked
invariant" phase it should be made uniform.

**Fix:** Pick one denominator everywhere. Recommend computing `adherence_bp` against the
same rounded `meta_cents` the user sees in both views and in the dashboard combined-line
recompute:

```sql
case when meta_cents = 0 then null
     else (realized_cents * 10000) / meta_cents end as adherence_bp
```

(guard `meta_cents = 0 → null`, matching the current sem-receita semantics).

---

### LOW

#### LW-01: `createTransaction` does not sync the reserva ledger — dormant footgun

> **FIXED (9e5f2af):** added the `isReservaCategory` guard so a Reserva category routed
> through `createTransaction` is rejected before insert (steering to
> `createTransactionWithReserva`). Unit test added in `transactions.test.ts`.

**File:** `src/actions/transactions.ts:184-228`

**Issue:** `createTransaction` (the non-`WithReserva` variant) inserts a transaction
with no `is_reserva` check and no ledger sync. If its category is the Reserva one, the
alocação adherence counts the spend but no aporte is created — the same divergence as
HG-01. It is currently only reachable from `transactions.test.ts`, never the UI (the
form always calls `createTransactionWithReserva`), so this is dormant, not live. But a
second exported create path that silently breaks the reserva invariant is an easy future
regression.

**Fix:** Either delete `createTransaction` and point the tests at
`createTransactionWithReserva`, or add the same `isReservaCategory` guard so a Reserva
category routed through it is rejected rather than half-recorded.

#### LW-02: `registerSaida` overdraw detection matches the raw error string `'saldo'`

> **FIXED (12d687f):** migration `0018` raises the overdraw case with a dedicated
> SQLSTATE `'P0002'`; `registerSaida` now branches on `error.code === 'P0002'` instead
> of `error.message.includes('saldo')`. `reserva-saida.test.ts` asserts the code.

**File:** `src/actions/reservas.ts:200-204`; also `saida-form.tsx:119`

**Issue:** The action distinguishes the overdraw rejection from other DB errors with
`error.message.includes('saldo')`, keyed off the RPC's pt-BR raise text
(`'Saída maior que o saldo da reserva'`, `0016/0017:39`). A future copy/i18n change to
that message silently downgrades the precise "maior que o saldo" field error to the
generic "Não foi possível registrar a saída." toast. The RPC already raises a dedicated
`errcode = 'P0001'`; branching on a structured signal is more robust than substring
matching the message.

**Fix:** Use a distinct SQLSTATE for the overdraw case (e.g. a custom `'P0002'` or carry
`errcode`/`details`) and branch on `error.code` instead of `error.message.includes`,
mirroring the `moneyWriteError` `code === '23514'` pattern already used in
`transactions.ts`.

#### LW-03: `ReservaProgress` ratio divides through JS floats (display-only)

> **FIXED (4f860f3):** the percentage is now derived with integer bigint math
> (`(saldo * 10000n) / alvo` basis-points); only the bar's DOM width stays numeric.

**File:** `src/components/reserva-progress.tsx:37-38`

**Issue:** `const saldo = Number(centsToBigInt(saldoCents)); const ratio = saldo /
alvoCents` round-trips money through a JS float for the progress ratio. The saldo itself
is view-derived and never persisted from this value, so there is no money-corruption
risk — it is strictly the bar width / percentage label. Worth a note only because the
"no float in money" discipline is otherwise rigorously kept (`money.ts` goes to great
lengths to avoid exactly this). Acceptable for a pure display ratio.

**Fix:** None required for correctness. If desired, compute the percentage with integer
math (`(saldo * 100) / alvo` in bigint) for consistency with the rest of the money path.

---

## What was verified clean (high-value negatives)

- **RLS shape** on `budget_targets` / `reservas` / `reserva_ledger`: ENABLE RLS +
  USING + WITH CHECK + grants + `user_id` index all present and uniform
  (`0011:24-34`, `0013:33-55`). Covered by `rls-isolation.test.ts`.
- **View leakage:** `v_adherence_month`, `v_adherence_ytd`, `v_reserva_balance` all
  `with (security_invoker = true)` (`0014:20,85`, `0015:8`). Covered by
  `view-leak.test.ts`.
- **IDOR:** `assertOwnedCategory` / `assertOwnedReserva` / `isReservaCategory` re-derive
  ownership under the RLS client before every FK write in `upsertBudgetTarget`,
  `registerSaida`, `createTransactionWithReserva`, `updateTransaction`, `deleteTransaction`.
  The saída RPC is SECURITY INVOKER with a pinned `search_path` and aborts on a
  foreign/nonexistent reserva (null balance → raise).
- **Reserva never-negative + concurrency:** `0017` `select ... for update` on the owning
  `reservas` row before the balance read genuinely serializes per-reserva saídas; the
  positive-amount guard + `amount > saldo` check hold. Balance is always derived,
  never a stored column.
- **Aporte accounting:** the `'in'` ledger entry counts as alocação allocation via the
  view's `alloc_total` grouping and never as consumo; the partial
  `unique(transaction_id)` index + delete-old-then-insert in
  `syncReservaLedgerForTransaction` keeps the single-row create/edit path idempotent
  with no orphan/double-count; `deleteTransaction` explicitly removes the linked entry
  before the SET NULL FK can leave a phantom. (The bulk path is the one gap — HG-01.)
- **Money:** integer basis-points for percent, centavos via `money.ts`; half-up rounding
  shared between monthly and YTD `meta_cents`; `parseBRLToCents` rejects ambiguous
  grouping, NaN, and non-positive amounts.
- **Injection / input validation:** all client-supplied ids run through
  `z.string().uuid()` before reaching `.eq`/`.in`; `?mes` normalized through
  `isMonthKey` before date-fns/DB; no `eval`/string-built SQL.

---

_Reviewed: 2026-06-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
