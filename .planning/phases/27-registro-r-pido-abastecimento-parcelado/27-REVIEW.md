---
phase: 27-registro-r-pido-abastecimento-parcelado
reviewed: 2026-06-22T00:00:00Z
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
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-06-22
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Phase 27 relaxes the abastecimento cost model from a 2-state XOR (fatura | manual) to a
3-state XOR (fatura | manual | parcelado), adds the parcelado write mapping in the server
action, and exposes a "Parcelado" tab plus a manual-only registro-rápido on the `/carros`
list card.

The **schema** (`abastecimento.ts`) is the strongest piece: the 3-state superRefine is
correct, mirrors the 0039 CHECK truth table faithfully, and is well-tested. The **write
mapping** in `abastecimentoWriteFields` correctly nulls all à-vista cost columns on the
parcelado path (no double-count) and the dual-IDOR (`assertOwnedCarro` /
`assertOwnedTransaction`) re-derives are intact. The XOR-create and parcelado-create paths
are sound.

The serious problems are in the **edit / display contract for parcelado rows**, which the
phase shipped half-built. `AbastecimentoForm`'s edit shape (`AbastecimentoEdit`) has NO
parcelado fields, and the changed `updateAbastecimento` happily nulls `valor_total_cents` /
`parcelas_total` — so editing an existing parcelado fuel-up silently destroys the
parcelamento and rewrites it as à-vista (data loss). Separately, the parcelado cost never
reaches the card's "Gasto total" KPI, and the consuming detail-page query (out of the
changed set but driven by the new columns) shows a parcelado cost as a misleading `R$ 0,00`.

## Critical Issues

### CR-01: Editing a parcelado abastecimento silently destroys it (data loss)

**File:** `src/actions/abastecimentos.ts:171-217`, `src/components/abastecimento-form.tsx:83-94,158-159,214-241`

**Issue:** `updateAbastecimento` accepts the full `AbastecimentoInput` and calls
`abastecimentoWriteFields`, which on the à-vista path **unconditionally writes
`valor_total_cents: null` and `parcelas_total: null`** (lines 84-87). But the form's edit
contract has no way to re-submit a parcelado state:

- `AbastecimentoEdit` (form lines 83-94) exposes only `transactionId` and `amount` — there
  are **no** `valorTotal` / `parcelas` seed fields.
- `initialSource` (line 158-159) can only ever resolve to `'fatura'` or `'manual'` — never
  `'parcelado'`. The parcelado create-mode fields (`valorTotal`, `parcelas`) always reset to
  `''` on open (lines 188-189), even in edit mode.

So when a user opens an existing **parcelado** row to edit, the dialog opens on the
`'manual'` tab with empty cost. Saving anything writes the à-vista columns and nulls
`valor_total_cents` + `parcelas_total` — the parcelamento is irreversibly converted to an
à-vista (or rejected, leaving the user unable to edit the row at all). This is silent
financial-data loss on a documented user path (the per-row "Editar" in
`abastecimento-history.tsx:158-165` wires exactly this form/action).

**Fix:** Either (a) extend `AbastecimentoEdit` + the form to seed and submit the parcelado
state (add `valorTotal`/`parcelas` to the edit shape, derive `initialSource = 'parcelado'`
when the row has `parcelas_total > 1`, and seed the fields on open), or (b) if parcelado
edit is genuinely out of scope for this phase, guard the action and the UI:

```ts
// updateAbastecimento — refuse to clobber an existing parcelado row from an à-vista edit
const { data: prior } = await supabase
  .from('abastecimentos')
  .select('parcelas_total')
  .eq('id', id)
  .maybeSingle()
const wasParcelado = (prior?.parcelas_total ?? 0) > 1
const willBeParcelado = parsed.data.parcelasTotal !== undefined && parsed.data.parcelasTotal > 1
if (wasParcelado && !willBeParcelado) {
  return { error: 'Edição de abastecimento parcelado ainda não é suportada.' }
}
```
and disable/hide "Editar" for parcelado rows until the form supports them. Do NOT ship an
edit path that can null `valor_total_cents` without the user ever seeing the value.

