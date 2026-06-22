---
phase: 27-registro-r-pido-abastecimento-parcelado
fixed_at: 2026-06-22T08:32:00Z
review_path: .planning/phases/27-registro-r-pido-abastecimento-parcelado/27-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 3
skipped: 1
status: partial
---

# Phase 27: Code Review Fix Report (re-review iteration 2)

**Fixed at:** 2026-06-22T08:32:00Z
**Source review:** .planning/phases/27-registro-r-pido-abastecimento-parcelado/27-REVIEW.md
**Iteration:** 2

> Note: this report covers the SECOND review pass (WR-01, IN-01, IN-02, IN-03). The
> first pass (CR-01, WR-01..WR-04, committed f3338b9/0281198/07ca7ba/3460527) is
> superseded here but its commits remain in history.

**Summary:**
- Findings in scope: 4 (WR-01, IN-01, IN-02, IN-03)
- Fixed: 3 (WR-01, IN-01, IN-02)
- Skipped: 1 (IN-03 — deferred to Phase 28 per reviewer)

Verification: `tsc --noEmit` passed clean after every edit. `vitest run` shows 964
unit tests passing; the only 2 failing files (`tests/import-idor.test.ts` and a
sibling integration test) fail at `readLocalConfig` because the local Supabase stack
was not running (`could not read supabase status`) — a documented env-flaky condition,
NOT a regression from these fixes. The abastecimentos action unit suite passed 20/20.

## Fixed Issues

### WR-01: Transient DB error on the transaction-ownership check is mislabeled "Lançamento inválido"

**Files modified:** `src/lib/ownership.ts`, `src/actions/abastecimentos.ts`, `src/actions/abastecimentos.test.ts`
**Commit:** b172c0a
**Applied fix:** Promoted the shared helper `assertOwnedTransaction` from a boolean
return to the tri-state `OwnershipResult` (`'owned' | 'not-owned' | 'error'`), matching
`assertOwnedCarro`. The function now returns `'error'` on a query error and
`'owned'`/`'not-owned'` based on the row count. Moved the `OwnershipResult` type
definition above `assertOwnedTransaction` so it is in scope. Updated BOTH call sites in
`abastecimentos.ts` (create path and update path): an `'error'` result now maps to the
generic "Não foi possível salvar/atualizar o abastecimento. Tente novamente." retry
message, and only `'not-owned'` maps to "Lançamento inválido." Verified via repo-wide
grep that the ONLY callers of `assertOwnedTransaction` are the two in
`abastecimentos.ts` — no other module consumes it. The test mock's forged-transaction
case (`transactionsSelect = { data: [], error: null }`) already resolves to
`'not-owned'` under the new logic; updated its inline comment accordingly. Typecheck
clean; the 20-test abastecimentos action suite passes.

### IN-01: Stale migration reference (0027) in action-level docstring after the 0039 cost-XOR replacement

**Files modified:** `src/actions/abastecimentos.ts`
**Commit:** dc2794b
**Applied fix:** Updated the line-22 docstring reference from the superseded "DB CHECK
(0027)" to "the DB CHECK (0039 `abastecimentos_cost_xor`; replaced the strict 0027
XOR)", matching the corrected schema docstring and the `abastecimentoWriteFields`
comment so the file is internally consistent. Comment-only change; typecheck clean.

### IN-02: `onSubmit` error-key fallback to `'odometroKm'` can mislabel a path-less issue

**Files modified:** `src/components/abastecimento-form.tsx`
**Commit:** 38edbef
**Applied fix:** Replaced the `String(issue.path[0] ?? 'odometroKm')` fallback with
`issue.path.length > 0 ? String(issue.path[0]) : '_form'`, filing any path-less Zod
issue under a neutral `_form` sentinel instead of mislabeling it onto the Odômetro
field. Added a form-level `<FieldError>` rendering `errors._form` once at the top of
the form (mirroring the WR-03 neutral-path `'cost'` pattern). Typecheck clean.

## Skipped Issues

### IN-03: Update path leaves a stale `carro_id` tag when the cost source changes

**File:** `src/actions/abastecimentos.ts:169-175, 226-234`
**Reason:** deferred — the reviewer explicitly states "No code change required for this
phase" and recommends deferring the stale-`carro_id` relink to the Phase 28
attach-later work where relinking is in scope. No code was written; this is the
intended outcome (a tracked follow-up), not a fix failure.
**Original issue:** `updateAbastecimento` re-syncs `transactions.carro_id` for the
currently-linked tx but does NOT clear the `carro_id` on a previously-linked
transaction when an edit switches the cost source (e.g. fatura → manual/parcelado).
The orphaned tag still counts toward the carro's spend in `v_carro_resumo` until
manually cleared — a subtle double-attribution risk. Documented in the docstring as
"harmless if left" and deferred past v1.

---

_Fixed: 2026-06-22T08:32:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
