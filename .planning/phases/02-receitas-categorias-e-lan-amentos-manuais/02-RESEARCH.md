# Phase 2: Receitas, categorias e lançamentos manuais - Research

**Researched:** 2026-06-16
**Domain:** Personal-finance CRUD (receitas + categorias + transações), monthly civil-month aggregation, dense filterable table with bulk re-classify — all on the established Next 16 + Supabase + RLS + bigint-centavos foundation from Phase 1.
**Confidence:** HIGH (stack locked & verified; data-model + RLS + money + test patterns all proven in Phase 1; only new surface is two tables, two SQL views, a TanStack table, and URL-state filters — all standard).

## Summary

Phase 2 closes the manual data loop: the user records where money comes from (`incomes`: recurring templates that materialize one editable occurrence per civil month, plus ad-hoc avulsas) and where it goes (`transactions`: manual expenses with a category FK), edits categories (rename, consumo/alocação kind, optional swatch color, archive-instead-of-delete-when-used), and reads a dense filterable Extrato with month + multi-category filters and multi-row bulk re-classify. The "receita líquida do mês" computed here is the Phase 3 metas denominator.

Everything reuses Phase 1 verbatim: the RLS shape `(select auth.uid()) = user_id` USING+WITH CHECK `to authenticated` + GRANTs + `user_id` index per table; money via `src/lib/money.ts` (`parseBRLToCents`/`formatCents`); Server Actions mirroring `src/actions/auth.ts` (Zod-validated at the boundary, `{ error }` result, `redirect`/`revalidatePath` on success); forms via the `field` primitive + react-hook-form + `zodResolver` (mirror `auth-form.tsx`); and the two-user RLS + seed test harness in `tests/`. New deps are only `@tanstack/react-table`, `date-fns`, `date-fns-tz`, and (optional) `nuqs` for URL-state.

**Primary recommendation:** Model recurring income as a **template + materialize-on-read with lazy persistence**: `income_templates` (source, day-of-month, default amount_cents, active) + `income_occurrences` (month_key `YYYY-MM`, amount_cents, template_id nullable). When a month is opened, derive the expected occurrences from active templates and `UPSERT` any missing rows (idempotent on `unique(user_id, template_id, month_key)`); editing a single month edits only that occurrence row (INC-02). Ad-hoc receitas (INC-03) and "receita líquida do mês" (INC-04) both fall out of one `SUM(amount_cents)` over `income_occurrences` for the month. Do per-category and income sums in **SQL views** (RLS-inherited), never by fetching rows into JS.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Income template & occurrence storage, transactions, categories | Database (Postgres + RLS) | — | System of record; isolation enforced by RLS, not app code |
| Occurrence materialization (idempotent upsert) | API/Backend (Server Action) | Database (unique constraint) | Deterministic write triggered on month read; constraint guarantees no dup |
| "Receita líquida do mês" + per-category totals | Database (SQL view) | Backend (typed wrapper) | Money sums belong in SQL inside the RLS boundary; avoids over-fetch |
| Form validation (money parse, required fields) | Backend (Server Action, Zod) | Client (zodResolver mirror) | Single Zod schema validates form AND action — same as auth |
| Extrato grid: sort/filter/selection state | Client (TanStack react-table, headless) | — | Pure presentation/interaction; no money math client-side beyond display |
| Month + category filters | Client (URL searchParams) | Backend (RSC reads params) | URL-persisted so filters survive nav; server component re-queries |
| Money display / parse | Shared (`src/lib/money.ts`) | — | One module owns every format/parse edge (Phase 1 invariant) |
| Civil-month boundaries (America/Sao_Paulo) | Shared (`date-fns-tz` helper) | — | Single tz-pinned helper used app-wide; prevents month slip |

## Standard Stack

### Core (already installed — reuse, do not re-add)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.9 | App Router, Server Actions, RSC | Locked. [VERIFIED: package.json] |
| `@supabase/ssr` | 0.12.x | Cookie auth + typed client in RSC/actions | Locked, Phase-1 proven. [VERIFIED: package.json] |
| `@supabase/supabase-js` | 2.108.x | Typed DB client | Locked. [VERIFIED: package.json] |
| `zod` | 4.4.x | Boundary validation (forms + actions) | Phase-1 pattern (`auth-schema.ts`). [VERIFIED: package.json] |
| `react-hook-form` + `@hookform/resolvers` | 7.79.x / 5.4.x | Forms | Phase-1 pattern (`auth-form.tsx`). [VERIFIED: package.json] |
| `sonner` | 2.0.x | Toasts (bulk success + Desfazer) | Already vendored. [VERIFIED: package.json] |
| `src/lib/money.ts` | — | `parseBRLToCents`/`formatCents` | Hardened in Phase 1; use for ALL money I/O. [VERIFIED: codebase] |

