---
phase: 03-metas-ader-ncia-e-reservas
plan: 01
subsystem: phase3-substrate
tags: [migrations, rls, security-invoker, adherence-views, reserva-ledger, derived-balance, atomic-rpc, is-reserva-flag, basis-points, zod, progress, nav, BUD, RSV]
requires:
  - 0002 categories (kind consumo/alocacao seed + handle_new_user) — extended with is_reserva
  - 0005 transactions (category_id, amount_cents>0, occurred_on) — adherence YTD + ledger FK source
  - 0007 v_income_month / v_category_totals (security_invoker) — adherence denominator + per-category spend
  - 0010 reassign_and_delete_category — atomic security-invoker RPC template for register_reserva_saida
  - src/lib/money.ts (parseBRLToCents/formatCents) + src/lib/month.ts (TZ-pinned month math)
  - src/lib/schemas/transaction.ts (Zod schema style) + src/components/app-sidebar.tsx (NAV_ITEMS)
provides:
  - supabase/migrations/0011_budget_targets.sql (percent_bp basis-points, direction, unique per category, RLS+grants+index)
  - supabase/migrations/0012_categories_is_reserva.sql (is_reserva flag + backfill + handle_new_user seed)
  - supabase/migrations/0013_reservas.sql (reservas + reserva_ledger, positive amounts, unique txn link, RLS)
  - supabase/migrations/0014_adherence_views.sql (v_adherence_month + v_adherence_ytd, security_invoker, alocação grouped)
  - supabase/migrations/0015_reserva_balance_view.sql (v_reserva_balance derived saldo, security_invoker)
  - supabase/migrations/0016_register_reserva_saida.sql (atomic never-negative saída RPC, security invoker)
  - src/types/database.types.ts (regenerated — all new relations/function/column)
  - src/lib/month.ts (currentYear + yearBounds, YTD window)
  - src/lib/adherence.ts (adherenceStatus + adherenceTokens + formatBpAsPercent — pure presentation)
  - src/lib/schemas/budget-target.ts (budgetTargetSchema) + src/lib/schemas/reserva.ts (reservaSchema, saidaSchema)
  - src/components/ui/progress.tsx (Radix-free progress bar) + src/components/app-sidebar.tsx (Reservas nav)
affects:
  - 03-02 (Wave-0 tests — exercises every migration/view/RPC + adherence.ts unit tests)
  - 03-03 (dashboard slice — reads v_adherence_month/_ytd, imports adherence.ts, upsertBudgetTarget)
  - 03-04 (reservas slice — reads v_reserva_balance, registerSaida RPC, reservaSchema, progress.tsx, nav)
  - 03-05 (aporte sub-flow — keys off categories.is_reserva, writes reserva_ledger 'in')
tech-stack:
  added: []
  patterns:
    - "percent stored as INTEGER basis-points (percent_bp 0<bp<=10000, 3000=30%) — no float anywhere in money/percent math"
    - "alocação grouping done IN THE VIEW (Open Question 1): a kind='alocacao' CTE sums Investimentos+Reserva together so a reserva aporte counts as allocation, never consumo (RSV-03)"
    - "monthly↔YTD consistency: identical percent_bp, identical half-up rounding (income*bp+5000)/10000, identical alocação grouping; ONLY the window differs (month_key vs civil year)"
    - "is_reserva boolean flag (Open Question 2) as the stable handle for the aporte sub-flow — backfilled + seeded in handle_new_user, never name-match (survives CAT-02 rename)"
    - "derived reserva balance (Σ in − Σ out) in a security_invoker view — never a stored column; the saída RPC reads it inside one atomic function body (TOCTOU-safe)"
    - "register_reserva_saida mirrors reassign_and_delete_category: SECURITY INVOKER + pinned search_path + P0001 raises; foreign reserva → null saldo → abort (IDOR-safe)"
key-files:
  created:
    - supabase/migrations/0011_budget_targets.sql
    - supabase/migrations/0012_categories_is_reserva.sql
    - supabase/migrations/0013_reservas.sql
    - supabase/migrations/0014_adherence_views.sql
    - supabase/migrations/0015_reserva_balance_view.sql
    - supabase/migrations/0016_register_reserva_saida.sql
    - src/lib/adherence.ts
    - src/lib/schemas/budget-target.ts
    - src/lib/schemas/reserva.ts
    - src/components/ui/progress.tsx
  modified:
    - src/types/database.types.ts
    - src/lib/month.ts
    - src/components/app-sidebar.tsx
