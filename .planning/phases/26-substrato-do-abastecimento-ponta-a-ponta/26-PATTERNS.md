# Phase 26: Substrato do abastecimento ponta-a-ponta - Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 6 (2 migrations, 1 generated types, 3 new tests, 1 extended test)
**Analogs found:** 6 / 6 (all in-repo, exact)

> Pure data-layer phase. Artifacts are SQL migrations + vitest integration tests + a regenerated types file — NO app code. RESEARCH.md already locks the exact SQL bodies; this map pins each artifact to its analog file:line and the minimal shape to copy. Read RESEARCH.md Patterns 1–4 for the full target SQL; this file is the analog→artifact bridge.

## File Classification

| New/Modified Artifact | Role | Data Flow | Closest Analog | Match Quality |
|-----------------------|------|-----------|----------------|---------------|
| `supabase/migrations/0039_abastecimento_parcelado.sql` | migration (schema) | transform (DDL: CHECK + columns + junction + 2 view rewrites + RLS/grants) | `0027_carros.sql` (table/CHECK/RLS/view) + `0028_carros_fix.sql` (drop-then-add) + `0029_consumo_same_odometer_fix.sql` (LIVE view body) | exact (assembly of 3 proven patterns) |
| `supabase/migrations/0040_categorias_combustivel.sql` | migration (seed) | batch (data + trigger redef) | `0035_categories_marketplace.sql` | exact |
| `src/types/database.types.ts` | generated | n/a (codegen output) | — (run `npm run gen:types`, never hand-edit) | n/a |
| `tests/abastecimento-cost-check.test.ts` | test (integration) | request-response (insert → 23514 assert) | `tests/abastecimento-action.test.ts` + `tests/helpers/local-supabase.ts` | exact |
| `tests/abastecimento-parcelas.test.ts` | test (integration) | request-response (junction unique + RLS) | `tests/carro-rls.test.ts` + harness | exact |
| `tests/categorias-combustivel.test.ts` | test (integration) | request-response (seed-on-new + backfill) | `tests/carro-rls.test.ts` `createUser` flow + harness | role-match (no existing categories test) |
| `tests/carro-consumo.test.ts` (EXTEND) | test (integration) | request-response (parcelado no-double-count) | its own WR-02 same-odometer fixture (L142–186, L276–301) | exact (self-analog) |

---

## Pattern Assignments

### `supabase/migrations/0039_abastecimento_parcelado.sql` (migration / schema)

This file has FOUR sub-parts, each with a distinct analog. Header MUST pin the invariants verbatim in the style of `0027_carros.sql` L8–19 (centavos bigint always-positive; `litros` is volume not money; `security_invoker = true` mandatory on views) and document the residual cross-row double-link as an action-layer invariant (RESEARCH A1).

**Sub-part A — Relaxed CHECK.** Analog: `0027_carros.sql` L60–63 (the strict XOR being REPLACED) + `0028_carros_fix.sql` L24–33 (drop-then-add idempotency, since `add constraint` has no `IF NOT EXISTS`).

Strict XOR to replace (`0027_carros.sql` L60–63):
```sql
constraint abastecimentos_cost_xor check (
  (transaction_id is not null and amount_cents is null)
  or (transaction_id is null and amount_cents is not null)
)
```
Drop-then-add shape to mirror (`0028_carros_fix.sql` L24–27):
```sql
alter table public.carros drop constraint if exists carros_ano_chk;
alter table public.carros
  add constraint carros_ano_chk
  check (ano is null or (ano between 1900 and 2100));
```
→ Apply this drop-then-add to `abastecimentos_cost_xor` with the relaxed CASE predicate from RESEARCH Pattern 1 (à-vista "≥1 source" + `valor_total_cents is null`; parcelado branch `valor_total_cents not null and transaction_id is null and amount_cents is null`).

**Sub-part B — New columns + junction.** Analog: `0027_carros.sql` table def L46–64, the unique index L67–68 (PRESERVE — do not touch), positive-int CHECK style `odometro_km int not null check (odometro_km > 0)` (L51), and the full RLS/grants/policy shape L84–100.

Columns: `add column if not exists` (replay-safe — RESEARCH Pitfall 1). `parcelas_total int`, `valor_total_cents bigint check (valor_total_cents is null or valor_total_cents > 0)` — mirror the `amount_cents` positive-cents CHECK at L56.

Index to PRESERVE intact (`0027_carros.sql` L67–68):
```sql
create unique index if not exists abastecimentos_transaction_uniq
  on public.abastecimentos (transaction_id) where transaction_id is not null;
```
RLS/grants/policy shape to mirror for the junction (`0027_carros.sql` L84–100):
```sql
alter table public.abastecimentos enable row level security;
grant select, insert, update, delete on public.abastecimentos to authenticated, service_role;
drop policy if exists "own abastecimentos" on public.abastecimentos;
create policy "own abastecimentos" on public.abastecimentos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```
→ Clone 1:1 as `"own abastecimento_parcelas"`. Junction columns + `unique (transaction_id)` + `unique (abastecimento_id, parcela_num)` per RESEARCH Pattern 2; `user_id uuid not null references auth.users(id) on delete cascade` + `created_at timestamptz not null default now()` exactly as the `0027` table rows (L48, L58).

