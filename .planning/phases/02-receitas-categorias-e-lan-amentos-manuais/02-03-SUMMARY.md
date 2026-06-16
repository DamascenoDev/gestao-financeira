---
phase: 02-receitas-categorias-e-lan-amentos-manuais
plan: 03
subsystem: categorias-slice
tags: [server-actions, delete-block, atomic-rpc, archive, zod, rsc, swatch-color, kind-toggle, CAT]
requires:
  - 02-01 categories.color swatch column + is_archived (Phase 1)
  - 02-01 v_category_totals security_invoker view (tx_count per category)
  - 02-01 reassign_and_delete_category(src,dst) atomic RPC
  - 02-01 lib/schemas/category.ts (categorySchema, CATEGORY_KINDS, CATEGORY_COLORS)
  - src/actions/auth.ts + src/actions/incomes.ts (action boundary pattern)
  - src/components/receita-form.tsx (manual-state dialog pattern)
provides:
  - src/actions/categories.ts (createCategory, renameCategory, setKind, setColor, archiveCategory, deleteCategory, reassignAndDelete)
  - src/app/(app)/categorias/page.tsx (RSC: category list + usos tx_count + inline kind toggle)
  - src/components/category-badge.tsx (swatch dot + name + optional kind badge; SWATCH_OKLCH map + CategoryDot/KindBadge)
  - src/components/categoria-form.tsx (create/edit dialog: nome + kind switch + 8-swatch picker + feature-category warning)
  - src/components/category-delete-dialog.tsx (blocked-with-txns -> Arquivar / Reatribuir e remover; else standard confirm)
  - src/components/category-kind-toggle.tsx + category-row-actions.tsx (client islands over the RSC)
affects:
  - 02-04 (Extrato slice — imports CategoryBadge for the Categoria column; reuses the category action boundary)
  - 03 (metas — consumo/alocação kind drives goal direction; Reserva feature-category warning)
tech-stack:
  added: []
  patterns:
    - "discriminated deleteCategory result { ok } | { error } | { blocked, txCount } drives the alert-dialog branch (delete-block, Pitfall 5)"
    - "atomic reassign via supabase.rpc('reassign_and_delete_category', { src, dst }) — move+delete in one transaction (Open Q2)"
    - "controlled-open dialog pattern: optional open/onOpenChange props so a dropdown menu can drive CategoriaForm/CategoryDeleteDialog without an inline trigger"
    - "RSC reads v_category_totals once, sums tx_count per category into a Map for the usos column + the delete-block pre-check passed down as a prop"
    - "client islands (kind toggle, row actions) over an RSC list — single-field actions revalidatePath('/categorias')"
key-files:
  created:
    - src/actions/categories.ts
    - src/actions/categories.test.ts
    - "src/app/(app)/categorias/page.tsx"
    - src/components/category-badge.tsx
    - src/components/categoria-form.tsx
    - src/components/category-delete-dialog.tsx
    - src/components/category-kind-toggle.tsx
    - src/components/category-row-actions.tsx
  modified: []
decisions:
  - "Wave-0 category tests (category-delete/category-kind) assert DB-substrate guarantees and were already GREEN from 02-01; this slice ADDS action-level tests (categories.test.ts) for the CRUD/delete-block/reassign wrappers per the plan"
  - "deleteCategory keeps the discriminated { blocked, txCount } pre-check via v_category_totals; the txCount is also passed from the RSC to the delete dialog so the blocked vs standard-confirm branch is synchronous (no probe-delete on open) and the standard confirm remains an explicit destructive action"
  - "category-badge.tsx was created here (the plan/prompt's 'REUSE from 02-01' was inaccurate — it never existed); it is self-contained so Extrato 02-04 imports it cleanly"
  - "Inline CAT-03 kind toggle + editar/excluir menu split into two client islands (category-kind-toggle, category-row-actions) over the RSC, plus a controlled-open refactor of CategoriaForm/CategoryDeleteDialog — required because an RSC list can't call actions inline"
metrics:
  duration: ~7 min
  completed: 2026-06-16
---

# Phase 2 Plan 03: Categorias Slice Summary

Categorias vertical slice closing CAT-02/03: a Zod-validated category Server Action layer (create/rename/kind/color/archive + a delete-block pre-check and an atomic reassign-and-delete RPC) plus the Categorias RSC that lists each category's usos (tx_count from `v_category_totals`) with an inline consumo/alocação toggle, a reusable `CategoryBadge` (consumed by the Extrato slice), and a delete dialog that swaps the destructive confirm for Arquivar / Reatribuir e remover whenever the category still holds transactions.

