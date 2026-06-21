# Phase 26: Substrato do abastecimento ponta-a-ponta - Research

**Researched:** 2026-06-21
**Domain:** Postgres schema migration (CHECK relaxation + junction table + view rewrite + idempotent seed) on Supabase, TypeScript types regen
**Confidence:** HIGH (all findings verified against the actual migration files, contracts, and test harness in this repo; zero external-package surface)

## Summary

Phase 26 is a **pure data-layer phase** on an existing, well-pinned Supabase schema. There are no new npm packages, no app code, no UI. The entire deliverable is SQL (one or two migrations starting at `0039`) plus a `npm run gen:types` regeneration. CONTEXT.md (D-01..D-09) already locks every product decision; this research answers only the SQL-correctness questions it explicitly delegated under `<canonical_refs>` → "Pontos de pesquisa pro researcher".

The four hard SQL problems are: (1) the **exact relaxed `abastecimentos_cost_xor` predicate** that admits attach-later (both `transaction_id` and `amount_cents` present) on the à-vista path AND the parcelado path (`valor_total_cents` only) while still rejecting "custo nenhum"; (2) the **`abastecimento_parcelas` junction** constraints that prevent a transaction being two parcelas and prevent the simultaneous à-vista-link + parcela double-link; (3) the **view rewrite** of `v_abastecimento_consumo`/`v_carro_resumo` so parcelado cost comes from `valor_total_cents` once with no double-count — rebuilt off the **current 0029 view body** (id-anchored interval tuple), not the 0027 original; (4) the **"Combustível" seed** mirroring `0035` exactly (no gen:types diff).