### Supporting (NEW — to install this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-table` | 8.21.3 | Headless Extrato grid: sorting, multi-filter, **row selection model** (reused by Phase 4) | Extrato table + per-category totals + bulk-select. [VERIFIED: npm registry — 56M downloads/mo, TanStack/table repo] |
| `date-fns` | 4.4.0 | `startOfMonth`/`endOfMonth`/`format` for month cycles + pt-BR labels | Month math + "Junho 2026" labels. [VERIFIED: npm registry — date-fns/date-fns repo] |
| `date-fns-tz` | 3.2.0 | Pin civil month to `America/Sao_Paulo` (`fromZonedTime`/`toZonedTime`/`formatInTimeZone`) | Default-month derivation + any timestamp→month mapping. [VERIFIED: npm registry — marnusw/date-fns-tz repo, 38M/mo] |
| `nuqs` | 2.8.9 | Type-safe URL searchParam state for filters (`?mes=`, `?cat=`) | OPTIONAL — see Alternatives. [VERIFIED: npm registry — 47ng/nuqs repo, 12.6M/mo] |

shadcn components to add (official registry, from UI-SPEC §Component Inventory): `table`, `dialog`, `alert-dialog`, `dropdown-menu`, `select`, `popover`, `calendar`, `checkbox`, `badge`, `switch`, `tabs`, `sidebar`, `tooltip`, `skeleton`, `empty`. Install via `npx shadcn@latest add <name>`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `nuqs` | Native `useSearchParams` + `URLSearchParams` + `router.replace` | Zero new dep, but you hand-roll serialize/parse/array-handling for multi-category. nuqs gives typed parsers (`parseAsArrayOf`, `parseAsString`) and a server-side `createLoader` for RSC. **Recommendation: prefer native if avoiding a non-STACK dep; use nuqs only if multi-filter URL plumbing gets painful.** Either way filters MUST live in the URL (UI-SPEC). |
| Materialize-on-read income occurrences | Stored cron/job materialization | A background job adds infra + a "what if no month was opened" gap. Materialize-on-read is simpler, deterministic, and idempotent (unique constraint) — matches CONTEXT "preferir simples e determinístico". |
| SQL views for sums | App-side `reduce` over fetched rows | Over-fetches, scatters money math outside RLS, slows with history (ARCHITECTURE Anti-Pattern 5). Use views. |
| `@tanstack/react-query` | Server Components + Server Actions + `revalidatePath` | RSC reads + action revalidation cover Phase 2 with no client cache. Don't add react-query. |

**Installation:**
```bash
npm install @tanstack/react-table@8.21.3 date-fns@4.4.0 date-fns-tz@3.2.0
# optional URL-state helper:
npm install nuqs@2.8.9
# shadcn components:
npx shadcn@latest add table dialog alert-dialog dropdown-menu select popover calendar checkbox badge switch tabs sidebar tooltip skeleton empty
# after every migration:
npm run gen:types
```

**Version verification (2026-06-16, npm registry):**
- `@tanstack/react-table` 8.21.3 (modified 2026-06-14)
- `date-fns` 4.4.0 (2026-05-29)
- `date-fns-tz` 3.2.0 (2024-09-30 — stable, low churn)
- `nuqs` 2.8.9 (2026-06-15)

## Package Legitimacy Audit

> Legitimacy seam (`gsd-tools query package-legitimacy check`) was unavailable in this environment; verdicts below derive from npm registry metadata + download counts + verified source repos.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@tanstack/react-table` | npm | mature | 56.4M/mo | github.com/TanStack/table | OK | Approved (in locked STACK) |
| `date-fns` | npm | mature | (ecosystem-standard) | github.com/date-fns/date-fns | OK | Approved (in locked STACK) |
| `date-fns-tz` | npm | mature | 38.5M/mo | github.com/marnusw/date-fns-tz | OK | Approved (in locked STACK) |
| `nuqs` | npm | mature | 12.7M/mo | github.com/47ng/nuqs | OK | Approved (optional; not in locked STACK — planner should note it's an addition) |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none. `nuqs` is legitimate but is the only dep not in the original locked STACK — if the project prefers zero stack drift, use the native `useSearchParams` alternative instead (no checkpoint needed either way).

## Architecture Patterns

### System Architecture Diagram

```
                         BROWSER (Client Components)
  ┌────────────────────────────────────────────────────────────────────┐
  │  MonthSelector ──writes──► URL ?mes=YYYY-MM&cat=a,b  (searchParams)  │
  │  Receitas form / Categoria form / Transação form  (RHF + zodResolver)│
  │  Extrato grid (TanStack react-table: sort/filter/rowSelection)       │
  │        │ select rows → SelectionActionBar → action(ids, categoryId)  │
  └────────┼──────────────────────────────────┬────────────────────────-┘
           │ form submit / bulk action         │ navigation (filter change)
           ▼                                    ▼
  ┌─────────────────────────────┐   ┌──────────────────────────────────┐
  │  SERVER ACTIONS ('use server')│   │  RSC PAGE (reads searchParams)    │
  │  createIncomeTemplate         │   │  await createClient() (RLS)       │
  │  upsertIncomeOccurrence (INC-02)│  │  parse ?mes → civil-month bounds  │
  │  createAdhocIncome (INC-03)   │   │  query views v_income_month,      │
  │  createCategory/rename/setKind│   │   v_category_totals + tx rows     │
  │  archiveCategory / reassign+del│  │  render table + hero figure       │
  │  create/update/deleteTxn      │   └──────────────┬───────────────────┘
  │  bulkReclassify(ids,catId)    │                  │
  │   └─ Zod validate → mutate →  │                  │
  │      revalidatePath('/extrato')│                 │
  └──────────────┬────────────────┘                  │
                 ▼                                    ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │  SUPABASE Postgres (RLS: (select auth.uid()) = user_id everywhere)     │
  │  income_templates ─1:N→ income_occurrences (unique user_id,template,mes)│
  │  categories ─1:N→ transactions (FK ON DELETE RESTRICT)                 │
  │  VIEW v_income_month   = SUM(income_occurrences.amount_cents) per mês   │
  │  VIEW v_category_totals = SUM(transactions.amount_cents) per cat,mês    │
  └──────────────────────────────────────────────────────────────────────┘