## What Was Built

**Task 1 — Category Server Actions (TDD; commits bff5876 RED, 61058b6 GREEN).** `src/actions/categories.ts` (`'use server'`) mirroring `auth.ts`/`incomes.ts`: each action safeParses with `lib/schemas/category.ts` → `{ error }`, resolves the owner via `getClaims()` (`claims.sub` → "Sessão expirada." when absent), and `revalidatePath('/categorias')` on success.
- `createCategory(formData)`: Zod-validated insert (name 1-60, kind enum, optional swatch color); an absent/empty `color` is treated as "no color" rather than a validation failure; free-hex / non-swatch colors are rejected at the boundary (T-02-CAT-VAL).
- `renameCategory` / `setKind` / `setColor`: single-field edits (the CAT-03 kind toggle persists consumo↔alocacao).
- `archiveCategory`: flips `is_archived=true` (history kept, hidden from `is_archived=false` pickers).
- `deleteCategory`: a discriminated result `{ ok } | { error } | { blocked, txCount }` — pre-checks by summing `tx_count` across the per-month `v_category_totals` rows for the category; `txCount > 0` → `{ blocked }` (drives the archive/reassign dialog); else deletes, with `ON DELETE RESTRICT` (error 23503) as a friendly-message backstop, never a raw DB error (RESEARCH Pitfall 5, T-02-CAT-FK).
- `reassignAndDelete(src, dst)`: invokes `supabase.rpc('reassign_and_delete_category', { src, dst })` so the move+delete is atomic (no half-applied state, Open Q2); a self-reassign (`src === dst`) is guarded before the RPC.
- RED-first `src/actions/categories.test.ts` (19 tests) mocks `@/lib/supabase/server` with a chainable query-builder + `.rpc()` and a `v_category_totals` result channel, asserting owner/kind/color inserts, Zod rejections (empty name, bad kind, free hex), the `{ blocked, txCount }` pre-check + multi-row sum + 23503 backstop, the atomic RPC args + self-reassign guard, and the session gate.

**Task 2 — Categorias page + components (commit cccf9ed).**
- `category-badge.tsx`: a `SWATCH_OKLCH` map (the 8 fixed swatch keys → mid-chroma OKLCH), `CategoryDot` (swatch dot, neutral-ring fallback), `KindBadge` (Consumo amber / Alocação indigo text badge — color is never the sole signal), and `CategoryBadge` (dot + name + optional kind badge). Self-contained for Extrato 02-04.
- `categoria-form.tsx`: a create/edit `dialog` (manual-state + `useTransition` + `toast`, mirroring `receita-form`) with nome (`input`), the consumo/alocação `switch` (default consumo, CAT-03), and the 8-swatch color picker; when editing a feature seed category (`Reserva`) it renders the inline muted warning "Esta categoria é usada pelo fluxo de reservas — alterá-la pode afetar relatórios." Create posts to `createCategory`; edit persists only changed fields via `renameCategory`/`setKind`/`setColor`. Supports an optional controlled `open`/`onOpenChange`.
- `category-delete-dialog.tsx`: an `alert-dialog` that branches on the category's `txCount` (passed from the RSC). `txCount > 0` → "Esta categoria tem {n} transações. Você não pode excluí-la diretamente." with [Arquivar] (`archiveCategory`) and [Reatribuir e remover] (a target-category `Select` → `reassignAndDelete`). `txCount === 0` → the standard "Excluir categoria — Esta ação não pode ser desfeita." confirm calling `deleteCategory` (whose own pre-check + 23503 backstop covers a race). Controlled-open capable.
- `category-kind-toggle.tsx` + `category-row-actions.tsx`: client islands over the RSC — the inline CAT-03 switch (calls `setKind`) and the editar/excluir `dropdown-menu` that drives the (controlled) CategoriaForm + CategoryDeleteDialog.
- `src/app/(app)/categorias/page.tsx` (RSC): reads active categories (`is_archived=false`, ordered by sort+name) and `v_category_totals`, sums `tx_count` per category into a Map for the usos column + the delete-block prop, and renders the CategoryBadge, the inline kind toggle, the muted usos count, and the row-actions menu, plus the "Nova categoria" CTA and the empty-state copy.

## Verification Results