**Primary recommendation:** Ship **two migrations** — `0039_abastecimento_parcelado.sql` (schema: relaxed CHECK + columns + junction + view rewrite + RLS/grants; HAS a gen:types diff) and `0040_categorias_combustivel.sql` (seed: `handle_new_user()` re-seed + idempotent backfill; NO gen:types diff). Splitting isolates the gen:types-affecting change from the data-only change, exactly matching how `0035` (seed, no types) and `0027` (schema, types) are already separated in this repo. Both must `supabase db reset` (replay) clean and `npm run gen:types` must regenerate `src/types/database.types.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Relaxed cost CHECK (attach-later + parcelado) | Database (CHECK constraint) | — | Cost-source enforcement is a DB invariant in this repo (defense-in-depth with Zod, but Zod is intentionally NOT touched in P26 per D-08). |
| Parcelamento columns | Database (table columns) | — | `parcelas_total`/`valor_total_cents` on `abastecimentos`. |
| N:1 parcela→transaction links | Database (junction table + constraints) | — | `abastecimento_parcelas` with unique + RLS; double-link prevention is a schema invariant. |
| Consumo cost-of-record (parcelado once) | Database (view) | — | `v_abastecimento_consumo`/`v_carro_resumo` are the single source of consumo math (0027/0028/0029 precedent: interval logic lives in ONE place). |
| "Combustível" default category | Database (trigger fn + backfill) | — | `handle_new_user()` SECURITY DEFINER + idempotent backfill (0035 pattern). |
| Type safety | Build (codegen) | — | `supabase gen types typescript --local` → `src/types/database.types.ts`. |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (manter o esperado):** ao vincular a transação a um abastecimento com valor manual esperado, os DOIS campos coexistem — `amount_cents` = esperado, `transaction_id` = real. CHECK relaxa de XOR para "**pelo menos uma fonte de custo não-nula**" no caminho à-vista (`NOT (transaction_id IS NULL AND amount_cents IS NULL)`). Ambos presentes passa a ser permitido. Esperado é dado de auditoria, não lixo.
- **D-02 (precedência de custo):** a view já faz `coalesce(t.amount_cents, a.amount_cents)` → quando ambos presentes, o **real (transação) ganha**. Sem mudança nessa semântica. `gasto_total` soma transações etiquetadas; `consumo` faz coalesce por linha — métricas distintas, sem double-count (comportamento v1.2 já existente).
- **D-03 (junção agora):** P26 cria `abastecimento_parcelas (abastecimento_id, transaction_id, parcela_num, …)` para o N:1. `abastecimentos.transaction_id` + índice único `abastecimentos_transaction_uniq` **permanecem intactos** (link 1:1 à-vista) → zero regressão v1.2.
- **D-04 (colunas novas):** `parcelas_total int` + `valor_total_cents bigint` em `abastecimentos`. Marcador de parcelado: `parcelas_total > 1`.
- **D-05 (cost-of-record):** parcelado → custo = `valor_total_cents` (contado **uma vez** no consumo); à-vista → `coalesce(transaction, amount_cents)`. Parcelado **nunca** usa `abastecimentos.transaction_id`; todos os links de parcela vão na junção. Parcelas confirmadas (P28) etiquetam `carro_id` → caixa espalha em `gasto_total` sem recontar consumo.
- **D-06 (sort ~4):** "Combustível" (`kind consumo`) entra logo após "Transporte" (sort 3), empurrando Saúde→Marketplace +1, "Outros" continua último.
- **D-07 (padrão 0035):** re-seed do `handle_new_user()` (corpo do 0035 + 'Combustível') + backfill idempotente (`insert … where not exists (… name = 'Combustível')`). Data/trigger only → **sem efeito no gen:types**.
- **D-08 (escopo):** P26 entrega schema completo (colunas + junção + CHECK relaxado + índices + RLS/grants padrão 0027/0035 + types) E atualiza as duas views. Re-link = banco/contrato permitem; o wiring de `updateAbastecimento`/`createAbastecimento` fica em 27/28. Zod `superRefine` **não** é alterado em P26.
- **D-09 (gen:types muda):** a parte de schema TEM diff de `database.types.ts` (nova tabela + colunas). SC5 exige a regeneração. Migrations aplicam limpas em replay no stack local.

### Claude's Discretion
- Nomes exatos das colunas/tabela de junção e o predicado SQL exato do CHECK relaxado, desde que o comportamento das decisões fique preservado.
- Tipo/constraints de `parcela_num` e colunas auxiliares da junção (`created_at`, `user_id` p/ RLS) seguindo o padrão 0027/0025.
- Como exatamente a view distingue parcelado (provável `case when parcelas_total > 1 then valor_total_cents else coalesce(t.amount_cents, a.amount_cents) end`) — sem double-count, `security_invoker = true` preservado.

### Deferred Ideas (OUT OF SCOPE)
- **CAR-13** (lembrete/projeção de parcelas futuras) — v2. A junção deixa o dado disponível; a UI de projeção fica fora.
- **CAR-14** (edição/relink de custo pela UI) — v2; P26 só destrava o relink no banco/contrato.
- **Alinhar o Zod `superRefine` ao CHECK relaxado + novos campos** — acontece em 27/28; NÃO é P26.
- Botão "Novo abastecimento" na lista, `AbastecimentoForm` com toggle parcelado, sugestão por valor na grid de importação, wiring dos novos campos nas actions — tudo 27/28.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FUEL-01 | Categoria default "Combustível" (kind `consumo`) para todos os usuários + apply-on-confirm da categoria ao vincular lançamento↔abastecimento. | P26 cobre **só a metade** "categoria default": seed via `handle_new_user()` + backfill idempotente (mirror 0035). O **apply-on-confirm** é Phase 28 (CONTEXT.md L106). Research below gives the exact seed SQL + sort math. |

## Standard Stack

**No external packages added or changed in this phase.** This is SQL + a codegen run against tooling already pinned in the repo.

| Tool | Version (installed) | Purpose | Why Standard |
|------|---------------------|---------|--------------|
| `supabase` CLI | ^2.106.0 (`package.json` devDeps) [VERIFIED: package.json] | migrations + local stack + type gen | Already the repo's migration toolchain (`db:push`, `db:reset`, `gen:types` scripts). |
| `vitest` | ^4.1.9 [VERIFIED: package.json] | run SQL-behavior assertions against local Docker stack | Repo has zero pgTAP; all DB invariants are proven by vitest integration tests hitting `supabase start` (e.g. `tests/carro-view-leak.test.ts`, `tests/abastecimento-action.test.ts`). [VERIFIED: grep — no pgTAP/pg_tap anywhere] |
| Postgres (Supabase) | local Docker stack | the DB itself | CHECK constraints, partial unique indexes, row-value comparison, `security_invoker` views all native. |

**Repo npm scripts (use these, do not hand-roll):** [VERIFIED: package.json]
```
"db:push":  "supabase db push"
"db:reset": "supabase db reset"          # full replay — the SC5 clean-replay gate
"gen:types":"supabase gen types typescript --local > src/types/database.types.ts"
"test":     "vitest run"
```

## Package Legitimacy Audit

> Not applicable — Phase 26 installs **zero** external packages. It is SQL migrations + a type-regen run using tooling already present in `package.json`. No registry verification needed.

## Architecture Patterns

### System Architecture Diagram

```
                 ┌──────────────────────────────────────────────┐
 NEW signup ───► │ auth.users insert → trigger handle_new_user() │
                 │  • profiles row                               │
                 │  • categories seed (now WITH 'Combustível'    │
                 │    at sort 4, kind consumo)                   │  ← 0040 (seed, NO gen:types)
                 └──────────────────────────────────────────────┘
 EXISTING ─────► idempotent backfill: insert 'Combustível' WHERE NOT EXISTS (name)

 abastecimento write path (enabled by 0039, wired in 27/28):
   ┌─────────────┐   à-vista (parcelas_total null/≤1)        ┌──────────────────┐
   │ abastecimento├──► amount_cents (esperado) AND/OR ───────►│ abastecimentos_  │
   │  row        │     transaction_id (1:1, uniq idx kept)   │  cost_xor (CHECK)│
   │             │   parcelado (parcelas_total > 1)          │  relaxed predicate│
   │             ├──► valor_total_cents; transaction_id NULL │  rejects "neither"│
   └─────┬───────┘     amount_cents NULL                     └──────────────────┘
         │ parcelado links (N:1)                              ┌──────────────────┐
         └───────────────────────────────────────────────────►│abastecimento_    │
                                                               │ parcelas (junc.) │
                                                               │ uniq(transaction)│
                                                               └──────────────────┘
 consumo read path (views, security_invoker = true):
   v_abastecimento_consumo  ──custo = CASE parcelado→valor_total_cents (once)
                                          else coalesce(t.amount_cents,a.amount_cents)
   v_carro_resumo  ──reads OFF v_abastecimento_consumo (avgs) + gasto OFF transactions.carro_id