```

File-to-implementation mapping lives in the Component Responsibilities table below, not the diagram.

### Recommended Project Structure
```
src/
├── app/(app)/
│   ├── layout.tsx          # upgrade shell → sidebar + MonthSelector (UI-SPEC §0)
│   ├── receitas/page.tsx   # RSC: templates+occurrences for ?mes; hero líquida
│   ├── categorias/page.tsx # RSC: category list + usos count
│   └── extrato/page.tsx     # RSC: tx rows + per-cat totals for ?mes&?cat
├── actions/
│   ├── incomes.ts          # template/occurrence/adhoc CRUD (INC-01..04)
│   ├── categories.ts       # create/rename/setKind/archive/reassign (CAT-02/03)
│   └── transactions.ts     # CRUD + bulkReclassify (TXN-01,02,04)
├── lib/
│   ├── money.ts            # EXISTING — reuse
│   ├── month.ts            # NEW: civil-month helpers (date-fns-tz, Sao_Paulo)
│   └── schemas/            # NEW: zod schemas (income, category, transaction)
├── components/
│   ├── month-selector.tsx  # ‹ Junho 2026 › → URL ?mes
│   ├── money-input.tsx     # R$ input → parseBRLToCents on submit
│   ├── category-badge.tsx  # swatch dot + name (+ kind variant)
│   ├── amount-cell.tsx     # mono tabular, signed/colored by kind
│   ├── extrato-table.tsx   # TanStack table + selection + totals
│   ├── selection-action-bar.tsx  # bulk reclassify bar (Phase-4 reusable)
│   └── ui/                 # shadcn components
└── types/database.types.ts # REGENERATE after migrations
supabase/migrations/
│   ├── 0004_incomes.sql        # income_templates + income_occurrences + RLS + idx
│   ├── 0005_transactions.sql   # transactions + category FK RESTRICT + RLS + idx
│   ├── 0006_categories_phase2.sql # add color + is_archived already exists; ensure
│   └── 0007_views.sql          # v_income_month + v_category_totals (security_invoker)
```

### Pattern 1: Income template + materialize-on-read (INC-01, INC-02, INC-03)
**What:** A recurring template stores the "intent"; a per-month occurrence row stores the "actual". Opening a month upserts missing occurrences from active templates; editing one month edits only that occurrence.
**When to use:** Any recurring-with-overridable-instance modeling.
**Example (SQL sketch):**
```sql
-- 0004_incomes.sql
create table if not exists public.income_templates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  source        text not null,                       -- free text: Salário, Pensão, Outros
  amount_cents  bigint not null check (amount_cents >= 0),
  day_of_month  int  not null check (day_of_month between 1 and 31),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists income_templates_user_id_idx on public.income_templates (user_id);

create table if not exists public.income_occurrences (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  template_id   uuid references public.income_templates(id) on delete set null, -- null = avulsa (INC-03)
  source        text not null,                       -- snapshot of source (rename-safe history)
  amount_cents  bigint not null check (amount_cents >= 0),
  month_key     text not null check (month_key ~ '^\d{4}-\d{2}$'),  -- 'YYYY-MM', civil Sao_Paulo
  occurred_on   date not null,                       -- concrete day (templates: day_of_month; avulsa: picked)
  created_at    timestamptz not null default now(),
  -- one materialized occurrence per template per month → makes upsert idempotent (INC-02 isolation)
  unique (user_id, template_id, month_key)
);
create index if not exists income_occurrences_user_month_idx
  on public.income_occurrences (user_id, month_key);

-- RLS — identical shape to Phase 1 (profiles/categories)
alter table public.income_templates  enable row level security;
alter table public.income_occurrences enable row level security;
grant select, insert, update, delete on public.income_templates  to authenticated, service_role;
grant select, insert, update, delete on public.income_occurrences to authenticated, service_role;
drop policy if exists "own income_templates" on public.income_templates;
create policy "own income_templates" on public.income_templates
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own income_occurrences" on public.income_occurrences;
create policy "own income_occurrences" on public.income_occurrences
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
```
> **NOTE on the `unique(user_id, template_id, month_key)` constraint:** Postgres treats NULLs as distinct in a unique index by default, so multiple avulsas (`template_id IS NULL`) in the same month are allowed — exactly what INC-03 needs. The constraint only de-dups *materialized template occurrences*. [CITED: PostgreSQL NULL-in-unique semantics] If you ever need a partial-unique only on non-null templates, use `unique (user_id, template_id, month_key)` as written — it already behaves correctly here.

**Materialize-on-read (Server Action, idempotent):**
```ts
// actions/incomes.ts — called by receitas/page.tsx RSC for the selected ?mes
'use server'
export async function ensureMonthOccurrences(monthKey: string) {
  const supabase = await createClient()
  // 1. read active templates (RLS-scoped)
  const { data: templates } = await supabase
    .from('income_templates').select('*').eq('is_active', true)
  if (!templates?.length) return
  // 2. upsert one occurrence per template for this month; ON CONFLICT DO NOTHING
  //    means re-opening the month never overwrites an edited occurrence (INC-02).
  const rows = templates.map(t => ({
    user_id: t.user_id, template_id: t.id, source: t.source,
    amount_cents: t.amount_cents, month_key: monthKey,
    occurred_on: occurredOnFor(monthKey, t.day_of_month), // clamps Feb-30 → last day
  }))
  await supabase.from('income_occurrences').upsert(rows, {
    onConflict: 'user_id,template_id,month_key', ignoreDuplicates: true,
  })
}
```

### Pattern 2: Transactions + category FK with delete-block (TXN-01, CAT-02)
```sql
-- 0005_transactions.sql
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete restrict, -- BLOCK hard-delete
  amount_cents  bigint not null check (amount_cents > 0),  -- ALWAYS positive; sign derives from kind
  kind          text not null default 'expense' check (kind in ('expense')), -- expense only in P2
  occurred_on   date not null,
  description   text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists transactions_user_month_idx on public.transactions (user_id, occurred_on);
