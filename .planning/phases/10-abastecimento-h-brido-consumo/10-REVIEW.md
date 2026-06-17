---
phase: 10-abastecimento-h-brido-consumo
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - supabase/migrations/0028_carros_fix.sql
  - src/lib/schemas/abastecimento.ts
  - src/lib/schemas/abastecimento.test.ts
  - src/lib/schemas/carro.ts
  - src/lib/ownership.ts
  - src/actions/abastecimentos.ts
  - src/actions/abastecimentos.test.ts
  - src/lib/carro/consumo.ts
  - src/lib/carro/consumo.test.ts
  - src/components/abastecimento-form.tsx
  - src/components/transacao-picker.tsx
  - src/components/abastecimento-history.tsx
  - src/app/(app)/carros/[id]/page.tsx
  - tests/abastecimento-action.test.ts
  - tests/carro-consumo.test.ts
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the Phase-10 abastecimento module: migration 0028 (consumption-view fix +
carros CHECKs), the Zod schema + XOR refine, the dual-IDOR action layer, the pure
consumo helpers, the form/picker/history UI, the detail page, and both Wave-0
integration tests.

The security-critical invariants the phase exists to protect are sound:

- **Cost-source XOR** is enforced in three layers (Zod `superRefine`, the DB
  `abastecimentos_cost_xor` CHECK from 0027, and the form clearing the inactive
  source). Both branches of the XOR are tested.
- **Dual IDOR** is correctly ordered: `assertOwnedCarro` (tri-state) AND
  `assertOwnedTransaction` both run **before** any FK write, and the carro_id stamp
  on the linked transaction only happens after ownership + the 1:1 pre-check pass.
  The foreign-tx integration test proves B's transaction never receives A's carro_id.
- **`security_invoker = true`** is preserved on the re-created view; **`preco_litro`
  is never stored** (proven by the column-absent test); the `km_rodados <= 0` guard
  excludes bad intervals and the CASE branches guard divide-by-zero.
- **`litros` is handled as numeric**, never routed through `parseBRLToCents`.
- Action results are `{ ok } | { error }` and never throw.

No BLOCKER-level defects were found. The findings below are correctness edge cases in
the view math, an edit-path UX/data-visibility defect, and quality/robustness items.

## Warnings

### WR-01: Edit form hides the currently-linked transaction from the picker

**File:** `src/app/(app)/carros/[id]/page.tsx:90-110`, consumed by
`src/components/abastecimento-history.tsx:131-138` and
`src/components/abastecimento-form.tsx:318-324`

**Issue:** The page builds a single `transacoes` list that excludes **every** linked
`transaction_id` (`linkedTxIds`), then passes that same list to both the "Novo" form
and every per-row edit form. When the user edits a fatura-linked abastecimento, its own
`transaction_id` is in `linkedTxIds`, so it is filtered out of `transacoes`. The edit
form seeds `source='fatura'` and `transactionId = row.transaction_id`, but the
`TransacaoPicker` only renders/selects options present in `transacoes` — so the linked
lançamento is invisible (the picker may even render "Nenhum lançamento disponível para
vincular"). The user editing a linked fuel-up cannot see or re-confirm what is linked,
and if they touch the picker they cannot reselect the current tx. (The hidden state is
still submitted, so a no-op save succeeds — masking the defect.)

**Fix:** Include the row's own linked transaction in the picker list for the edit case.
Pass the current `transaction_id` (and a fetched option for it) into the edit form so
the picker can render it as the selected option, e.g. compute a per-row option list
that re-adds `row.transaction_id` even though it is "linked":

```ts
// in toEdit / page: fetch the linked tx's own option and merge it for the edit picker
const editTransacoes = row.transaction_id
  ? [linkedOptionFor(row.transaction_id), ...transacoes]
  : transacoes
```

### WR-02: View double-counts litros when two full-tank fills share one odometer

**File:** `supabase/migrations/0028_carros_fix.sql:88-103`

**Issue:** `prev_full_odometro` lags over full-tank fills ordered by
`(odometro_km, occurred_on, created_at, id)`. The litros/custo subqueries aggregate by
`s.odometro_km > prev_full_odometro AND s.odometro_km <= f.odometro_km`. If two
`tanque_cheio` fills exist at the **same** `odometro_km = X` with a prior full fill at
`Y < X`: the interval closing at the *second* X fill has `prev_full = X` → `km_rodados
= 0` → correctly excluded by the `> 0` WHERE. But the interval closing at the *first* X
fill has `prev_full = Y`, range `(Y, X]`, which sums **both** X fills' litros (and
custo) into one interval — inflating `litros_intervalo`/`custo_intervalo_cents` and
distorting that interval's `km_por_litro` / `reais_por_km`. The tie-break makes the
*selection* deterministic but does not prevent the same-odometer sibling from being
swept into the surviving interval's range.

**Fix:** Tie the litros/custo aggregation to the same deterministic ordering used for
the interval boundary (aggregate the *open interval of fills strictly between the two
boundary fills* rather than a pure odometer-range `<=`), or de-duplicate same-odometer
full fills before forming intervals. At minimum, document that same-odometer full fills
are an unsupported data shape and surface it as a data-entry warning.

### WR-03: `centsToBigInt` is called on a possibly-undefined embedded join, silently yielding R$ 0,00

