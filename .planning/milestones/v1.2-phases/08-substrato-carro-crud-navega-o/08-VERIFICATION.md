---
phase: 08-substrato-carro-crud-navega-o
verified: 2026-06-17T16:35:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
mode: mvp
---

# Phase 8: Substrato Carro + CRUD + navegação — Verification Report

**Phase Goal:** Usuário cria/edita/arquiva carro(s) numa aba dedicada, e o sistema fica com todo o substrato de dados do módulo (tabelas `carros`/`abastecimentos`, coluna `transactions.carro_id`, views de consumo `security_invoker`, RLS e ownership re-derivado) em pé — front-loading do schema irreversível.
**Verified:** 2026-06-17T16:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is observably TRUE in the codebase. Every ROADMAP Success Criterion is satisfied with codebase + live-DB evidence (not SUMMARY claims). The irreversible substrate is verified against the **live local Postgres** (port 55322), the typed client is byte-identical to a fresh regen (zero drift), and the user-facing CRUD slice builds and resolves under the auth guard. The deferred KPIs/abastecimento-UI/expense-tagging (CAR-02..05) are intentionally out of scope per the roadmap (Phases 9-11) — not gaps.

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | SC#1 — Usuário cadastra/edita/arquiva/desarquiva carro; lista `/carros` mostra não-arquivados, badge nos arquivados | ✓ VERIFIED | `carroSchema` (apelido required + 4 optional + combustivel enum + ano 1900..yr+1); `createCarro/updateCarro/archiveCarro/unarchiveCarro` in `src/actions/carros.ts`; `/carros/page.tsx` reads RLS-scoped, `.eq('is_archived', false)` default, `CarrosArchiveFilter` toggles `?arquivados=1`, CarroCard grid + "Arquivado" badge; CarroForm wired to create/update; 22 unit tests green |
| 2   | SC#2 — Aba "Carros" (ícone Car) na sidebar + bottom-nav; `/carros` e `/carros/[id]` resolvem sob auth guard | ✓ VERIFIED | `Car` imported + `{href:'/carros',label:'Carros',icon:Car}` in `app-sidebar.tsx` (line 26, after Reservas) AND `bottom-nav.tsx` (6 href items); `npm run build` compiles `ƒ /carros` and `ƒ /carros/[id]`; `(app)/layout.tsx` calls `getClaims()` → `redirect('/auth/login')` (both routes inherit) |
| 3   | SC#3 — `carros`, `abastecimentos`, nullable `transactions.carro_id` (ON DELETE SET NULL) com RLS; query de outro usuário retorna vazio | ✓ VERIFIED | Live DB: both tables present; `transactions.carro_id` = uuid, nullable; FK delete_rule = **SET NULL** (also `abastecimentos.transaction_id`=SET NULL, `abastecimentos.carro_id`=CASCADE); RLS enabled on both; policies "own carros"/"own abastecimentos" carry both `USING ((select auth.uid())=user_id)` and `WITH CHECK`; XOR CHECK + partial unique index live; `tests/carro-rls.test.ts` asserts User B reads zero (green) |
| 4   | SC#4 — `v_abastecimento_consumo` + `v_carro_resumo` são `security_invoker = true` (não vazam) e cliente tipado regenera sem drift | ✓ VERIFIED | Live DB: both views `reloptions = {security_invoker=true}`; `tests/carro-view-leak.test.ts` — User A sees own rows, User B `toHaveLength(0)` on both views (green); fresh `supabase gen types --local` diffs **0 lines** against committed `database.types.ts` (zero drift confirmed, not just claimed) |
| 5   | SC#5 — Toda escrita de carro re-deriva a posse (`assertOwnedCarro`) antes do write; nunca expõe service-role no bundle do cliente | ✓ VERIFIED | `assertOwnedCarro` (`src/lib/ownership.ts:134`) = RLS-active exactly-1-row → 3-state `OwnershipResult`; `updateCarro`/`setArchived` call it BEFORE `.eq('id',id)`, return `{error}` + NO write on `not-owned`; `'use server'`, never throws, `{ ok } | { error }`; no `service_role`/admin client import in any client component (grep NONE) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/0027_carros.sql` | tables + carro_id + views + RLS + XOR + indexes, idempotent | ✓ VERIFIED | 241 lines; all objects present, idempotent guards; applied to live DB (verified by direct SQL introspection) |
| `src/types/database.types.ts` | regenerated, carros/abastecimentos/carro_id/views, no drift | ✓ VERIFIED | Contains all new objects; fresh regen diff = 0 lines |
| `tests/carro-rls.test.ts` | 2-user isolation + XOR/unique negatives | ✓ VERIFIED | Green; asserts isolation across 3 objects + DB-level negatives |
| `tests/carro-view-leak.test.ts` | security_invoker proof both views | ✓ VERIFIED | Green; User B reads zero on both views |
| `src/lib/schemas/carro.ts` | carroSchema | ✓ VERIFIED | apelido required, optionals, combustivel enum, ano bound |
| `src/actions/carros.ts` | 4 actions | ✓ VERIFIED | All 4 exported, Zod+session+ownership gated, never throw |
| `src/lib/ownership.ts` | assertOwnedCarro | ✓ VERIFIED | exactly-1-row RLS re-derive (3-state) |
| `src/actions/carros.test.ts` | action unit tests | ✓ VERIFIED | Green (Zod gate, session gate, IDOR no-write, shape) |
| `src/components/carro-form.tsx` (≥80) | create/edit Dialog | ✓ VERIFIED | 248 lines, wired to createCarro/updateCarro |
| `src/components/carro-card.tsx` (≥60) | identity card | ✓ VERIFIED | 135 lines, no money helper, wired to archive actions + CarroForm |
| `src/app/(app)/carros/page.tsx` | list RSC | ✓ VERIFIED | RLS read + filter + grid + Empty + error |
| `src/app/(app)/carros/[id]/page.tsx` | minimal detail RSC | ✓ VERIFIED | maybeSingle → notFound, identity-only definition list |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `abastecimentos.transaction_id` | `transactions.id` | FK SET NULL + partial unique | ✓ WIRED | Live DB: delete_rule=SET NULL; `abastecimentos_transaction_uniq` partial index present |
| `transactions.carro_id` | `carros.id` | FK ON DELETE SET NULL (nullable) | ✓ WIRED | Live DB: nullable uuid, delete_rule=SET NULL (deleting carro unlinks lançamentos non-destructively, D4) |
| `src/actions/carros.ts` | `assertOwnedCarro` | re-derive before write | ✓ WIRED | called in updateCarro/setArchived before `.eq('id',id)` |
| `src/actions/carros.ts` | `carros` table | RLS insert/update after getClaims | ✓ WIRED | `from('carros')` insert/update, user_id from getClaims().sub |
| `app-sidebar.tsx` / `bottom-nav.tsx` | `/carros` | NAV_ITEMS Car entry | ✓ WIRED | both files; bottom-nav 6 items |
| `carros/page.tsx` | `carros` table | RLS select + is_archived filter | ✓ WIRED | `from('carros').select(...).eq('is_archived',false)` |
| `carro-form/card/detail-actions` | Plan-02 actions | create/update/archive/unarchive | ✓ WIRED | all imports + call sites confirmed |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| tsc clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| carro test suite | `npx vitest run` (4 carro files) | 36/36 passed | ✓ PASS |
| production build + routes | `npm run build` | exit 0; `/carros` + `/carros/[id]` compiled | ✓ PASS |
| live schema substrate | direct SQL introspection (port 55322) | tables/column/views/RLS/FK/constraints all present | ✓ PASS |
| security_invoker on views | `pg_class.reloptions` | `{security_invoker=true}` both | ✓ PASS |
| type no-drift | fresh `gen types --local` diff | 0 lines | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CAR-01 | 08-01/02/03 | Cadastra/edita/arquiva carro(s); lista mostra não-arquivados | ✓ SATISFIED | SC#1+#3+#5 verified; full CRUD slice + substrate live |
| CAR-06 | 08-01/03 | Aba "Carros" sidebar+bottom-nav; rotas `/carros` + `/carros/[id]` | ✓ SATISFIED | SC#2 verified; nav in both, routes compile under auth guard |

