---
phase: 26-substrato-do-abastecimento-ponta-a-ponta
verified: 2026-06-21T20:31:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 26: Substrato do abastecimento ponta-a-ponta Verification Report

**Phase Goal:** O modelo de dados deixa de exigir o custo no momento da criação e passa a suportar o fluxo "registro agora, fatura depois". A migration (~0039+) relaxa o CHECK `abastecimentos_cost_xor` (de 0027) para permitir attach-later, adiciona colunas de parcelamento, e libera o re-link; em paralelo seeda a categoria default 'Combustível' (kind consumo) para todos os usuários. Substrato puro de dados — habilita as fases 27 e 28.
**Verified:** 2026-06-21T20:31:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The verification ran against the LIVE local schema (`supabase_db_gestao-financeira` on port 55322, per `supabase/config.toml`), not just the SQL on disk. Every claimed object was queried out of the running Postgres catalog and matches the migration files byte-for-intent. The four Wave 0 Nyquist tests plus the modified sibling/regression tests were executed against that live schema and pass.

### Observable Truths (ROADMAP Success Criteria SC1–SC5)

| #   | Truth (Success Criterion)   | Status     | Evidence       |
| --- | --------------------------- | ---------- | -------------- |
| 1   | SC1 — Default 'Combustível' (kind consumo) for every user: seeded in `handle_new_user` (new accounts) + idempotent backfill (existing), no `gen:types` effect | ✓ VERIFIED | Live `pg_get_functiondef(handle_new_user)` contains `('Combustível','consumo',4,false)` + `SECURITY DEFINER` + `search_path=public`; backfill `insert ... select ... where not exists name='Combustível'` (0040 L45-52); no schema DDL → types diff empty (0040 is data/trigger only). Test `categorias-combustivel.test.ts` green (seed-on-signup + backfill idempotency). |
| 2   | SC2 — Abastecimento with manual expected value + transaction linked later (attach-later); CHECK accepts it, forbids double/none cost | ✓ VERIFIED | Live `abastecimentos_cost_xor` CASE: à-vista branch = `NOT(transaction_id IS NULL AND amount_cents IS NULL) AND valor_total_cents IS NULL` → BOTH-present passes, neither rejected. `abastecimento-cost-check.test.ts` asserts the full 9-row truth table (4 PASS incl. attach-later F/T/T/F, 5 REJECT incl. neither → 23514) — green. |
| 3   | SC3 — Parcelado: nº parcelas + valor total persisted (new columns), à-vista preserved without regression | ✓ VERIFIED | Live columns `parcelas_total int`, `valor_total_cents bigint` (positive-or-null guard live); preserved partial index `abastecimentos_transaction_uniq ... WHERE transaction_id IS NOT NULL` confirmed live (untouched by 0039). `carro-rls.test.ts` à-vista path green (no regression). |
| 4   | SC4 — Transaction can be re-linked/attached to a pre-existing abastecimento (re-link enabled at DB/contract layer) | ✓ VERIFIED | Relaxed CHECK no longer forces tx-at-create-only; junction `abastecimento_parcelas` with `unique(transaction_id)` + `unique(abastecimento_id, parcela_num)` + RLS live. Test `abastecimento-parcelas.test.ts` 'a transaction can be attached to a PRE-EXISTING abastecimento (attach-later is legal)' + uniqueness + RLS-isolation cases green. (Action-layer re-link wiring is Phase 27/28 by design; SC4 here is the DB-substrate enablement, which holds.) |
| 5   | SC5 — Migrations replay clean in order locally; `database.types.ts` regenerated reflecting parcelamento columns | ✓ VERIFIED | Live schema is the product of the clean `db:reset` replay (0001→0040): all 0039/0040 objects present in catalog. `src/types/database.types.ts` carries `abastecimento_parcelas` (4 refs) + `parcelas_total`/`valor_total_cents` in Row/Insert/Update (lines 97-133). Empty diff is the accepted pass state (0039 regenerated in Plan 02; 0040 seed contributes no diff). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `supabase/migrations/0039_abastecimento_parcelado.sql` | relaxed CHECK + parcelamento columns + junction + view rewrite + RLS/grants | ✓ VERIFIED | 236 lines; relaxed `abastecimentos_cost_xor` CASE, `parcelas_total`/`valor_total_cents` add-column-if-not-exists, `abastecimento_parcelas` junction (unique tx + unique abast/parcela_num + RLS policy + grants), `v_abastecimento_consumo` rewritten with `security_invoker = true` and parcelado-aware cost CASE at both sites. All confirmed live. |
| `supabase/migrations/0040_categorias_combustivel.sql` | Combustível seed + idempotent backfill, no schema DDL | ✓ VERIFIED | 53 lines; `create or replace function handle_new_user` (Combustível sort 4, security definer, search_path public) + `insert ... where not exists` backfill. No DDL → no types diff. Confirmed live in function body. |
| `src/types/database.types.ts` | regenerated — new table + 2 columns | ✓ VERIFIED | `abastecimento_parcelas` present (4 refs); `parcelas_total`/`valor_total_cents` in Row/Insert/Update. Matches live schema. |
| `tests/abastecimento-cost-check.test.ts` | 9-row relaxed-CHECK truth table | ✓ VERIFIED | 210 lines; 9 `it()` cases (4 PASS / 5 REJECT-23514). Green live. |
| `tests/abastecimento-parcelas.test.ts` | junction unique + double-link + RLS | ✓ VERIFIED | 201 lines; unique(transaction_id), unique(abastecimento_id,parcela_num), attach-later, user-B-reads-zero RLS isolation. Green live. |
| `tests/categorias-combustivel.test.ts` | Combustível seed + backfill idempotency | ✓ VERIFIED | 96 lines; new-account seed + `where not exists` backfill idempotency. Green live. |
| `tests/carro-consumo.test.ts` | parcelado no-double-count fixture | ✓ VERIFIED | 383 lines; Carro 4 parcelado fixture asserts `custo_intervalo_cents == valor_total_cents` counted once. Green live. |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| 0039 | `public.abastecimentos` | drop+add relaxed `abastecimentos_cost_xor` (CASE) | ✓ WIRED | Live constraint def matches the CASE predicate exactly. |
| 0039 | `public.v_abastecimento_consumo` | `create or replace view ... with (security_invoker = true)` cost CASE on parcelas_total | ✓ WIRED | Live `reloptions = {security_invoker=true}`; cost CASE present at both view sites (L160-163, L196-200). |
| 0039 | `public.abastecimento_parcelas` | junction with unique(tx) + unique(abast,parcela_num) + RLS | ✓ WIRED | Live: both unique constraints, FKs (user/abast/tx ON DELETE CASCADE), RLS enabled, policy `own abastecimento_parcelas` (ALL). |
| 0040 | `public.handle_new_user` | re-seed with Combustível sort 4, security definer | ✓ WIRED | Live function body contains the Combustível insert + hardening. |
| 0040 | `public.categories` | idempotent `where not exists` backfill | ✓ WIRED | 0040 L45-52; `where not exists name='Combustível'`. |
| Wave 0 tests | 0039 + 0040 | inserts exercising relaxed CHECK / junction / seed | ✓ WIRED | 24/24 Wave 0 assertions pass against live schema. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Relaxed CHECK 9-row truth table (SC2/SC3 — behavior-dependent) | `vitest run abastecimento-cost-check` | 9/9 pass (4 PASS, 5 REJECT-23514) | ✓ PASS |
| Junction unique + attach-later + RLS isolation (SC4) | `vitest run abastecimento-parcelas` | pass | ✓ PASS |
| Combustível seed-on-signup + backfill idempotency (SC1) | `vitest run categorias-combustivel` | pass | ✓ PASS |
| Parcelado no-double-count in view | `vitest run carro-consumo` | pass | ✓ PASS |
| No regression: à-vista cost path + 13-category seed + anti-leak invoker view | `vitest run carro-rls seed-categories carro-view-leak` | 13/13 pass | ✓ PASS |
| Live constraint def matches migration | `psql ... pg_get_constraintdef('abastecimentos_cost_xor')` | CASE predicate matches | ✓ PASS |
| Preserved à-vista 1:1 index | `psql ... pg_indexes abastecimentos_transaction_uniq` | partial unique index present | ✓ PASS |