```

### Recommended migration layout
```
supabase/migrations/
├── 0039_abastecimento_parcelado.sql   # CHECK relax + columns + junction + 2 view rewrites + RLS/grants  (gen:types DIFF)
└── 0040_categorias_combustivel.sql    # handle_new_user() re-seed + idempotent backfill                  (NO gen:types diff)
src/types/database.types.ts             # regenerated after 0039 (new table + columns)
```

### Pattern 1: Relaxed `abastecimentos_cost_xor` (THE central predicate)

**What:** Replace the strict XOR (0027 L60–63) with a branch on the parcelado marker. Drop-then-add so it is idempotent and replay-clean.

**Current (0027, to REPLACE):** [VERIFIED: 0027_carros.sql L60–63]
```sql
constraint abastecimentos_cost_xor check (
  (transaction_id is not null and amount_cents is null)
  or (transaction_id is null and amount_cents is not null)
)
```

**Recommended relaxed predicate** (à-vista = "≥1 fonte não-nula"; parcelado = valor_total only):
```sql
-- 0039: idempotent — constraints can't use IF NOT EXISTS, so drop then add.
alter table public.abastecimentos drop constraint if exists abastecimentos_cost_xor;
alter table public.abastecimentos
  add constraint abastecimentos_cost_xor check (
    case
      -- PARCELADO (D-05): cost is valor_total_cents ONCE; abastecimentos.transaction_id
      -- is NEVER used (links live in the junction), and amount_cents is NEVER used.
      when parcelas_total is not null and parcelas_total > 1 then
        valor_total_cents is not null
        and transaction_id is null
        and amount_cents   is null
      -- À-VISTA (D-01): at least one cost source present. attach-later (BOTH present)
      -- now passes; "neither" is still rejected. valor_total_cents must stay null here.
      else
        not (transaction_id is null and amount_cents is null)
        and valor_total_cents is null
    end
  );
```

**Why each clause:**
- Parcelado branch forces the cost-of-record onto `valor_total_cents` and bans both 1:1 cost sources — guarantees the view's `CASE parcelas_total > 1` branch is the *only* place parcelado cost can come from (no ambiguity, no double-count source).
- À-vista branch keeps the v1.2 invariant that a fuel-up always has a cost, but loosens "exactly one" to "at least one" so attach-later (esperado + real coexisting, D-01) is legal. It also pins `valor_total_cents is null` on the à-vista path so the two cost models never bleed into each other.

**Why CHECK over a partial constraint:** a single `CASE` CHECK is the simplest construct that covers both branches and is trivially replay-safe (drop-then-add). It also reads as one truth table (below).

### Pattern 2: `abastecimento_parcelas` junction (D-03)

**What:** N:1 junction (one parcelado abastecimento → N parcela transactions), RLS-scoped like every 0027/0025 table, with double-link prevention.

```sql
create table if not exists public.abastecimento_parcelas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  abastecimento_id  uuid not null references public.abastecimentos(id) on delete cascade,
  transaction_id    uuid not null references public.transactions(id)   on delete cascade,
  parcela_num       int  not null check (parcela_num > 0),
  created_at        timestamptz not null default now(),
  -- A transaction is at most ONE parcela across the whole junction (no tx is two parcelas).
  constraint abastecimento_parcelas_transaction_uniq unique (transaction_id),
  -- Parcela numbers are unique within a given abastecimento (no two "parcela 1").
  constraint abastecimento_parcelas_num_uniq unique (abastecimento_id, parcela_num)
);

create index if not exists abastecimento_parcelas_user_idx  on public.abastecimento_parcelas (user_id);
create index if not exists abastecimento_parcelas_abast_idx on public.abastecimento_parcelas (abastecimento_id);

alter table public.abastecimento_parcelas enable row level security;
grant select, insert, update, delete on public.abastecimento_parcelas to authenticated, service_role;

drop policy if exists "own abastecimento_parcelas" on public.abastecimento_parcelas;
create policy "own abastecimento_parcelas" on public.abastecimento_parcelas
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

**Double-link prevention — the two distinct hazards and how the schema stops each:**

