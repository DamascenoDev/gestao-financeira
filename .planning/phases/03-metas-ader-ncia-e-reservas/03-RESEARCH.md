# Phase 3: Metas, aderência e reservas - Research

**Researched:** 2026-06-16
**Domain:** Budget targets (% of net income, teto/alvo direction), adherence computation in `security_invoker` SQL views (monthly + YTD, consistent), inline dashboard alerts, and reservas (sinking funds) with a derived-balance ledger + the "qual reserva?" aporte sub-flow — all on the established Phase 1/2 RLS + bigint-centavos + Server-Action + IDOR-hardening foundation.
**Confidence:** HIGH — the stack is locked and proven across Phases 1-2; every new surface (two view families, two tables, one balance view, one RPC) reuses a verbatim Phase-2 pattern. The only genuinely novel design is the adherence-math denominator + alocação grouping, which CONTEXT already locks.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Metas (budget targets)**
- Stored in table `budget_targets` (user_id, category_id, percent, direction) — one meta per category.
- Default direction derived from category `kind`: consumo → teto (não exceder), alocação → alvo (atingir); user-editable (BUD-01).
- Alert: fixed thresholds — warn at 80% of the meta (approaching) and 100% (over/reached), shown on the dashboard (BUD-04).
- Annual meta is derived: the same % applied over the ACCUMULATED net income of the year (same ledger as the monthly view, no separate annual meta) — guarantees monthly↔annual consistency (BUD-03).

**Aderência / Dashboard**
- Adherence computed in a `security_invoker = true` SQL view (gasto/alocado ÷ receita líquida do período vs meta %) — never in the app, never leaks between users.
- Semantics by direction: TETO (consumo) → green below the meta, red above; ALVO (alocação) → green when ≥ meta (BUD-02).
- ALOCAÇÃO categories (Investimentos + Reserva) sum TOGETHER into the investment meta; reserva aportes count as investment allocation and NEVER as consumption spend (RSV-03, locked decision).
- Dashboard shows monthly adherence AND accumulated YTD vs annual metas, both from the same ledger and consistent (BUD-02/BUD-03).

**Reservas (sinking funds)**
- Model: `reservas` (user_id, nome, alvo_cents optional) + `reserva_ledger` (user_id, reserva_id, kind in/out, amount_cents positive, transaction_id optional link, data); balance ALWAYS derived (Σ in − Σ out) via a view, never a mutable column (RSV-05).
- Aporte trigger: a transaction of category "Reserva" fires the sub-question "qual reserva?" and creates an `in` entry in `reserva_ledger` linked to the transaction (RSV-02).
- Saída (withdrawal): reduces the balance, validated to never leave a negative balance (out ≤ current balance); a saída is a reserva movement, does NOT affect spend metas (RSV-04).
- Progress bar appears only when there is an alvo (RSV-01/RSV-05).
- **Ownership (Phase-2 IDOR lesson):** every `reserva_id` and `category_id` from the client is validated server-side by owner (RLS-scoped select) BEFORE writing — RLS does not close an FK to another user's row.

### Claude's Discretion
- Exact shape of views/migrations (follow the Phase-2 RLS + grants + index + security_invoker pattern).
- shadcn dashboard components (adherence cards, progress bars, gauges).
- Exact dashboard and reservas-screen layout.
- How the "qual reserva?" sub-question fits into the transaction-entry flow (dialog).