Combined: 37/37 phase-relevant tests green against the live local schema. The behavior-dependent truths (CHECK accept/reject transitions, RLS per-user isolation, view no-double-count) are proven by executed tests, not symbol presence alone.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| FUEL-01 | 26-01/02/03/04 | Default 'Combustível' category (kind consumo) for all users | ✓ SATISFIED | SC1 verified live (handle_new_user + backfill). FUEL-01's second clause (auto-suggest Combustível on vínculo confirm) is the action-layer behavior explicitly mapped to Phase 28; ROADMAP SC1 scopes the Phase-26 portion to category existence/seed, which is delivered. REQUIREMENTS.md marks FUEL-01 Complete; no orphaned requirements for this phase. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in any phase-26 migration or modified test. Migrations are fully replay-idempotent (drop-if-exists, add-if-not-exists). |

### Gaps Summary

None. The phase goal — a pure data substrate that relaxes the cost XOR for attach-later, adds parcelamento columns + RLS-scoped junction, rewrites the consumo view safely (security_invoker, no double-count), and seeds the Combustível category — is fully achieved and proven against the live local schema with 37/37 phase-relevant tests green.

**Note on advisory code-review item WR-01 (non-blocking):** the junction RLS gates only the self-set `user_id` and does not DB-enforce cross-user `abastecimento_id`/`transaction_id` ownership. This matches the pre-existing `abastecimentos` pattern, is documented in the 0039 header (L25-33), and is a conscious deferral to the Phase 27/28 action layer (which does not exist yet). It is not a Phase-26 goal failure — the phase goal is the data substrate only. The phase makes the common double-links structurally impossible via `abastecimentos_transaction_uniq` + `abastecimento_parcelas_transaction_uniq`.

**Note on production deploy:** production `supabase db push` of 0039/0040 is the deferred, credential-gated deploy-time step per this project's established pattern — intentionally out of scope for this local-substrate phase.

---

_Verified: 2026-06-21T20:31:00Z_
_Verifier: Claude (gsd-verifier)_