1. **A transaction as two parcelas** → `unique (transaction_id)` on the junction. Direct. [HIGH]
2. **A transaction simultaneously an à-vista link (`abastecimentos.transaction_id`) AND a parcela in the junction.** This is the subtle one. A single multi-table CHECK cannot express it (Postgres CHECK is single-row, single-table). Two viable enforcement strategies:
   - **(Recommended, schema-only) Make them structurally disjoint via the relaxed CHECK + app contract.** The CHECK already forces parcelado rows to have `abastecimentos.transaction_id IS NULL` (D-05). So an à-vista `transaction_id` only ever exists on a *non-parcelado* abastecimento, and parcelas only ever attach to *parcelado* abastecimentos (parcelas_total > 1). The double-link a tx-is-both-an-à-vista-link-and-a-parcela can therefore only happen if the SAME tx id is reused across two DIFFERENT abastecimento rows (one à-vista, one parcelado). `abastecimentos_transaction_uniq` (kept) already makes a tx at most one à-vista link; `abastecimento_parcelas_transaction_uniq` makes it at most one parcela. The remaining cross-table reuse (à-vista on abast A + parcela on abast B, same tx) is **not** preventable by a constraint without a trigger; it is the same class of cross-table invariant the existing code enforces in the action layer (the `ALREADY_LINKED` pre-check in `src/actions/abastecimentos.ts` L99–108). **Recommendation: enforce cross-table single-link in the 27/28 action wiring (out of P26 app scope), and document the residual in the migration header.** The schema makes the *common* double-links impossible; the cross-row reuse is an app-layer invariant by existing precedent. [HIGH — matches repo's existing defense-in-depth model]
   - **(Optional, stronger, more SQL) A `before insert` trigger** on the junction that rejects a `transaction_id` already present in `abastecimentos.transaction_id`, and vice-versa on `abastecimentos`. Heavier; only add if the planner wants belt-and-suspenders. Most repos here lean on the action-layer pre-check + unique indexes rather than cross-table triggers. [MEDIUM]

**`parcela_num` type/constraints:** `int not null check (parcela_num > 0)` mirrors the positive-int invariant style of `odometro_km int not null check (odometro_km > 0)` in 0027. Unique within abastecimento via `unique (abastecimento_id, parcela_num)`. [HIGH]

### Pattern 3: View rewrite without double-count (D-02, D-05, D-08)

**Critical:** the **live** view is the **0029** body (id-anchored interval tuple via row-value comparison), NOT the 0027 original. The rewrite MUST start from 0029 or it silently regresses WR-02/WR-05/WR-06. [VERIFIED: 0029 is the last `create or replace view v_abastecimento_consumo`; 0030 is `adherence_views_refresh`, unrelated]

The only change vs the 0029 body is the **cost expression**. Today (0029 L82, L115) cost is `coalesce(t.amount_cents, s.amount_cents)`. Parcelado needs `valor_total_cents` counted **once**. The cleanest place is in the `fills` CTE per-row cost, so both the `litros`/`custo` subqueries and the `coalesce` inherit it:

```sql
-- inside fills CTE: replace the custo expression with a parcelado-aware one.
coalesce(
  case when a.parcelas_total is not null and a.parcelas_total > 1
       then a.valor_total_cents                     -- parcelado: full fuel cost, ONCE
       else coalesce(t.amount_cents, a.amount_cents) -- à-vista: real wins over esperado (D-02)
  end
, 0)::bigint as custo_cents
```
…and the same `CASE` inside the **interval subquery** (0029 L114–123) that sums `coalesce(st.amount_cents, s.amount_cents)`:
```sql
select sum(
  case when s.parcelas_total is not null and s.parcelas_total > 1
       then s.valor_total_cents
       else coalesce(st.amount_cents, s.amount_cents)
  end
)
```

**Why no double-count:** the consumo cost comes from the abastecimento row's `valor_total_cents` exactly once (it's a per-row scalar, summed once per interval). The per-parcela **transactions** live in `transactions` tagged with `carro_id`; they feed `v_carro_resumo.gasto_total_cents` (the cash-flow tag total) but **never** feed `v_abastecimento_consumo` cost, because that view reads cost from `abastecimentos`, not from tagged transactions. The two metrics stay distinct exactly as D-02 states. [HIGH]

**`v_carro_resumo` (0027 L198–240):** likely needs **no structural change** — it reads consumo averages OFF `v_abastecimento_consumo` (so the new cost flows through automatically) and `gasto_total_cents` OFF `transactions.carro_id` (unchanged tag semantics). Confirm during planning that `preco_litro_medio_cents` (which divides `Σ custo_intervalo_cents ÷ Σ litros_intervalo`) reads sensibly when parcelado cost is the full `valor_total_cents` — it does, because litros for that fill is the real volume and the cost is the real full cost. **Re-issue `v_carro_resumo` only if the planner wants to keep the 0027/0028/0029 "interval logic in ONE place" discipline visibly intact; otherwise leaving it is consistent with 0028/0029 which deliberately left it untouched.** [HIGH — 0028 L6–8 and 0029 L6–8 both explicitly leave v_carro_resumo as-is for this exact reason]

**Preserve `with (security_invoker = true)`** on BOTH views — non-negotiable anti-leak invariant proven by `tests/carro-view-leak.test.ts`. A DEFINER view leaks every user's rows. [VERIFIED: 0027 L11–13, 0028 L11–13, 0029 L10–13, tests/carro-view-leak.test.ts]

### Pattern 4: "Combustível" seed (D-06, D-07) — mirror 0035 exactly

**Sort math:** current seed (0035) is sort 1–12 with Marketplace at 9. Inserting "Combustível" at sort 4 (right after Transporte=3) pushes Saúde and everything below +1. New ordering: [VERIFIED: 0035 L23–34 current body]

```
1 Moradia · 2 Alimentação · 3 Transporte · 4 Combustível(NEW) · 5 Saúde · 6 Educação ·
7 Lazer · 8 Vestuário · 9 Assinaturas · 10 Marketplace · 11 Investimentos · 12 Reserva · 13 Outros
```
(Outros stays last — now sort 13.)

```sql
-- 0040: (1) re-seed handle_new_user() — copy 0035 body, Combustível at sort 4, shift the rest.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, user_id) values (new.id, new.id);
  insert into public.categories (user_id, name, kind, sort, is_reserva) values
    (new.id, 'Moradia',        'consumo',   1, false),
    (new.id, 'Alimentação',    'consumo',   2, false),
    (new.id, 'Transporte',     'consumo',   3, false),
    (new.id, 'Combustível',    'consumo',   4, false),   -- NEW
    (new.id, 'Saúde',          'consumo',   5, false),
    (new.id, 'Educação',       'consumo',   6, false),
    (new.id, 'Lazer',          'consumo',   7, false),
    (new.id, 'Vestuário',      'consumo',   8, false),
    (new.id, 'Assinaturas',    'consumo',   9, false),
    (new.id, 'Marketplace',    'consumo',  10, false),
    (new.id, 'Investimentos',  'alocacao', 11, false),
    (new.id, 'Reserva',        'alocacao', 12, true),
    (new.id, 'Outros',         'consumo',  13, false);
  return new;
end; $$;

-- (2) Idempotent backfill — add to any account lacking it (skips UI-added dups).
insert into public.categories (user_id, name, kind, sort, is_reserva)
select p.user_id, 'Combustível', 'consumo', 4, false
  from public.profiles p
 where not exists (
   select 1 from public.categories c
    where c.user_id = p.user_id and c.name = 'Combustível'
 );
```

