---
phase: 10-abastecimento-h-brido-consumo
fixed_at: 2026-06-17T00:00:00Z
review_path: .planning/phases/10-abastecimento-h-brido-consumo/10-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 3
skipped: 1
status: partial
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-06-17
**Source review:** .planning/phases/10-abastecimento-h-brido-consumo/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (critical_warning): 5 warnings (WR-01..WR-05)
- Fixed: 3 (WR-01, WR-03, WR-04)
- Skipped / deferred: 1 (WR-02 — deferred to Phase 11 by orchestrator triage)
- Out of scope (noted only): WR-05 (not triaged for this pass) + 4 Info items (IN-01..IN-04)

> Each fix was applied in an isolated git worktree, type-checked with
> `npx tsc --noEmit` (exit 0 after every fix), and validated against the touched
> carro/abastecimento test set (77 tests green, local Supabase up). Commits are
> atomic, one per finding. REVIEW-FIX.md itself is left for the orchestrator to commit.

## Fixed Issues

### WR-04: Picker offered expenses already tagged to a different carro

**Files modified:** `src/app/(app)/carros/[id]/page.tsx`
**Commit:** 5fca04f
**Applied fix:** The recent-expenses query that feeds the TransacaoPicker now adds
`.or('carro_id.is.null,carro_id.eq.${id}')`, so it only offers expenses that are
untagged OR already tagged to THIS carro. This prevents the silent cross-carro
re-stamp of `transactions.carro_id` (which would have shifted that expense's spend
between carros via `v_carro_resumo.gasto_total_cents`). `transactions.carro_id`
exists since migration 0027; no migration touched. Verified by `tsc` (0) and
`tests/carro-tag-nondestructive.test.ts` + the abastecimento action tests (green).

### WR-03: Missing embedded-join amount rendered a fake R$ 0,00

**Files modified:** `src/app/(app)/carros/[id]/page.tsx`,
`src/components/abastecimento-history.tsx`
**Commit:** 237e345
**Applied fix:** `AbastecimentoRow.custo_cents` is now `number | bigint | null`. For a
fatura-linked row whose embedded `transactions(amount_cents)` join is null (e.g. the
linked tx was deleted — `transaction_id` is `ON DELETE SET NULL`, or an RLS/timing
visibility gap), the page sets `custo_cents = null` instead of coercing
`centsToBigInt(undefined) -> 0n`. A new `custoLabel` helper renders the `—` sentinel
when `custo_cents === null`, used by both the desktop table cell and the mobile card
cell. `toEdit` treats a null cost as "no manual amount". A genuine zero cost still
renders R$ 0,00. Verified by `tsc` (0) and the carro/abastecimento test set.

### WR-01: Edit form hid the row's own currently-linked transaction

**Files modified:** `src/app/(app)/carros/[id]/page.tsx`,
`src/components/abastecimento-history.tsx`
**Commit:** b0fb65c
**Applied fix:** The page built one `transacoes` list that excludes EVERY linked
`transaction_id` and reused it for the create form AND every per-row edit form, so
editing a fatura-linked abastecimento hid its own linked lançamento from the picker
(it could even show "Nenhum lançamento disponível para vincular"). The abastecimentos
query now embeds the linked tx's `id, description, occurred_on, amount_cents`, and the
page exposes each row's own linked transaction as `linked_transacao: TransacaoOption | null`.
In `RowActions`, a memoized `editTransacoes` re-adds that own option (deduped) to the
list passed to the edit form, while the create form keeps the all-linked-excluded
list. The edit picker can now render and re-confirm the current selection. Verified by
`tsc` (0) and the carro/abastecimento test set (77 tests green).

## Skipped Issues

### WR-02: View double-counts litros when two full-tank fills share one odometer

**File:** `supabase/migrations/0028_carros_fix.sql:88-103`
**Reason:** skipped (deferred to Phase 11). Per orchestrator triage: this is a view
migration concern and only triggers on two `tanque_cheio` fills at the EXACT same
`odometro_km` — a near-impossible data anomaly. The existing `km_rodados <= 0` guard
already covers the common same-odometer case (the interval closing at the second X
fill has `prev_full = X -> km_rodados = 0` and is correctly excluded). Fixing the
residual sweep-in of the same-odometer sibling requires a `0029` view migration, which
Phase 11 (which builds on these views) can include as a view refinement if warranted.
Per instructions: NO migration was touched and NO `supabase db push/reset` was run.
**Original issue:** `prev_full_odometro` lags over full-tank fills ordered by
`(odometro_km, occurred_on, created_at, id)`; the litros/custo subqueries aggregate by
pure odometer range `(prev_full, f.odometro_km]`. With two full fills at the same
`odometro_km = X` and a prior full fill at `Y < X`, the interval closing at the first X
fill (range `(Y, X]`) sums BOTH X fills' litros/custo into one interval, inflating
`litros_intervalo`/`custo_intervalo_cents` and distorting that interval's
`km_por_litro`/`reais_por_km`.

## Out-of-Scope (noted, not fixed)

These were not part of the orchestrator's triaged fix set for this pass.

- **WR-05** (`src/components/transacao-picker.tsx:29-32`,
  `src/components/abastecimento-history.tsx:59-62`): duplicate `ddMM` helper across two
  client components, neither guarding malformed `occurred_on`. Quality/robustness item;
  not triaged for this pass. Candidate for extraction into `@/lib/month` later.
- **IN-01** (`src/actions/abastecimentos.ts`): inconsistent `idSchema` application;
  reviewer notes behaviour is already safe (Zod `uuid()` runs first). Info only.
- **IN-02** (`src/lib/schemas/carro.ts:12` vs `0028_carros_fix.sql:27`): Zod `MAX_ANO`
  (`getFullYear()+1`) vs the fixed SQL CHECK `2100`; intentional looser SQL backstop, no
  behavioural bug. Info only.
- **IN-03** (`src/lib/carro/consumo.ts:61`): `reais_por_km` rounded to whole centavos at
  the display edge; acceptable for v1. Info only.
- **IN-04** (`src/actions/abastecimentos.ts` vs `0027_carros.sql:60`): unused
  `abastecimentos.note` column / write path; deferred scope. Info only.

---

_Fixed: 2026-06-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
