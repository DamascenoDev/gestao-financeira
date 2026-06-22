---
phase: 27-registro-r-pido-abastecimento-parcelado
reviewed: 2026-06-22T11:08:15Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/lib/schemas/abastecimento.ts
  - src/lib/schemas/abastecimento.test.ts
  - src/actions/abastecimentos.ts
  - src/actions/abastecimentos.test.ts
  - src/components/abastecimento-form.tsx
  - src/components/carro-card.tsx
  - src/app/(app)/carros/page.tsx
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-06-22T11:08:15Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the abastecimento parcelado slice: the shared Zod schema (now 3-state),
its tests, the server actions (create/update/delete), the action tests, the
create/edit dialog, the `/carros` list card hosting the manual-only form, and the
`/carros` RSC page.

The security substrate is solid: dual-IDOR re-derive (`assertOwnedCarro` tri-state +
`assertOwnedTransaction` + the 1:1 link pre-check) runs before every FK write, Zod
`safeParse` is at the boundary, DB errors are mapped to friendly strings without
leaking details, and the 3-state cost-source invariant is enforced both in the schema
and in `abastecimentoWriteFields`. No injection, secret, or auth-bypass vectors found.

The dominant defect is a **parcelado edit round-trip gap**: the `AbastecimentoForm`
edit shape (`AbastecimentoEdit`) and its `initialSource` logic have no `'parcelado'`
state, so editing an existing parcelado fuel-up silently re-types it as an à-vista
manual cost and destroys the parcelamento on save. The cross-file caller
(`abastecimento-history.tsx#toEdit`) is the trigger, but the root cause — the form
cannot represent a parcelado edit — lives in the reviewed `abastecimento-form.tsx`.
Several secondary correctness/consistency warnings follow.

No structural-findings block was provided, so this report is narrative-only.

## Critical Issues

### CR-01: Editing a parcelado abastecimento silently converts it to à-vista manual (data loss)

**File:** `src/components/abastecimento-form.tsx:83-94, 158-159, 214-241`
**Issue:**
The edit model cannot represent a parcelado fuel-up. `AbastecimentoEdit` (L83-94)
has only `transactionId` and `amount` cost fields — no `valorTotal`/`parcelas`.
`initialSource` (L158-159) can only resolve to `'fatura'` or `'manual'`, never
`'parcelado'`, and `handleOpenChange` (L188-189) hard-resets `valorTotal`/`parcelas`
to `''` on every open. The caller in `src/components/abastecimento-history.tsx#toEdit`
(L91-94) seeds a parcelado row's cost into the **manual** `amount` field, because for
a parcelado row `transaction_id` is null and `custo_cents` equals `valor_total_cents`
(per the `v_abastecimento_consumo` CASE in migration 0039).

Result: opening Editar on a parcelado abastecimento shows the **Manual** tab with the
full `valor_total_cents` as a one-shot manual value. Saving runs
`abastecimentoWriteFields` with `source === 'manual'`, which writes
`amount_cents = valor_total_cents`, `parcelas_total = null`, `valor_total_cents = null`
(`src/actions/abastecimentos.ts:84-87`). The parcelamento (installment count + the
"counted once" cost-of-record semantics) is destroyed with no warning, and the carro's
spend/consumo silently reinterprets the row. This is data loss on a routine edit.

**Fix:** Extend the edit contract to carry the parcelado state and make the form
re-enter it. Minimum changes in `abastecimento-form.tsx`:

```ts
export type AbastecimentoEdit = {
  // ...existing fields...
  /** pt-BR string for a parcelado total (empty unless the row is parcelado). */
  valorTotal?: string
  /** Installment count as a string (empty unless the row is parcelado). */
  parcelas?: string
}

const initialSource: CostSource =
  edit?.parcelas && parseParcelas(edit.parcelas)
    ? 'parcelado'
    : !manualOnly && edit?.transactionId
      ? 'fatura'
      : 'manual'
```

Seed `valorTotal`/`parcelas` from `edit` in both `useState` initializers and
`handleOpenChange` (instead of unconditionally `''`). Then update
`abastecimento-history.tsx#toEdit` to populate the new fields from
`row.parcelas_total`/`row.valor_total_cents` (which must be added to
`AbastecimentoRow` and selected by the page query). Until the form can represent a
parcelado edit, the Editar action on a parcelado row should be disabled rather than
silently downgrading the row.

## Warnings

### WR-01: Schema docstring claims to mirror the 0039 CHECK but is strictly stricter on the à-vista path