**Sort caveat for the planner (decide explicitly):** the backfill inserts Combustível at sort 4 but does **NOT** re-number existing categories. Existing accounts will have Combustível at 4 colliding with their existing Saúde (also 4) — `categories.sort` has no unique constraint [VERIFIED: 0002 L10–18, no unique on sort], so this is legal, but ordering ties resolve arbitrarily. **0035 had the same property** (it inserted Marketplace at 9 alongside the old sort-9 row without renumbering) and shipped accepted. Recommendation: **mirror 0035's behavior (insert-only, no renumber)** for backfill consistency, and accept the tie on existing accounts — it's purely a display-order nicety, not a correctness issue. If the founder wants existing accounts perfectly re-sorted, that's a separate `update categories set sort = sort + 1 where sort >= 4` step the planner can add — flag as a discretion call. [MEDIUM — behavioral parity with 0035 is the safe default]

**No gen:types diff:** this migration is data + trigger function body only — no DDL on a table shape. `gen:types` reads schema, not function bodies or rows, so `database.types.ts` is unaffected (same as 0035). [HIGH]

### Anti-Patterns to Avoid
- **Rewriting the view from the 0027 body.** It would drop the WR-02/05/06 fixes. Start from **0029**. [VERIFIED]
- **Turning the relaxed CHECK back into anything that allows "neither".** The à-vista branch must keep `not (transaction_id is null and amount_cents is null)`.
- **Letting parcelado rows carry `amount_cents` or `abastecimentos.transaction_id`.** Banned by the parcelado branch — it's what keeps the consumo cost unambiguous.
- **Dropping `security_invoker = true`** on a `create or replace view`. Re-state it every time (the attribute is part of the view definition).
- **Adding a unique constraint on `categories.sort`.** None exists; the seed math relies on its absence.
- **Putting the seed in the same migration as the schema.** Mixing makes the "this migration has no gen:types diff" claim untrue and muddies SC review.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-table "tx not double-linked" full enforcement | A bespoke multi-table CHECK (impossible) or an elaborate trigger web | Unique indexes (per-table) + the existing action-layer pre-check pattern (`ALREADY_LINKED`, abastecimentos.ts L99–108), wired in 27/28 | Matches the repo's established defense-in-depth; a cross-table trigger is more surface for the rare reuse case. |
| Interval consumo math | A fresh window-function view | The **0029** body verbatim + only the cost `CASE` swapped | The interval logic is hard-won (WR-02/05/06); re-deriving it risks silent regression. |
| Idempotent category seed | A custom "does it exist" RPC | The `0035` `insert … where not exists (name = …)` backfill verbatim | Proven idempotent + replay-safe; matches every other seed in the repo. |
| Money typing | Anything float | `bigint` centavos, always positive (pinned invariant) | 0027 L8–9 invariant; `valor_total_cents bigint check (… > 0)`. |
| Type definitions | Hand-editing `database.types.ts` | `npm run gen:types` | Pre-commit hook regenerates it anyway (see dev-env memory); hand edits get clobbered. |

**Key insight:** every brick already exists in this repo — relaxing a CHECK, an RLS-scoped junction (0027 shape), a `security_invoker` view (0027/0028/0029), an idempotent seed (0035). P26 is **assembly of proven local patterns**, not invention. The risk is regression (view body, security_invoker, replay order), not novelty.

## Runtime State Inventory

> This is a schema-migration phase. Runtime state matters here because the relaxed CHECK and seed touch live data on replay.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `abastecimentos` rows (existing à-vista fills, all satisfy the relaxed CHECK — "exactly one" ⊂ "at least one"); `categories` rows per existing account (need 'Combustível' backfill). | Relaxed CHECK: existing rows pass (strictly weaker on à-vista; parcelado branch unreachable since `parcelas_total` is null on all current rows). Seed: idempotent backfill covers existing accounts. **No data migration of existing rows needed** beyond the backfill insert. |
| Live service config | None — no n8n/Datadog/external config keys on this string. | None. |
| OS-registered state | None. | None — verified by scope (SQL + types only). |
| Secrets/env vars | None — no secret references the abastecimento schema or "Combustível". | None. |
| Build artifacts | `src/types/database.types.ts` — stale after 0039 adds the table + columns. | `npm run gen:types` (D-09 / SC5). Pre-commit hook also regenerates it (dev-env memory). |

**Replay safety:** all new DDL uses `create table if not exists`, `add column if not exists`, `drop constraint if exists`/`add constraint`, `create index if not exists`, `drop policy if exists`/`create policy`, `create or replace view`/`function`. A `supabase db reset` re-applies 0001→0040 clean. Existing à-vista rows satisfy the relaxed CHECK on first apply. [HIGH]

## Common Pitfalls

### Pitfall 1: Adding columns without `if not exists` breaks replay
**What goes wrong:** `alter table … add column …` fails on a second `db reset`.
**Why:** the table already has the column on replay-after-failure or partial states.
**How to avoid:** `add column if not exists parcelas_total int;` / `add column if not exists valor_total_cents bigint check (valor_total_cents is null or valor_total_cents > 0);`
**Warning signs:** `db:reset` errors on 0039.

### Pitfall 2: Constraint can't use `IF NOT EXISTS`
**What goes wrong:** `alter table … add constraint abastecimentos_cost_xor` errors "already exists" on replay.
**Why:** Postgres `add constraint` has no `if not exists`.
**How to avoid:** always `drop constraint if exists` immediately before `add constraint` (the 0028 pattern, L24–33). [VERIFIED: 0028]
**Warning signs:** replay fails specifically on the CHECK.

