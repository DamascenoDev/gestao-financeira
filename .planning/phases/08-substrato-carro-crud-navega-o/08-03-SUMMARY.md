---
phase: 08-substrato-carro-crud-navega-o
plan: 03
subsystem: carro-ui
tags: [nextjs, rsc, server-actions, rls, idor, dialog, shadcn, navigation, carros, typescript]

# Dependency graph
requires:
  - phase: 08-substrato-carro-crud-navega-o
    plan: 01
    provides: "carros table + RLS + typed Database client (the rows the list/detail read)"
  - phase: 08-substrato-carro-crud-navega-o
    plan: 02
    provides: "carroSchema + createCarro/updateCarro/archiveCarro/unarchiveCarro server actions (the validated, IDOR-safe write boundary the form/card call)"
  - phase: 03-reservas
    provides: "reserva-form / reserva-card / reservas/page.tsx grammar cloned verbatim (controllable dialog, dropdown actions, RSC grid + Empty)"
  - phase: 07-identidade-visual-e-polimento
    provides: "locked design system (navy+gold tokens, Empty/CardSkeleton/text-destructive grammar, app-sidebar/bottom-nav active-gold nav)"
provides:
  - "src/components/carro-form.tsx — CarroForm create/edit Dialog (controllable, useTransition, sonner, client carroSchema validation) — the opener Phase 9 CarroPicker can reuse"
  - "src/components/carro-card.tsx — CarroCard identity card + toCarroEdit() helper + CarroCardData type (apelido link + modelo/placa/ano + combustivel/Arquivado badges + Editar/Arquivar dropdown)"
  - "src/components/carros-archive-filter.tsx — ?arquivados=1 URL-param Switch filter"
  - "src/components/carro-detail-actions.tsx — /carros/[id] header Editar + Arquivar/Desarquivar controls"
  - "src/app/(app)/carros/page.tsx — /carros list RSC (RLS read + filter + grid + empty/error)"
  - "src/app/(app)/carros/[id]/page.tsx — minimal identity detail RSC (notFound on foreign id)"
  - "src/app/(app)/carros/loading.tsx — CardSkeleton loading"
  - "Carros nav entry in app-sidebar.tsx (after Reservas) + bottom-nav.tsx (6th mobile item)"