**File:** `src/lib/schemas/abastecimento.ts:13-25, 107-115`
**Issue:**
The header comment asserts the schema mirrors `abastecimentos_cost_xor` from migration
0039 "defense in depth". It does not, for the à-vista case. Migration 0039 relaxes the
à-vista branch to `not (transaction_id is null and amount_cents is null)` — i.e. **at
least one** source, explicitly allowing BOTH present ("attach-later with BOTH present
now passes", per the migration comment). The schema's `if (hasTx === hasAmount)`
(L109) rejects BOTH-present with `COST_SOURCE_MESSAGE`. So a both-present à-vista row
the DB would accept is rejected at the schema layer.

This is arguably intended for this phase (vincular-fatura/attach-later is Phase 28),
but the divergence is undocumented and the docstring is now misleading — a future
attach-later feature will be silently blocked by this schema with no breadcrumb.
**Fix:** Update the docstring to state the schema is *intentionally stricter* than the
0039 CHECK on the à-vista branch (single-source-only until Phase 28), so the next
maintainer does not "fix" the DB or the schema to match the wrong side.

### WR-02: Manual-only edit of a previously fatura-linked row submits with no cost source

**File:** `src/components/abastecimento-form.tsx:158-159, 228-233`
**Issue:**
When `manualOnly` is true and an `edit` row is fatura-linked, `initialSource` forces
`'manual'` (L159) while `transactionId` is still seeded (L168). In `buildInput`,
`transactionId` is emitted only when `source === 'fatura'` (L228-229) and `amount` is
empty for a linked row, so the submitted input carries neither cost source → the schema
XOR error fires and the user cannot save without re-entering a manual value. Today this
is latent (carro-card uses `manualOnly` only for CREATE), but the prop combination is
public API and will misbehave the moment a manual-only edit is wired.
**Fix:** Either reject `manualOnly` + a fatura-linked `edit` at the type/usage level, or
on open of a manual-only edit drop the seeded `transactionId` and surface a notice that
the linked cost must be re-entered manually.

### WR-03: `errors.amountCents` key collides across all three cost sources

**File:** `src/components/abastecimento-form.tsx:109-115, 310, 383, 403`
**Issue:**
The schema's à-vista "exactly one source" issue is published at `path: ['amountCents']`
(`abastecimento.ts:113`). In the form, `errors.amountCents` drives the wrapping
`Field data-invalid` on the whole Custo block (L383), is passed as the TransacaoPicker
`error` (L403), and is also the manual MoneyInput error. So an XOR violation raised
while on the **Da fatura** tab renders the cost-source message under the fatura picker,
and switching tabs leaves a stale `amountCents` error attached to a now-hidden control.
Not a security issue, but a confusing/incorrect error surface.
**Fix:** Map the cost-source XOR issue to a source-neutral error key (e.g. `cost`) and
render it once below the Tabs, or clear `errors` in `onSourceChange` so a stale
cross-tab error never lingers.

### WR-04: 1:1 link pre-check uses `.select('id')` without `.limit(1)` — reads all matching rows

**File:** `src/actions/abastecimentos.ts:123-130, 199-207`
**Issue:**
The "already linked?" probe selects every row matching `transaction_id` and then checks
`existing.length > 0`. The partial unique index makes 0-or-1 the practical cardinality,
so this is correctness-safe today, but it is a brittle pattern: it returns full rows and
relies on the index for the bound. Consistency with the codebase's other ownership
probes (which use `.eq(...).maybeSingle()` or bounded selects) would be clearer and
avoids reading an unbounded set if the index were ever dropped.
**Fix:** Add `.limit(1)` (or `.maybeSingle()`), e.g.
`.select('id').eq('transaction_id', transactionId).limit(1)` and branch on a single
row. On the update path keep the `.neq('id', id)` filter.

## Info

### IN-01: `?? null` / `?? undefined` after a proven-defined value is dead defensiveness

**File:** `src/actions/abastecimentos.ts:84-87`; `src/components/abastecimento-form.tsx:239`
**Issue:**
In `abastecimentoWriteFields`, `isParcelado` is already
`parcelasTotal !== undefined && parcelasTotal > 1`, so inside the `isParcelado` branch
`input.parcelasTotal ?? null` (L84) can never hit the null side. Similarly in the form,
`parseParcelas(parcelas) ?? undefined` (L239) is reached only when
`source === 'parcelado'`. Harmless, but the redundant fallbacks suggest an invariant the
reader has to re-derive.
**Fix:** Drop the unreachable fallbacks or add a one-line comment that they are purely
type-narrowing for the Supabase insert overload.

### IN-02: `open!` non-null assertion is avoidable

**File:** `src/components/abastecimento-form.tsx:146`
**Issue:**
`const open = isControlled ? controlledOpen! : uncontrolledOpen`. The `!` is only safe
because `isControlled` is `controlledOpen !== undefined`. TypeScript cannot narrow
across the separate `isControlled` const, hence the assertion. Stylistic, but assertions
mask future refactors.
**Fix:** `const open = controlledOpen ?? uncontrolledOpen` (a controlled boolean is never
`undefined` when controlled), or inline the `!== undefined` check.

### IN-03: Duplicated parcelado-detection predicate across schema, action, and SQL

**File:** `src/lib/schemas/abastecimento.ts:82`; `src/actions/abastecimentos.ts:68-69`; `supabase/migrations/0039_abastecimento_parcelado.sql`
**Issue:**
`parcelasTotal !== undefined && parcelasTotal > 1` is hand-rolled in three places (TS
schema, TS action, SQL CASE). They agree today, but the rule is load-bearing for the
no-double-count invariant and has no single source of truth in TS.
**Fix:** Extract a tiny `isParcelado(parcelasTotal?: number | null): boolean` helper
shared by the schema and the action. The SQL is necessarily separate but should keep a
comment pointing at the TS helper as the canonical statement.

---

_Reviewed: 2026-06-22T11:08:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