### Pitfall 3: View rewrite silently regresses WR-02/05/06
**What goes wrong:** consumo km/l or R$/km goes wrong for tied-odometer or rolled-back readings.
**Why:** rewriting from the 0027 body instead of 0029.
**How to avoid:** copy the **0029** view body; change ONLY the cost `CASE`. Run `tests/carro-consumo.test.ts` (it has the WR-02 same-odometer fixture).
**Warning signs:** `carro-consumo.test.ts` fails on the same-odometer carro.

### Pitfall 4: Dropping `security_invoker` on replace
**What goes wrong:** every user sees every user's consumo rows.
**Why:** `create or replace view` without re-stating `with (security_invoker = true)` resets it to definer.
**How to avoid:** re-state the attribute on every view in 0039. Run `tests/carro-view-leak.test.ts`.
**Warning signs:** `carro-view-leak.test.ts` "user B reads ZERO" fails.

### Pitfall 5: Parcelado cost double-counted
**What goes wrong:** parcelado fuel cost appears both as `valor_total_cents` in consumo AND as summed parcela transactions.
**Why:** if the view summed tagged transactions for consumo cost (it doesn't) OR if a parcelado row also carried `amount_cents`/`transaction_id` (the relaxed CHECK bans this).
**How to avoid:** the parcelado CHECK branch (`amount_cents null`, `transaction_id null`) + consumo reading cost from `abastecimentos`, not `transactions`. Add a parcelado fixture to the consumo test (see Validation).
**Warning signs:** a parcelado interval's `custo_intervalo_cents` ≠ `valor_total_cents`.

### Pitfall 6: gen:types claim mismatch
**What goes wrong:** SC says "seed has no types diff" but the diff is non-empty.
**Why:** seed accidentally added to the schema migration.
**How to avoid:** keep seed in 0040 (function body + rows only). Verify `git diff src/types/database.types.ts` after `gen:types` shows ONLY the new table + two columns.
**Warning signs:** types diff touches `categories` or `handle_new_user`.

## Code Examples

All canonical patterns are inline in **Architecture Patterns** above, copied/adapted from these verified repo sources:
- Relaxed CHECK → adapts `0027_carros.sql` L60–63 (the strict XOR being replaced).
- Junction table + RLS → mirrors `0027_carros.sql` L46–100 (table + RLS + grants + policy shape).
- View rewrite → adapts `0029_consumo_same_odometer_fix.sql` L40–149 (the LIVE body) — cost `CASE` only.
- Seed → mirrors `0035_categories_marketplace.sql` L13–48 verbatim with the sort-4 insert.
- Drop-then-add constraint idempotency → `0028_carros_fix.sql` L24–33.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Strict cost XOR (one source) | Relaxed: à-vista "≥1 source" + parcelado "valor_total only" | P26 (0039) | Enables attach-later + parcelamento; existing rows unaffected. |
| Consumo view 0027 body | 0029 body (id-anchored interval row-value tuple) | 0028→0029 (v1.2 review) | **Rewrite must start from 0029**, not 0027. |
| 12-category seed (Marketplace @9) | 13-category seed (Combustível @4) | P26 (0040) | Sort shift; no types diff. |

**Deprecated/outdated:**
- The 0027 `abastecimentos_cost_xor` predicate — replaced in P26.
- Using `v_abastecimento_consumo`'s 0027/0028 bodies as the rewrite base — superseded by 0029.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cross-row tx reuse (à-vista on abast A + parcela on abast B, same tx) is enforced at the action layer in 27/28, not by a P26 constraint. | Pattern 2 | If founder wants pure-schema enforcement, P26 needs an extra trigger. Low risk — matches the repo's existing `ALREADY_LINKED` action-layer precedent. Flag in discuss/plan. |
| A2 | Backfill inserts Combustível at sort 4 WITHOUT renumbering existing accounts' categories (mirrors 0035's insert-only behavior; sort ties accepted on existing accounts). | Pattern 4 | If perfect re-sort on existing accounts is required, add a `update … set sort = sort + 1 where sort >= 4` step. Display-only, not correctness. |
| A3 | `v_carro_resumo` needs NO structural change (reads consumo off the rewritten view + gasto off transactions). | Pattern 3 | If the planner wants the "one place" discipline visibly re-stated, re-issue it unchanged; harmless either way. |
| A4 | Two migrations (0039 schema / 0040 seed) is preferred over one. | Summary / layout | Planner's call (CONTEXT L145–146 explicitly leaves one-vs-two to the planner). One migration also works but blurs the gen:types-diff boundary. |
| A5 | Validation is vitest-against-local-stack (no pgTAP in repo). | Validation Architecture | Verified by grep — no pgTAP. If the planner introduces pgTAP it's net-new infra (not recommended; breaks repo convention). |

## Open Questions (RESOLVED)

1. **One migration or two?**
   - What we know: CONTEXT L145–146 leaves it to the planner; schema has a types diff, seed doesn't.
   - RESOLVED: **two migrations** — `0039` (schema, has gen:types diff) + `0040` (seed, no types diff). Adopted by the plans (cleanest SC5 story; preserves the diff boundary).

2. **Re-sort existing accounts' categories, or insert-only?**
   - What we know: 0035 inserted-only (no renumber) and shipped; `categories.sort` has no unique constraint.
   - RESOLVED: **insert-only backfill** (where-not-exists, parity with 0035); the cosmetic sort tie on existing accounts is accepted/flagged, no renumber.

