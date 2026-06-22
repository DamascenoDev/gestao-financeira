---
phase: 28-v-nculo-reverso-por-valor-consumo-sem-double-count
reviewed: 2026-06-22T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/lib/carro/abastecimento-match.ts
  - src/lib/carro/abastecimento-match.test.ts
  - src/lib/ownership.ts
  - src/lib/parsers/types.ts
  - src/lib/schemas/import.ts
  - src/actions/import.ts
  - src/components/import-review-table.tsx
  - src/app/(app)/importar/[statementId]/page.tsx
  - tests/import-abastecimento-link.test.ts
  - tests/abastecimento-consumo-no-double-count.test.ts
  - src/actions/import.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-06-22
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The phase implements "vínculo reverso por valor": a pure value-match module
(`abastecimento-match.ts`) that greedily pairs review rows to unlinked
abastecimentos, threaded as a non-binding hint through ingest/persist, and a
link-write block in `confirmImport` that persists the link only on human confirm.

**Security posture is strong on the points the phase prioritized.** The IDOR
re-derive of `abastecimentoId` via the tri-state `assertOwnedAbastecimento`
(#5) runs BEFORE any link write and rejects the whole payload on a forged/foreign
id (proven by `import-abastecimento-link.test.ts` (3)). `parcela_num` is genuinely
recomputed server-side (line 1142) and the client-supplied `parcelaNum` is parsed
but never read — confirmed by grep. The money math in the match module is integer-cents
only (`Math.floor`/`Math.ceil`, no float, no cents tolerance). 23505 unique-violations
on both link paths map to already-linked (swallow), never a 500.

The findings below are real correctness/robustness gaps the phase's own pinned
invariants (D-04 cap, the cross-row double-link residual the 0039 migration explicitly
delegates to "Phases 27/28 action wiring") are NOT enforced in `confirmImport`. The
test suite is green because no test exercises a hostile/duplicated client payload
against the link-write — every link test seeds a single, well-formed row per
abastecimento.

## Warnings

### WR-01: `confirmImport` does not enforce the cross-row double-link invariant the schema delegates to it

**File:** `src/actions/import.ts:1078-1188`
**Issue:** Migration 0039 (lines 22-30) is explicit: a transaction that is BOTH an
à-vista `abastecimentos.transaction_id` AND a junction parcela on a *different*
abastecimento "is NOT preventable by any single-row/single-table DB constraint … The
remaining cross-row reuse is enforced in the Phases 27/28 action wiring." The
`confirmImport` link loop processes each `linkRow` independently with no such guard.

`authoritativeRows` is built by iterating the raw client `parsedRows` (line 885) with
**no de-duplication of `dedupe_key`** — a client may submit the same `dedupe_key`
twice. Both resolve to the same `txnId`. A payload of:
- Row A: `dedupe_key=X, abastecimentoId=AB1, abastecimentoKind=avista`
- Row B: `dedupe_key=X, abastecimentoId=AB2, abastecimentoKind=parcela`

links txnId to AB1 via `abastecimentos.transaction_id` AND inserts a junction parcela
on AB2 with the same `transaction_id`. Neither unique index
(`abastecimentos_transaction_uniq` is on AB1's row; `abastecimento_parcelas_transaction_uniq`
is on AB2's junction) is violated — they live on different rows/tables. The single fuel
cash-flow is now double-counted: AB1's cost via `coalesce(t.amount_cents, …)` AND AB2's
cost via `valor_total_cents` are both attributed in `v_abastecimento_consumo`. This is
exactly the residual the migration says the action layer owns, and it is unenforced.
**Fix:** Track each `txnId` already consumed by a link in this confirm and reject (or
skip) any second link targeting the same transaction:
```ts
const linkedTxns = new Set<string>()
for (const r of linkRows) {
  const txnId = txByKey.get(r.base.dedupe_key)
  if (!txnId) continue
  if (linkedTxns.has(txnId)) {
    return { error: 'Um lançamento não pode ser vinculado a dois abastecimentos.' }
  }
  linkedTxns.add(txnId)
  // … existing à-vista / parcela write …
}
```

### WR-02: `abastecimentoKind` is trusted from the client and never reconciled with the abastecimento's actual parcelado/à-vista state

**File:** `src/actions/import.ts:1139-1186`, `src/lib/schemas/import.ts:52`
**Issue:** The write path is chosen purely from the client-supplied
`abastecimentoKind` (`'parcela'` → junction insert; else → `abastecimentos.transaction_id`
update). The server re-derives *ownership* of `abastecimentoId` but never re-derives its
*kind*. If a client sends `abastecimentoKind: 'avista'` for an owned **parcelado**
abastecimento, the code runs `update abastecimentos.transaction_id = txnId`, which
violates the 0039 `abastecimentos_cost_xor` CHECK (parcelado requires `transaction_id is
null`) → a **23514** error. Only 23505 is swallowed (line 1166); 23514 falls through to
the generic "vínculo não foi salvo" return — but only AFTER the transaction already
landed, leaving the import in a confusing surface-but-keep state for a perfectly owned
target. Symmetrically, `kind: 'parcela'` against an à-vista abastecimento inserts a junk
junction row referencing an abastecimento that carries no `valor_total_cents`.
**Fix:** Re-derive the kind server-side from the same fetch used for ownership (or a
small batched read of `parcelas_total`) and pick the write path from the authoritative
value, rejecting a kind that disagrees:
```ts
// fetch id + parcelas_total for the owned ids; isParcelado = parcelas_total > 1
const serverKind = isParcelado(r.abastecimentoId) ? 'parcela' : 'avista'
if (r.abastecimentoKind && r.abastecimentoKind !== serverKind) {
  return { error: 'Abastecimento inválido.' }
}
// branch on serverKind, never r.abastecimentoKind
```

### WR-03: parcelado link-write never caps at `parcelas_total` — over-cap parcelas can be inserted

**File:** `src/actions/import.ts:1139-1157`
**Issue:** The pure match module enforces D-04 (≤ N parcelas, stop suggesting once full),
but the server-side link-write does NOT re-enforce that cap. `parcela_num` is recomputed
as `jaNaJuncao + atribuidasNesteConfirm + 1` and inserted; the only DB guard is
`check (parcela_num > 0)` (0039) — there is **no** `parcela_num <= parcelas_total` CHECK.
A client that confirms more `kind:'parcela'` rows than the abastecimento has parcelas
(e.g. an already-full N=3 plus one more, or 4 fresh rows for N=3) inserts `parcela_num=4`
unchallenged. Cost is not double-counted (cost is `valor_total_cents` once), but the
junction is polluted with phantom parcelas and the "N parcelas fecham" invariant the
phase advertises is silently broken on the write side. The grid suggestion path respects
the cap, but the security model assumes the client is untrusted at confirm.
**Fix:** When recomputing `parcelaNum`, read `parcelas_total` for the abastecimento (the
same batched fetch as WR-02) and skip/reject when `parcelaNum > parcelasTotal`:
```ts
if (parcelaNum > parcelasTotalById.get(r.abastecimentoId)!) continue // já fechado
```

### WR-04: partial link-write failure returns success-shaped error but leaves orphaned/asymmetric state

**File:** `src/actions/import.ts:1149-1185`
**Issue:** On a non-23505 failure mid-loop (e.g. WR-02's 23514, or a transient error on
the `transactions.carro_id` sync at line 1180), the function returns
`{ error: 'As transações foram importadas, mas o vínculo do abastecimento não foi salvo.' }`
and **stops** — but any link rows processed BEFORE the failing one are already committed,
and `merchant_patterns` LEARN + `status='imported'` (lines 1190-1239) never run. The user
sees a link-failure message even though some links DID land, memory did NOT learn, and the
statement stays un-`imported` (so a re-confirm re-runs the whole flow, re-attempting the
already-succeeded links — which now 23505-swallow, but also re-runs LEARN). The
"surface-but-keep" intent is sound, but bailing out of the loop on the first error makes
the persisted state path-dependent on row order and skips the downstream LEARN/status
steps. **Fix:** Accumulate a `linkFailed` flag instead of early-returning, let the loop
finish, then run LEARN + status, and surface the link warning at the end so partial
success is consistent regardless of which row failed:
```ts
let linkFailed = false
for (const r of linkRows) { /* on non-23505: linkFailed = true; continue */ }
// … LEARN, status='imported' …
if (linkFailed) return { imported, duplicated, /* or a warning channel */ }
```

## Info

### IN-01: client `parcelaNum` is validated but dead — trust-boundary smell

**File:** `src/lib/schemas/import.ts:53`, `src/components/import-review-table.tsx:893`
**Issue:** `parcelaNum: z.number().int().positive().optional()` is accepted into the
payload and threaded by `runConfirm`, but `confirmImport` never reads it (correctly —
it recomputes server-side, confirmed by grep at lines 1109-1147). Carrying an unused,
client-controlled trust-sensitive field invites a future maintainer to "use the value
that's already there." **Fix:** Drop `parcelaNum` from `confirmImportRowSchema` and the
`runConfirm` payload (keep it client-only in `ReviewRow`), or add a one-line comment at
the schema field stating it is intentionally ignored server-side.

### IN-02: `dayDistance` silently degrades to NaN on a malformed civil date

**File:** `src/lib/carro/abastecimento-match.ts:102-104`
**Issue:** `Date.parse('${a}T00:00:00Z')` returns `NaN` for a malformed `occurredOn`;
`dist` becomes NaN and every comparison in `pickNearest` is false, so such a candidate
is never selected (and if it is the only eligible candidate, the row gets no match). Data
originates from DB civil dates + parser output (controlled), so this is low-risk, but the
function has no guard and no test for it. **Fix:** Either document the precondition
(inputs are always valid `YYYY-MM-DD`) or guard: `if (Number.isNaN(ms)) return
Number.POSITIVE_INFINITY`.

### IN-03: parcelado transactions rely solely on the main-insert `carro_id` for aggregate spend

**File:** `src/actions/import.ts:1014`, `src/actions/import.ts:1158-1186`
**Issue:** The à-vista link branch re-syncs `transactions.carro_id` (line 1174-1185); the
parcelado branch does not. This is correct ONLY because `applyLinkToRow` sets
`carro_id = match.carroId` on the client for both kinds and the main insert persists it
(line 1014). But if a user confirms a parcela link via a path that does not run
`applyLinkToRow` (e.g. a future bulk variant, or a manually-edited payload that carries
`abastecimentoKind:'parcela'` without `carroId`), the parcela transaction lands with
`carro_id = null` and never enters `v_carro_resumo.gasto_total_cents` (which 0039 line 115
says the per-parcela transactions feed). The invariant is currently held by client
convention, not by the server. **Fix:** In the parcelado branch, mirror the à-vista
`carro_id` sync using `r.carroId ?? r.base.abastecimentoMatch?.carroId` so aggregate spend
does not depend on the client having populated `carroId`.

---

_Reviewed: 2026-06-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