create index if not exists transactions_category_idx   on public.transactions (category_id);
-- RLS identical shape (USING+WITH CHECK, to authenticated) + grants — see Pattern 1.
```
> **`on delete restrict`** is the database-level guarantee behind CONTEXT's "hard-delete proibido": Postgres refuses to delete a category referenced by any transaction, raising error code `23503` (foreign_key_violation). The UI's archive/reassign flow (UI-SPEC §Categorias) is the *graceful* path; RESTRICT is the *safety net* so a stray delete can never orphan history.

### Pattern 3: SQL views for sums (INC-04, per-category totals)
```sql
-- 0007_views.sql — security_invoker so the view runs as the querying user → RLS applies
create or replace view public.v_income_month
  with (security_invoker = true) as
  select user_id, month_key, sum(amount_cents)::bigint as total_cents
  from public.income_occurrences group by user_id, month_key;

create or replace view public.v_category_totals
  with (security_invoker = true) as
  select t.user_id,
         to_char(t.occurred_on, 'YYYY-MM') as month_key,  -- date column: civil day already
         t.category_id,
         sum(t.amount_cents)::bigint as total_cents,
         count(*)::int as tx_count
  from public.transactions t
  group by t.user_id, to_char(t.occurred_on, 'YYYY-MM'), t.category_id;

grant select on public.v_income_month, public.v_category_totals to authenticated;
```
> **`security_invoker = true` (Postgres 15+, confirmed `major_version = 17` in config.toml) is mandatory** — without it a view runs with the *definer's* privileges and silently bypasses RLS, leaking every user's sums. [CITED: Supabase RLS + views guidance, ARCHITECTURE.md]. The `tx_count` per category also feeds the Categorias "usos" column and the delete-block messaging.

### Pattern 4: TanStack row-selection model (TXN-03, TXN-04 — Phase-4 reusable)
```tsx
// extrato-table.tsx (client) — selection state is the load-bearing piece
const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
const table = useReactTable({
  data: rows, columns,
  getCoreRowModel: getCoreRowModel(),
  getRowId: (r) => r.id,                 // stable id = transaction.id
  state: { rowSelection },
  onRowSelectionChange: setRowSelection,
  enableRowSelection: true,
})
const selectedIds = Object.keys(rowSelection)   // → bulkReclassify(selectedIds, categoryId)
```
Keep `SelectionActionBar` a self-contained component taking `{ selectedIds, onApply }` so Phase 4's import-review reuses it verbatim (CONTEXT specifics). Header checkbox uses `table.getToggleAllRowsSelectedHandler()`; shift-range selection is a small custom handler on row index.

### Anti-Patterns to Avoid
- **Storing income as negative or transactions as negative:** sign derives from `kind`, value always positive (`check amount_cents > 0`). Painting a gasto red is wrong (UI-SPEC: expense is neutral, not an error).
- **Aggregating in JS:** never `select('*')` then `reduce`. Use the views (over-fetch + RLS-scatter, ARCHITECTURE AP-5).
- **`ON DELETE CASCADE` on category→transaction:** would silently destroy spend history when a category is deleted. Use `RESTRICT`.
- **Recomputing occurrences on every read without the unique constraint:** would duplicate rows. The `unique(user_id, template_id, month_key)` + `ignoreDuplicates` makes it idempotent.
- **Hand-formatting money or parsing with `parseFloat`:** always go through `money.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sortable/filterable/selectable grid | Custom table state machine | `@tanstack/react-table` | Selection + filtering + sorting edge cases (shift-select, all-filtered-select) are deep; it's headless so shadcn `table` styles it |
| Civil-month boundaries in `America/Sao_Paulo` | Manual UTC offset math | `date-fns-tz` (`fromZonedTime`/`formatInTimeZone`) | DST-safe, IANA-correct; manual offsets slip a transaction into the wrong month |
| BRL parse/format | New parser | `src/lib/money.ts` | Already hardened against NaN/0 + MAX_SAFE_INTEGER (Phase 1) |
| Form ↔ action validation | Two separate validators | One Zod schema shared (mirror `auth-schema.ts`) | Contract can't drift between client and server |
| Category delete-safety | App-only "check then delete" | Postgres `ON DELETE RESTRICT` | App-level check has a TOCTOU race; the FK is the real guarantee |
| Income sums / category totals | JS reduce over fetched rows | `security_invoker` SQL views | RLS-inherited, indexed, no over-fetch |
| URL filter state | Manual `URLSearchParams` plumbing | `nuqs` *(optional)* or native `useSearchParams` | Multi-value (`cat`) serialization is fiddly; nuqs gives typed parsers. Either is fine — just keep filters in the URL |