3. **Optional cross-table double-link trigger?**
   - What we know: unique indexes + relaxed CHECK make the common double-links impossible; the residual cross-row reuse is the same class the action layer already guards.
   - RESOLVED: **double-link enforcement deferred to the action layer in Phases 27/28** (no P26 trigger). Residual cross-row reuse is documented in the 0039 header and tracked as threat T-26-06; matches the repo's existing `ALREADY_LINKED` action-layer precedent.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase local Docker stack (`supabase start`) | replay + integration tests | assumed ✓ (repo's standard dev loop) | CLI ^2.106.0 | none — required for SC5 replay + all DB tests |
| `npm run gen:types` (local stack) | SC5 types regen | ✓ (script exists) | — | none |
| Docker | local Postgres | assumed ✓ | — | none — Supabase local needs it |

**Missing dependencies with no fallback:** none identified; the toolchain is the repo's existing dev loop. Note (dev-env memory): the dev server points at PROD Supabase and a pre-commit hook rewrites `database.types.ts` — run migrations/tests against the **local** stack, and let the hook own the types file.

## Validation Architecture

> nyquist_validation is enabled. No pgTAP in this repo — every DB invariant is proven by **vitest integration tests against the local Docker stack** (`tests/helpers/local-supabase.ts` harness: `serviceClient`/`userClient`/`createUser`). New assertions clone `tests/carro-consumo.test.ts` / `tests/carro-view-leak.test.ts` / `tests/abastecimento-action.test.ts`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.9 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` [VERIFIED] |
| Quick run command | `npx vitest run tests/<file>.test.ts` |
| Full suite command | `npm test` (= `vitest run`) |
| DB stack | local Supabase Docker (`supabase start`); replay via `npm run db:reset` |

### Phase Requirements → Test Map (Success Criteria SC1–SC5)
| SC | Behavior | Test Type | Automated Command | File |
|----|----------|-----------|-------------------|------|
| SC1 | "Combustível" present on NEW account (handle_new_user) AND backfilled on existing; no gen:types diff | integration + git assert | `npx vitest run tests/categorias-combustivel.test.ts` (create user → assert category exists at sort 4) + `git diff --exit-code src/types/database.types.ts` after gen:types on the SEED migration | ❌ Wave 0: `tests/categorias-combustivel.test.ts` |
| SC2 | Relaxed CHECK accepts attach-later (both present, à-vista), accepts parcelado (valor_total only), rejects "neither", rejects parcelado-with-amount/tx | integration (insert + expect 23514 on invalid) | `npx vitest run tests/abastecimento-cost-check.test.ts` (full truth table — see below) | ❌ Wave 0: `tests/abastecimento-cost-check.test.ts` |
| SC3 | parcelado columns persist; à-vista path unchanged (regression) | integration | extend `tests/abastecimento-action.test.ts` or the new check test | ❌ Wave 0 (extend existing) |
| SC4 | re-link enabled at DB/contract: a tx can be linked to a pre-existing abastecimento (junction insert + re-set abastecimentos.transaction_id legal under relaxed CHECK) | integration | `npx vitest run tests/abastecimento-parcelas.test.ts` (junction unique + double-link rejection) | ❌ Wave 0: `tests/abastecimento-parcelas.test.ts` |
| SC5 | migrations replay clean + types regenerated | command + git assert | `npm run db:reset` (must exit 0) → `npm run gen:types` → `git diff src/types/database.types.ts` shows ONLY new table + 2 columns | ❌ Wave 0 (CI/manual step) |
| (anti-leak) | both rewritten views stay security_invoker | integration | `npx vitest run tests/carro-view-leak.test.ts` (existing — must stay green) | ✅ exists |
| (no double-count) | parcelado consumo cost = valor_total_cents ONCE; parcela transactions don't inflate consumo | integration | extend `tests/carro-consumo.test.ts` with a parcelado fixture | ✅ exists (extend) |
| (consumo regression) | WR-02/05/06 still hold after view rewrite | integration | `npx vitest run tests/carro-consumo.test.ts` (existing same-odometer fixture) | ✅ exists |

### CHECK truth table (the deterministic SC2 assertions)
Let P = `parcelas_total > 1`, T = `transaction_id` not null, A = `amount_cents` not null, V = `valor_total_cents` not null.

| Case | P | T | A | V | Expected | Why |
|------|---|---|---|---|----------|-----|
| à-vista manual (v1.2) | F | F | T | F | **PASS** | ≥1 source, V null. Existing rows. |
| à-vista linked (v1.2) | F | T | F | F | **PASS** | ≥1 source, V null. Existing rows. |
| attach-later (D-01) | F | T | T | F | **PASS** | both present now allowed. |
| à-vista neither | F | F | F | F | **REJECT** | no cost source. |
| à-vista with V leak | F | T/F | T/F | T | **REJECT** | V belongs to parcelado only. |
| parcelado valid (D-05) | T | F | F | T | **PASS** | valor_total only. |
| parcelado + tx | T | T | F | T | **REJECT** | parcelado never uses transaction_id. |
| parcelado + amount | T | F | T | T | **REJECT** | parcelado never uses amount_cents. |
| parcelado no V | T | F | F | F | **REJECT** | parcelado must have valor_total_cents. |

Each row is one insert assertion (expect success, or expect Postgres error code **`23514`** check_violation). [VERIFIED: abastecimento-action test asserts on rejected cost states already, L212/L266 pattern]

### Sampling Rate
- **Per task commit:** the touched DB test(s), e.g. `npx vitest run tests/abastecimento-cost-check.test.ts`.
- **Per wave merge:** `npm test` (full vitest suite against the local stack).
- **Phase gate:** `npm run db:reset` exits 0 (clean replay) + `npm run gen:types` + full suite green before `/gsd-verify-work`.

### Deterministic vs backstop
- **Deterministic (SQL/test assertions):** the full CHECK truth table (9 inserts), junction unique + double-link rejection, view security_invoker leak test, parcelado-no-double-count fixture, clean replay exit code, gen:types diff scope. These are exact and gate the phase.
- **Backstop (none required):** no property-based/held-out testing needed — the state space is the finite truth table above; exhaustive enumeration IS the test. No AI/non-determinism in this phase.

### Wave 0 Gaps
- [ ] `tests/abastecimento-cost-check.test.ts` — the 9-row CHECK truth table (SC2/SC3). New file, clone `abastecimento-action.test.ts` seeding helpers.
- [ ] `tests/abastecimento-parcelas.test.ts` — junction unique(transaction_id), unique(abastecimento_id, parcela_num), double-link rejection, RLS isolation (SC4). New file, clone `carro-rls.test.ts` shape.
- [ ] `tests/categorias-combustivel.test.ts` — new account has Combustível (sort 4) + backfill idempotency (SC1). New file.
- [ ] Extend `tests/carro-consumo.test.ts` — add a parcelado fixture asserting `custo_intervalo_cents == valor_total_cents` and that tagged parcela transactions don't inflate consumo (no-double-count).
- [ ] No framework install needed — vitest + local-supabase harness already present.

## Security Domain

> `security_enforcement` default-enabled. This phase is DB-only; the security surface is RLS isolation + the SECURITY DEFINER trigger + view leak prevention.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | **yes** | RLS `(select auth.uid()) = user_id` on `abastecimento_parcelas` (USING + WITH CHECK, FOR ALL TO authenticated) — clone 0027 policy. `security_invoker = true` on both views (caller's RLS, never definer's). |
| V5 Input Validation | yes | CHECK constraints (`parcela_num > 0`, `valor_total_cents > 0`, relaxed cost CHECK) pin invariants at the DB; FKs `on delete cascade`/`set null` per 0027. |
| V6 Cryptography | no | No crypto in this phase. |
| V2/V3 (auth/session) | no | Unchanged; trigger is SECURITY DEFINER with pinned `search_path = public` (already the 0035 pattern). |

### Known Threat Patterns for Supabase Postgres data layer
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Definer view leaks all users' consumo/parcela rows | Information Disclosure | `with (security_invoker = true)` re-stated on every `create or replace view`; proven by `tests/carro-view-leak.test.ts`. |
| New junction table without RLS = world-readable to authenticated | Information Disclosure | enable RLS + "own abastecimento_parcelas" policy + grants to authenticated/service_role (0027 shape). |
| SECURITY DEFINER trigger search_path hijack | Elevation of Privilege | `set search_path = public` on `handle_new_user()` (already in 0035; preserve verbatim). |
| Cross-user FK write via forged abastecimento_id/transaction_id | Tampering | RLS WITH CHECK on insert + (in 27/28) action-layer `assertOwnedCarro`/`assertOwnedTransaction` re-derivation before any FK write (existing precedent, abastecimentos.ts L83–108). |

## Sources

### Primary (HIGH confidence — verified in this repo this session)
- `supabase/migrations/0027_carros.sql` — abastecimentos table (L46–64), strict cost XOR (L60–63), transaction uniq index (L67–68), RLS/grants (L84–100), both views (L102–240), pinned invariants (L8–19).
- `supabase/migrations/0028_carros_fix.sql` — drop-then-add constraint idempotency (L24–33), WR-05/06 view fixes, "v_carro_resumo left as-is" rationale (L6–8).
- `supabase/migrations/0029_consumo_same_odometer_fix.sql` — the LIVE consumo view body (L40–149), id-anchored row-value interval tuple (WR-02).
- `supabase/migrations/0035_categories_marketplace.sql` — seed pattern: re-seed handle_new_user (L13–37) + idempotent backfill (L41–48), "no gen:types diff" rationale (L9–10).
- `supabase/migrations/0002_categories.sql` — categories table (no unique on name/sort), handle_new_user SECURITY DEFINER (L10–18).
- `src/actions/abastecimentos.ts` — create/update contracts, ALREADY_LINKED pre-check (L99–108), "relinking out of scope for v1" note (L145–147).
- `src/lib/schemas/abastecimento.ts` — Zod XOR superRefine (L49–60), intentionally NOT touched in P26.
- `tests/carro-view-leak.test.ts`, `tests/carro-consumo.test.ts`, `tests/abastecimento-action.test.ts` — vitest-against-local-stack harness, WR-02 same-odometer fixture, cost-state rejection assertions.
- `package.json` — db:push/db:reset/gen:types/test scripts; supabase ^2.106.0, vitest ^4.1.9.
- `.planning/ROADMAP.md` §Phase 26 — Goal + SC1–SC5. `.planning/REQUIREMENTS.md` — FUEL-01.

### Secondary (MEDIUM)
- grep across `supabase/` and `tests/` — confirmed no pgTAP (validation is vitest only).

### Tertiary (LOW)
- none.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all tooling verified in package.json.
- Architecture (CHECK predicate, junction, view, seed): HIGH — every pattern copied/adapted from verified repo files; truth table enumerated.
- Pitfalls: HIGH — derived from the actual 0027→0029 migration history and the live tests.
- Cross-table double-link enforcement strategy: MEDIUM — schema stops common cases; residual cross-row reuse is an action-layer invariant (A1) by repo precedent.

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable — internal schema, no external dependency churn)