### CR-02: Parcelado row cost displays as R$ 0,00 instead of valor_total_cents

**File:** `src/app/(app)/carros/[id]/page.tsx:84-92,217-257` (driven by the new columns added this phase)

**Issue:** The new parcelado cost-of-record lives in `valor_total_cents`, but the detail
page's abastecimento query (line 87) selects only `... transaction_id, amount_cents, ...` —
it does **not** select `valor_total_cents` or `parcelas_total`. The row-cost derivation
(line 227-231) then computes, for a parcelado row (`transaction_id` null):
`custoCents = centsToBigInt(a.amount_cents)` = `centsToBigInt(null)` = `0n`.

Result: every parcelado fuel-up renders its cost as a misleading **`R$ 0,00`** in the
history table — the exact "placeholder zero" the codebase's null-discipline (D4) forbids,
and it under-reports a real cost the consumo view (`v_abastecimento_consumo`) DOES count via
`valor_total_cents`. (This file is outside the literal changed-files set, but it is the sole
consumer of the columns this phase introduced; the phase is incomplete without it.)

**Fix:** Select the parcelado columns and resolve the cost from them:

```ts
.select(
  'id, occurred_on, odometro_km, litros, tanque_cheio, combustivel, transaction_id, amount_cents, valor_total_cents, parcelas_total, transactions(id, description, occurred_on, amount_cents)',
)
// ...
const isParcelado = (a.parcelas_total ?? 0) > 1
const custoCents: bigint | null = isParcelado
  ? centsToBigInt(a.valor_total_cents)
  : a.transaction_id
    ? (linked?.amount_cents != null ? centsToBigInt(linked.amount_cents) : null)
    : centsToBigInt(a.amount_cents)
```

## Warnings

### WR-01: Parcelado spend is absent from the "Gasto total" KPI on the card hosting the form

**File:** `src/components/carro-card.tsx:153-168`, `src/app/(app)/carros/page.tsx:63-80` (via `v_carro_resumo`)

**Issue:** `v_carro_resumo.gasto_total_cents` is `Σ transactions.amount_cents WHERE carro_id
IS NOT NULL` (migration 0027 L213-226). A parcelado abastecimento writes **no** transaction
and **no** `carro_id` tag (the parcela tx links are deferred to Phase 28). So a R$600
parcelado fuel-up entered via the card's own "Novo abastecimento" button never appears in
that same card's "Gasto total" KPI — yet it DOES move the km/l and reais/km averages (which
read `valor_total_cents` through `v_abastecimento_consumo`). The two KPIs on the card
disagree about whether the spend exists, which will read as a bug to the user who just
entered it. This is a documented Phase-28 deferral, but the inconsistency lands on the
surface this phase ships.

**Fix:** If Phase 28 is the intended home for parcela→carro tagging, add a short inline note
or empty-state hint so the user isn't surprised that a parcelado entry doesn't move "Gasto
total". Longer term, `v_carro_resumo.gasto_total_cents` should include parcelado
`valor_total_cents` (or the per-parcela tags) so the card's two KPIs stay consistent.

### WR-02: valorTotal-without-parcelas produces a misleading cost-source error

**File:** `src/components/abastecimento-form.tsx:234-239`, `src/lib/schemas/abastecimento.ts:107-122`

**Issue:** On the parcelado tab, if the user fills "Valor total" but leaves "Número de
parcelas" blank/invalid, `buildInput` emits `valorTotalCents: <n>, parcelasTotal: undefined`.
The schema then treats the row as **à-vista** (`isParcelado` false), takes the else-branch,
and raises the cost-source XOR message ("Informe exatamente uma fonte de custo…") on the
`amountCents` path — plus the "à vista não pode ter valor total" error. The user is on the
Parcelado tab seeing a "fonte de custo" error that names manual/fatura sources. The error is
correct that the input is invalid, but it points at the wrong field and uses à-vista
vocabulary.