**Key insight:** Phase 2 has almost no novel infrastructure — it's Phase-1 patterns applied to two more tables plus two well-known headless libraries. The only genuinely new *design* decision is the income template/occurrence split, and CONTEXT already locked it (template + editable monthly occurrence). Resist building anything custom for tables, dates, or money.

## Runtime State Inventory

> This is a **greenfield additive** phase (new tables, new screens) — not a rename/refactor. No existing runtime state is mutated. Section included for completeness; all categories verified empty.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new tables only; existing `categories`/`profiles` untouched except an additive `color` column | none |
| Live service config | None — no external services configured for this app yet | none |
| OS-registered state | None | none |
| Secrets/env vars | None new — same `NEXT_PUBLIC_SUPABASE_*` as Phase 1 | none |
| Build artifacts | `src/types/database.types.ts` becomes stale after each migration | regenerate via `npm run gen:types` (already scripted) |

**Note:** adding a `color` column to `categories` (CAT optional color) is an `ALTER TABLE ... ADD COLUMN color text` — additive, nullable, no data migration. Verified: existing `categories` table already has `is_archived` (Phase 1), so archive flag is reusable; only `color` is new.

## Common Pitfalls

### Pitfall 1: Per-category percentage rounding drift
**What goes wrong:** Computing "categoria X = Y% da receita líquida" by dividing cents and rounding each independently makes the parts not sum to 100%.
**Why it happens:** Integer division + naive `Math.round` per category loses/gains a centavo.
**How to avoid:** Keep all *money* as integer cents and only compute percentages at the **display edge** for presentation (Phase 3 owns metas math). In Phase 2, percentages are informational only — render `formatCents(total)` and a derived `%` string; never persist a rounded percent. When you must show parts-of-whole, use the "largest remainder" approach or simply show each category's raw `formatCents` total (UI-SPEC asks for per-category totals, not enforced-to-100% percentages).
**Warning signs:** A totals row whose category percentages add to 99% or 101%.

### Pitfall 2: Recurring occurrence duplication
**What goes wrong:** Re-opening a month (or a double render of the RSC) inserts a second occurrence for the same template/month.
**Why it happens:** Materialize-on-read without an idempotency guard.
**How to avoid:** `unique(user_id, template_id, month_key)` + `upsert(..., { onConflict, ignoreDuplicates: true })`. The DB makes the operation a no-op on repeat. Never overwrite (would clobber an INC-02 edit) — use `ignoreDuplicates`, not an update-on-conflict.
**Warning signs:** "Receita líquida" doubling after navigating away and back.

### Pitfall 3: Timezone month boundary slip
**What goes wrong:** A receipt/transaction near midnight on the last day of the month lands in the wrong civil month, or the default "current month" flips a day early/late.
**Why it happens:** Using UTC `new Date()` / `getMonth()` instead of `America/Sao_Paulo` civil time.
**How to avoid:** One `lib/month.ts` helper. For the *default current month*, derive from São Paulo civil time: `formatInTimeZone(new Date(), 'America/Sao_Paulo', 'yyyy-MM')`. Transaction/occurrence `occurred_on` is a plain `date` the user picks (no time component) so it carries no tz ambiguity — but the **default** and any "now" must be tz-pinned. Store `month_key` as the São Paulo civil `YYYY-MM`.
**Warning signs:** Late-night testing shows a transaction in next month; "mês atual" wrong for a few hours around midnight.

### Pitfall 4: View bypasses RLS (data leak)
**What goes wrong:** A view created without `security_invoker` runs as its owner and returns *all users'* sums.
**Why it happens:** Postgres views default to `security_definer` semantics for RLS.
**How to avoid:** Always `create view ... with (security_invoker = true)` (PG 15+; confirmed PG 17 locally). Add a two-user test that queries the view as user B and asserts B sees only their totals.
**Warning signs:** `v_income_month` returns rows for another `user_id`.

### Pitfall 5: FK delete error surfaced as a generic 500
**What goes wrong:** `ON DELETE RESTRICT` correctly blocks the delete, but the action throws an opaque error instead of the friendly "Esta categoria tem N transações" message.
**Why it happens:** Not catching Postgres error `23503` in the delete action.
**How to avoid:** In `deleteCategory`, attempt the delete; on error code `23503` (or pre-check `v_category_totals.tx_count > 0`) return the structured "blocked" result that drives the alert-dialog's archive/reassign branch. Prefer the pre-check (cleaner UX) with RESTRICT as the backstop.
**Warning signs:** Deleting a used category shows a raw DB error toast.