### Deferred Ideas (OUT OF SCOPE)
- Merchant→reserva learning (auto-suggest reserva) → Phase 4 (RSV-06).
- Upload/AI → Phase 4; MEI → Phase 5.
- "Disponível para orçar" (whether an aporte reduces what's left to budget) → not in v1, keep it simple.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUD-01 | Define meta per category in % of net income, direction configurable: teto (consumo) or alvo (alocação) | `budget_targets` table (Pattern 1) + `direction` default-from-kind in `upsertBudgetTarget` action; one-meta-per-category via `unique(user_id, category_id)` |
| BUD-02 | Monthly adherence dashboard: gasto/alocado X% vs meta Y% per category | `v_adherence_month` view (Pattern 2) joins `v_category_totals` + `v_income_month` + `budget_targets`; UI maps direction→color |
| BUD-03 | Accumulated-year view vs annual metas | `v_adherence_ytd` view (Pattern 3) — same % over accumulated income + accumulated spend; consistency guaranteed by sharing one ledger and one % |
| BUD-04 | Alert on approaching/over a category meta | 80%/100% thresholds derived in the view (`status` column) and surfaced inline on the dashboard row + summary count; no notification system |
| RSV-01 | Create named reserva with optional alvo | `reservas` table (Pattern 4) + `createReserva`/`updateReserva` actions; progress bar conditional on `alvo_cents IS NOT NULL` |
| RSV-02 | "Reserva" transaction fires "qual reserva?" and creates a ledger entry | `createTransactionWithReserva` Server Action — one DB round-trip path that inserts the transaction AND the linked `in` ledger entry; sub-question is a conditional field in `transacao-form` (Pattern 6) |
| RSV-03 | Aporte counts as investment allocation, not consumption spend | Adherence views aggregate by `kind='alocacao'` group, NOT per-category, so aportes (category Reserva, kind alocacao) and Investimentos sum together; aportes never reach the consumo total (Pattern 2/3 + Pitfall 3) |
| RSV-04 | Register saída with per-reserva in/out history | `registerSaida` action → `register_reserva_saida` RPC (Pattern 5) validates `out ≤ saldo` atomically; ledger keeps full history |
| RSV-05 | Balance always derived; progress bar vs alvo | `v_reserva_balance` view = Σ(in) − Σ(out) (Pattern 4); never a stored column |
</phase_requirements>

## Summary

Phase 3 delivers the product's core-value screen ("visão de metas") on top of the manual loop built in Phase 2. It adds three things, each a thin application of an already-proven pattern: (1) a `budget_targets` table holding one `percent`+`direction` meta per category, with the direction defaulting from the category's `kind`; (2) a family of `security_invoker` adherence views that divide period spend/allocation by net income and compare to the meta, computed entirely in SQL inside the RLS boundary; and (3) reservas — a `reservas` table plus an append-only `reserva_ledger` whose balance is **always derived** (`Σ in − Σ out`) via a view, with saídas validated against the live balance inside an atomic RPC and aportes created by a Server Action that links a "Reserva"-category transaction to the chosen bucket.

The two hard design decisions are both pre-resolved by CONTEXT and must be honored exactly. First, **monthly↔annual consistency (BUD-03)**: there is no separate annual meta; the YTD view applies the *same* `percent` to the *accumulated* net income of the civil year and compares it to the *accumulated* spend over the same window — so the two views cannot diverge because they share one ledger and one percentage. Second, **alocação grouping (RSV-03, locked)**: the adherence math must aggregate the alocação categories (Investimentos + Reserva) **together** into the investment meta, so a reserva aporte counts as investment allocation and **never** as consumption spend. The view is therefore built to roll spend up by `kind`-group, not strictly per-category, for the alocação side — this is the single most important correctness constraint in the phase and is the source of the worst pitfall (double-counting an aporte as both a gasto and an allocation).

**Primary recommendation:** Compute *everything* — adherence %, status thresholds (80/100), and reserva balance — in `security_invoker` SQL views over the existing `v_income_month` / `v_category_totals` plus the new `budget_targets` / `reserva_ledger` tables. Keep the app as a pure formatter of view output. Carry the Phase-2 IDOR fix verbatim: every client-supplied `reserva_id` and `category_id` is re-derived as owner-scoped server-side before any write, and the saída validation lives in an atomic `security invoker` RPC (mirroring `reassign_and_delete_category`) so a concurrent withdrawal can never drive the balance negative. Reuse the entire Phase-1/2 RLS shape, money helpers, `month.ts`, the two-user test harness, and the action boundary pattern — there is **no new runtime dependency** and **no new shadcn component except `progress`**.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `budget_targets`, `reservas`, `reserva_ledger` storage + isolation | Database (Postgres + RLS) | — | System of record; RLS `(select auth.uid()) = user_id` is the isolation boundary, not app code |
| Adherence % (monthly + YTD), 80/100 status, alocação grouping | Database (`security_invoker` views) | Backend (typed read in RSC) | Money sums + division belong in SQL inside the RLS boundary; views inherit RLS; avoids over-fetch (ARCHITECTURE AP-5) |
| Reserva balance (Σ in − Σ out) | Database (`v_reserva_balance` view) | App (progress = balance ÷ alvo, null-safe) | Derived-never-stored is the canonical finance pattern; progress is presentational division |
| Saída validation (out ≤ saldo, never negative, race-safe) | Database (atomic `register_reserva_saida` RPC) | Backend (action calls RPC) | A check-then-write in app code has a TOCTOU race; the RPC does balance-check + insert in one transaction (mirrors `reassign_and_delete_category`) |
| Aporte from "Reserva" transaction → ledger `in` linked to txn | Backend (Server Action) | Database (FK link, RLS) | Needs the user's reserva CHOICE — a pure DB trigger can't know which bucket; the action does txn-insert + ledger-insert + ownership checks |
| Budget-target direction default-from-kind | Backend (Server Action) | Client (form prefill mirror) | Direction default is a business rule keyed on category.kind; editable by the user |
| `category_id` / `reserva_id` ownership before FK write | Backend (Server Action, RLS-scoped select) | Database (RPC EXISTS checks as backstop) | FKs are NOT RLS-aware (Phase-2 IDOR lesson); re-derive ownership server-side, RPC hardened too |
| Form ↔ action validation (percent 0–100, money, ids) | Backend (Server Action, Zod) | Client (zodResolver mirror) | One Zod schema validates form AND action — Phase-1/2 invariant |
| Adherence/reserva display, direction-aware color, progress | Client (presentation) | Shared (`money.ts`, percent format) | Pure formatting of view output; no money math client-side |

## Standard Stack

### Core (already installed — reuse, do NOT re-add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.x | App Router, Server Actions, RSC | Locked. [VERIFIED: package.json] |
| `@supabase/ssr` + `@supabase/supabase-js` | 0.12.x / 2.108.x | Cookie auth + typed RLS client | Phase-1/2 proven. [VERIFIED: package.json] |
| `zod` | 4.4.x | Boundary validation (forms + actions) | Phase-1/2 pattern (`lib/schemas/*`). [VERIFIED: package.json] |
| `react-hook-form` + `@hookform/resolvers` | 7.79.x / 5.4.x | Forms (manual-state variant in `transacao-form`) | Phase-2 pattern. [VERIFIED: package.json] |
| `@tanstack/react-table` | 8.21.x | Reserva ledger table (only if sorting needed; a plain `table` is fine) | Already vendored from Phase 2. [VERIFIED: package.json] |
| `date-fns` + `date-fns-tz` | 4.4.x / 3.2.x | Civil-month + civil-YEAR boundaries (`America/Sao_Paulo`) | `lib/month.ts` owns it; YTD needs `startOfYear` in SP. [VERIFIED: package.json] |
| `sonner` | 2.0.x | Toasts (meta salva, saída registrada) | Already vendored. [VERIFIED: package.json] |
| `lucide-react` | — | Status glyphs (triangle-alert, octagon-alert, check, piggy-bank) | Already vendored. [VERIFIED: package.json] |
| `src/lib/money.ts` | — | `parseBRLToCents` / `formatCents` / `centsToBigInt` | Hardened Phase 1; use for ALL money I/O. [VERIFIED: codebase] |
| `src/lib/month.ts` | — | `currentMonthKey` / `monthBounds` / `monthKeyOf` / `isMonthKey` | Civil-month owner; EXTEND with a civil-year helper. [VERIFIED: codebase] |

### Supporting (NEW shadcn component this phase)
| Component | Source | Purpose | When to Use |
|-----------|--------|---------|-------------|
| `progress` | shadcn official registry (`npx shadcn@latest add progress`) | Reserva alvo progress bar (rendered only when `alvo_cents` set) | Reservas screen. The **dashboard adherence bars are a CUSTOM `AdherenceBar`** (div/flex with a meta-marker tick + direction-aware fill), NOT shadcn `progress` (UI-SPEC §Component Inventory). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adherence in `security_invoker` views | App-side division over fetched rows | Over-fetches, scatters money math outside RLS, risks `NaN%` leaking to UI; views inherit RLS and divide once in SQL. **Use views.** (ARCHITECTURE AP-5) |
| Saída validation in an atomic RPC | App-level "read balance, then insert if ok" | TOCTOU race: two concurrent saídas both pass the check and overdraw. The RPC does check+insert in one transaction. **Use the RPC.** (mirrors `reassign_and_delete_category`) |
| Derived balance view | Stored `reservas.balance` column incremented per entry | Drifts on partial failure/retry/concurrency — destroys trust in a finance app. **Balance is always Σ in − Σ out.** (ARCHITECTURE AP-1, RSV-05 locked) |
| Aporte via Server Action | DB trigger on `transactions` INSERT where category=Reserva | A trigger can't know WHICH reserva the user chose; the choice is UI input. **Use the action.** (CONTEXT locked) |
| `recharts` / shadcn `chart` for the dashboard | — | Not needed in v1 — adherence is a list of horizontal bars, reads faster than a chart and avoids the `react-is` override (UI-SPEC Charting Decision). **Do not add recharts.** |
| `percent numeric` (e.g. 30.0) | `percent_bp` integer basis-points (3000 = 30%) | Basis-points avoids float entirely and is exact. **Recommended** — see Pitfall 1. Either is acceptable if the % is treated as exact-at-display only, but integer basis-points is the zero-ambiguity choice consistent with the "no float in money" discipline. |

**Installation:**
```bash
# No new runtime deps. One shadcn component:
npx shadcn@latest add progress
# After every migration (0011+):
npm run gen:types
```

**Version verification (2026-06-16):** No new npm packages are introduced this phase, so no registry verification is required beyond the Phase-2-verified set already in `package.json`. `progress` is vendored from the shadcn official registry (no third-party registry; `registries: {}` confirmed in `components.json`).

## Package Legitimacy Audit

> This phase installs **no external npm packages**. The only addition is a shadcn-official `progress` component (source code vendored into the repo, not an npm dependency). The legitimacy gate is therefore N/A — there is nothing to slopsquat.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | No external packages installed this phase |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.
**`[ASSUMED]` packages requiring `checkpoint:human-verify`:** none.

## Architecture Patterns

### System Architecture Diagram

```
                         BROWSER (Client Components)
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  Dashboard: period tabs (Mensal | Anual-YTD) ─► reads view rows            │
  │    AdherenceRow × N  (direction-aware AdherenceBar + status + % + meta%)   │
  │    AdherenceSummaryStrip (receita líquida hero + estouradas/atingidas)     │
  │  MetaDialog: % input + Teto↔Alvo switch + live R$ preview (% × receita)    │
  │  Reservas: ReservaCard × N (saldo hero + ReservaProgress if alvo)          │
  │    SaidaForm (valor ≤ saldo, client+server) · ReservaLedgerTable           │
  │  transacao-form: when categoria==="Reserva" ► ReservaPicker conditional    │
  └───────┬───────────────────────────────────────────────┬───────────────────┘
          │ form submit / saída / aporte                    │ navigation (?mes=, tab)
          ▼                                                 ▼
  ┌──────────────────────────────────┐   ┌──────────────────────────────────────┐
  │  SERVER ACTIONS ('use server')    │   │  RSC PAGES (read views, RLS-scoped)   │
  │  upsertBudgetTarget (BUD-01)      │   │  dashboard: v_adherence_month / _ytd  │
  │  deleteBudgetTarget               │   │  reservas:  reservas + v_reserva_bal  │
  │  createReserva/update/delete (RSV)│   │  reserva detail: reserva_ledger rows  │
  │  createTransactionWithReserva     │   │   parse ?mes → monthBounds;           │
  │    (RSV-02: txn + ledger 'in')    │   │   Anual → civil-year bounds (SP)      │
  │  registerSaida → RPC (RSV-04)     │   └──────────────────┬────────────────────┘
  │   └─ Zod → ownership re-derive →  │                      │
  │      mutate → revalidatePath      │                      │
  └──────────────┬────────────────────┘                     │
                 ▼                                           ▼
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  SUPABASE Postgres (RLS: (select auth.uid()) = user_id everywhere)         │
  │  budget_targets (unique user_id,category_id)  reservas  reserva_ledger      │
  │  RPC register_reserva_saida(reserva, amount, …)  SECURITY INVOKER, atomic   │
  │  VIEW v_reserva_balance   = Σ(in) − Σ(out) per reserva                       │
  │  VIEW v_adherence_month   = spend_or_alloc ÷ v_income_month vs budget %      │
  │  VIEW v_adherence_ytd     = accumulated spend ÷ accumulated income vs %      │
  │     (alocação categories Investimentos+Reserva ROLL UP TOGETHER — RSV-03)   │
  │  reuses: v_income_month, v_category_totals (Phase 2, security_invoker)      │
  └───────────────────────────────────────────────────────────────────────────┘
```

File-to-implementation mapping lives in the Component Responsibilities table, not the diagram.

### Recommended Project Structure
```
src/
├── app/(app)/
│   ├── dashboard/page.tsx     # RSC: real metas/aderência (replaces placeholder)
│   │                          #   reads v_adherence_month for ?mes, v_adherence_ytd for the year
│   ├── reservas/page.tsx      # RSC: reservas + v_reserva_balance; new nav item
│   └── reservas/[id]/page.tsx # (or a sheet) RSC: one reserva's ledger + saldo
├── actions/
│   ├── budget-targets.ts      # upsertBudgetTarget / deleteBudgetTarget (BUD-01)
│   ├── reservas.ts            # create/update/delete reserva, registerSaida (RSV-01/04/05)
│   └── transactions.ts        # EXTEND: createTransactionWithReserva (RSV-02) + edit/undo aporte
├── lib/
│   ├── month.ts               # EXTEND: yearBounds(year)/currentYear() in Sao_Paulo (BUD-03 YTD)
│   ├── adherence.ts           # NEW (optional): status→token mapping (presentation only)
│   └── schemas/
│       ├── budget-target.ts   # NEW: percent 0–100 (or bp 0–10000) + direction enum
│       └── reserva.ts         # NEW: nome + alvo (optional) + saida (valor) schemas
├── components/
│   ├── adherence-bar.tsx      # NEW custom: track + direction-aware fill + meta-marker tick
│   ├── adherence-row.tsx      # NEW: CategoryBadge + bar + R$ + % + meta% + status
│   ├── adherence-summary-strip.tsx  # NEW
│   ├── meta-dialog.tsx        # NEW: % + Teto/Alvo switch + live R$ preview
│   ├── reserva-card.tsx       # NEW
│   ├── reserva-progress.tsx   # NEW: wraps shadcn progress (only if alvo)
│   ├── reserva-ledger-table.tsx # NEW
│   ├── reserva-form.tsx       # NEW
│   ├── saida-form.tsx         # NEW
│   ├── reserva-picker.tsx     # NEW: "qual reserva?" select + "+ Nova reserva"
│   ├── transacao-form.tsx     # EXTEND: conditional ReservaPicker when categoria=Reserva
│   └── app-sidebar.tsx        # EXTEND: add Reservas nav item; Dashboard now real
└── types/database.types.ts    # REGENERATE after migrations
supabase/migrations/
│   ├── 0011_budget_targets.sql        # table + RLS + index + unique(user_id,category_id)
│   ├── 0012_reservas.sql              # reservas + reserva_ledger + RLS + indexes
│   ├── 0013_adherence_views.sql       # v_adherence_month + v_adherence_ytd (security_invoker)
│   ├── 0014_reserva_balance_view.sql  # v_reserva_balance (security_invoker)
│   └── 0015_register_reserva_saida.sql# atomic saída RPC (security invoker)
```

### Pattern 1: `budget_targets` table + direction default-from-kind (BUD-01)
**What:** One meta per category: a percent of net income and a direction (`teto` for consumo, `alvo` for alocação). The direction defaults from the category's `kind` but is user-editable.
**When to use:** Per-category percentage targets.
**SQL sketch (`0011_budget_targets.sql`) — verbatim Phase-2 RLS shape:**
```sql
-- 0011_budget_targets.sql
-- One meta per category: percent of net income + direction. Direction default is
-- a business rule (consumo→teto, alocacao→alvo) applied in the action, NOT a DB
-- default, because it depends on the referenced category's kind. Same uniform RLS
-- shape as Phase 1/2: (select auth.uid()) = user_id USING+WITH CHECK, TO authenticated,
-- DML grants + user_id index. category_id FK ON DELETE CASCADE: removing a category
-- legitimately removes its meta (a meta has no value without its category — unlike a
-- transaction, which must be preserved → that one is RESTRICT). (BUD-01)

create table if not exists public.budget_targets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  -- Integer basis-points (3000 = 30.00%): exact, no float, consistent with the
  -- "no float in money" discipline. 0 < bp <= 10000 by domain rule (a single
  -- category meta of >100% is nonsensical; UI soft-warns when the SUM of tetos >100%).
  percent_bp   int  not null check (percent_bp > 0 and percent_bp <= 10000),
  direction    text not null check (direction in ('teto','alvo')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One meta per category per user (BUD-01). Upsert keys on this.
  unique (user_id, category_id)
);

create index if not exists budget_targets_user_idx on public.budget_targets (user_id);

alter table public.budget_targets enable row level security;
grant select, insert, update, delete on public.budget_targets to authenticated, service_role;

drop policy if exists "own budget_targets" on public.budget_targets;
create policy "own budget_targets" on public.budget_targets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```
> **Direction default lives in the action, not the DB.** When the user opens the MetaDialog for a category, prefill `direction` from the category's `kind` (`consumo→teto`, `alocacao→alvo`); the user may flip it. The action validates the final value against the enum. Do NOT add a DB trigger to set it — the default is a UI affordance, the user's choice is authoritative.

### Pattern 2: Monthly adherence view with alocação grouping (BUD-02, RSV-03)
**What:** Per-meta adherence = `(spend or allocation for the period) ÷ (net income × meta%)` rendered as a % of the target, with a `status` derived from the 80/100 thresholds **and** the direction. The alocação side rolls Investimentos + Reserva **together** so aportes count as investment allocation, never consumption.
**When to use:** The dashboard Mensal view.
**SQL sketch (`0013_adherence_views.sql`):**
```sql
-- 0013_adherence_views.sql
-- Adherence computed in SQL inside the RLS boundary. security_invoker = true is
-- MANDATORY (PG 15+, PG 17 local) — without it the view runs as definer and leaks
-- every user's sums (proven by view-leak.test.ts in Phase 2). (BUD-02/03/04, RSV-03)
--
-- CRITICAL (RSV-03, locked): adherence is computed PER CATEGORY for consumo (teto)
-- metas, but the alocação metas (Investimentos + Reserva) aggregate TOGETHER. The
-- "realized" number for an alocação meta is the sum of ALL alocacao-kind spend in the
-- period, so a reserva aporte (a transaction with category Reserva, kind alocacao)
-- counts as investment allocation and NEVER as consumo spend. The view below carries
-- the category's kind so the app groups alocacao rows into one meta line; the
-- denominator is always v_income_month for the same period (receita líquida).

create or replace view public.v_adherence_month
  with (security_invoker = true) as
  with income as (
    select user_id, month_key, total_cents as income_cents
    from public.v_income_month
  ),
  spend as (
    -- per (user, month, category): realized cents + the category kind
    select ct.user_id, ct.month_key, ct.category_id, c.kind,
           ct.total_cents as realized_cents
    from public.v_category_totals ct
    join public.categories c on c.id = ct.category_id
  )
  select
    bt.user_id,
    s.month_key,
    bt.category_id,
    c.kind,
    c.name as category_name,
    bt.percent_bp,
    bt.direction,
    i.income_cents,
    s.realized_cents,
    -- meta in cents = income × percent_bp / 10000, rounded HALF-UP once (Pitfall 1)
    (i.income_cents * bt.percent_bp + 5000) / 10000          as meta_cents,
    -- adherence ratio in basis-points of the meta (realized ÷ meta), guarded /0
    case when (i.income_cents * bt.percent_bp) = 0 then null
         else (s.realized_cents * 10000 * 10000)
              / nullif(i.income_cents * bt.percent_bp, 0)
    end                                                       as adherence_bp
  from public.budget_targets bt
  join public.categories c on c.id = bt.category_id
  left join spend  s on s.user_id = bt.user_id and s.category_id = bt.category_id
  left join income i on i.user_id = bt.user_id and i.month_key   = s.month_key;
  -- NOTE: this sketch shows the per-category skeleton. The alocação GROUPING
  -- (Investimentos + Reserva summed) is applied in the app OR via a second
  -- grouped CTE that sums realized_cents over kind='alocacao' and attaches it to
  -- the alocação meta(s). Planner: decide grouping locus (see Open Question 1) but
  -- the INVARIANT is fixed — aporte realized cents land ONLY in the alocação total.

grant select on public.v_adherence_month to authenticated;
```
> The `status` (No limite / Aproximando / Estourou / Atingido) is a pure function of `adherence_bp` + `direction` and is cheap to compute either in a final `case` in the view or in `lib/adherence.ts` at the display edge. UI-SPEC asks for both a color token AND a text label + glyph, so the app needs the raw `adherence_bp` + `direction` regardless — compute the label app-side from those two.

### Pattern 3: YTD adherence — same ledger, guaranteed consistent (BUD-03)
**What:** The annual view is NOT a separate meta. It applies the *same* `percent_bp` to the *accumulated* net income of the civil year and divides the *accumulated* realized cents over the same `[startOfYear .. now]` window. Because both views read the same `income_occurrences` / `transactions` and the same `budget_targets`, they cannot diverge.
**SQL sketch (same migration):**
```sql
create or replace view public.v_adherence_ytd
  with (security_invoker = true) as
  with year_income as (
    select user_id,
           left(month_key, 4) as year,
           sum(total_cents)::bigint as income_cents
    from public.v_income_month
    group by user_id, left(month_key, 4)
  ),
  year_spend as (
    select t.user_id,
           to_char(t.occurred_on, 'YYYY') as year,
           t.category_id,
           sum(t.amount_cents)::bigint as realized_cents
    from public.transactions t
    group by t.user_id, to_char(t.occurred_on, 'YYYY'), t.category_id
  )
  select
    bt.user_id, ys.year, bt.category_id, c.kind, c.name as category_name,
    bt.percent_bp, bt.direction,
    yi.income_cents, ys.realized_cents,
    (yi.income_cents * bt.percent_bp + 5000) / 10000 as meta_cents,
    case when (yi.income_cents * bt.percent_bp) = 0 then null
         else (ys.realized_cents * 10000 * 10000)
              / nullif(yi.income_cents * bt.percent_bp, 0)
    end as adherence_bp
  from public.budget_targets bt
  join public.categories c on c.id = bt.category_id
  left join year_spend  ys on ys.user_id = bt.user_id and ys.category_id = bt.category_id
  left join year_income yi on yi.user_id = bt.user_id and yi.year = ys.year;

grant select on public.v_adherence_ytd to authenticated;
```
> **Consistency proof:** identical `percent_bp`, identical row source (`v_income_month` / `transactions`), identical alocação grouping rule, identical rounding. The ONLY difference is the window (`month_key` vs `year`). A test must assert that for a single-month year, `v_adherence_month` and `v_adherence_ytd` produce the same `adherence_bp` per category (see Validation Architecture).

### Pattern 4: `reservas` + `reserva_ledger` + derived balance (RSV-01, RSV-05)
**What:** A reserva is a named bucket with an optional `alvo_cents`. Its ledger is append-only `in`/`out` entries with positive `amount_cents`. Balance is **always** `Σ in − Σ out` via a `security_invoker` view — never a stored column.
**SQL sketch (`0012_reservas.sql` + `0014_reserva_balance_view.sql`):**
```sql
-- 0012_reservas.sql
create table if not exists public.reservas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  alvo_cents  bigint check (alvo_cents is null or alvo_cents > 0),  -- OPTIONAL target
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists reservas_user_idx on public.reservas (user_id);

create table if not exists public.reserva_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  reserva_id     uuid not null references public.reservas(id) on delete cascade,
  kind           text not null check (kind in ('in','out')),
  amount_cents   bigint not null check (amount_cents > 0),   -- ALWAYS positive; sign from kind
  -- Links a "Reserva"-classified transaction to its aporte entry. ON DELETE SET NULL:
  -- if the source transaction is deleted, the ledger entry survives but unlinks.
  -- (RSV-02 edit/undo re-derives balance; see transactions action for the undo path.)
  transaction_id uuid references public.transactions(id) on delete set null,
  occurred_on    date not null,
  note           text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists reserva_ledger_reserva_idx on public.reserva_ledger (reserva_id);
create index if not exists reserva_ledger_user_idx    on public.reserva_ledger (user_id);
-- One aporte entry per source transaction (idempotent re-link; an edit replaces it).
create unique index if not exists reserva_ledger_txn_uniq
  on public.reserva_ledger (transaction_id) where transaction_id is not null;

alter table public.reservas       enable row level security;
alter table public.reserva_ledger enable row level security;
grant select, insert, update, delete on public.reservas       to authenticated, service_role;
grant select, insert, update, delete on public.reserva_ledger to authenticated, service_role;

drop policy if exists "own reservas" on public.reservas;
create policy "own reservas" on public.reservas
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own reserva_ledger" on public.reserva_ledger;
create policy "own reserva_ledger" on public.reserva_ledger
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```
```sql
-- 0014_reserva_balance_view.sql — derived balance, security_invoker (RSV-05)
create or replace view public.v_reserva_balance
  with (security_invoker = true) as
  select r.user_id,
         r.id   as reserva_id,
         r.nome,
         r.alvo_cents,
         coalesce(sum(case when l.kind = 'in'  then l.amount_cents else 0 end), 0)::bigint
         - coalesce(sum(case when l.kind = 'out' then l.amount_cents else 0 end), 0)::bigint
           as saldo_cents
  from public.reservas r
  left join public.reserva_ledger l on l.reserva_id = r.id
  group by r.user_id, r.id, r.nome, r.alvo_cents;

grant select on public.v_reserva_balance to authenticated;
```

### Pattern 5: Atomic saída validation — RPC, never-negative, race-safe (RSV-04)
**What:** A withdrawal must never leave a negative balance. A "read balance, then insert if ok" in app code has a TOCTOU race; do it in one transaction in an RPC (mirrors `reassign_and_delete_category`'s `security invoker` shape).
**SQL sketch (`0015_register_reserva_saida.sql`):**
```sql
-- 0015_register_reserva_saida.sql
-- SECURITY INVOKER so the balance read + the insert both run under the CALLER's RLS:
-- a forged reserva_id belonging to another user sees no rows → balance 0 → aborts.
-- The whole check+insert is ONE statement-level transaction (a function body), so a
-- concurrent saída cannot pass the check and then overdraw. (RSV-04 / never-negative)

create or replace function public.register_reserva_saida(
  p_reserva_id uuid,
  p_amount_cents bigint,
  p_occurred_on date,
  p_note text default ''
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_saldo   bigint;
  v_id      uuid;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido' using errcode = 'P0001';
  end if;

  -- Ownership + current balance in one RLS-scoped read. A foreign/nonexistent
  -- reserva returns no row → treat as not-found and abort (IDOR-safe).
  select saldo_cents into v_saldo
  from public.v_reserva_balance
  where reserva_id = p_reserva_id and user_id = v_user_id;

  if v_saldo is null then
    raise exception 'Reserva inexistente ou sem permissão' using errcode = 'P0001';
  end if;
  if p_amount_cents > v_saldo then
    raise exception 'Saída maior que o saldo da reserva' using errcode = 'P0001';
  end if;

  insert into public.reserva_ledger
    (user_id, reserva_id, kind, amount_cents, occurred_on, note)
  values
    (v_user_id, p_reserva_id, 'out', p_amount_cents, p_occurred_on, coalesce(p_note,''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.register_reserva_saida(uuid, bigint, date, text) to authenticated;
```
> **Why the balance read inside the function is sufficient:** the `v_reserva_balance` view is `security_invoker`, so inside this `security invoker` function it runs under the caller's RLS — a foreign reserva yields `null`. The check and the insert are in the same function-body transaction, so there's no window for a concurrent overdraw. The action still re-derives ownership for a friendly error, but the RPC is the authoritative guard.

### Pattern 6: Aporte from a "Reserva" transaction — Server Action, not trigger (RSV-02, RSV-03)
**What:** When a transaction is classified into the seed "Reserva" category, the user picks WHICH reserva, and the action writes both the transaction and a linked `in` ledger entry. A DB trigger cannot do this — it can't know the chosen bucket.
**Action signature + skeleton (`actions/transactions.ts`, extends existing):**
```ts
// createTransactionWithReserva — RSV-02. When categoria is the seed "Reserva"
// (kind='alocacao'), the form sends a reservaId; the action inserts the transaction
// AND a linked 'in' ledger entry. Both category_id AND reserva_id are re-derived as
// owner-scoped server-side BEFORE writing (FKs are not RLS-aware — Phase-2 IDOR fix).
export async function createTransactionWithReserva(
  formData: FormData,                 // description, amount, categoryId, occurredOn, reservaId?
): Promise<ActionResult> {
  // 1. Zod parse (transactionSchema + optional reservaId uuid)
  // 2. parseBRLToCents(amount) → amountCents  (throws → friendly money error)
  // 3. getClaims() → userId  (Sessão expirada otherwise)
  // 4. assertOwnedCategories(supabase, [categoryId])     // existing helper
  // 5. resolve whether categoryId is the user's "Reserva" (kind='alocacao', name='Reserva'):
  //      const isReserva = await isReservaCategory(supabase, categoryId)
  //      if (isReserva && !reservaId) return { error: 'Selecione uma reserva.' }
  //      if (isReserva && !(await assertOwnedReserva(supabase, reservaId))) // NEW helper
  //        return { error: 'Reserva inválida.' }
  // 6. insert transaction → returning id
  // 7. if (isReserva) insert reserva_ledger { reserva_id, kind:'in', amount_cents,
  //        transaction_id: txn.id, occurred_on }  (unique txn link makes re-run idempotent)
  // 8. revalidatePath('/extrato'); revalidatePath('/reservas'); revalidatePath('/dashboard')
  // 9. return { ok: true }
}
```
> **`assertOwnedReserva` is the verbatim Phase-2 IDOR pattern** applied to `reserva_id`: `select id from reservas where id = $1` under the RLS-active client; 0 rows ⇒ not owned ⇒ reject. This is mandatory because the `reserva_ledger.reserva_id` FK is satisfied by ANY user's reserva globally (the `category-idor.test.ts` lesson, applied to reservas).
>
> **Edit/undo (UI-SPEC §4):** if a transaction is re-classified AWAY from Reserva (or deleted), its linked ledger entry must be removed so the balance re-derives. The `unique(transaction_id)` index + `on delete set null` make this clean: `updateTransaction` deletes any `reserva_ledger` row where `transaction_id = id` when the new category is not Reserva, and re-inserts when it is. Surface honestly — no silent orphan.

### Anti-Patterns to Avoid
- **Storing `reservas.balance` as a mutable column** — drifts on retry/concurrency. Balance is always `Σ in − Σ out` (ARCHITECTURE AP-1, RSV-05 locked).
- **Counting a reserva aporte as consumo spend** — the single worst correctness bug in this phase. An aporte is `kind='alocacao'`; it must land ONLY in the alocação total (RSV-03). Never sum it into a consumo teto.
- **App-level "read balance then insert"** for saída — TOCTOU race overdraws. Use the atomic RPC (Pattern 5).
- **A view without `security_invoker = true`** — runs as definer, leaks every user's sums (Phase-2 `view-leak.test.ts` proves the fix). Mandatory on `v_adherence_month`, `v_adherence_ytd`, `v_reserva_balance`.
- **Writing `reserva_id`/`category_id` from the client without an ownership re-derive** — FKs are not RLS-aware (Phase-2 IDOR). Re-derive owner-scoped before every FK write.
- **Rounding each category's % independently and expecting them to sum to 100%** — integer-divide once, round half-up once, at the display edge (Pitfall 1).
- **A separate annual meta** — would let monthly and annual diverge. One `percent_bp`, two windows (BUD-03 locked).
- **Hand-formatting money or showing `NaN%`** — go through `money.ts`; guard /0 with the "sem receita no período" copy (UI-SPEC).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reserva balance | A mutable counter column updated per entry | `v_reserva_balance` view (Σ in − Σ out) | Counters drift; the ledger is the truth (RSV-05) |
| Saída never-negative | App-side check-then-insert | `register_reserva_saida` RPC (atomic) | TOCTOU race overdraws under concurrency |
| Adherence % + thresholds | JS division over fetched rows | `security_invoker` adherence views | RLS-inherited, divides once in SQL, no over-fetch, no `NaN%` leak |
| Monthly↔annual consistency | Two independent meta tables/calcs | One `percent_bp`, two windows over the same ledger | Two sources of truth diverge (BUD-03) |
| Ownership of client `reserva_id`/`category_id` | "It's a valid UUID, write it" | RLS-scoped `select … where id = $1` (Phase-2 `assertOwnedCategories` clone) | FKs are not RLS-aware — IDOR (Phase-2 lesson) |
| BRL parse/format, bigint-safe | New parser / `parseFloat` | `src/lib/money.ts` | Hardened against NaN/0 + MAX_SAFE_INTEGER (Phase 1) |
| Civil-year (YTD) boundaries in `America/Sao_Paulo` | Manual UTC year math | EXTEND `lib/month.ts` with `yearBounds`/`currentYear` (date-fns-tz) | Year boundary slip near 31-Dec midnight; one owner module |
| Form ↔ action validation | Two validators | One Zod schema per surface | Contract can't drift (Phase-1/2 invariant) |
| Percent storage | `float`/`numeric` with naive rounding | Integer basis-points (`percent_bp`, 0–10000) | Exact; consistent with "no float in money" |

**Key insight:** Phase 3 introduces almost no new infrastructure — it is Phase-1/2 patterns (RLS shape, `security_invoker` views, atomic `security invoker` RPC, IDOR ownership re-derive, bigint-centavos, Zod-at-the-boundary actions) applied to budget targets and reservas. The only genuinely new *design* decisions (denominator = net income of the period; alocação grouping; monthly==YTD consistency) are all pre-locked by CONTEXT. Resist hand-rolling anything for balances, rounding, or money.

## Common Pitfalls

### Pitfall 1: Percentage / meta-cents rounding drift
**What goes wrong:** `meta_cents = income × percent%` computed with floats, or each category's % rounded independently, so the displayed parts don't reconcile (e.g. tetos shown as summing to 101%).
**Why it happens:** Float multiplication of cents, or `Math.round` per category.
**How to avoid:** Store the percent as integer basis-points (`percent_bp`, 3000 = 30%). Compute `meta_cents = (income_cents * percent_bp + 5000) / 10000` in **integer** SQL (half-up, rounded once). Render the realized % at the display edge with `Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1})` from the raw `adherence_bp`. Never persist a rounded percent. The "sum of tetos > 100%" warning compares `SUM(percent_bp) > 10000` exactly.
**Warning signs:** A meta-cents value off by a centavo from a hand calculation; tetos summing to 99/101%.

### Pitfall 2: Division by zero when there's no income in the period
**What goes wrong:** A month/year with metas but zero receita líquida produces `realized ÷ 0` → `NaN%`/`Infinity%` leaking to the UI.
**Why it happens:** Unguarded division in the view or app.
**How to avoid:** In the view, `case when income_cents = 0 then null … / nullif(…, 0)`; the app renders the UI-SPEC copy "Sem receita líquida em {período} — as metas em % não podem ser calculadas." when `adherence_bp IS NULL` / `meta_cents = 0`. Never show `NaN%`.
**Warning signs:** `NaN%` or `Infinity%` on the dashboard for a no-income month.

### Pitfall 3: Reserva aporte double-counted (the locked-decision trap)
**What goes wrong:** A "Reserva" transaction's amount is summed into BOTH the consumo spend (because it's a `transaction`) AND the alocação allocation — inflating spend and corrupting both metas.
**Why it happens:** The adherence view sums `transactions` per category without respecting the `kind`-group rule; or the aporte is recorded as a consumo expense.
**How to avoid:** The seed "Reserva" category is `kind='alocacao'`. The adherence view's consumo (teto) totals must filter to `kind='consumo'`; the alocação (alvo) total sums `kind='alocacao'` (Investimentos + Reserva) together. An aporte transaction never appears in a consumo total. **Add a test that asserts an aporte raises the alocação realized cents and leaves every consumo total unchanged** (RSV-03).
**Warning signs:** Consumption adherence jumps when the user makes a reserva aporte; the same cents appear in two meta lines.

### Pitfall 4: Negative-balance race on concurrent saídas
**What goes wrong:** Two withdrawals issued near-simultaneously both read the old balance, both pass the `≤ saldo` check, and the reserva goes negative.
**Why it happens:** App-level check-then-insert (TOCTOU).
**How to avoid:** `register_reserva_saida` RPC reads the balance and inserts the `out` entry in one function-body transaction (Pattern 5). The client + form also block over-balance submits for UX, but the RPC is authoritative.
**Warning signs:** A reserva with `saldo_cents < 0`; two `out` entries whose sum exceeds prior balance.

### Pitfall 5: View bypasses RLS (cross-user leak)
**What goes wrong:** An adherence/balance view created without `security_invoker` returns every user's sums.
**Why it happens:** Postgres views default to definer semantics for RLS.
**How to avoid:** `with (security_invoker = true)` on `v_adherence_month`, `v_adherence_ytd`, `v_reserva_balance`. Extend the existing `view-leak.test.ts` to assert user B reads zero of user A's adherence/balance rows.
**Warning signs:** A view returns rows for another `user_id`.

### Pitfall 6: IDOR on `reserva_id` / `category_id` FK target
**What goes wrong:** A forged `reserva_id` (another user's bucket) is written as the `reserva_ledger.reserva_id` FK — the FK is satisfied globally, so the aporte/saída attaches to a foreign reserva.
**Why it happens:** Validating only that the id is a UUID; FKs are not RLS-aware (the exact Phase-2 `category-idor.test.ts` finding).
**How to avoid:** `assertOwnedReserva` (RLS-scoped `select … where id = $1`, 0 rows ⇒ reject) before any ledger write; the saída RPC is hardened the same way (balance read returns null for a foreign reserva). Test both halves: raw insert accepts a foreign id (proves RLS alone is insufficient), ownership check rejects it.
**Warning signs:** A ledger entry whose `reserva_id` belongs to another user (only visible with the service client in a test).

### Pitfall 7: YTD/monthly divergence from inconsistent windows or rounding
**What goes wrong:** The annual view uses a different rounding, a different income source, or a different alocação grouping than the monthly view, so the two read inconsistently.
**Why it happens:** Copy-paste drift between the two view definitions.
**How to avoid:** Both views use the identical `percent_bp`, the identical `(income × bp + 5000) / 10000` rounding, the identical alocação grouping rule, and the same base tables (`v_income_month` / `transactions`). Add a test: for a year with one populated month, per-category `adherence_bp` from `v_adherence_month` equals that from `v_adherence_ytd`.
**Warning signs:** Mensal and Anual show different % for the same single-month data.

## Runtime State Inventory

> **Greenfield-additive phase** (new tables, new views, new RPC, new screens). No existing runtime state is renamed or migrated. Section completed per protocol — every category answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — only NEW tables (`budget_targets`, `reservas`, `reserva_ledger`). Existing `categories`/`transactions`/`income_*` untouched. The seed "Reserva"/"Investimentos" categories (kind `alocacao`) already exist from Phase 1 `handle_new_user()` — reused, not modified. | none (verified by reading `0002_categories.sql`) |
| Live service config | None — no external services (no n8n, Datadog, Cloudflare, etc.) are configured for this app. | none |
| OS-registered state | None — no Task Scheduler/pm2/launchd/systemd registrations reference this app. | none |
| Secrets/env vars | None new — same `NEXT_PUBLIC_SUPABASE_*` as Phases 1-2; no new keys. | none |
| Build artifacts | `src/types/database.types.ts` goes stale after migrations 0011–0015. | regenerate via `npm run gen:types` (already scripted) |

**Note:** the only edit to existing code is *additive*: extend `actions/transactions.ts` (new `createTransactionWithReserva` + aporte-undo branch in `updateTransaction`/`deleteTransaction`), extend `transacao-form.tsx` (conditional `ReservaPicker`), extend `app-sidebar.tsx` (Reservas nav), and extend `lib/month.ts` (year helpers). None rename or move existing symbols.

## Code Examples

### Server Action: upsert budget target (BUD-01)
```ts
// actions/budget-targets.ts
'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const targetSchema = z.object({
  categoryId: z.string().uuid('Selecione uma categoria'),
  percentBp: z.number().int().gt(0).lte(10000),        // 0 < bp <= 10000 (0.01%..100%)
  direction: z.enum(['teto', 'alvo']),
})
export type ActionResult = { error: string } | { ok: true }

export async function upsertBudgetTarget(input: z.infer<typeof targetSchema>): Promise<ActionResult> {
  const parsed = targetSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // IDOR: re-derive category ownership server-side before writing the FK.
  const { data: owned } = await supabase
    .from('categories').select('id').eq('id', parsed.data.categoryId)
  if (!owned || owned.length !== 1) return { error: 'Categoria inválida.' }

  const { error } = await supabase.from('budget_targets').upsert({
    user_id: userId,
    category_id: parsed.data.categoryId,
    percent_bp: parsed.data.percentBp,
    direction: parsed.data.direction,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,category_id' })
  if (error) return { error: 'Não foi possível salvar a meta.' }

  revalidatePath('/dashboard')
  return { ok: true }
}
```

### Server Action: register saída via atomic RPC (RSV-04)
```ts
// actions/reservas.ts
'use server'
export async function registerSaida(input: {
  reservaId: string; amount: string; occurredOn: string; note?: string
}): Promise<ActionResult> {
  // 1. Zod: reservaId uuid, occurredOn date regex, note optional
  // 2. parseBRLToCents(amount) → amountCents (throws → 'Valor monetário inválido.')
  // 3. getClaims() → userId (else 'Sessão expirada.')
  const supabase = await createClient()
  // 4. IDOR re-derive: assertOwnedReserva(supabase, reservaId) → else 'Reserva inválida.'
  const { error } = await supabase.rpc('register_reserva_saida', {
    p_reserva_id: input.reservaId,
    p_amount_cents: amountCents,
    p_occurred_on: input.occurredOn,
    p_note: input.note ?? '',
  })
  // 5. The RPC raises P0001 'Saída maior que o saldo da reserva' on overdraw →
  //    map to the friendly UI-SPEC copy; any other error → generic fallback.
  if (error) {
    if (error.message.includes('saldo')) return { error: 'A saída não pode ser maior que o saldo da reserva.' }
    return { error: 'Não foi possível registrar a saída.' }
  }
  revalidatePath('/reservas')
  return { ok: true }
}
```

### Ownership helper for reservas (Phase-2 IDOR pattern, applied to reserva_id)
```ts
// actions/reservas.ts — verbatim clone of assertOwnedCategories for reservas
async function assertOwnedReserva(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('reservas').select('id').eq('id', id)
  if (error || !data) return false
  return data.length === 1   // RLS-scoped: a foreign id returns 0 rows
}
```

### Civil-year helper (EXTEND lib/month.ts, for YTD — BUD-03)
```ts
// lib/month.ts — additions
import { formatInTimeZone } from 'date-fns-tz'
const TZ = 'America/Sao_Paulo'
/** Current civil year in Sao_Paulo as 'YYYY' — the default Anual window. */
export function currentYear(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy')
}
/** First and last civil day of the year (YYYY-MM-DD) for the YTD window. */
export function yearBounds(year: string): { first: string; last: string } {
  return { first: `${year}-01-01`, last: `${year}-12-31` }
}
```

### Direction default-from-kind (form prefill — BUD-01)
```ts
// in MetaDialog: prefill direction from the category's kind; user can flip it.
const defaultDirection = category.kind === 'alocacao' ? 'alvo' : 'teto'
// live R$ preview = % of net income, formatted via money.ts:
//   formatCents(Math.round(incomeCents * percentBp / 10000))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Views default to definer rights (RLS bypass) | `with (security_invoker = true)` on every aggregation view | PG 15 | Mandatory for all three new views |
| Stored mutable balance counter | Derived `Σ in − Σ out` ledger view | — (domain best practice) | RSV-05 locked; no drift |
| App-level check-then-write for limits | Atomic `security invoker` RPC | — | Race-safe saída validation |
| `float`/`numeric` percent + naive rounding | Integer basis-points, round-half-up once in SQL | — | Exact %; no drift |
| Separate annual budget table | One `percent_bp`, two windowed views | — | Monthly↔annual consistency (BUD-03) |

**Deprecated/outdated:** none introduced this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Percent stored as integer basis-points (`percent_bp`, 0–10000) rather than `numeric` | Pattern 1 / Pitfall 1 | LOW — CONTEXT says "percent" without a type; basis-points is the zero-float choice consistent with the locked "no float in money" discipline. A `numeric(5,2)` column also works if treated as exact-at-display; planner may swap, but tests must still assert no rounding drift. |
| A2 | `budget_targets.category_id` FK is `ON DELETE CASCADE` (a meta dies with its category) | Pattern 1 | LOW — a meta has no meaning without its category, unlike a transaction (which is RESTRICT to preserve history). If the user expects a "deleting a category warns about its meta" flow, that's UI sugar; CASCADE is the safe default. |
| A3 | Alocação grouping (Investimentos + Reserva summed) is keyed on `kind='alocacao'`, not on category name | Pattern 2 / RSV-03 | LOW — CONTEXT says "categorias de ALOCAÇÃO somam JUNTAS"; `kind` is the existing discriminator (Phase-1 seed marks both as `alocacao`). Keying on name would break if the user renames. **Planner: confirm the alocação meta is rendered as ONE combined line (or a parent row) per UI-SPEC §Dashboard.** |
| A4 | YTD window = civil calendar year `[YYYY-01-01 .. now]` in `America/Sao_Paulo` | Pattern 3 | LOW — UI-SPEC labels it "Acumulado de {ano} (jan–{mês})", i.e. calendar year, not rolling 12 months. |
| A5 | The "Reserva" category is identified by `kind='alocacao'` AND `name='Reserva'` (the seed) for the aporte sub-flow trigger | Pattern 6 / RSV-02 | MEDIUM — the trigger fires on the seed "Reserva" category. If the user renames or deletes it, the sub-flow needs a stable handle. **Open Question 2** — recommend a stable marker (see below) rather than matching on the literal name. |
| A6 | `reserva_ledger.transaction_id` is `unique` (one aporte entry per source transaction) with `ON DELETE SET NULL` | Pattern 4 / Pattern 6 | LOW — makes re-link idempotent and supports the edit/undo path; SET NULL preserves history if the txn is hard-deleted (the balance re-derives). |
| A7 | Saídas are standalone (no `transaction_id`); only aportes link to a transaction in v1 | Pattern 4/5 | LOW — UI-SPEC §3 registers a saída via `SaidaForm` (valor/data/descrição), not via a transaction. A saída is a reserva movement that does NOT affect spend metas (RSV-04 locked). |

**No HIGH-risk assumptions.** The only MEDIUM (A5) is the "Reserva" category handle — resolved in Open Question 2.

## Open Questions

1. **Locus of the alocação grouping (Investimentos + Reserva summed)**
   - What we know: the realized cents for the alocação meta must be the SUM of all `kind='alocacao'` spend (RSV-03 locked); aportes must never reach a consumo total.
   - What's unclear: whether to roll the alocação sum up inside the view (a `kind='alocacao'`-grouped CTE attached to the alocação meta) or in the app (fetch per-category rows, sum the alocação ones for the combined line).
   - Recommendation: **do the grouping in the view** so the invariant lives in SQL inside the RLS boundary and the app stays a pure formatter — but the per-category breakdown is still useful for a tooltip ("inclui aportes de reserva"). Expose both: a per-category row set AND the alocação-group total. Either way the INVARIANT is fixed; this is a structure choice the planner finalizes. (Tag: the test in Validation Architecture pins the behavior regardless of locus.)

2. **Stable handle for the "Reserva" category (aporte trigger)**
   - What we know: the aporte sub-flow fires when a transaction is classified into the seed "Reserva" category (RSV-02); the seed marks it `kind='alocacao'`, `name='Reserva'`.
   - What's unclear: how to identify it robustly if the user renames it (CAT-02 allows rename) — matching on the literal name `'Reserva'` is brittle.
   - Recommendation: add a stable, nullable marker — e.g. an `is_reserva boolean` flag (or a `system_key text` column) on `categories`, set `true` for the seed "Reserva" row in `handle_new_user()` and via a one-time backfill in the 0011 migration. The aporte trigger checks the flag, not the name. This is a tiny additive column (mirrors how `kind` already discriminates) and removes A5's MEDIUM risk. **Planner: decide flag vs name-match; flag is recommended.**

3. **Aporte edit/undo data semantics**
   - What we know: re-classifying a transaction away from Reserva (or deleting it) must remove the linked ledger entry so the balance re-derives (UI-SPEC §4).
   - What's unclear: exact action surface — does `updateTransaction` own the delete-old-ledger + maybe-insert-new-ledger logic, or a dedicated `syncReservaLedgerForTransaction(txnId)`?
   - Recommendation: a small internal helper `syncReservaLedgerForTransaction(supabase, txnId, newCategoryId, reservaId?)` called by both `updateTransaction` and `createTransactionWithReserva`: delete any existing entry for the txn, insert a fresh `in` if the new category is Reserva. The `unique(transaction_id)` index keeps it idempotent. `deleteTransaction` relies on `ON DELETE SET NULL` (entry survives, unlinked) OR explicitly deletes the entry — recommend explicit delete so the balance drops immediately and no orphan lingers.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (local stack) | migrations 0011–0015, type-gen, RLS/RPC tests | ✓ | 2.106.x (devDep) | — |
| Local Postgres (Docker via `supabase start`) | apply migrations + run integration tests (`security_invoker`, RPC, RLS) | ✓ | 17 (config.toml) | — |
| Node + npm | install, build, vitest | ✓ | — | — |
| `npm run gen:types` script | regenerate `database.types.ts` after migrations | ✓ | — | — |
| shadcn CLI | add `progress` component | ✓ (`shadcn` in deps) | — | hand-author a Radix-free progress div if CLI unavailable |

**Missing dependencies with no fallback:** none — Phase 3 needs only the already-present local Supabase stack and the vendored UI toolchain.
**Missing dependencies with fallback:** none. (`progress` is a vendored component, not an environment gap.)

> Reminder: the local Docker stack must be running (`supabase start`) before the RLS/RPC/integration tests; `tests/helpers/local-supabase.ts` throws a clear error otherwise.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x (jsdom env, globals) |
| Config file | `vitest.config.ts` (`@`→`src` alias; includes `src/**/*.test.{ts,tsx}` + `tests/**/*.test.ts`) |
| Quick run command | `npm test` (`vitest run`) — unit subset is sub-2s |
| Full suite command | `npm test` (integration tests need the local Supabase stack up) |
| Watch | `npm run test:watch` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUD-01 | Budget target CRUD; one-meta-per-category upsert (unique) round-trips | integration | `vitest run tests/budget-target-crud.test.ts` | ❌ Wave 0 |
| BUD-01 | Direction defaults from kind (consumo→teto, alocacao→alvo) in the action/form prefill; user override persists | unit + integration | `vitest run tests/budget-target-direction.test.ts` | ❌ Wave 0 |
| BUD-02 | `v_adherence_month` realized ÷ (income × meta%) correct; status thresholds 80/100 | integration | `vitest run tests/adherence-month.test.ts` | ❌ Wave 0 |
| BUD-02/03 | Monthly == YTD consistency: single-month year → identical `adherence_bp` per category | integration | `vitest run tests/adherence-consistency.test.ts` | ❌ Wave 0 |
| BUD-03 | `v_adherence_ytd` accumulates over the civil year (multi-month) correctly | integration | `vitest run tests/adherence-ytd.test.ts` | ❌ Wave 0 |
| BUD-04 | 80%/100% status derivation per direction (teto over/under, alvo reached) | unit | `vitest run src/lib/adherence.test.ts` | ❌ Wave 0 |
| RSV-01 | Reserva create/update/delete; alvo optional; progress only when alvo set | integration | `vitest run tests/reserva-crud.test.ts` | ❌ Wave 0 |
| RSV-02/03 | Aporte from a "Reserva" transaction creates a linked `in` ledger entry AND counts as alocação allocation, NOT consumo spend | integration | `vitest run tests/reserva-aporte.test.ts` | ❌ Wave 0 |
| RSV-04 | Saída validated `≤ saldo`; overdraw rejected; never-negative under concurrent calls | integration | `vitest run tests/reserva-saida.test.ts` | ❌ Wave 0 |
| RSV-05 | `v_reserva_balance` = Σ in − Σ out; no stored column | integration | `vitest run tests/reserva-balance.test.ts` | ❌ Wave 0 |
| IDOR | Forged `reserva_id` rejected by ownership re-derive; raw insert accepts it (proves RLS insufficient) | integration | `vitest run tests/reserva-idor.test.ts` | ❌ Wave 0 |
| View leak | User B reads ZERO of A's adherence/balance rows (all 3 new views `security_invoker`) | integration | extend `tests/view-leak.test.ts` | ⚠ extend existing |
| RLS | User B cannot read/insert/update/delete A's `budget_targets`/`reservas`/`reserva_ledger` | integration | extend `tests/rls-isolation.test.ts` `TABLES` array | ⚠ extend existing |
| money/percent | `meta_cents` rounding (half-up once); `adherence_bp`→% display; /0 → null | unit | `vitest run src/lib/adherence.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (fast unit subset <2s; integration needs the local stack up).
- **Per wave merge:** `npm test` full suite with local Supabase running.
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/budget-target-crud.test.ts` — BUD-01 CRUD + unique-upsert
- [ ] `tests/budget-target-direction.test.ts` — BUD-01 direction default + override
- [ ] `tests/adherence-month.test.ts` — BUD-02 monthly math + thresholds
- [ ] `tests/adherence-consistency.test.ts` — BUD-02/03 monthly == YTD (the consistency proof)
- [ ] `tests/adherence-ytd.test.ts` — BUD-03 multi-month accumulation
- [ ] `tests/reserva-crud.test.ts` — RSV-01
- [ ] `tests/reserva-aporte.test.ts` — RSV-02/03 (aporte → ledger `in` + counts as alocação, NOT consumo) ← **highest-value test**
- [ ] `tests/reserva-saida.test.ts` — RSV-04 (overdraw rejected; never-negative; concurrent)
- [ ] `tests/reserva-balance.test.ts` — RSV-05 (Σ in − Σ out)
- [ ] `tests/reserva-idor.test.ts` — IDOR on `reserva_id` (clone of `category-idor.test.ts`)
- [ ] `src/lib/adherence.test.ts` — status mapping + percent/rounding unit tests
- [ ] Extend `tests/view-leak.test.ts` — add `v_adherence_month`, `v_adherence_ytd`, `v_reserva_balance`
- [ ] Extend `tests/rls-isolation.test.ts` `TABLES` with `budget_targets`, `reservas`, `reserva_ledger`
- [ ] Reuse `tests/helpers/local-supabase.ts` verbatim (`serviceClient`/`userClient` two-user pattern)

*Test infrastructure (vitest, jsdom, local-supabase two-user helper, `view-leak`/`category-idor` patterns) all exist from Phases 1-2 — Wave 0 is new test files cloning proven harnesses, not new framework.*

## Security Domain

> `security_enforcement` not explicitly false → included. Personal financial data; RLS is the boundary.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Phase 1) | `@supabase/ssr` + middleware + `getClaims()` re-check (unchanged) |
| V3 Session Management | no (Phase 1) | Cookie refresh in middleware (unchanged) |
| V4 Access Control | **yes** | RLS `(select auth.uid()) = user_id` USING+WITH CHECK on `budget_targets`/`reservas`/`reserva_ledger`; `security_invoker` on all 3 views; `security invoker` saída RPC; `to authenticated` grants; **server-side ownership re-derive** of `category_id`/`reserva_id` (FKs not RLS-aware). Two-user + IDOR tests prove isolation. |
| V5 Input Validation | **yes** | Zod at every action boundary; `percent_bp` 0–10000; `parseBRLToCents` rejects bad money; `reserva_id`/`category_id` validated as UUID then owner-re-derived; date regex. |
| V6 Cryptography | no | No crypto in this phase |

### Known Threat Patterns for Next 16 + Supabase + RLS
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user read via forged id/`user_id` | Information Disclosure | RLS USING+WITH CHECK on all 3 new tables; never filter by `user_id` in app code alone |
| Adherence/balance view leaks all users' sums | Information Disclosure | `with (security_invoker = true)` on `v_adherence_month`/`v_adherence_ytd`/`v_reserva_balance` + leak test |
| IDOR: forged `reserva_id`/`category_id` FK target | Tampering / IDOR | RLS-scoped ownership re-derive before every FK write; saída RPC balance read returns null for a foreign reserva (Phase-2 lesson) |
| Negative-balance race on concurrent saídas | Tampering / Integrity | Atomic `register_reserva_saida` RPC (check + insert in one transaction) |
| Aporte double-counted as consumo + alocação | Integrity | `kind='alocacao'` grouping; consumo totals filter `kind='consumo'`; aporte test |
| Negative/zero money corrupting sums | Tampering | `check (amount_cents > 0)` (ledger) / `percent_bp > 0` (targets) + `parseBRLToCents` throw-on-invalid |
| Division-by-zero → `NaN%` in UI | Integrity | `nullif`/`case` guard in views; "sem receita" copy |
| Missing GRANTs masking RLS as false-green | Information Disclosure | `grant select,insert,update,delete … to authenticated, service_role` per table + `grant select … to authenticated` per view (Phase-1 note) |

## Sources

### Primary (HIGH confidence)
- Phase 1/2 codebase — `supabase/migrations/0002,0004,0005,0007,0008,0010`, `src/lib/{money,month}.ts`, `src/actions/{transactions,categories}.ts`, `src/components/transacao-form.tsx`, `tests/{view-leak,category-idor,helpers/local-supabase}.test.ts` — established RLS shape, `security_invoker` views, atomic `security invoker` RPC, IDOR ownership re-derive, money/month helpers, two-user test harness [VERIFIED: codebase]
- `.planning/phases/03-metas-ader-ncia-e-reservas/03-CONTEXT.md` — locked decisions (budget_targets shape, direction-from-kind, 80/100 alerts, monthly==annual via one %, alocação grouping RSV-03, reserva ledger derived balance, saída never-negative, aporte via action, IDOR re-derive) [CITED: phase docs]
- `.planning/phases/03-metas-ader-ncia-e-reservas/03-UI-SPEC.md` — screen contracts, direction-aware color semantics, ReservaPicker sub-flow, progress-only-when-alvo, copy, `progress` as the one new shadcn add [CITED: phase docs]
- `.planning/research/ARCHITECTURE.md` — derived-balance-not-stored (AP-1), SQL-views-for-aggregation (AP-5), reserva ledger model, budget % over income, `(select auth.uid())` RLS form [CITED: ARCHITECTURE.md]
- `.planning/REQUIREMENTS.md` — BUD-01..04 / RSV-01..05 definitions + Phase-3 traceability [CITED: REQUIREMENTS.md]
- `.planning/phases/02-receitas-categorias-e-lan-amentos-manuais/02-RESEARCH.md` — `security_invoker` view rationale, IDOR fix, money/month patterns, two-user test gaps [CITED: phase docs]
- `CLAUDE.md` STACK — locked versions, integer-cents, RLS non-negotiable, `security_invoker` views [CITED: CLAUDE.md]

### Secondary (MEDIUM confidence)
- PostgreSQL integer rounding (`(a*bp + 5000)/10000` half-up) — standard integer-arithmetic idiom; verify in the rounding unit test [ASSUMED → pinned by test]

### Tertiary (LOW confidence)
- none — every claim traces to a verified codebase pattern or a locked phase decision.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new npm deps; only a vendored `progress` component; all libs already in `package.json`.
- Architecture / data model: HIGH — directly extends Phase-1/2 RLS shape, `security_invoker` views, and the atomic `security invoker` RPC; every modeling decision is locked in CONTEXT or proven in the codebase.
- Adherence math (denominator, alocação grouping, monthly==YTD): HIGH on intent (CONTEXT-locked), MEDIUM on the exact view-vs-app grouping locus (Open Question 1) — but the invariant is fixed and test-pinned.
- Pitfalls: HIGH — each maps to a concrete Phase-1/2 lesson (`view-leak`, `category-idor`, `reassign_and_delete_category` race-safety) or a documented Postgres/RLS behavior.
- Tests: HIGH — harness exists; Wave 0 is new files cloning the proven two-user / view-leak / IDOR patterns.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable locked stack; no external versions to re-verify since no new deps).
