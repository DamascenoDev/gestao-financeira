---
phase: 27-registro-r-pido-abastecimento-parcelado
reviewed: 2026-06-22T12:05:00Z
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
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 27: Code Review Report

**Reviewed:** 2026-06-22T12:05:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Re-review after the iteration-1 fix pass (CR-01, WR-01..WR-04). All five prior
fixes verified present and correct, with no regressions:

- **CR-01** (parcelado edit data-loss): `AbastecimentoEdit` now carries
  `valorTotal`/`parcelas`; `deriveInitialSource()` re-enters `'parcelado'` and
  `handleOpenChange` re-seeds the parcelado fields. Round-trip is restored.
- **WR-01** (schema docstring vs 0039 CHECK): the header now documents the à-vista
  branch as *intentionally stricter* than the relaxed 0039 CHECK, with a Phase-28
  breadcrumb. Verified the schema enforces single-source à-vista (`hasTx === hasAmount`)
  while 0039 relaxes to `not (both null)` — divergence is deliberate and labeled.
- **WR-02** (manual-only edit of a linked row): `seededTransactionId()` drops the
  linked `transactionId` under `manualOnly`, forcing a coherent manual re-entry.
- **WR-03** (errors.amountCents key collision): the XOR violation is published at the
  neutral `['cost']` path, rendered once below the Tabs; `onSourceChange` clears
  `errors` on tab switch so no stale error lingers on a hidden control.
- **WR-04** (unbounded 1:1 link probe + carro tri-state): both probes carry
  `.limit(1)`; `assertOwnedCarro` is tri-state with a generic retry on `'error'`. The
  test mock's `.limit()` is a thenable-preserving passthrough — select results still
  resolve unchanged (no regression).

Remaining findings are one Warning (an ownership-error asymmetry the WR-04 fix did
NOT extend to transactions) and three Info-level items (stale migration reference,
a fragile error-path fallback, an undefended stale-tag on edit). No BLOCKER-class
defects found. The cost-source 3-state invariant, dual-IDOR re-derive, and the
no-double-count parcelado write are all sound and well-tested.

## Warnings

### WR-01: Transient DB error on the transaction-ownership check is mislabeled "Lançamento inválido"

**File:** `src/actions/abastecimentos.ts:117-120` (and the update path `199-201`)
**Issue:** The WR-04 fix made carro ownership tri-state (`assertOwnedCarro` →
`'owned' | 'not-owned' | 'error'`) precisely so a transient backend hiccup does not
falsely report a legitimately-owned carro as "inválido." The from-fatura transaction
check was left on the old boolean helper:

```ts
if (!(await assertOwnedTransaction(supabase, transactionId))) {
  return { error: 'Lançamento inválido.' }
}
```

`assertOwnedTransaction` (`src/lib/ownership.ts:127-129`) returns `false` on BOTH a
genuine not-owned result AND a transient query error (`if (error || !data) return false`).
So a backend hiccup while validating the user's OWN linked lançamento surfaces the
flat-wrong message "Lançamento inválido." (implying the lançamento is forged/foreign)
instead of a "tente novamente" retry. This is the exact asymmetry WR-04 fixed for
carros, left unfixed one helper over. Fail-safe is preserved (no write either way),
but the user-facing message is misleading on a retryable error.

**Fix:** Promote `assertOwnedTransaction` to the same tri-state shape as
`assertOwnedCarro` and branch on it in both create and update:
```ts
// ownership.ts
export async function assertOwnedTransaction(
  supabase: Client,
  id: string,
): Promise<OwnershipResult> {
  const { data, error } = await supabase.from('transactions').select('id').eq('id', id)
  if (error) return 'error'
  return data?.length === 1 ? 'owned' : 'not-owned'
}

// abastecimentos.ts (both paths)
const tx = await assertOwnedTransaction(supabase, transactionId)
if (tx === 'error') {
  return { error: 'Não foi possível salvar o abastecimento. Tente novamente.' }
}
if (tx === 'not-owned') return { error: 'Lançamento inválido.' }
```
Note: `assertOwnedTransaction` is a shared helper — changing its signature requires
updating any other callers (grep for usages before applying).

## Info

### IN-01: Stale migration reference (0027) in action-level docstrings after the 0039 cost-XOR replacement

**File:** `src/actions/abastecimentos.ts:22, 20-21`
**Issue:** WR-01 corrected the schema docstring to reference the 0039
`abastecimentos_cost_xor` CHECK, but the action file's docstrings still cite the
superseded constraint: line 22 says "enforced in abastecimentoSchema AND the DB CHECK
(0027)". Migration 0039 (`supabase/migrations/0039_abastecimento_parcelado.sql:66-78`)
DROPS the strict 0027 XOR and replaces it with the 3-state CASE constraint. The
`abastecimentoWriteFields` docstring (lines 49-65) already correctly references 0039,
so the file is internally inconsistent (0027 in one comment, 0039 in another). A
maintainer reading line 22 would look for the wrong constraint.
**Fix:** Update the line-22 reference to cite the 0039 `abastecimentos_cost_xor`
CHECK, matching the corrected schema docstring and the `abastecimentoWriteFields`
comment.

### IN-02: `onSubmit` error-key fallback to `'odometroKm'` can mislabel a path-less issue

**File:** `src/components/abastecimento-form.tsx:291`
**Issue:** When mapping Zod issues to the `errors` record:
```ts
const key = String(issue.path[0] ?? 'odometroKm')
```
Any issue with an empty `path` (a top-level/superRefine issue published without a
path) is silently filed under `errors.odometroKm`, surfacing an unrelated message
under the Odômetro field. Today the superRefine always sets an explicit `path`
(`'cost'`, `'valorTotalCents'`, `'transactionId'`, `'amountCents'`), so this branch is
not currently reachable — but the fallback is a latent foot-gun: a future schema
refine that omits `path` would render its message under the wrong control with no
compile-time signal.
**Fix:** Use a neutral sentinel that is not a real field, or skip path-less issues
from per-field mapping and surface them via toast/a form-level error:
```ts
const key = issue.path.length > 0 ? String(issue.path[0]) : '_form'
```
and render `errors._form` once at the form level (mirrors the `'cost'` neutral-path
pattern adopted in WR-03).

### IN-03: Update path leaves a stale `carro_id` tag when the cost source changes (documented, but no guardrail)

**File:** `src/actions/abastecimentos.ts:169-175, 226-234`
**Issue:** `updateAbastecimento` re-syncs `transactions.carro_id` for the
currently-linked tx but, as the docstring acknowledges, does NOT clear the carro_id on
a previously-linked transaction when an edit switches the cost source (e.g. fatura →
manual, or fatura → parcelado). The old tx keeps a now-orphaned `carro_id` tag. The
docstring calls this "harmless if left" and defers relinking past v1. That is a
reasonable scope call, but the additive tag means the orphaned transaction still
counts toward the carro's spend in `v_carro_resumo` until manually cleared — a subtle
double-attribution if the user later links a different tx for the same fuel-up. This
is INFO (documented, low-frequency, not data corruption) rather than a defect, but
worth a tracked follow-up rather than a buried comment.
**Fix:** No code change required for this phase. Recommend a tracked item: on the
update path, when the prior link differs from the new source, clear `carro_id` on the
previously-linked transaction (requires reading the row's current `transaction_id`
before the update). Defer to the Phase-28 attach-later work where relinking is in
scope.

---

_Reviewed: 2026-06-22T12:05:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