**Fix:** Add a parcelado-tab pre-submit guard mirroring the manual/valorTotal guards
(lines 246-255): when `source === 'parcelado'` and `parseParcelas(parcelas) === null`, set
`errors.parcelasTotal = 'Informe o número de parcelas (2 a 24).'` and return before
`safeParse`, so the message lands on the parcelas field in the parcelado vocabulary.

### WR-03: onSubmit error-mapping defaults unknown issue paths to `odometroKm`

**File:** `src/components/abastecimento-form.tsx:258-263`

**Issue:** `const key = String(issue.path[0] ?? 'odometroKm')`. Any schema issue whose
`path[0]` is undefined (e.g. a top-level/`superRefine` issue not given an explicit `path`)
is funneled onto the `odometroKm` field, surfacing an unrelated error under "Odômetro". The
current superRefine always sets `path`, so this is latent, but it is a fragile default that
will mis-route the next pathless issue added to the schema.

**Fix:** Route pathless issues to a dedicated form-level error slot instead of an arbitrary
field, e.g. `const key = String(issue.path[0] ?? '_form')` and render a `_form` error near
the submit button (or toast it). Never default to a specific input the issue isn't about.

### WR-04: Stale carro_id tag left on the previously-linked transaction after an edit

**File:** `src/actions/abastecimentos.ts:164-227`

**Issue:** Documented in the action's doc comment, but worth flagging as a correctness risk:
when an abastecimento is edited from one fatura transaction to another (or from fatura to
manual/parcelado), the action sets `carro_id` on the new tx but never clears it from the
**old** linked tx. That stale tag keeps the old transaction counting toward
`v_carro_resumo.gasto_total_cents` for the carro indefinitely, double-counting the carro's
spend after a relink. The comment calls the leftover "harmless," but for a financial KPI it
is an over-count, not harmless.

**Fix:** Before/after the update, if the prior `transaction_id` differs from the new one,
clear `carro_id` on the prior tx (`update({ carro_id: null }).eq('id', priorTxId)`). Re-read
the prior link from the row being edited (RLS-scoped) to know what to clear.

## Info

### IN-01: Schema/file-header doc references the wrong migration number

**File:** `src/lib/schemas/abastecimento.test.ts:6-9`

**Issue:** The test header says the cost XOR "mirrors the DB cost XOR CHECK in migration
0027", while the schema and action correctly reference the relaxed CHECK in **0039**. The
0027 CHECK was the strict 2-state XOR; the 3-state behavior these tests assert is 0039.
Misleading provenance comment.

**Fix:** Update the comment to reference migration 0039 (or "0027 as relaxed by 0039").

### IN-02: DialogDescription text omits the parcelado option

**File:** `src/components/abastecimento-form.tsx:303-306`

**Issue:** The dialog description still says "escolha a fonte do custo: um lançamento da
fatura ou um valor manual" — it predates the new Parcelado tab and never mentions
parcelamento, so the copy under-describes the now-3-state cost picker.

**Fix:** Mention the parcelado option, e.g. "…um lançamento da fatura, um valor manual ou um
parcelamento."

### IN-03: `parseParcelas` regex/Number.isInteger check is redundant

**File:** `src/components/abastecimento-form.tsx:75-81`

**Issue:** After `/^\d+$/.test(trimmed)` passes, `Number(trimmed)` is always a finite
non-negative integer, so the subsequent `!Number.isInteger(n)` can never be true (the only
residual purpose is the range check). Harmless, but dead within the conditional.

**Fix:** Drop `!Number.isInteger(n) ||`, keeping only the `< PARCELAS_MIN || > PARCELAS_MAX`
range check, since the regex already guarantees integer-ness.

---

_Reviewed: 2026-06-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
