---
phase: 03-metas-ader-ncia-e-reservas
plan: 04
subsystem: reservas-slice
tags: [server-action, idor, atomic-rpc, derived-balance, never-negative, reserva-ledger, progress-conditional, rsc, security-invoker, sinking-funds, RSV]
requires:
  - 03-01 substrate (reservas + reserva_ledger tables, v_reserva_balance security_invoker view, register_reserva_saida RPC, reservaSchema/saidaSchema, progress.tsx, Reservas nav)
  - 03-02 Wave-0 tests (reserva-saida never-negative + concurrent, reserva-idor ownership re-derive, reserva-balance derived saldo, reserva-crud — all GREEN against the substrate this action implements over)
  - src/actions/transactions.ts (assertOwnedCategories IDOR pattern → cloned as assertOwnedReserva) + budget-targets.test.ts (chainable-mock style)
  - src/components/{amount-cell,money-input}.tsx + src/components/ui/{progress,dialog,alert-dialog,dropdown-menu,field,badge,table,card}.tsx
  - src/lib/money.ts (parseBRLToCents/formatCents/centsToBigInt/centsToEditableBRL)
provides:
  - src/actions/reservas.ts (createReserva/updateReserva/deleteReserva RSV-01 + registerSaida RSV-04 via RPC + assertOwnedReserva IDOR guard)
  - src/actions/reservas.test.ts (25 action-unit cases, mock supabase + rpc)
  - src/components/reserva-progress.tsx (ReservaProgress RSV-05 — renders ONLY with an alvo)
  - src/components/reserva-card.tsx (ReservaCard — view-derived saldo hero + conditional progress + actions dropdown + delete alert-dialog)
  - src/components/reserva-form.tsx (ReservaForm — EXPORTED for Plan 05; create/edit; controlled/uncontrolled)
  - src/components/saida-form.tsx (SaidaForm RSV-04 — valor ≤ saldo client FieldError + server-authoritative)
  - src/components/reserva-ledger-table.tsx (ReservaLedgerTable — entrada/saída history + txn links, mobile cards)
  - src/app/(app)/reservas/page.tsx (RSC list reading v_reserva_balance RLS-scoped)
  - src/app/(app)/reservas/[id]/page.tsx (RSC detail/ledger reading reserva_ledger newest-first)