**File:** `src/app/(app)/carros/[id]/page.tsx:115-119`

**Issue:** For a fatura-linked row, `custoCents = centsToBigInt(linked?.amount_cents)`.
`centsToBigInt(undefined)` returns `0n`. If the embedded `transactions(amount_cents)`
join ever comes back null (e.g. the linked transaction was deleted — `transaction_id`
is `ON DELETE SET NULL`, but a timing window or RLS visibility gap could surface a row
with `transaction_id` set yet the embed null), the cost silently renders as **R$ 0,00**
instead of signalling missing data. A zero cost also feeds nothing into the view (the
view recomputes from its own join), but the displayed custo column misleads.

**Fix:** Distinguish "linked but amount unavailable" from a real zero. Render the
sentinel (`—`) when `a.transaction_id` is set but `linked?.amount_cents` is null/undefined:

```ts
const custoCents =
  a.transaction_id != null
    ? (linked?.amount_cents != null ? centsToBigInt(linked.amount_cents) : null)
    : centsToBigInt(a.amount_cents)
// render formatCents(custoCents) only when custoCents !== null, else SENTINEL
```

### WR-04: Recent-transactions picker is unfiltered by `user_id`-relevant carro scope and shows expenses already tagged to another carro

**File:** `src/app/(app)/carros/[id]/page.tsx:97-110`

**Issue:** `recentTx` selects the user's `kind='expense'` transactions (RLS-scoped,
correct) and excludes only those linked to an abastecimento. It does **not** exclude
transactions already carrying a `carro_id` for a *different* carro. Linking such a
transaction here re-stamps `transactions.carro_id` to the current carro
(`updateAbastecimento`/`createAbastecimento` overwrite it), silently moving that
expense from the other carro's spend total to this one with no warning. Since the tag
drives `v_carro_resumo.gasto_total_cents`, this changes accounting-adjacent totals
without user awareness.

**Fix:** Either exclude transactions already tagged to a different carro from the picker
list (`.is('carro_id', null)` or filter client-side), or surface a confirmation when the
chosen transaction already has a `carro_id`. Document the chosen behaviour.

### WR-05: Duplicate `ddMM` date helper across two client components

**File:** `src/components/transacao-picker.tsx:29-32` and
`src/components/abastecimento-history.tsx:59-62`

**Issue:** The identical `ddMM(occurredOn)` helper is copy-pasted into both components.
Divergent edits (e.g. a locale tweak or a guard for malformed dates) will drift. Neither
copy guards a malformed `occurred_on` (a string without two `-` yields `undefined/undefined`).

**Fix:** Extract a single shared `ddMM` into a date util (e.g. `@/lib/month` next to
`todaySP`) and import it in both, adding a defensive guard for non-`yyyy-MM-dd` inputs.

## Info

### IN-01: `idSchema` not applied to `carroId` in create/update before ownership query

**File:** `src/actions/abastecimentos.ts:36-37, 85`

**Issue:** `idSchema` validates the `id` argument in `update`/`delete`, but `carroId`
reaches `assertOwnedCarro(...).eq('id', carroId)` validated only by the Zod
`uuid()` in the schema (which does run first via `safeParse`). This is fine, but the
local `idSchema` is inconsistently applied — `carroId`/`transactionId` rely on the
schema, the row `id` on `idSchema`. Consider a single consistent validation story.

**Fix:** Documentation comment is enough; behaviour is safe (schema already enforces
uuid on `carroId`/`transactionId`).

### IN-02: `MAX_ANO` drifts at year rollover while the DB CHECK is fixed at 2100

**File:** `src/lib/schemas/carro.ts:12` vs `supabase/migrations/0028_carros_fix.sql:27`

**Issue:** The Zod `ano` upper bound is `getFullYear() + 1` (intentionally dynamic per
the comment), while the DB CHECK is the fixed literal `2100`. These are intentionally
different bounds, but the divergence means the "single source of truth" claim in the
0028 header comment ("the application already restricts these in Zod; pin the same
invariants in SQL") is inaccurate — the SQL bound is far looser than Zod.

**Fix:** Either align the comment to state the SQL bound is a deliberately looser
backstop, or pin both to the same policy. No behavioural bug.

### IN-03: `reais_por_km` rounded to whole centavos at the display edge

**File:** `src/lib/carro/consumo.ts:61`

**Issue:** `reaisPerKmLabel` does `formatCents(Math.round(reaisPorKmCents))`. For
low-cost-per-km vehicles the rounded value can collapse to `R$ 0,00` or `R$ 0,01`,
losing meaningful resolution (R$/km is naturally sub-centavo). Acceptable for v1 display
but worth noting.

**Fix:** Consider rendering R$/km with extra precision (e.g. format the raw ratio with
`Intl.NumberFormat` at 2-3 decimals of a real) rather than rounding to whole centavos.

### IN-04: Unused `note` write path / column

**File:** `src/actions/abastecimentos.ts:55-67` vs `supabase/migrations/0027_carros.sql:60`

**Issue:** `abastecimentos.note` exists in the table but `abastecimentoWriteFields`
never writes it and the form has no note input. Harmless dead column for this phase, but
flag so it is intentionally deferred rather than forgotten.

**Fix:** Confirm `note` is deferred scope; remove the column or wire it up in a later phase.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
