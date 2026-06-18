---
phase: 08-substrato-carro-crud-navega-o
reviewed: 2026-06-17T00:00:00Z
depth: standard
files_reviewed: 19
files_reviewed_list:
  - supabase/migrations/0027_carros.sql
  - src/types/database.types.ts
  - src/lib/schemas/carro.ts
  - src/lib/schemas/carro.test.ts
  - src/lib/ownership.ts
  - src/actions/carros.ts
  - src/actions/carros.test.ts
  - src/components/carro-form.tsx
  - src/components/carro-card.tsx
  - src/components/carro-detail-actions.tsx
  - src/components/carros-archive-filter.tsx
  - src/app/(app)/carros/page.tsx
  - src/app/(app)/carros/[id]/page.tsx
  - src/app/(app)/carros/loading.tsx
  - src/components/app-sidebar.tsx
  - src/components/bottom-nav.tsx
  - tests/carro-rls.test.ts
  - tests/carro-view-leak.test.ts
findings:
  critical: 0
  warning: 6
  info: 4
  total: 10
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-17
**Depth:** standard
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Reviewed the Carro substrate: migration `0027_carros.sql` (tables `carros` +
`abastecimentos`, nullable `transactions.carro_id ON DELETE SET NULL`, the two
`security_invoker` consumption views, the cost XOR CHECK, the partial unique
index, RLS), the Zod schema, the server actions, and the CRUD/nav UI.

The weighted concerns are in good shape:

- **RLS / ownership.** `security_invoker = true` is present on both views and
  proven by `carro-view-leak.test.ts`; both tables carry the uniform
  `auth.uid() = user_id` USING + WITH CHECK policy; `assertOwnedCarro` re-derives
  ownership before every `update`/archive write, and `createCarro` correctly does
  NOT re-derive (it is a self-scoped insert). The IDOR no-write path is covered by
  `carros.test.ts`.
- **XOR cost CHECK + partial unique index** are written correctly and exercised
  by `carro-rls.test.ts` (both-source, neither-source, and duplicate-link cases).
- **`carro_id` tagging is non-destructive:** additive nullable column, `ON DELETE
  SET NULL`, no category/metas accounting keys off it.
- **Result-shape discipline** is uniform `{ ok: true } | { error }`, never throws,
  raw DB details never leaked.
- **No service-role key** appears in any client bundle file.

No BLOCKERS found. The findings below are robustness / consistency gaps. The most
material is the schema-vs-Zod divergence (WR-01): the DB accepts `combustivel_padrao`
and `ano` values the application layer rejects, so any non-action write path (or a
future direct insert) can persist values the rest of the system assumes impossible.

## Warnings

### WR-01: DB has no CHECK on `combustivel_padrao` / `ano` — only Zod guards them

