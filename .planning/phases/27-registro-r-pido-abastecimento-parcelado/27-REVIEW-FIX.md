---
phase: 27-registro-r-pido-abastecimento-parcelado
fixed_at: 2026-06-22T11:19:52Z
review_path: .planning/phases/27-registro-r-pido-abastecimento-parcelado/27-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 27: Code Review Fix Report

**Fixed at:** 2026-06-22T11:19:52Z
**Source review:** .planning/phases/27-registro-r-pido-abastecimento-parcelado/27-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01, WR-02, WR-03, WR-04)
- Fixed: 5
- Skipped: 0

Verification: full `tsc --noEmit -p tsconfig.json` passes clean; full `vitest run`
passes (103 files / 974 tests) after the fixes.

## Fixed Issues

### CR-01: Editing a parcelado abastecimento silently converted it to à-vista manual (data loss)

**Files modified:** `src/components/abastecimento-form.tsx`, `src/components/abastecimento-history.tsx`, `src/app/(app)/carros/[id]/page.tsx`
**Commit:** f3338b9
**Status:** fixed: requires human verification (the parcelado-edit round-trip is logic that should be confirmed in the UI)

**Applied fix (the complete round-trip, not the disable-Editar fallback):**
- `AbastecimentoEdit` gained optional `valorTotal` and `parcelas` string fields.
- The form's source derivation now resolves to `'parcelado'` when the edit carries
  `parcelas` parsing to a valid count (new `deriveInitialSource()` used by both the
  initial `useState` source and `handleOpenChange`).
- The `valorTotal`/`parcelas` state initializers and `handleOpenChange` now seed from
  `edit` instead of unconditionally resetting to `''`, so reopening a parcelado row
  re-enters the parcelado tab with its values.
- `abastecimento-history.tsx#toEdit` now detects a parcelado row
  (`parcelas_total > 1`), seeds `valorTotal` from `valor_total_cents` and `parcelas`
  from `parcelas_total`, and crucially does NOT seed the manual `amount` for a
  parcelado row (its `custo_cents` equals `valor_total_cents`, which previously leaked
  into the manual field and caused the downgrade on save).
- `AbastecimentoRow` gained `parcelas_total` and `valor_total_cents`.
- The `/carros/[id]` page query now selects `parcelas_total, valor_total_cents`, maps
  them onto the row, and computes `custo_cents` parcelado-aware (mirrors the
  `v_abastecimento_consumo` CASE — the list now shows the parcelado total instead of a
  sentinel from the null `amount_cents`).

This fully removes the data-loss path: a parcelado fuel-up now opens, edits, and saves
as parcelado.

### WR-01: Schema docstring claimed to mirror the 0039 CHECK but is stricter on the à-vista path

**Files modified:** `src/lib/schemas/abastecimento.ts`
**Commit:** 0281198
**Applied fix:** Rewrote the header docstring to state that the à-vista branch is
*intentionally stricter* than the relaxed 0039 CHECK (single-source-only until
attach-later lands in Phase 28), with an explicit breadcrumb to relax it then — so a
future maintainer does not "fix" the wrong side.

### WR-02: Manual-only edit of a previously fatura-linked row submitted with no cost source

**Files modified:** `src/components/abastecimento-form.tsx`
**Commit:** f3338b9 (co-delivered with the CR-01 form changes — same file)
**Applied fix:** Added a `seededTransactionId()` helper that drops the linked
`transactionId` when `manualOnly` is set (the "Da fatura" branch never renders in that
mode). Both the `useState` initializer and `handleOpenChange` now use it, so a
manual-only edit of a previously-linked row opens with no hidden tx and forces a
coherent manual re-entry rather than submitting neither cost source.

### WR-03: `errors.amountCents` key collided across all three cost sources

**Files modified:** `src/lib/schemas/abastecimento.ts`, `src/components/abastecimento-form.tsx`
**Commits:** 07ca7ba (schema path), f3338b9 (form render — same file as CR-01)
**Applied fix:** The à-vista "exactly one source" XOR issue is now published at the
source-neutral path `['cost']` instead of `['amountCents']`. The form's wrapping
`Field data-invalid` and the rendered `FieldError` now read `errors.cost` and render
it once below the Tabs; the TransacaoPicker no longer receives the XOR error. Tab
switches now clear `errors` so a stale cost error never lingers on a hidden control.
(The schema test asserts on the message string, not the path, so no test change was
needed.)

### WR-04: 1:1 link pre-check read all matching rows (no `.limit(1)`)

**Files modified:** `src/actions/abastecimentos.ts`, `src/actions/abastecimentos.test.ts`
**Commit:** 3460527
**Applied fix:** Added `.limit(1)` to the "already linked?" probe on both the create
and update paths (the update path keeps its `.neq('id', id)` self-exclusion). Updated
the action test's supabase query-builder mock to expose a thenable `.limit()` so the
bounded probe still resolves.

---

_Fixed: 2026-06-22T11:19:52Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