- `npx vitest run src/actions/categories.test.ts`: **19/19 GREEN** (action layer).
- `npx vitest run category-delete category-kind`: GREEN (Task 1 verify — substrate FK RESTRICT / reassign RPC / archive / kind-toggle guarantees).
- `npx tsc --noEmit`: clean.
- `npm run build`: succeeds; `/categorias` route compiled (ƒ Dynamic).
- `grep -q "Reatribuir e remover" src/components/category-delete-dialog.tsx`: matches.
- Full suite `npx vitest run`: **103/103 GREEN** across 16 files (84 prior + 19 new category action tests).

### Delete-block + archive + reassign + kind toggle
- **Delete-block:** wired — `deleteCategory` sums `v_category_totals.tx_count` and returns `{ blocked, txCount }` when > 0; the dialog shows the exact UI-SPEC copy and offers Arquivar / Reatribuir e remover. `ON DELETE RESTRICT` (23503) is the race-safe backstop, never a raw toast.
- **Archive:** `archiveCategory` flips `is_archived=true`; the RSC list filters `is_archived=false` so archived categories drop out of the list and the reassign targets while keeping their transactions.
- **Reassign:** `reassignAndDelete` calls the atomic RPC; the target Select lists every other active category. Functional in build/tsc; the click-through verification is deferred to the 02-05 human-verify checkpoint per the plan.
- **Kind toggle:** the inline `CategoryKindToggle` persists consumo↔alocação via `setKind` (CAT-03); the categoria-form switch shares the same action surface on edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] base-ui Select onValueChange nullability**
- **Found during:** Task 2 (`tsc --noEmit`).
- **Issue:** base-ui's `Select.onValueChange` passes `string | null`, which is not assignable to `Dispatch<SetStateAction<string>>` (TS2322) — broke the type-check.
- **Fix:** Wrapped the handler as `(v) => setTarget(v ?? '')` in the reassign Select.
- **Files modified:** src/components/category-delete-dialog.tsx
- **Commit:** cccf9ed

### Plan-intent adjustments (no permission needed)

- **`category-badge.tsx` created here, not reused:** the plan/prompt said "REUSE — from 02-01", but the file never existed in 02-01 (verified: not in 02-01's key-files, absent on disk). It is created in this slice (it is in this plan's `<files>` list) and is self-contained so Extrato 02-04 imports it.
- **Two extra client islands + a controlled-open refactor:** the plan lists 5 files; an RSC list cannot call Server Actions inline, so the inline CAT-03 kind toggle (`category-kind-toggle.tsx`) and the editar/excluir menu (`category-row-actions.tsx`) are small client islands, and `CategoriaForm`/`CategoryDeleteDialog` gained optional `open`/`onOpenChange` props so the menu can drive them. No behavior change to the planned components' default (uncontrolled) usage; this is the minimal wiring to make the RSC interactive (Rule 2 — required for the page to function).
- **deleteCategory txCount passed from the RSC to the dialog:** rather than probe-deleting on dialog open, the RSC passes each category's `tx_count` so the blocked-vs-standard branch is synchronous and the standard destructive confirm stays an explicit user action; `deleteCategory`'s own pre-check + 23503 backstop still covers the render→confirm race.
- **Wave-0 category tests already GREEN:** per 02-01, `category-delete`/`category-kind` assert DB-substrate guarantees and were GREEN before this slice. This plan adds the *action-level* tests the plan called for (`categories.test.ts`).

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation warning (Phase 1 file convention) — surfaced by `npm run build`, unrelated to this plan's changes (already logged in 02-01/02-02).

## Authentication Gates
None — the local Supabase stack was already running; the category Wave-0 tests ran against it. The actions resolve the owner via `getClaims()` and return "Sessão expirada." when unauthenticated (covered by a unit test), which is normal flow, not a gate.

## Known Stubs
None. The page reads live `categories` + `v_category_totals`; the form/dialog post to real Server Actions; the usos counts, kind toggle, archive, and reassign all hit the DB. The Dashboard/Receitas/Extrato nav links remain forward references (Extrato ships in 02-04).

## Threat Surface
No new surface beyond the plan's `<threat_model>`. T-02-CAT-FK (v_category_totals pre-check `{ blocked }` + ON DELETE RESTRICT backstop + atomic reassign RPC), T-02-CAT-VAL (Zod name/kind/color enum at the boundary, rejects free hex/arbitrary kind), and T-02-CAT-RLS (RLS on categories + security_invoker view + getClaims() owner) are all implemented as specified.

## Local Stack
Left **running** for 02-04 — `supabase status` reports the local API at http://127.0.0.1:55321 with migrations 0001-0008 applied. The next slice (Extrato) can execute test-first immediately and imports `CategoryBadge` from this slice.

## Self-Check: PASSED