affects: [09-etiquetar-gastos-carro, 10-abastecimento-consumo, 11-carro-dashboard-kpis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Carro UI cloned verbatim from the reservas slice: reserva-form → carro-form (controllable Dialog + useTransition + sonner + { ok } | { error }), reserva-card → carro-card (dropdown per-item actions + controlled child dialog), reservas/page.tsx → carros/page.tsx (RSC RLS read + grid + Empty)"
    - "Boolean list filter via ?arquivados=1 URL param (the Extrato convention) so the RSC re-reads on toggle — a thin 'use client' Switch calls router.replace"
    - "Identity-only surfaces: NO money/KPIs this phase (deferred to Phases 9-11); CarroCard imports no money helper (AmountCell/formatCents absent) — verified by grep gate"
    - "Archive is a soft, reversible toggle (neutral secondary Badge + toast, no AlertDialog, no destructive styling) — distinct from the reserva delete it was cloned from"

key-files:
  created:
    - "src/components/carro-form.tsx"
    - "src/components/carro-card.tsx"
    - "src/components/carros-archive-filter.tsx"
    - "src/components/carro-detail-actions.tsx"
    - "src/app/(app)/carros/page.tsx"
    - "src/app/(app)/carros/[id]/page.tsx"
    - "src/app/(app)/carros/loading.tsx"
  modified:
    - "src/components/app-sidebar.tsx"
    - "src/components/bottom-nav.tsx"

key-decisions:
  - "Mostrar arquivados implemented as a ?arquivados=1 URL param (not a pure client toggle) — matches the Extrato filter convention so the RSC re-reads RLS-scoped with the new filter; UI-SPEC §2 explicitly allows either, chose the established pattern for consistency"
  - "Detail edit/archive split into a dedicated carro-detail-actions.tsx client component (rather than reusing the card's dropdown) so the header gets explicit labelled Editar/Arquivar buttons (UI-SPEC §5 header action area) while reusing toCarroEdit() + the same actions — one ownership/toast path, no drift"
  - "toCarroEdit() + CarroCardData exported from carro-card.tsx so both the card and the detail page (and Phase 9's picker) map a DB row → the CarroForm edit shape through ONE converter (DB nulls → '' for the controlled inputs)"
  - "ano field collected as a text Input (inputMode=numeric) and coerced to Number before carroSchema.safeParse — the schema owns the 1900..currentYear+1 bound + 'Ano inválido' message; an empty ano stays undefined (optional)"

requirements-completed: [CAR-01, CAR-06]

# Metrics
duration: 4min
completed: 2026-06-17
---

# Phase 8 Plan 03: Carro Nav + CRUD UI Summary

**The user-facing Carro slice that closes CAR-01 + CAR-06: a "Carros" nav entry (sidebar after Reservas + bottom-nav 6th mobile item, lucide `Car`), the `CarroForm` create/edit Dialog and identity-only `CarroCard` (both cloned verbatim from the reservas grammar and wired to the Plan-02 actions), the `/carros` list RSC (RLS-scoped read + `?arquivados=1` Switch filter + responsive CarroCard grid + Car-icon Empty + inline error), and the minimal `/carros/[id]` identity detail (definition list + Editar/Arquivar header actions, `notFound()` on a foreign/missing id) — identity only, zero money/KPIs (deferred to Phases 9-11), zero new visual primitives, zero new npm deps.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-17T16:08:15Z
- **Completed:** 2026-06-17T16:12:12Z
- **Tasks:** 3 (all auto)
- **Files:** 9 (7 created, 2 modified)

## Accomplishments

- **Task 1 — nav:** Added the lucide `Car` icon + `{ href:'/carros', label:'Carros', icon:Car }` to `app-sidebar.tsx`'s `NAV_ITEMS` (immediately after `/reservas`, before `/mei`) and the same entry to `bottom-nav.tsx` (taking the mobile bar from 5 to 6 items). Active detection + gold-active styling are the frozen Phase-7 grammar (unchanged).
- **Task 2 — components:**
  - `carro-form.tsx` (`'use client'`): a controllable create/edit Dialog mirroring `reserva-form.tsx` — manual-state + `useTransition`, re-seed-on-open (no useEffect), the 5 fields (Apelido required `Input` → "Informe o apelido", Modelo/Placa optional `Input`, Ano optional numeric `Input` → "Ano inválido" via the schema bound, Combustível padrão optional `Select` with Flex·Gasolina·Etanol·Diesel·GNV). Client-side `carroSchema.safeParse` before calling `createCarro`/`updateCarro(id, …)`; `{ error }` → `toast.error`, success → `toast.success('Carro adicionado'|'Carro atualizado')` + close. Default trigger = gold "Novo carro"; footer = `DialogClose` "Cancelar" + gold "Salvar".
  - `carro-card.tsx` (`'use client'`): an IDENTITY-ONLY card mirroring `reserva-card.tsx`'s structure — apelido (links to `/carros/[id]`), `modelo · placa · ano` secondary line (null fields omitted), neutral `outline` combustível Badge + `secondary` "Arquivado" Badge, and a `DropdownMenu` (MoreHorizontal) of Editar (controlled CarroForm) + Arquivar/Desarquivar (soft reversible toggle in a useTransition → toast). NO money/KPIs, NO `AmountCell`/`formatCents`. Exports `CarroCardData` + `toCarroEdit()`.
- **Task 3 — routes:**
  - `carros/page.tsx` (RSC): `from('carros').select('id, apelido, modelo, placa, ano, combustivel_padrao, is_archived').order('apelido')` RLS-scoped; reads `?arquivados=1` to show all vs only `is_archived=false`; header = `text-xl` h1 "Carros" + `CarrosArchiveFilter` Switch + gold "Novo carro"; `grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3` of CarroCard; `Empty` (Car icon, "Nenhum carro ainda" + CTA) when zero cars; inline `text-destructive` error.
  - `carros/[id]/page.tsx` (RSC): `await params`, `.eq('id', id).maybeSingle()` → `notFound()` on no row (RLS returns nothing for a foreign/missing id); header apelido + `modelo · placa · ano` + Arquivado badge + `CarroDetailActions`; body = a single `Card` definition list (null optionals show "—"). No money/charts/tables/placeholders.
  - `carros/loading.tsx`: `CardSkeleton` grid (never a spinner) with the page chrome visible.
  - Supporting client composites: `carros-archive-filter.tsx` (URL-param Switch) + `carro-detail-actions.tsx` (header Editar/Arquivar buttons).

## Task Commits

1. **Task 1: Carros nav entry** — `af3fd65` (feat)
2. **Task 2: CarroForm + CarroCard** — `3918e34` (feat)
3. **Task 3: /carros list + /carros/[id] detail + loading** — `15b1434` (feat)

## Files Created/Modified

- `src/components/carro-form.tsx` (created) — create/edit Dialog
- `src/components/carro-card.tsx` (created) — identity card + `toCarroEdit()` + `CarroCardData`
- `src/components/carros-archive-filter.tsx` (created) — `?arquivados=1` Switch filter
- `src/components/carro-detail-actions.tsx` (created) — detail header actions
- `src/app/(app)/carros/page.tsx` (created) — list RSC
- `src/app/(app)/carros/[id]/page.tsx` (created) — minimal detail RSC
- `src/app/(app)/carros/loading.tsx` (created) — CardSkeleton loading
- `src/components/app-sidebar.tsx` (modified) — +Carros nav entry (after Reservas)
- `src/components/bottom-nav.tsx` (modified) — +Carros (6th mobile item)

## Decisions Made

- **Filter = URL param.** `?arquivados=1` (the Extrato convention) over a pure client toggle so the RSC re-reads RLS-scoped on toggle. UI-SPEC §2 allows either; chose consistency with the existing filter pattern.
- **Dedicated detail-actions component.** The detail header uses explicit labelled `Editar`/`Arquivar` buttons (`carro-detail-actions.tsx`) instead of the card's icon dropdown, matching UI-SPEC §5's header action area — while still routing through `toCarroEdit()` + the same Plan-02 actions (one ownership/toast path).
- **One row→edit converter.** `toCarroEdit()` (exported from `carro-card.tsx`) maps a DB row → the `CarroForm` edit shape (DB nulls → '' for controlled inputs) for both the card and the detail page.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model Coverage

- **T-08-10 (Information Disclosure — /carros, /carros/[id] reads):** both routes sit in `(app)` under the existing auth guard; the list/detail reads run on the RLS-active server client (own rows only); a foreign/missing id on the detail → `notFound()` (RLS returns no row). Mitigated.
- **T-08-11 (IDOR / EoP — edit/archive from card/detail):** all mutations route through the Plan-02 server actions (`updateCarro`/`archiveCarro`/`unarchiveCarro`) which re-derive ownership via `assertOwnedCarro` before any write; the UI never touches the DB directly. Mitigated.
- **T-08-12 (service-role key in client bundle):** this plan adds only RSC reads + client components calling server actions; no client module imports the service-role admin client (SEC-01 secret-bundle audit stays green). Accepted as designed.
- **T-08-13 (Tampering — carro_id accounting via UI):** the card/detail are identity-only; this phase's UI never tags transactions (CAR-02 is Phase 9), so no accounting surface is touched (D4 preserved by construction). Accepted as designed.

## Known Stubs

None. Identity surfaces are intentionally minimal per UI-SPEC (KPIs/spend/abastecimento/consumo deferred to Phases 9-11) — these are documented deferrals, not stubs: no placeholder zeros, no "coming soon" sections, no empty data sources wired to mock data.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration. (Local Supabase stack is up; remote push/deploy remains the standing deferred blocker from 01-04, unrelated to this plan.)

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — exit 0; compiles `/carros` and `/carros/[id]` (confirmed in the route manifest).
- `npm test` — **632 passed / 76 files** (≥632 criterion met; no regressions — this UI slice adds no new test files, the Plan-02 action tests already cover the write boundary).
- grep gates: `/carros` + `Car` in both nav files; `from('carros')` in the list; `notFound` in the detail; "Nenhum carro ainda" empty copy; no `AmountCell`/`formatCents` in the card.

## Next Phase Readiness

- **CAR-01 + CAR-06 complete.** A user can create, edit, archive, unarchive, and navigate to their cars end-to-end; the Carros tab is in both navs; both routes resolve under the auth guard. Phase 8 is fully delivered (3/3 plans).
- **Phase 9 (etiquetar gastos → carro):** `CarroForm` is exportable/controllable and `toCarroEdit()` + `CarroCardData` are exported — the Phase-9 "qual carro?" picker can reuse the opener; the carros list/RLS read pattern is established.
- **Phases 10-11 (abastecimento/consumo/KPIs):** the `/carros/[id]` detail is the surface those phases extend with spend/km-l sections; the `v_carro_resumo`/`v_abastecimento_consumo` views (Plan 01) are ready to wire.
- No blockers introduced.

## Self-Check: PASSED

---
*Phase: 08-substrato-carro-crud-navega-o*
*Completed: 2026-06-17*