decisions:
  - "Open Question 1 (alocação grouping locus) resolved IN THE VIEW: an alloc_total CTE sums all kind='alocacao' realized cents per period; each alocação meta row reads that combined total, consumo rows read their own per-category total. Invariant lives in SQL inside the RLS boundary; the app stays a pure formatter."
  - "Open Question 2 (Reserva stable handle) resolved as an is_reserva boolean flag on categories (not a system_key text). Backfilled true on the seed Reserva row and seeded explicitly per row in handle_new_user; the aporte sub-flow (Plan 05) keys off the flag, never the literal name."
  - "progress.tsx hand-authored Radix-free (role=progressbar + aria-value{now,min,max} + h-2, caller-controlled fill) instead of `npx shadcn add progress`: @radix-ui/react-progress was not installed and the phase threat model (T-03-SC) forbids new external npm packages this phase. Source-vendored, zero new dependency, satisfies the UI-SPEC contract."
  - "Both adherence views guard /0 with `case when (income*bp)=0 then null` + nullif so a no-income period yields adherence_bp=null (rendered as the 'sem receita' copy), never NaN%/Infinity% (Pitfall 2)."
metrics:
  duration: ~14 min
  completed: 2026-06-16
---

# Phase 3 Plan 01: Metas/Reservas Substrate Summary

The entire Phase-3 data + helper substrate in one atomic [BLOCKING] step: six migrations (0011–0016) applied to the LOCAL stack with `database.types.ts` regenerated — `budget_targets` (percent as integer basis-points + teto/alvo direction), the `is_reserva` stable-handle flag resolving the Reserva-rename open question, `reservas` + an append-only `reserva_ledger` with a derived `v_reserva_balance`, the two `security_invoker` adherence views (monthly + civil-year YTD that share one percent + one rounding + one alocação grouping so they cannot diverge), and the atomic never-negative `register_reserva_saida` RPC — plus the pure app-side helpers (year boundaries, adherence status/token mapping), the two Zod schemas, the Radix-free `progress` component, and the Reservas nav item.

## What Was Built

**Task 1 — Migrations 0011-0016 + is_reserva, applied local + regenerated types (commit bd768f0).**
- `0011_budget_targets.sql` (BUD-01): `budget_targets(percent_bp int check 0<bp<=10000, direction in teto/alvo, unique(user_id,category_id))`, `category_id` FK `ON DELETE CASCADE`, `budget_targets_user_idx`, RLS `(select auth.uid()) = user_id` USING+WITH CHECK `to authenticated` + DML grants. Direction default-from-kind is deliberately NOT a DB default (it is a Plan-03 form affordance).
- `0012_categories_is_reserva.sql` (Open Question 2): `add column if not exists is_reserva boolean not null default false`; one-time backfill `is_reserva=true where name='Reserva' and kind='alocacao'`; `handle_new_user()` re-created from the 0002 body verbatim with `is_reserva` added to the seed column list — `true` only for the Reserva row, `false` for the other 10. ASCII enum values unchanged.
- `0013_reservas.sql` (RSV-01/02/04/05): `reservas(nome, alvo_cents bigint check null-or>0, is_archived)` + `reserva_ledger(kind in/out, amount_cents>0 ALWAYS positive, transaction_id FK ON DELETE SET NULL, occurred_on, note)`; indexes `reservas_user_idx`, `reserva_ledger_reserva_idx`, `reserva_ledger_user_idx`, and the partial unique `reserva_ledger_txn_uniq on (transaction_id) where transaction_id is not null` (idempotent aporte re-link); RLS + grants on both tables.
- `0014_adherence_views.sql` (BUD-02/03/04, RSV-03): `v_adherence_month` + `v_adherence_ytd`, both `with (security_invoker = true)`. `meta_cents = (income_cents*percent_bp + 5000)/10000` (integer half-up, once). `adherence_bp` guarded `case when (income*bp)=0 then null else realized*10000*10000/nullif(income*bp,0)`. **Alocação grouping in the view:** an `alloc_total` CTE sums all `kind='alocacao'` realized cents per period; each row's realized cents is the combined alocação total for alocação metas and the strict per-category total for consumo (`kind='consumo'`) metas — a reserva aporte lands ONLY in the alocação total, never a consumo teto. The YTD view uses the same percent_bp, the same rounding, the same grouping — only the window differs (`left(month_key,4)` / `to_char(occurred_on,'YYYY')`).
- `0015_reserva_balance_view.sql` (RSV-05): `v_reserva_balance` `with (security_invoker = true)` = `coalesce(Σ in) − coalesce(Σ out)` per reserva, carrying `user_id, reserva_id, nome, alvo_cents`. Balance is always derived here.
- `0016_register_reserva_saida.sql` (RSV-04): `register_reserva_saida(p_reserva_id, p_amount_cents, p_occurred_on, p_note default '')` returns the new ledger id, `language plpgsql`, `security invoker`, `set search_path = public`. Rejects null/<=0 (P0001 'Valor inválido'); reads `saldo_cents` from `v_reserva_balance` scoped to the caller (`(select auth.uid())`) — a foreign/nonexistent reserva → null → P0001 'Reserva inexistente ou sem permissão'; `amount > saldo` → P0001 'Saída maior que o saldo da reserva'; else inserts the 'out' row in the same function body (TOCTOU-safe). `grant execute … to authenticated`.
- Applied via `npm run db:reset` (0001–0016 clean, no error) then `npm run gen:types`. **No remote push.**