**Sub-part C — View rewrite.** Analog: **`0029_consumo_same_odometer_fix.sql` L40–149** — this is the LIVE body and the ONLY correct rewrite base (NOT 0027/0028; RESEARCH Pitfall 3 / Anti-Patterns). `with (security_invoker = true)` MUST be re-stated (`0029` L41) — proven by `tests/carro-view-leak.test.ts`.

The ONLY change vs the 0029 body is the cost expression. Two sites carry `coalesce(t.amount_cents, a.amount_cents)` / `coalesce(st.amount_cents, s.amount_cents)`:
- `fills` CTE per-row cost (`0029` L82)
- interval cost subquery sum (`0029` L114–123)

Both become the parcelado-aware CASE (`case when parcelas_total > 1 then valor_total_cents else coalesce(...) end`) per RESEARCH Pattern 3. `v_carro_resumo` (`0027` L198–240) likely needs NO structural change — it reads OFF the consumo view; re-issue unchanged only to keep the "interval logic in ONE place" discipline (`0028` L5–8, `0029` L5–8 both deliberately left it as-is). RESEARCH A3.

**Sub-part D — gen:types.** This schema DOES diff `database.types.ts` (new table + 2 columns; D-09 / RESEARCH Pitfall 6). Keep the seed OUT of this file so the diff stays scoped.

---

### `supabase/migrations/0040_categorias_combustivel.sql` (migration / seed)

**Analog:** `0035_categories_marketplace.sql` — copy 1:1, two parts.

Part 1 — re-seed `handle_new_user()` (`0035` L13–37): copy the whole `create or replace function … security definer set search_path = public` body, insert `(new.id, 'Combustível', 'consumo', 4, false)` after Transporte (sort 3) and shift Saúde→Outros +1 (RESEARCH Pattern 4 gives the full 13-row VALUES block; Outros becomes sort 13).

Part 2 — idempotent backfill (`0035` L41–48, copy verbatim with name swapped):
```sql
insert into public.categories (user_id, name, kind, sort, is_reserva)
select p.user_id, 'Marketplace', 'consumo', 9, false
  from public.profiles p
 where not exists (
   select 1 from public.categories c
    where c.user_id = p.user_id
      and c.name = 'Marketplace'
 );
```
→ Swap `'Marketplace'`/sort 9 → `'Combustível'`/sort 4. Header MUST state "data + trigger redef only — `database.types.ts` unaffected" (`0035` L9–10). Insert-only, NO renumber of existing accounts (RESEARCH A2 — parity with 0035; sort tie is cosmetic).

---

### `tests/abastecimento-cost-check.test.ts` (test / integration) — SC2/SC3

**Analog:** `tests/abastecimento-action.test.ts` (the 23514-via-error rejection pattern) + `tests/helpers/local-supabase.ts`. Simplest base is actually `tests/carro-rls.test.ts` — it inserts directly into `abastecimentos` via `userClient` and asserts `expect(error).not.toBeNull()` on CHECK violations (no action mock needed). Prefer that direct-insert style for a truth-table test.

Harness boilerplate to copy (`tests/carro-rls.test.ts` L33–49 `createUser`, L51–94 `beforeAll` seeding a carro, L96–100 `afterAll`).

Rejection assertion shape (`tests/carro-rls.test.ts` L139–152):
```sql
const { error } = await a.from('abastecimentos').insert({
  user_id: userA.id, carro_id: carroAId, occurred_on: '2026-05-20',
  odometro_km: 10500, litros: 38, tanque_cheio: true,
  transaction_id: txAId, amount_cents: 20000, // both → must violate the XOR CHECK
})
expect(error).not.toBeNull()
```
→ Implement all 9 rows of the RESEARCH "CHECK truth table" (L430–440): each is one insert, asserting `error` null (PASS) or not-null (REJECT / Postgres `23514`). Cover attach-later PASS (both present, V null), parcelado PASS (V only), and the parcelado-leak REJECTs. To seed a real `transaction_id` use the `seedTx` helper from `abastecimento-action.test.ts` L101–119.

---

### `tests/abastecimento-parcelas.test.ts` (test / integration) — SC4

**Analog:** `tests/carro-rls.test.ts` (two-user RLS isolation shape) + harness.