affects:
  - 03-05 (aporte sub-flow — imports ReservaForm + the reservas this slice creates; writes reserva_ledger 'in' which surfaces in this slice's ledger + saldo)
  - 03-06 (human-verify walkthrough — verifies reserva CRUD, derived saldo, saída-never-negative, progress-only-with-alvo)
tech-stack:
  added: []
  patterns:
    - "registerSaida mirrors categories.reassignAndDelete: 'use server' + Zod safeParse → {error} + getClaims gate + assertOwnedReserva re-derive (FKs not RLS-aware) + supabase.rpc('register_reserva_saida', …); the RPC is the authoritative never-negative/TOCTOU guard, the action only re-derives ownership for a friendly error (NO app-side read-balance-then-insert — Pitfall 4)"
    - "assertOwnedReserva = verbatim clone of assertOwnedCategories applied to reserva_id (select id where id=$1 under RLS, exactly 1 row = owned) — pinned by the live reserva-idor Wave-0 test"
    - "RPC overdraw mapping: error.message.includes('saldo') → 'A saída não pode ser maior que o saldo da reserva.'; any other DB error → generic fallback; raw DB errors never reach the client"
    - "optional alvo parsed via parseOptionalAlvo: undefined/blank → null (no progress bar, RSV-01), non-blank-unparseable → 'Valor monetário inválido.'; alvo_cents is the ONLY conditional that shows/hides the bar"
    - "saldo ALWAYS read from v_reserva_balance (Σ in − Σ out) in both RSC routes — never computed or stored in the app (RSV-05); ReservaProgress takes the view saldo and only divides for the display ratio"
    - "ReservaForm/SaidaForm support controlled (open/onOpenChange) AND uncontrolled (built-in trigger) modes — the card drives them from its dropdown, the pages use the built-in CTA, Plan 05 will open ReservaForm controlled"
key-files:
  created:
    - src/actions/reservas.ts
    - src/actions/reservas.test.ts
    - src/components/reserva-progress.tsx
    - src/components/reserva-card.tsx
    - src/components/reserva-form.tsx
    - src/components/saida-form.tsx
    - src/components/reserva-ledger-table.tsx
    - src/app/(app)/reservas/page.tsx
    - src/app/(app)/reservas/[id]/page.tsx
  modified: []
decisions:
  - "registerSaida does NOT read the balance app-side before the RPC: the atomic register_reserva_saida RPC (0016 + the 0017 row-lock from Plan 02) is the sole authoritative never-negative/race-safe guard. The action re-derives ONLY ownership (assertOwnedReserva) for a friendly 'Reserva inválida.' error; the RPC's own RLS-scoped balance read backstops a foreign reserva (Pattern 5 / Pitfall 4)."
  - "ReservaForm + SaidaForm carry an optional controlled open/onOpenChange (mirroring CategoryDeleteDialog) so ReservaCard can open them from its dropdown menu (no inline trigger) while the /reservas pages use the default 'Nova reserva' / 'Registrar saída' button trigger. This keeps ReservaForm a single self-contained export Plan 05 can drive controlled for its '+ Nova reserva' affordance."
  - "SaidaForm validates valor ≤ saldo TWICE: a client FieldError fast-path (aria-invalid + the exact saldo in the copy, never just a disabled button) AND the server registerSaida → RPC as the authoritative boundary; a server 'saldo' rejection is re-surfaced as the same amount FieldError, not a toast, so the boundary failure lands on the field."
  - "ReservaProgress owns the alvo conditional: alvoCents===null (or ≤0) → returns null (renders NOTHING, not a 0% bar). Both the card and the detail header pass the raw view alvo_cents, so 'progress only with alvo' (RSV-05) is enforced in exactly one place."
  - "reserva_ledger.transaction_id renders a 'Ver lançamento' link to /extrato (the extrato has no per-id deep route yet in Phase 3); the link is honest about a txn-backed aporte vs a standalone saída (— when null). A per-transaction deep link can replace the href in a later phase without touching the ledger contract."
metrics:
  duration: ~8 min
  completed: 2026-06-16
---

# Phase 3 Plan 04: Reservas Slice Summary

The reservas vertical slice end-to-end: a user CREATES a named reserva (optional alvo), SEES its derived saldo and — only when there is an alvo — a progress bar, REGISTERS a validated saída that can never overdraw, and VIEWS the per-reserva ledger history. Ships `reservas.ts` (createReserva/updateReserva/deleteReserva + registerSaida via the atomic `register_reserva_saida` RPC + the `assertOwnedReserva` IDOR re-derive), the five reserva components (ReservaProgress conditional-on-alvo, ReservaCard with the view-derived saldo hero, the exported ReservaForm, SaidaForm with ≤-saldo validation client+server, ReservaLedgerTable), and the `/reservas` list + `/reservas/[id]` ledger detail RSC routes — all reading the saldo from `v_reserva_balance` (Σ in − Σ out), never client-computed. Delivers RSV-01/04/05 as one capability over the live Wave-0-pinned substrate.

## What Was Built

**Task 1 — reservas Server Action: CRUD + registerSaida via atomic RPC + assertOwnedReserva (commit 12b641e).**
- `src/actions/reservas.ts`: mirrors `transactions.ts`/`budget-targets.ts` verbatim — `'use server'`, Zod `safeParse` → `{error}`, `getClaims()` → `userId` else `'Sessão expirada.'`, `revalidatePath('/reservas')` on success.
  - `createReserva({nome, alvo?})` / `updateReserva(id, {nome, alvo?})`: `reservaSchema` validation, `parseOptionalAlvo` (undefined/blank → `null` so no progress bar; non-blank-unparseable → `'Valor monetário inválido.'`), insert/update with `alvo_cents`. `updateReserva` guards the id with `idSchema` first.
  - `deleteReserva(id)`: UUID guard + getClaims + RLS-scoped `delete().eq('id', id)` (ledger cascades per the 0013 FK).
  - `registerSaida({reservaId, amount, occurredOn, note?})`: `saidaSchema` + `parseBRLToCents(amount)` → friendly money error; `assertOwnedReserva` re-derive (else `'Reserva inválida.'`) BEFORE the RPC; `supabase.rpc('register_reserva_saida', {p_reserva_id, p_amount_cents, p_occurred_on, p_note})`; an overdraw raise (message includes `'saldo'`) maps to `'A saída não pode ser maior que o saldo da reserva.'`, any other error → `'Não foi possível registrar a saída.'`. No app-side read-balance-then-insert — the RPC is the authoritative atomic guard (Pitfall 4).
  - `assertOwnedReserva(supabase, id)`: verbatim clone of `assertOwnedCategories` — `select id from reservas where id=$1` under the RLS-active client, exactly 1 row ⇒ owned (FKs are not RLS-aware — the Phase-2 IDOR lesson).
- `src/actions/reservas.test.ts`: 25 action-unit cases on the `budget-targets.test.ts` chainable-builder mock (extended with `rpc()` capture + `rpcCalls`), RFC-4122 v4 UUID fixtures. Covers every behavior: create with/without/blank alvo, update nome+alvo + alvo→null, delete, the session gate + friendly DB-error fallbacks; for registerSaida — the ownership-then-rpc order, `p_note` default, the foreign-reservaId rejection (RPC never called), the overdraw `'saldo'`→friendly mapping, the generic-fallback mapping, and the Zod/money/session gates.

**Task 2 — Reserva components: Card, Progress, Form, SaidaForm, LedgerTable (commit 62e6811).**
- `reserva-progress.tsx` (ReservaProgress, RSV-05): wraps the Plan-01 vendored `progress`. Returns `null` when `alvoCents===null` (or ≤0) — renders NOTHING, not a 0% bar. Shows `saldo / alvo` + % (mono, tabular, pt-BR one-decimal), fill `bg-primary` switching to `bg-income` at ≥100% with a `CheckCircle2` "Alvo atingido" badge. `aria-valuetext` carries the saldo/alvo ratio (a11y — color never the sole signal).
- `reserva-card.tsx` (ReservaCard): a `--card` surface — nome · "Saldo" + the view-derived saldo as an `AmountCell` (neutral, ALWAYS `reserva.saldoCents` from the view) · `ReservaProgress` (renders only if alvo) · a `dropdown-menu`: Registrar saída → controlled `SaidaForm`, Ver extrato → `Link` to `/reservas/[id]`, Editar → controlled `ReservaForm`, Excluir → `alert-dialog` with the "Esta reserva tem {n} movimentos…" copy calling `deleteReserva`.
- `reserva-form.tsx` (ReservaForm): create/edit dialog mirroring `receita-form`'s manual-state + `useTransition` + `sonner`; nome (`Input`, required) + alvo (`MoneyInput`, optional). Re-seeds from props on open (no `useEffect`). Editing alvo→empty stores `null` (removes the bar). Calls `createReserva`/`updateReserva`; toasts "Reserva criada"/"Reserva atualizada". **Exported + self-contained**, supports controlled `open`/`onOpenChange` so Plan 05's ReservaPicker can drive it.
- `saida-form.tsx` (SaidaForm, RSV-04): dialog — valor (`MoneyInput`), data (native date input mirroring `transacao-form`), descrição (optional). Validates `valor ≤ saldo` client-side as a `FieldError` ("A saída não pode ser maior que o saldo da reserva ({R$})." with the exact saldo) AND server-side via `registerSaida` (authoritative); a server `'saldo'` rejection re-surfaces as the same amount `FieldError`, never just a disabled button. Toast "Saída registrada".
- `reserva-ledger-table.tsx` (ReservaLedgerTable): a `table` — Data (dd/MM) · Tipo (`Badge` Entrada/Saída) · Descrição · Valor (`AmountCell`: entrada `income`/green `+`, saída `expense`/neutral `−`) · Vínculo (link to the source transação when `transaction_id` set, else —). Caller orders newest-first; mobile (`<md`) collapses to one card per movimento (mirrors the Extrato mobile pattern).

**Task 3 — /reservas list RSC + per-reserva ledger detail route (commit 425b5b0).**
- `src/app/(app)/reservas/page.tsx` (RSC): h1 "Reservas" + a "Nova reserva" `ReservaForm` CTA. Reads `v_reserva_balance` (`reserva_id, nome, alvo_cents, saldo_cents`, ordered by nome) RLS-scoped — the saldo ALWAYS comes from the view, never computed here (RSV-05) — plus a `reserva_ledger` read folded into a per-reserva movement count for the delete-confirm copy. Renders a responsive `ReservaCard` grid; Empty-no-reservas (`Empty` primitive + the "Apê, Carro" copy + "Nova reserva" CTA); Error (inline `text-destructive` "Não foi possível carregar as reservas…").
- `src/app/(app)/reservas/[id]/page.tsx` (RSC detail/ledger): reads the one reserva's `v_reserva_balance` saldo via `.eq('reserva_id', id).maybeSingle()` → `notFound()` for a foreign/nonexistent id (RLS returns no row), then its `reserva_ledger` rows newest-first (`occurred_on` then `created_at` desc). Header with nome + saldo (view-derived) + `ReservaProgress` (only with alvo); primary action "Registrar saída" (`SaidaForm`); `ReservaLedgerTable` or the empty-ledger copy "Nenhum movimento nesta reserva ainda…".

## Verification Results

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run reservas`: **25/25 GREEN** (action-unit).
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run reserva-idor reserva-saida reserva-crud reserva-balance`: **15/15 GREEN** — the Plan-02 Wave-0 reserva-idor ownership-check and reserva-saida never-negative assertions hold against this action's substrate.
- Full suite `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run`: **260 passed | 0 skipped** across **32 files** (up from the 235/31 baseline: +25 new reservas action tests, +1 new file). No regressions.
- `npx tsc --noEmit`: clean (exit 0).
- `npx eslint` on all 9 touched source files: clean (exit 0 per file batch).
- `npm run build`: succeeds; `/reservas` and `/reservas/[id]` both compile as dynamic (server-rendered) routes.
- Greps: `alvo` in reserva-progress, `registerSaida` in saida-form, `createReserva` in reserva-form, `v_reserva_balance` in reservas/page, `reserva_ledger` in reservas/[id]/page.

## Deviations from Plan

None — plan executed exactly as written. All five components, both routes, and the action shipped with the contracts the plan specified; the controlled/uncontrolled dialog support and the `parseOptionalAlvo` null-handling are implementation details inside the plan's stated behavior, not deviations.

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation note surfaced by `npm run build` (Phase-1 file convention, already logged in 02-01/03 and 03-01/03) — unrelated to this plan.

## Authentication Gates
None — the local Supabase stack was already running (03-03 left it up at `127.0.0.1:55321`, migrations 0001-0017). `vitest`, `tsc`, `eslint`, and `npm run build` all ran without an auth gate.

## Known Stubs
None. `createReserva`/`updateReserva`/`deleteReserva`/`registerSaida` are real and IDOR-checked; the five components render live data; both routes read `v_reserva_balance`/`reserva_ledger` RLS-scoped with the saldo always view-derived. The ledger `transaction_id` "Ver lançamento" link points at `/extrato` (the extrato has no per-id deep route in Phase 3) — an honest, working link, not a placeholder; a per-transaction deep link can replace the href later without touching the ledger contract.

## Threat Surface
No new surface beyond the plan's `<threat_model>`. T-03-04-01 (IDOR on `reserva_ledger.reserva_id` — `assertOwnedReserva` re-derive before the RPC, pinned by the live `reserva-idor` test), T-03-04-02 (concurrent/over-balance saída — the atomic `register_reserva_saida` RPC with the 0017 row-lock is the sole authoritative guard; no app-side read-then-insert), T-03-04-03 (client-computed/stored balance — the saldo is ALWAYS read from `v_reserva_balance` in both routes, the UI only divides for the display ratio), and T-03-04-04 (information disclosure — both RSC reads are RLS-scoped under the user's JWT; the view is security_invoker from 03-01, view-leak test from 03-02) are all implemented as specified. T-03-04-SC: no new npm packages (reuses the Plan-01 vendored `progress` + existing shadcn).

## Requirements
- **RSV-01** (create reserva + optional alvo) — Complete: createReserva/updateReserva + ReservaForm; progress conditional on alvo.
- **RSV-04** (saída with history, never negative) — Complete: registerSaida via the atomic RPC + SaidaForm ≤-saldo client+server; ReservaLedgerTable history.
- **RSV-05** (derived balance + conditional progress) — Complete: saldo from v_reserva_balance in both routes; ReservaProgress renders only with an alvo.
- RSV-02/03 (aporte sub-flow linking a "Reserva" transaction into a reserva) land in **03-05**, which imports this slice's ReservaForm and writes the `reserva_ledger 'in'` entries that surface in this slice's ledger + saldo.

## Local Stack
Left **running** for 03-05 — API at `http://127.0.0.1:55321` with migrations 0001-0017 applied and `database.types.ts` in sync. No remote push.

## Self-Check: PASSED