**Task 2 — App-side helpers, schemas, progress, nav (commit f7adf89).**
- `src/lib/month.ts`: added `currentYear()` (`formatInTimeZone(new Date(), 'America/Sao_Paulo', 'yyyy')`) and `yearBounds(year)` (`{first:${year}-01-01, last:${year}-12-31}`), reusing the existing `TZ` constant (not duplicated).
- `src/lib/adherence.ts` (pure, no DB): `adherenceStatus(adherenceBp, direction)` → discriminant (`sem-receita` | teto: `no-limite`/`aproximando`/`estourou` | alvo: `abaixo`/`quase-la`/`atingido`) on the 8000/10000 thresholds; `adherenceTokens(status)` → `{fill, text, label}` per UI-SPEC §Semantic Color (teto amber→amber→destructive; alvo muted→allocation→income); `formatBpAsPercent(bp)` via `Intl.NumberFormat('pt-BR', {style:'percent', maximumFractionDigits:1})` returning `—` (never NaN%/Infinity%) for null.
- `src/lib/schemas/budget-target.ts`: `budgetTargetSchema = z.object({ categoryId uuid, percentBp int().gt(0).lte(10000), direction enum(['teto','alvo']) })` + inferred type.
- `src/lib/schemas/reserva.ts`: `reservaSchema` (nome trim 1..60; alvo optional raw pt-BR string) + `saidaSchema` (reservaId uuid; amount min(1); occurredOn date regex; note optional) + inferred types.
- `src/components/ui/progress.tsx`: Radix-free `Progress` (`role="progressbar"`, `aria-valuenow/min/max`, `h-2` track + caller-controlled `indicatorClassName` fill so the reserva bar can switch to `bg-income` at ≥100%).
- `src/components/app-sidebar.tsx`: added `{ href:'/reservas', label:'Reservas', icon: PiggyBank }` to `NAV_ITEMS` (lucide `PiggyBank` import); existing items + active-styling unchanged.

## Verification Results

- `npm run db:reset`: migrations 0001–0016 apply cleanly, no error.
- `npm run gen:types`: regenerated; `database.types.ts` contains `budget_targets`, `reservas`, `reserva_ledger`, `v_adherence_month`, `v_adherence_ytd`, `v_reserva_balance`, `register_reserva_saida`, `is_reserva` (all grep-confirmed).
- View smoke test (`psql`): all three new views are queryable (return 0 rows on the empty seed — compile + grant + security_invoker OK).
- `grep` security_invoker: 0014 has 2 occurrences, 0015 has 1; 0016 has `security invoker`.
- `npx tsc --noEmit`: clean (exit 0).
- `npx eslint` on the 6 touched source files: clean.
- Full suite `npm test`: **155/155 GREEN** across 19 files (Phase-1/2 RLS + view-leak integration tests pass against the freshly reset stack — confirms the new migrations did not break isolation).
- `npm run build`: succeeds.

## Deviations from Plan

### Plan-intent adjustments (no permission needed)

- **`progress.tsx` hand-authored Radix-free instead of via the shadcn CLI [Rule 3 — Blocking]:** `@radix-ui/react-progress` was not installed, and `npx shadcn@latest add progress` would pull a new external npm dependency, which the phase threat model (T-03-SC) explicitly forbids ("No external npm packages this phase"). The plan's `<action>` already names this exact fallback ("If the CLI is unavailable, hand-author a minimal Radix-free progress div per UI-SPEC"). The vendored component meets the UI-SPEC contract (`role="progressbar"`, `aria-value*`, `h-2`, caller-controlled fill) with zero new dependency. Package-install exclusion (Rule 3) respected — no install attempted.

### Out of scope (not fixed)
- Pre-existing Next.js "middleware → proxy" deprecation warning surfaced by `npm run build` (Phase-1 file convention, already logged in 02-01/02-03) — unrelated to this plan.

## Authentication Gates
None — the local Supabase stack was already running (`supabase start` containers up); `db:reset`, `gen:types`, and the full test suite all ran against it without an auth gate.

## Known Stubs
None. Every migration is applied and live; the helpers/schemas/component are real and type-clean. The `/reservas` and `/dashboard` nav targets are forward references — the real routes ship in Plans 03 (dashboard) and 04 (reservas). This is the intended substrate-first sequencing, not a stub.

## Threat Surface
No new surface beyond the plan's `<threat_model>`. T-03-01 (security_invoker on all 3 views), T-03-02 (RLS + grants + user_id index on all 3 tables), T-03-03 (atomic security-invoker saída RPC reads balance + inserts in one body), T-03-04 (alocação grouped; consumo filters kind='consumo'), T-03-05 (percent_bp/amount_cents domain checks, no float), and T-03-SC (no external npm packages; progress vendored as source) are all implemented as specified. The two-user RLS / view-leak / IDOR / aporte-grouping tests that pin these mitigations are authored in Plan 02 (Wave-0).

## Local Stack
Left **running** for Plan 02 — `supabase status` reports the local API at http://127.0.0.1:55321 with migrations 0001-0016 applied and `database.types.ts` in sync. The Wave-0 tests can execute immediately against the live substrate.

## Self-Check: PASSED