### Pitfall 6: `bigint` columns surfacing as string in JS
**What goes wrong:** supabase-js may return a `bigint` column as a string; doing `+a + +b` math or passing to a `number`-typed helper breaks.
**Why it happens:** JS `number` can't hold all `bigint` values, so the driver may stringify.
**How to avoid:** `formatCents` already accepts `number | bigint | string`-ish via `BigInt(cents)`; but for *sums* prefer the SQL view (returns a single `bigint`). When summing client-side is unavoidable, coerce with `BigInt(row.amount_cents)`. Aggregate in SQL — Pitfall avoided by design.
**Warning signs:** `NaN` totals or `[object Object]` in a money cell.

## Code Examples

### Server Action: create transaction (mirror auth.ts boundary pattern)
```ts
// actions/transactions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseBRLToCents } from '@/lib/money'
import { transactionSchema } from '@/lib/schemas/transaction'

export type ActionResult = { error: string } | { ok: true }

export async function createTransaction(formData: FormData): Promise<ActionResult> {
  const parsed = transactionSchema.safeParse({
    description: formData.get('description'),
    amount: formData.get('amount'),          // raw "R$ 1.234,56"
    categoryId: formData.get('categoryId'),
    occurredOn: formData.get('occurredOn'),   // 'yyyy-MM-dd'
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  let amount_cents: number
  try { amount_cents = parseBRLToCents(parsed.data.amount) }   // throws → friendly error
  catch { return { error: 'Valor monetário inválido.' } }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId, category_id: parsed.data.categoryId,
    amount_cents, kind: 'expense',
    occurred_on: parsed.data.occurredOn, description: parsed.data.description,
  })
  if (error) return { error: 'Não foi possível salvar a transação.' }
  revalidatePath('/extrato')
  return { ok: true }
}
```

### Server Action: bulk reclassify (TXN-04)
```ts
export async function bulkReclassify(ids: string[], categoryId: string): Promise<ActionResult> {
  if (ids.length === 0) return { error: 'Nenhuma transação selecionada.' }
  const supabase = await createClient()
  // RLS guarantees only the user's own rows are touched even if an id is forged.
  const { error } = await supabase
    .from('transactions').update({ category_id: categoryId }).in('id', ids)
  if (error) return { error: 'Não foi possível reclassificar.' }
  revalidatePath('/extrato')
  return { ok: true }
}
```

### Server Action: delete category with pre-check (CAT-02 block)
```ts
export async function deleteCategory(categoryId: string): Promise<
  { ok: true } | { error: string } | { blocked: true; txCount: number }
> {
  const supabase = await createClient()
  const { data: total } = await supabase
    .from('v_category_totals').select('tx_count').eq('category_id', categoryId)
  const txCount = (total ?? []).reduce((s, r) => s + (r.tx_count ?? 0), 0)
  if (txCount > 0) return { blocked: true, txCount }      // drives archive/reassign dialog
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error) return { error: 'Não foi possível excluir a categoria.' }   // 23503 backstop
  revalidatePath('/categorias')
  return { ok: true }
}
```

### Civil-month helper
```ts
// lib/month.ts
import { formatInTimeZone } from 'date-fns-tz'
import { format, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
const TZ = 'America/Sao_Paulo'

/** Current civil month in Sao_Paulo as 'YYYY-MM' — the default ?mes. */
export function currentMonthKey(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM')
}
/** 'Junho 2026' label for the MonthSelector. */
export function monthLabel(monthKey: string): string {
  const d = parse(monthKey, 'yyyy-MM', new Date())
  return format(d, "MMMM yyyy", { locale: ptBR })
}
/** Previous / next month_key for the ‹ › arrows. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const d = parse(monthKey, 'yyyy-MM', new Date())
  d.setMonth(d.getMonth() + delta)
  return format(d, 'yyyy-MM')
}
```

### Zod schema (shared form + action)
```ts
// lib/schemas/transaction.ts
import { z } from 'zod'
export const transactionSchema = z.object({
  description: z.string().trim().max(200).default(''),
  amount: z.string().min(1, 'Informe o valor'),         // parsed via parseBRLToCents server-side
  categoryId: z.string().uuid('Selecione uma categoria'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
})
export type TransactionInput = z.infer<typeof transactionSchema>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Views default to definer rights (RLS bypass risk) | `with (security_invoker = true)` on views | PG 15 | Views safely inherit RLS — required for any aggregation view here |
| Manual `URLSearchParams` filter plumbing | `nuqs` typed searchParam parsers (or native `useSearchParams`) | — | Cleaner multi-filter URL state; optional |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` (`getAll`/`setAll`) | — | Already adopted in Phase 1 |
| Numeric/float money | integer `bigint` cents + `money.ts` | Phase 1 | Established invariant; continue |

**Deprecated/outdated:** none introduced this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Income recurring = template + materialize-on-read occurrence (vs stored job) | Pattern 1 | LOW — CONTEXT explicitly locks "template + ocorrência mensal materializada e editável" and "preferir simples e determinístico". Materialize-on-read is the simplest deterministic reading. |
| A2 | `color` stored as a swatch-key text column (`slate|red|…`), not free hex | Data model | LOW — UI-SPEC §tokens locks an 8-swatch fixed palette, no free hex picker in v1. |
| A3 | `transactions.kind` constrained to `'expense'` only in Phase 2 (income lives in `incomes`) | Pattern 2 | LOW — CONTEXT: "receitas ficam na tabela incomes, gastos em transactions". Future phases may widen the check. |
| A4 | `month_key` derived from São Paulo civil time, stored as `YYYY-MM` text | Pitfall 3 | LOW — CONTEXT locks America/Sao_Paulo civil month app-wide. |
| A5 | Per-category percentages are display-only in Phase 2 (enforced metas math is Phase 3) | Pitfall 1 | LOW — REQUIREMENTS map BUD-* to Phase 3; Phase 2 only shows totals. |
| A6 | `nuqs` acceptable as an addition OR replaceable by native `useSearchParams` | Standard Stack | LOW — both keep filters in URL per UI-SPEC; planner picks based on stack-drift tolerance. |