RLS isolation assertion to mirror (`tests/carro-rls.test.ts` L119–135 — "user B reads ZERO of A's rows"):
```ts
it('user B reads ZERO of user A abastecimentos', async () => {
  const b = userClient(userB.jwt, config)
  const { data } = await b.from('abastecimentos').select('*').eq('user_id', userA.id)
  expect(data ?? []).toHaveLength(0)
})
```
Unique-index rejection to mirror (`tests/carro-rls.test.ts` L168–193 — first insert ok, duplicate not-null error):
```ts
expect(firstErr).toBeNull()
// second link to the SAME transaction_id → must violate the unique index
expect(dupErr).not.toBeNull()
```
→ Assert: junction `unique (transaction_id)` rejects a tx as two parcelas; `unique (abastecimento_id, parcela_num)` rejects two "parcela 1"; double-link (à-vista `abastecimentos.transaction_id` already linked → junction insert of same tx) handled per RESEARCH Pattern 2 hazard #2; two-user RLS isolation on `abastecimento_parcelas`. Seed a parcelado abastecimento (`parcelas_total > 1`, `valor_total_cents` set) using the `carro-rls` `beforeAll` insert style (L83–93).

---

### `tests/categorias-combustivel.test.ts` (test / integration) — SC1

**Analog:** `tests/carro-rls.test.ts` `createUser` flow (L33–49) + `tests/helpers/local-supabase.ts` (`readLocalConfig`/`serviceClient`/`userClient`). No existing categories test — clone the harness, drop the carro seeding.

`createUser` triggers `handle_new_user()` (the seed); read back via `userClient`:
```ts
const a = userClient(userA.jwt, config)
const { data } = await a.from('categories').select('name, sort').eq('name', 'Combustível')
expect((data ?? []).length).toBe(1)
expect(data![0]!.sort).toBe(4)
```
→ Assert: (1) NEW account has 'Combustível' at sort 4 (proves the re-seeded `handle_new_user`); (2) backfill idempotency — running the backfill again does not duplicate (count stays 1). Cleanup via `admin.auth.admin.deleteUser` (`carro-rls` L96–100).

---

### `tests/carro-consumo.test.ts` (EXTEND) — no-double-count

**Analog:** its OWN WR-02 same-odometer fixture — fixture constants L40–43, seeding L142–186, assertions L276–301. Mirror that structure for a 4th carro.

Add `carroParceladoId`, seed a parcelado abastecimento (`parcelas_total = 3`, `valor_total_cents = <full fuel cost>`, `transaction_id`/`amount_cents` NULL — the only legal parcelado shape under the relaxed CHECK) plus the prior full-tank fill so it closes a valid interval. Then mirror the L276–301 assertion block:
```ts
expect(Number(row.custo_intervalo_cents)).toBe(SAME_ODO_C2) // → assert == valor_total_cents, ONCE
```
→ Assert `custo_intervalo_cents === valor_total_cents` (counted once) AND that parcela transactions tagged with `carro_id` do NOT inflate consumo cost (they feed `v_carro_resumo.gasto_total_cents`, never the consumo view — RESEARCH Pattern 3 "why no double-count"). Run after the view rewrite to confirm WR-02/05/06 still hold (Pitfall 3).

---

## Shared Patterns

### Local-stack test harness
**Source:** `tests/helpers/local-supabase.ts` (`readLocalConfig` L38, `serviceClient` L86, `userClient` L97; hard-guarded to 127.0.0.1).
**Apply to:** all 3 new tests + the extension.
**`createUser` flow** (clone `tests/carro-rls.test.ts` L33–49): admin `createUser` → `signInWithPassword` → return `{ id, jwt }`; `afterAll` `admin.auth.admin.deleteUser`.

### RLS / grants on every domain table
**Source:** `0027_carros.sql` L84–100.
**Apply to:** `abastecimento_parcelas` (0039). `enable row level security` + `grant … to authenticated, service_role` + `drop policy if exists` / `create policy "own …" for all to authenticated using ((select auth.uid()) = user_id) with check (…)`.

### security_invoker on every view
**Source:** `0027` L11–13, `0028` L11–13, `0029` L10–13; proven by `tests/carro-view-leak.test.ts`.
**Apply to:** every `create or replace view` in 0039 — re-state `with (security_invoker = true)` (it resets to definer otherwise; RESEARCH Pitfall 4).

### Replay idempotency
**Source:** `0027` (`create table/index if not exists`), `0028` L24–33 (drop-then-add constraint), `0035` (`where not exists` backfill).
**Apply to:** both migrations. `add column if not exists`, `drop constraint if exists`→`add constraint`, `create index if not exists`, `drop policy if exists`→`create policy`, `create or replace view`/`function`. SC5 gate: `npm run db:reset` exits 0.

### Pinned money/volume invariants header
**Source:** `0027` L8–19.
**Apply to:** 0039 header — centavos `bigint` always-positive; `litros`/`valor_total_cents` typing; security_invoker mandatory; plus the residual cross-row double-link note (action-layer invariant, RESEARCH A1).

## No Analog Found

None. Every artifact maps to an exact in-repo analog; `src/types/database.types.ts` is codegen output (`npm run gen:types`), not authored.

## Metadata

**Analog search scope:** `supabase/migrations/` (0027, 0028, 0029, 0035), `tests/` (abastecimento-action, carro-rls, carro-consumo, helpers/local-supabase).
**Files scanned:** 8 (all read in full or at the RESEARCH-pinned ranges).
**Pattern extraction date:** 2026-06-21