No orphaned requirements: REQUIREMENTS.md maps exactly CAR-01, CAR-06 to Phase 8; both claimed by plans. CAR-02..05 are mapped to Phases 9-11 (not Phase 8).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/TODO/placeholder/coming-soon in any phase file | — | Clean |

### Deferred Items (intentional — addressed in later phases, NOT gaps)

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | KPIs / gasto total / km/l on card+detail | Phase 11 | ROADMAP Phase 11 goal: detalhe mostra gasto + histórico + curva km/l |
| 2 | Expense tagging UI (`carro_id` write from extrato/form) | Phase 9 | ROADMAP Phase 9 / CAR-02 |
| 3 | Abastecimento UI + consumption surfacing | Phase 10 | ROADMAP Phase 10 SC#1/#4 (CAR-03/04) |
| 4 | Review WR-01 (SQL CHECK on ano/combustivel) | Accepted deviation | ano/combustivel validated in `carroSchema` (Zod) at the server boundary; documented review deferral |
| 5 | Review WR-05/06 (negative-km guard in v_abastecimento_consumo) | Phase 10 | The consumption view's owning phase; view holds zero rows until abastecimento UI ships (Phase 10 SC#4) |

### Human Verification Required

None. Per 08-VALIDATION.md, the phase reuses the frozen Phase-7 design system verbatim (zero new visual primitives) and every behavior has an automated gate (unit/integration tests + build/tsc/SQL introspection). All gates executed and passed during this verification.

### Gaps Summary

No gaps. All 5 ROADMAP Success Criteria and all PLAN must_haves are verified against the live codebase and database. The irreversible substrate (tables, nullable `transactions.carro_id` ON DELETE SET NULL, both `security_invoker` views, uniform RLS with USING+WITH CHECK, XOR CHECK, partial unique index, four indexes) is confirmed in the running local Postgres — not merely declared in SQL. The typed client is byte-identical to a fresh regen (zero drift). The CRUD slice (schema, four IDOR-safe never-throw actions with `assertOwnedCarro` re-derive, CarroForm/CarroCard, `/carros` list with archive filter, minimal `/carros/[id]` with notFound on foreign id) builds, type-checks, and tests green (36/36 carro tests). Nav entries present in both surfaces; routes resolve under the `(app)` auth guard. No service-role key reaches the client bundle. Deferred KPIs/abastecimento/tagging are roadmap-scheduled for Phases 9-11 and are not Phase-8 gaps.

---

_Verified: 2026-06-17T16:35:00Z_
_Verifier: Claude (gsd-verifier)_