**No HIGH-risk assumptions.** Every modeling decision traces to a locked CONTEXT/UI-SPEC statement or a Phase-1 established pattern.

## Open Questions

1. **Avulsa receita: `occurred_on` day vs month_key consistency**
   - What we know: avulsa is a single dated income (INC-03) with `template_id IS NULL`.
   - What's unclear: whether the avulsa's `month_key` should be derived from its `occurred_on` (recommended) or set independently.
   - Recommendation: derive `month_key = to_char(occurred_on,'YYYY-MM')` in the action so an avulsa always sums into the civil month of its date. Add a `check` or compute it server-side; do not let the user set them inconsistently.

2. **Reassign-and-delete atomicity (CAT-02)**
   - What we know: "Reatribuir e remover" moves transactions to a target category, then deletes the source.
   - What's unclear: whether to wrap move+delete in a single Postgres function (RPC) for atomicity vs two action steps.
   - Recommendation: a small `security invoker` RPC `reassign_and_delete_category(src, dst)` doing `UPDATE … then DELETE` in one transaction is cleanest and avoids a half-applied state if the second step fails. Plan it as one task. (Two sequential supabase calls also work since RESTRICT prevents an orphan, but the move could succeed and delete fail, leaving an empty archivable category — acceptable but messier.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (local stack) | migrations, type-gen, RLS tests | ✓ | 2.106.x (devDep) | — |
| Local Postgres (Docker via `supabase start`) | apply migrations + run integration tests | ✓ (config.toml PG 17) | 17 | — |
| Node + npm | install deps, build | ✓ | — | — |
| `npm run gen:types` script | regenerate `database.types.ts` | ✓ | — | — |

**Missing dependencies with no fallback:** none — Phase 2 needs only the already-present local Supabase stack.
**Missing dependencies with fallback:** none. (New npm libs are installs, not environment gaps.)

> Reminder: the local Docker stack must be running (`supabase start`) before the RLS/integration tests; the test helper throws a clear error otherwise (`tests/helpers/local-supabase.ts`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.x (jsdom env, globals) |
| Config file | `vitest.config.ts` (`@`→`src` alias, includes `src/**/*.test.{ts,tsx}` + `tests/**/*.test.ts`) |
| Quick run command | `npm test` (`vitest run`) |
| Full suite command | `npm test` (same; add `--coverage` later if desired) |
| Watch | `npm run test:watch` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INC-01 | Recurring template creates one occurrence for the month | integration (local) | `vitest run tests/incomes-occurrence.test.ts` | ❌ Wave 0 |
| INC-02 | Editing a month's occurrence does NOT change template or other months | integration | `vitest run tests/incomes-occurrence.test.ts` | ❌ Wave 0 |
| INC-02 | Re-materializing a month is idempotent (no duplicate, no overwrite of edit) | integration | `vitest run tests/incomes-occurrence.test.ts` | ❌ Wave 0 |
| INC-03 | Multiple avulsas (template_id null) allowed in same month | integration | `vitest run tests/incomes-occurrence.test.ts` | ❌ Wave 0 |
| INC-04 | `v_income_month` sums recurring + avulsa = receita líquida | integration | `vitest run tests/income-sum.test.ts` | ❌ Wave 0 |
| CAT-02 | Delete category WITH transactions is blocked (RESTRICT / pre-check) | integration | `vitest run tests/category-delete.test.ts` | ❌ Wave 0 |
| CAT-02 | Reassign-and-delete moves txns then removes category | integration | `vitest run tests/category-delete.test.ts` | ❌ Wave 0 |
| CAT-02 | Archive hides category from pickers, keeps history | integration | `vitest run tests/category-delete.test.ts` | ❌ Wave 0 |
| CAT-03 | Category kind toggle persists consumo↔alocação | integration | `vitest run tests/category-kind.test.ts` | ❌ Wave 0 |
| TXN-01/02 | Transaction create/update/delete round-trips | integration | `vitest run tests/transactions-crud.test.ts` | ❌ Wave 0 |
| TXN-03 | `v_category_totals` returns correct per-category sums for a month | integration | `vitest run tests/category-totals.test.ts` | ❌ Wave 0 |
| TXN-04 | Bulk reclassify updates all selected ids to one category | integration | `vitest run tests/bulk-reclassify.test.ts` | ❌ Wave 0 |
| RLS (all new tables + views) | User B cannot read/insert/update/delete user A rows; views leak nothing | integration | extend `tests/rls-isolation.test.ts` (add `income_templates`,`income_occurrences`,`transactions`) + new `tests/views-rls.test.ts` | ⚠ extend existing |
| money | per-category % rounding, bigint→string safety | unit | `vitest run src/lib/money.test.ts` (extend) | ⚠ extend existing |
| lib/month | currentMonthKey/shiftMonthKey/monthLabel in Sao_Paulo | unit | `vitest run src/lib/month.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (fast unit subset runs in <2s; integration needs local stack up).
- **Per wave merge:** `npm test` full suite (local Supabase running).
- **Phase gate:** Full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/incomes-occurrence.test.ts` — INC-01/02/03 (materialize idempotency + edit isolation)
- [ ] `tests/income-sum.test.ts` — INC-04 (`v_income_month`)
- [ ] `tests/category-delete.test.ts` — CAT-02 (block / reassign / archive)
- [ ] `tests/category-kind.test.ts` — CAT-03
- [ ] `tests/transactions-crud.test.ts` — TXN-01/02
- [ ] `tests/category-totals.test.ts` — TXN-03 (`v_category_totals`)
- [ ] `tests/bulk-reclassify.test.ts` — TXN-04
- [ ] `tests/views-rls.test.ts` — `security_invoker` leak check (user B sees only own sums)
- [ ] Extend `tests/rls-isolation.test.ts` `TABLES` array with the three new tables
- [ ] `src/lib/month.test.ts` — civil-month helper unit tests
- [ ] Extend `src/lib/money.test.ts` — % rounding + bigint coercion (if any client-side sum survives)
- [ ] Reuse `tests/helpers/local-supabase.ts` verbatim (already provides `serviceClient`/`userClient`)

*Test infrastructure (vitest, jsdom, local-supabase helper, two-user RLS pattern) all exist from Phase 1 — Wave 0 is new test files, not new framework.*

## Security Domain

> `security_enforcement` not explicitly false → included. Financial data; RLS is the boundary.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (Phase 1) | Existing `@supabase/ssr` + middleware + `getClaims()` re-check in `(app)/layout.tsx` |
| V3 Session Management | no (Phase 1) | Cookie refresh in middleware (unchanged) |
| V4 Access Control | **yes** | RLS `(select auth.uid()) = user_id` USING+WITH CHECK on every new table; `security_invoker` views; `to authenticated` grants. Two-user test proves isolation. |
| V5 Input Validation | **yes** | Zod schema at every action boundary (mirror `auth.ts`); `parseBRLToCents` rejects bad money; `category_id` validated as uuid; date regex. |
| V6 Cryptography | no | No crypto in this phase |

### Known Threat Patterns for Next 16 + Supabase + RLS
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user data read via forged `user_id`/id | Information Disclosure | RLS USING + WITH CHECK on all new tables; never filter by `user_id` in app code alone |
| View leaks all users' sums | Information Disclosure | `with (security_invoker = true)` on `v_income_month`, `v_category_totals` + leak test |
| Bulk action `.in('id', forgedIds)` touching others' rows | Tampering | RLS scopes the UPDATE to the caller's rows even with forged ids (verified by test) |
| Negative/zero money corrupting sums | Tampering | `check (amount_cents > 0)` (txn) / `>= 0` (income) + `parseBRLToCents` throw-on-invalid |
| Orphaned spend history on category delete | Tampering / Integrity | `ON DELETE RESTRICT` + archive/reassign flow |
| Money float drift in % display | Integrity | integer cents + `money.ts`; percentages display-only |
| Missing GRANTs masking RLS as false-green | Information Disclosure | `grant select,insert,update,delete … to authenticated, service_role` per Phase-1 note |

## Sources

### Primary (HIGH confidence)
- Phase 1 codebase — `supabase/migrations/0001-0003`, `src/lib/money.ts`, `src/actions/auth.ts`, `src/lib/supabase/server.ts`, `tests/{rls-isolation,seed-categories,helpers}` — established RLS shape, money helper, action/test patterns [VERIFIED: codebase]
- `.planning/research/ARCHITECTURE.md` — income_sources/entries model, SQL-views-for-aggregation principle, anti-patterns, RLS performance form [CITED: ARCHITECTURE.md]
- `02-CONTEXT.md` / `02-UI-SPEC.md` — locked decisions (template+occurrence, kind-derived sign, archive-not-delete, swatch palette, URL filters, selection bar) [CITED: phase docs]
- CLAUDE.md STACK section — locked versions (react-table 8.21.x, date-fns 4.4.x, date-fns-tz 3.2.x, integer-cents, RLS non-negotiable) [CITED: CLAUDE.md]
- npm registry — `@tanstack/react-table` 8.21.3, `date-fns` 4.4.0, `date-fns-tz` 3.2.0, `nuqs` 2.8.9 versions + download counts + repos [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- date-fns-tz v3 API (`fromZonedTime`/`toZonedTime`/`formatInTimeZone`) via WebSearch — confirms civil-month helper shape [CITED: npmjs.com/package/date-fns-tz, github.com/marnusw/date-fns-tz]

### Tertiary (LOW confidence)
- none — all claims trace to a verified source or a locked phase decision.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified on npm; core libs already in `package.json`/STACK.
- Architecture / data model: HIGH — directly extends Phase-1 RLS shape + ARCHITECTURE.md model; income template/occurrence locked in CONTEXT.
- Pitfalls: HIGH — each maps to a concrete Phase-1 lesson or a documented Postgres/RLS behavior.
- Tests: HIGH — harness exists; gaps are new files using the proven two-user helper.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable stack; re-verify npm versions if installing later)