**File:** `supabase/migrations/0027_carros.sql:32-33`, `src/lib/schemas/carro.ts:19-22`
**Issue:** `combustivel_padrao` is a bare `text` column and `ano` a bare `int` in the
migration, with no CHECK constraint. The application restricts `combustivel_padrao`
to `('Flex','Gasolina','Etanol','Diesel','GNV')` and `ano` to `1900..currentYear+1`
purely in Zod (`carro.ts`). Any write path that bypasses the action — a direct
Supabase insert, a future server action, or the RLS test itself
(`carro-rls.test.ts:61` inserts `ano: 2020` with no combustivel) — can store an
arbitrary fuel string or a nonsense year. The UI then renders that junk as a badge
(`carro-card.tsx:91`) and a future selector seeded from the enum would silently drop
it. For a single-source-of-truth schema (a stated project convention: "one schema
validates form + DB shape"), the constraint belongs in SQL too.
**Fix:**
```sql
alter table public.carros
  add constraint carros_combustivel_padrao_chk
  check (combustivel_padrao is null
         or combustivel_padrao in ('Flex','Gasolina','Etanol','Diesel','GNV'));
alter table public.carros
  add constraint carros_ano_chk
  check (ano is null or (ano between 1900 and extract(year from now())::int + 1));
```
(Note the SQL `ano` upper bound drifts with `now()` while the Zod bound is fixed at
module load — keep them reconciled, or relax the SQL upper bound to a generous
constant to avoid a year-rollover mismatch.)

### WR-02: `ano` parsing yields a misleading error for non-integer input

**File:** `src/components/carro-form.tsx:112-119`
**Issue:** `buildInput()` does `ano: anoTrimmed ? Number(anoTrimmed) : undefined`.
`inputMode="numeric"` is only a soft hint (desktop keyboards, paste, and some mobile
keyboards still allow letters/decimals). `Number("abc")` → `NaN` and `Number("20.5")`
→ `20.5`; both fail `z.number().int()`, but the surfaced message is Zod's default
integer/NaN message keyed under `ano`, not the intended friendly `"Ano inválido"`.
The user sees a confusing error for what is really an invalid-year case.
**Fix:** Normalize to a clean integer-or-undefined before handing to the schema, or
parse with a guard:
```ts
const anoNum = anoTrimmed ? Number.parseInt(anoTrimmed, 10) : undefined
return {
  // ...
  ano: anoTrimmed && Number.isInteger(anoNum) ? anoNum : anoTrimmed ? Number.NaN : undefined,
}
```
or better, give `ano` an explicit `z.coerce.number().int(...).optional()` with a
single friendly message, and feed it the raw string.

### WR-03: List filtering happens in JS after fetching all rows; archived rows still leave the DB

**File:** `src/app/(app)/carros/page.tsx:34-40`
**Issue:** The query selects every carro for the user, then `.filter((c) =>
showArchived || !c.is_archived)` drops archived ones in JS. This is correct for
isolation (RLS still scopes to the user), but the default-view contract ("archived
hidden by default") is enforced client-of-DB-side rather than in the query. It is
not a security issue — only the caller's own archived rows are ever transmitted —
but it is inconsistent with pushing the predicate to Postgres and means archived
identity data is shipped to the server component even when hidden.
**Fix:** Apply the filter in the query so the default view never reads archived rows:
```ts
let q = supabase.from('carros').select('id, apelido, modelo, placa, ano, combustivel_padrao, is_archived')
if (!showArchived) q = q.eq('is_archived', false)
const { data, error } = await q.order('apelido', { ascending: true })
```

### WR-04: `assertOwnedCarro` treats a query error identically to "not owned"

**File:** `src/lib/ownership.ts:122-129`, `src/actions/carros.ts:92-94,117-119`
**Issue:** `assertOwnedCarro` returns `false` on either a real "no such owned row"
OR a transient DB/network error (`if (error || !data) return false`). The action then
returns `{ error: 'Carro inválido.' }` — telling the user their (legitimately owned)
carro is invalid when the truth is a backend hiccup. This is the shared pattern
across the ownership helpers, so it is consistent, but it conflates two distinct
failure modes and produces a wrong, alarming message on transient failure. (It is a
warning, not a blocker, because it fails safe — no write is issued.)
**Fix:** Distinguish the error case from the empty case so the caller can surface a
generic "tente novamente" instead of "Carro inválido.":
```ts
export async function assertOwnedCarro(supabase: Client, id: string):
  Promise<'owned' | 'not-owned' | 'error'> {
  const { data, error } = await supabase.from('carros').select('id').eq('id', id)
  if (error) return 'error'
  return (data?.length === 1) ? 'owned' : 'not-owned'
}
```
(Optional / cross-cutting — applies to all `assertOwned*` helpers, not just carro.)

### WR-05: `v_abastecimento_consumo` interval logic is non-deterministic on tied odometers

**File:** `supabase/migrations/0027_carros.sql:123,151-166`
**Issue:** `lag(a.odometro_km) over (partition by a.carro_id order by a.odometro_km)`
orders only by `odometro_km`. If two `tanque_cheio` fills share the same
`odometro_km` (data-entry error, or an odometer reset), the lag is non-deterministic
and `km_rodados = odometro_km - prev_full_odometro` can be `0` (guarded → null) or
negative (NOT guarded — see WR-06). The interval-sum subqueries
(`odometro_km > prev AND <= current`) likewise behave oddly with ties. The views are
not yet UI-consumed (Phase 10 by design), so this is latent, but the interval math
silently produces wrong rows rather than rejecting the bad data.
**Fix:** Add a deterministic tiebreaker to the window and document the monotonic-
odometer assumption (or add a per-carro CHECK/trigger in Phase 10):
```sql
lag(a.odometro_km) over (partition by a.carro_id order by a.odometro_km, a.occurred_on, a.id)
```

### WR-06: `reais_por_km` guards zero but not a negative `km_rodados`

**File:** `supabase/migrations/0027_carros.sql:151,179-186`
**Issue:** `km_rodados = f.odometro_km - f.prev_full_odometro`. The `km_por_litro`
and `reais_por_km` cases guard `is null` and `= 0` but NOT a negative result. A
`tanque_cheio` fill recorded with an `odometro_km` lower than the previous full-tank
fill (odometer rollover, mistyped reading) yields negative `km_rodados`, a negative
`litros_intervalo`-driven `km_por_litro`, and a negative `reais_por_km` — silently
flowing into the `v_carro_resumo` averages. Only `odometro_km > 0` is enforced at the
column level; nothing enforces monotonicity. Again latent (no UI yet) but it corrupts
the averages the resumo will eventually surface.
**Fix:** Guard non-positive `km_rodados` in both views, e.g.:
```sql
case when i.km_rodados is null or i.km_rodados <= 0 then null
     else (i.km_rodados / i.litros_intervalo) end as km_por_litro
```
and the same `<= 0` guard on the `reais_por_km` branch; consider filtering
`where km_rodados > 0` in the `intervals` CTE so bad intervals never reach the resumo.

## Info

### IN-01: `combustivel` (abastecimentos) is unconstrained free text, unlike `combustivel_padrao`

**File:** `supabase/migrations/0027_carros.sql:54`
**Issue:** `abastecimentos.combustivel` is bare `text` while `carros.combustivel_padrao`
is conceptually the same enum. The naming differs and one is (intended to be) enum-
constrained while the other is free text. Not a bug for this phase (no abastecimento
UI yet), but worth aligning when Phase 10 lands so the two fuel columns share one
validation source.
**Fix:** Reuse the same enum/CHECK for `abastecimentos.combustivel` in Phase 10.

### IN-02: `as Combustivel | undefined` cast bypasses the type system in the form

**File:** `src/components/carro-form.tsx:118`
**Issue:** `combustivel_padrao: (combustivel || undefined) as Combustivel | undefined`
casts a free-form `string` to the enum type. The subsequent `carroSchema.safeParse`
catches an invalid value at runtime, so it is safe in practice, but the cast defeats
TS strict checking at the boundary and would hide a future mismatch between the
component's `COMBUSTIVEL_OPTIONS` list and the schema enum.
**Fix:** Let the schema narrow it — pass the raw string and rely on the Zod enum to
reject, or type the `combustivel` state as `Combustivel | ''` and feed the Select
only enum values.

### IN-03: Detail page exposes archived carros via direct URL with no indication beyond the badge

**File:** `src/app/(app)/carros/[id]/page.tsx:24-32`
**Issue:** `/carros/[id]` reads the carro with no `is_archived` filter, so an archived
carro is fully viewable/editable by direct URL. This is intentional (archive is a
soft, reversible toggle and the "Arquivado" badge is shown), and RLS still scopes to
the owner — noting only that there is no redirect/notice for archived detail beyond
the badge, which is fine for v1.
**Fix:** None required; documented for awareness.

### IN-04: `carros.test.ts` uses a malformed UUID constant for the owned-id fixture

**File:** `src/actions/carros.test.ts:91`
**Issue:** `const CARRO_ID = '44444444-4444-4444-8444-444444444444'` — the third group
should encode the UUID version nibble. `z.string().uuid()` (the action's `idSchema`)
accepts it because it is lenient on version/variant, so the test passes, but the
fixture is not a strictly valid v4 UUID and reads as a typo. Cosmetic.
**Fix:** Use a canonical UUID (e.g. `'44444444-4444-4444-9444-444444444444'`) or
`crypto.randomUUID()` for the fixture.

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
