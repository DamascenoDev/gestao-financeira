# Phase 6: Endurecimento (LGPD, isolamento, auditoria) - Research

**Researched:** 2026-06-17
**Domain:** LGPD data-subject rights (export + delete), comprehensive RLS isolation proof, secrets/Storage/PII audits — all against the LOCAL Supabase stack
**Confidence:** HIGH (every claim grounded in this repo's migrations/tests/code; no external version lookups needed — no new packages)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**LGPD export/delete (DATA-02)**
- "Baixar meus dados": bundle (JSON + CSVs) de TODAS as linhas do usuário — incomes (templates+occurrences), transactions, categories, budget_targets, reservas, reserva_ledger, mei (settings/year_flags/invoices), merchant_patterns, statements (metadados).
- Apagar: Server Action SERVER-ONLY que apaga todas as minhas linhas + arquivos no Storage (`{user_id}/`) + o usuário em `auth.users` — usa o admin/service-role client (NUNCA exposto ao cliente).
- Confirmação: type-to-confirm (digitar "APAGAR") com aviso forte de irreversibilidade; após apagar, sign out.
- Escopo do delete: tudo — DB + Storage + auth.

**CSV export (DATA-01)**
- Export CSV das transações (filtrável por período) reusando `ExportCsvButton` + um `transactionsToCsv` (espelha `meiReportToCsv` da Fase 5).
- Relatório MEI: reusar o export já entregue na Fase 5 (NÃO refazer).
- Formato pt-BR consistente: BOM + separador `;` + vírgula decimal (mesmo de `src/lib/mei/csv.ts`).

**Auditoria & isolamento (SEC-01)**
- Teste abrangente de isolamento 2-usuários: usuário B não consegue SELECT/INSERT/UPDATE/DELETE nenhuma linha do usuário A — 4 verbos, TODAS as tabelas E no Storage (estende `tests/helpers/local-supabase.ts` + `rls-isolation.test.ts`, idealmente data-driven sobre a lista de tabelas).
- Auditoria de segredos: grep no bundle client buildado por marcadores de service-role/secret (estende `scripts/check-bundle-secrets.sh` + `bundle-secret-grep.test.ts`).
- Auditoria de Storage: faturas só acessíveis por signed URL (sem `getPublicUrl`, bucket privado).
- Auditoria PII→IA: guard test — sem dependência `@ai-sdk`/`ai`, `suggestCategory` retorna null, zero egress de PII.

### Claude's Discretion
- Forma exata do bundle de export (zip vs JSON único com CSVs embutidos).
- Layout da tela de Privacidade/Conta (export + delete).
- Como o admin/service-role client é instanciado server-only (env var, server-only import).
- Estrutura do teste data-driven de isolamento (lista de tabelas central).

### Deferred Ideas (OUT OF SCOPE)
- UI de conta compartilhada/família para a esposa (MUL-01) → v2 (este teste de isolamento é o pré-requisito).
- Chamada LLM real (CLS-02) + provider/key → pós-v1 (o guard PII garante que nada vaza enquanto isso).
- Deploy remoto + wiring de credenciais → fim do milestone.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Usuário exporta transações e relatório MEI em CSV | `transactionsToCsv` mirrors `meiReportToCsv` (§Standard Stack, §Code Examples); MEI export already shipped (Phase 5 `ExportCsvButton` + `dasn-report-view.tsx`) — confirm + reference, do not rebuild. |
| DATA-02 | Usuário exporta e apaga todos os seus dados (LGPD) | Export bundle over the **14-table** owned set (§Owned-Table Inventory); delete via server-only **service-role admin client** → Storage `remove` of `{user_id}/` prefix → `auth.admin.deleteUser` (DB rows fall by **ON DELETE CASCADE**) (§Architecture Patterns, §Code Examples). |
| SEC-01 | RLS isola dados por usuário em tabelas e Storage, validado com teste de 2 usuários | Data-driven 4-verb × 14-table isolation matrix + Storage object isolation, built on the existing `rls-isolation.test.ts` + `import-storage-rls.test.ts` harness (§Validation Architecture). |
</phase_requirements>

## Summary

This is a hardening phase: no new product features, just the three "ready-for-the-spouse" guarantees — LGPD export/delete, CSV export, and a *proof* of per-user isolation — implemented against the LOCAL Supabase stack the repo already tests against. The codebase is unusually well-prepared: **every one of the 14 user-owned tables FKs `auth.users(id) ON DELETE CASCADE`**, the storage bucket is already private with `{user_id}/` path RLS, the CSV pattern (`meiReportToCsv`) and the export button (`ExportCsvButton`) already exist, the two-user RLS harness (`local-supabase.ts` + `rls-isolation.test.ts`) already exists and is already data-driven over a partial table list, and the secret-bundle gate (`check-bundle-secrets.sh` + `bundle-secret-grep.test.ts`) already exists. The phase is mostly *extending* proven patterns to full coverage, plus one genuinely new and dangerous primitive: the server-only service-role admin client used for account deletion.

The single most important architectural fact: because all 14 tables cascade from `auth.users`, the **delete can be DB-trivial** — `auth.admin.deleteUser(userId)` removes the auth row and Postgres cascades every owned row across all tables automatically. The delete code therefore only needs to do two things explicitly: (1) remove the user's Storage objects under the `{user_id}/` prefix (Storage objects are NOT covered by the DB FK cascade), then (2) call `auth.admin.deleteUser`. Order matters: do Storage first (while you still have a clean handle), then the auth delete last so a failure leaves auth intact and retryable rather than orphaning storage against a deleted auth user.

The service-role key is the first legitimate server-side use of `SUPABASE_SECRET_KEY` in the project (Phases 1–5 used only anon+JWT+RLS). It must live behind `import 'server-only'` in a NEW module (`src/lib/supabase/admin.ts`), never be `NEXT_PUBLIC_*`, and the bundle-secret audit must still pass — proving the secret stays server-side even though it's now actually used.

**Primary recommendation:** Reuse, don't reinvent. Add `transactionsToCsv` next to `meiReportToCsv`; add `src/lib/supabase/admin.ts` (server-only service-role client); centralize the owned-table list in one shared constant that both the export bundle and the isolation matrix consume; extend the existing isolation + bundle-secret tests to full coverage; add the Storage-public and PII-egress guard tests. Delete = Storage `remove` of `{user_id}/`, then `auth.admin.deleteUser`, then sign out.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CSV serialization (transactions, MEI) | Browser/Client (pure fn + Blob download) | — | `meiReportToCsv`/`ExportCsvButton` already run client-side over RLS-scoped data the page already holds. Same model for transactions. |
| Export bundle assembly (read all owned rows) | API / Server Action (RLS-scoped client) | Browser (triggers download) | Must read across 14 tables for the current user; use the **anon+JWT RLS** server client (`src/lib/supabase/server.ts`) so RLS itself guarantees "only my rows" — no service-role needed for export. |
| Account delete (DB + Storage + auth) | API / Server Action (service-role admin client) | — | Deleting the `auth.users` row + Storage objects requires admin privileges RLS forbids. **Only** legitimate service-role use; strictly server-only. |
| RLS isolation enforcement | Database (Postgres RLS) | — | The boundary is the DB policy, never app filtering. The phase *proves* it, doesn't implement it (already enforced). |
| Storage object isolation | Database/Storage (storage.objects RLS) | — | `{user_id}/` path policy already enforces it (0003); the phase audits + proves it. |
| Secret containment | Build/Static (bundle grep gate) | — | The audit asserts the secret never reaches `.next/static`. |

## Owned-Table Inventory (the canonical 14)

> **VERIFIED: grep over `supabase/migrations/`** — every table below declares `user_id uuid ... references auth.users(id) on delete cascade` and `enable row level security` with an `own <table>` policy `using ((select auth.uid()) = user_id)`.

This is the **single source of truth** the export bundle and the isolation matrix must both consume. Recommend a shared constant `src/lib/data/owned-tables.ts` (or `tests/helpers/owned-tables.ts` imported by app code) so adding a table in v2 auto-extends both the export and the isolation proof.

| # | Table | Notes for export / delete / isolation |
|---|-------|----------------------------------------|
| 1 | `profiles` | PK `id` == `user_id`; both FK `auth.users ON DELETE CASCADE`. |
| 2 | `categories` | Referenced by transactions (`ON DELETE RESTRICT`), budget_targets/merchant_patterns (`CASCADE`). |
| 3 | `income_templates` | Recurrence templates. `income_occurrences.template_id` → `ON DELETE SET NULL`. |
| 4 | `income_occurrences` | Per-month income actuals. |
| 5 | `transactions` | `category_id` → categories `ON DELETE RESTRICT`; `statement_id` → statements `SET NULL`; referenced by `reserva_ledger.transaction_id` `SET NULL`. |
| 6 | `budget_targets` | `category_id` → categories `ON DELETE CASCADE`. |
| 7 | `reservas` | Sinking funds. `reserva_ledger.reserva_id` → `ON DELETE CASCADE`. |
| 8 | `reserva_ledger` | `transaction_id` → transactions `SET NULL`. |
| 9 | `statements` | Upload metadata. The **bytes** live in Storage `statements/{user_id}/...` (NOT cascaded by FK). |
| 10 | `merchant_patterns` | `category_id` CASCADE, `reserva_id` SET NULL. |
| 11 | `csv_import_profiles` | Saved CSV column mappings. **Not named in CONTEXT export list but is user-owned** — see Open Question #1. |
| 12 | `mei_settings` | `unique(user_id)`; `mei_start_date`. |
| 13 | `mei_year_flags` | `unique(user_id, year)`; `has_employee`. |
| 14 | `mei_invoices` | NF rows; `amount_cents`, `activity_type`, `tomador`. |

**Storage (NOT a table, NOT FK-cascaded):** bucket `statements`, private (`public = false`), objects under `{user_id}/`. Must be explicitly removed on delete.

**Delete cascade fact [VERIFIED: migrations]:** deleting the `auth.users` row cascades all 14 tables. Cross-table FKs use `RESTRICT`/`SET NULL` only between siblings *within* a user (e.g. `transactions.category_id RESTRICT`), but the auth-level cascade overrides ordering concerns because the whole user subtree goes at once. You do **not** need to hand-order per-table DELETEs.

## Standard Stack

### Core — already in the repo (no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.108.2 | Admin client (`createClient` with secret key) for `auth.admin.deleteUser` + `storage.remove` | Already a dependency; the `auth.admin` API is the only supported way to delete an auth user. [VERIFIED: package.json] |
| `@supabase/ssr` | ^0.12.0 | RLS-scoped server client for the export bundle read | The existing `src/lib/supabase/server.ts` pattern. [VERIFIED: package.json] |
| `server-only` | ^0.0.1 | Build-time guard so the admin module can never be bundled client-side | Already used by `server.ts`; the load-bearing guard for the new admin module. [VERIFIED: package.json] |
| `zod` | ^4.4.3 | Validate the delete confirmation + export period filter inputs | Established boundary-validation pattern. [VERIFIED: package.json] |
| `vitest` | ^4.1.9 | All tests (isolation matrix, audits, CSV) | Existing runner; `npm test` → `vitest run`. [VERIFIED: package.json] |

### Supporting — decision needed

| Concern | Recommendation | Rationale |
|---------|----------------|-----------|
| Bundle format (zip vs single JSON) | **Single JSON with embedded CSV strings** (no zip lib) | Avoids adding a zip dependency (jszip etc.) and a new supply-chain surface in a *hardening* phase. One `meus-dados.json` containing `{ exportedAt, userId, tables: {...}, csv: { transactions, mei } }` is simplest, fully testable, and human-readable. A zip would need a new dep → re-run package-legitimacy gate. If the user later wants discrete files, revisit. [ASSUMED — see A1] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single-JSON bundle | `jszip` → real `.zip` with separate `.csv` files | Nicer UX (open CSVs directly), but adds a runtime dep + bundle-secret/legitimacy re-audit in a security-hardening phase. Defer unless requested. |
| `auth.admin.deleteUser` + cascade | Hand-ordered per-table DELETE loop | Unnecessary and *more* dangerous — the FK cascade already deletes everything atomically; a manual loop reintroduces ordering bugs the cascade prevents. Use the cascade. |
| Service-role client for export read | RLS server client for export read | **Use RLS for export** — service-role bypasses RLS and could silently export the wrong/all users' rows if a filter is forgotten. RLS makes "only my rows" structural. Service-role is reserved for delete *only*. |

**Installation:** None. No new packages. (Confirms the PII guard: zero AI/zip/crypto deps added.)

## Package Legitimacy Audit

> **Not applicable — this phase installs ZERO external packages.** All capabilities use packages already vetted in Phases 1–5 (`@supabase/supabase-js`, `@supabase/ssr`, `server-only`, `zod`, `vitest`). Adding the recommended single-JSON bundle format specifically avoids a new zip dependency. If the planner chooses a zip library against this recommendation, run `gsd-tools query package-legitimacy check --ecosystem npm jszip` first.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
PRIVACY / ACCOUNT SCREEN  (app shell (app)/conta)
        │
        ├──[ "Exportar transações CSV" ]──────────────► ExportCsvButton (client)
        │                                                  │ transactionsToCsv(rows)  (pure fn, mirrors meiReportToCsv)
        │                                                  └─► Blob download  transacoes-{periodo}.csv
        │      (rows = RLS-scoped, already on the page / fetched via server client)
        │
        ├──[ "Baixar meus dados (LGPD)" ]─────────────► Server Action: exportMyData()
        │                                                  │ import server.ts  (anon+JWT, RLS-scoped)
        │                                                  │ for each of 14 owned tables: select('*')   ← RLS = only my rows
        │                                                  │ build { tables, csv:{transactions, mei} }
        │                                                  └─► return JSON  ─► client triggers meus-dados.json download
        │
        └──[ "APAGAR conta" + type-to-confirm "APAGAR" ]► Server Action: deleteMyAccount(confirm)
                                                           │ getClaims() → userId  (from RLS session)
                                                           │ zod: confirm === "APAGAR"  else reject
                                                           │ import 'server-only'  admin.ts  (SERVICE-ROLE)
                                                           │ 1. storage.from('statements').list/remove  {user_id}/*   ← Storage NOT FK-cascaded
                                                           │ 2. auth.admin.deleteUser(userId)            ← cascades all 14 DB tables
                                                           └─► success → client signs out → redirect /login

AUDITS (CI / vitest, no UI):
   check-bundle-secrets.sh  ── grep .next/static for sb_secret_/service_role/SUPABASE_SECRET_KEY  (must be absent)
   storage-public-audit     ── assert bucket private + no getPublicUrl in src/  + cross-user download denied
   pii-egress-guard         ── assert no 'ai'/'@ai-sdk' dep + suggestCategory()===null + no network call
   rls-isolation (matrix)   ── 4 verbs × 14 tables × (user B vs user A) + Storage object isolation
```

### Recommended Project Structure (additions only)

```
src/
├── lib/
│   ├── supabase/
│   │   └── admin.ts            # NEW — server-only service-role client (DELETE ONLY)
│   ├── data/
│   │   └── owned-tables.ts     # NEW — the canonical 14-table list (shared by export + tests)
│   └── export/
│       ├── transactions-csv.ts # NEW — transactionsToCsv (mirrors mei/csv.ts)
│       └── bundle.ts           # NEW — build the LGPD JSON bundle from the 14 tables
├── actions/
│   ├── export-data.ts          # NEW — Server Action exportMyData()
│   └── delete-account.ts       # NEW — Server Action deleteMyAccount() (uses admin.ts)
├── components/
│   ├── export-transactions-button.tsx  # NEW — wraps ExportCsvButton pattern for transactions
│   └── delete-account-form.tsx         # NEW — type-to-confirm "APAGAR" + sign out
└── app/(app)/conta/
    └── page.tsx                # NEW — Privacy/Account screen
tests/
├── helpers/local-supabase.ts   # EXISTS — reuse serviceClient/userClient
├── rls-isolation.test.ts       # EXTEND — 14-table list + 4 verbs (data-driven)
├── storage-isolation.test.ts   # NEW or extend import-storage-rls.test.ts
├── bundle-secret-grep.test.ts  # EXTEND — keep meaningful after delete uses the secret
├── storage-public-audit.test.ts# NEW — bucket private + no getPublicUrl
├── pii-egress-guard.test.ts     # NEW — no ai dep + suggestCategory null
├── transactions-csv.test.ts     # NEW — pt-BR BOM/;/comma correctness
├── export-bundle.test.ts        # NEW — every table present, only my rows
└── delete-account.test.ts       # NEW — A deleted entirely, B intact
scripts/
└── check-bundle-secrets.sh     # EXISTS — already greps the right markers
```

### Pattern 1: Server-only service-role admin client (the dangerous new primitive)

**What:** A NEW module that constructs a plain `createClient` with the secret key, guarded by `import 'server-only'`. Reads `SUPABASE_SECRET_KEY` (the env var already in `.env.example`/`.env.local`). NEVER `NEXT_PUBLIC_*`.
**When to use:** ONLY in the delete Server Action. Never imported by a client component, never by the export read (export uses RLS).
**Why this is safe:** `import 'server-only'` makes the build fail loudly if any client module imports it; the bundle-secret audit proves the key never reaches `.next/static`; vitest aliases `server-only` to a no-op so the module is still unit-testable.

### Pattern 2: Delete ordering — Storage first, auth last

**What:** `deleteMyAccount` does, in order: (1) list + `remove` all objects under `statements/{userId}/`; (2) `auth.admin.deleteUser(userId)`.
**Why this order:** Storage objects are **not** part of the DB FK cascade — if you delete auth first and the storage delete then fails, you've orphaned files belonging to a now-nonexistent user (unreachable, unremovable via the normal RLS path). Deleting storage first means a failure leaves the account fully intact and the whole operation idempotently retryable. The DB rows need no explicit handling — `deleteUser` cascades all 14 tables.
**Idempotency:** `storage.remove` on already-absent paths is a no-op; re-running after a partial failure is safe.

### Pattern 3: Export reads via RLS, not service-role

**What:** `exportMyData` uses the existing `createClient()` from `src/lib/supabase/server.ts` (anon+JWT). For each owned table it does `select('*')` with NO `user_id` filter — RLS already restricts to the caller. Then it also builds the transactions CSV and the MEI CSV (reusing `meiReportToCsv`).
**Why:** RLS guarantees "only my rows" structurally; a forgotten `.eq('user_id', ...)` filter can't leak because the policy enforces it. Using service-role here would *remove* that guarantee — the opposite of what a hardening phase wants.

### Pattern 4: Data-driven isolation matrix (extend, don't rewrite)

**What:** Promote the local `TABLES` array in `rls-isolation.test.ts` (currently 8 tables) to the shared 14-table constant, and add the missing INSERT row shapes (statements, merchant_patterns, csv_import_profiles, mei_settings, mei_year_flags, mei_invoices). The existing test already loops 4 verbs × tables — adding tables auto-extends coverage.
**Why a central list:** when the spouse/multi-account work (MUL-01/02) adds tables in v2, both the export bundle and the isolation proof extend automatically — no table can silently ship without an isolation test.

### Anti-Patterns to Avoid

- **Hand-ordered per-table DELETE loop for account deletion.** The `auth.users ON DELETE CASCADE` already deletes everything atomically; a manual loop reintroduces FK-ordering bugs (e.g. `transactions.category_id RESTRICT` would block deleting categories before transactions). Use the cascade.
- **Service-role client for the export read.** Defeats RLS; one forgotten filter leaks all users. Export = RLS client.
- **`getPublicUrl` for statements.** Bucket is private; a public URL bypasses all access control. The Storage audit forbids it.
- **Deleting `auth.users` before Storage.** Orphans the user's files. Storage first, auth last.
- **A second service-role client, or reusing it for normal reads.** One admin module, delete-only, server-only.
- **Putting the owned-table list in two places.** One constant; export + tests both import it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deleting all of a user's DB rows | A per-table DELETE loop in FK order | `auth.admin.deleteUser` + existing `ON DELETE CASCADE` | The cascade is atomic and ordering-correct; a loop is error-prone and races RESTRICT FKs. |
| Auth user deletion | Direct `DELETE FROM auth.users` via SQL | `supabase.auth.admin.deleteUser(id)` | The admin API is the supported path; raw SQL skips auth-internal cleanup (sessions, identities). |
| "Only my rows" on export | `.eq('user_id', userId)` on every query | RLS-scoped server client + bare `select('*')` | RLS already enforces it; manual filters are a leak waiting to happen if one is forgotten. |
| CSV pt-BR formatting | A new CSV writer | Mirror `src/lib/mei/csv.ts` (BOM via `String.fromCharCode(0xFEFF)`, `;`, `formatCents`) | The pattern is proven and tested; consistency matters for Excel pt-BR. |
| Secret-in-bundle detection | A bespoke scanner | Extend `scripts/check-bundle-secrets.sh` | Already greps `sb_secret_|service_role|SUPABASE_SECRET_KEY` over `.next/static`. |
| Zip bundling | `jszip` + a new dep | Single JSON with embedded CSV strings | No new supply-chain surface in a hardening phase. |

**Key insight:** The schema's `ON DELETE CASCADE` design (from Phase 1) was *built* to make LGPD delete trivial. The phase's job is to use it correctly, not to reimplement cascade logic in TypeScript.

## Runtime State Inventory

> This is a hardening phase, not a rename/refactor. There is no string-rename runtime state to migrate. The relevant "state" is what the **delete** must reach beyond DB rows — captured here because incomplete delete = orphaned user data (an LGPD failure).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (DB) | All 14 owned tables (see inventory) | **None explicit** — `auth.admin.deleteUser` cascades all 14 via `ON DELETE CASCADE`. [VERIFIED: migrations] |
| Storage objects | `statements` bucket, objects under `{user_id}/` (statement files) | **Explicit `storage.remove`** — Storage is NOT FK-cascaded; must list + remove the `{user_id}/` prefix before `deleteUser`. |
| Auth state | `auth.users` row + sessions/identities for the user | `auth.admin.deleteUser(userId)` (handles auth-internal cleanup). |
| Secrets/env vars | `SUPABASE_SECRET_KEY` newly *used* (was unused server-side until now) | Confirm it's in server env only (already in `.env.example`/`.env.local`, never `NEXT_PUBLIC_`); bundle-secret audit must still pass. |
| Build artifacts | `.next/static` (client bundle) — the audit target | The bundle-secret gate greps it post-build; must stay clean even though delete now references the secret server-side. |

**Nothing found in category:** No OS-registered state (no cron/scheduler), no external live-service config (single LOCAL stack). Verified — the app is web-only against one Supabase instance.

## Common Pitfalls

### Pitfall 1: Service-role key leaks into the client bundle
**What goes wrong:** The new admin module gets imported (directly or transitively) by a client component; Webpack ships `SUPABASE_SECRET_KEY` into `.next/static`. Total DB+Storage compromise.
**Why it happens:** This is the *first* time the secret is actually used in app code, so it's the first real chance to leak it. App Router server/client boundaries are easy to cross via a shared import.
**How to avoid:** `import 'server-only'` at the top of `admin.ts`; never `NEXT_PUBLIC_`; the admin client is imported ONLY by the delete Server Action; keep the bundle-secret audit green after a real `next build`.
**Warning signs:** `check-bundle-secrets.sh` finds `service_role`/`sb_secret_`/`SUPABASE_SECRET_KEY` in `.next/static`; a `'use client'` file imports `admin.ts`.

### Pitfall 2: Delete touches/needs another user's data — or leaves orphans
**What goes wrong:** A hand-rolled delete loop deletes by a forged/wrong `user_id`, or deletes auth before Storage and orphans files, or deletes Storage but auth delete fails leaving a half-deleted account.
**Why it happens:** Manual ordering; treating Storage as if it were FK-cascaded; not making the operation idempotent.
**How to avoid:** Derive `userId` from `getClaims()` (the session), never from client input; use the `auth.users` cascade for DB (no loop); Storage-remove first, `deleteUser` last; the operation is retryable. Test: delete A, assert B's rows in all 14 tables + B's Storage objects are untouched.
**Warning signs:** Delete test that only checks A is gone but never checks B survives; any `user_id` sourced from the request body.

### Pitfall 3: Incomplete export (a table silently missing)
**What goes wrong:** The bundle is built from a hardcoded list that drifts from the schema; a table (e.g. `csv_import_profiles`, or a v2 table) is omitted → LGPD export is incomplete.
**Why it happens:** Two lists of tables (export vs reality) that aren't the same constant.
**How to avoid:** One shared `owned-tables.ts` constant; the export iterates it; an export test asserts every table in the constant appears as a key in the bundle. (Resolves Open Question #1's risk structurally.)
**Warning signs:** Export keys hardcoded inline; no test that the bundle's table set equals the canonical set.

### Pitfall 4: RLS gap on a table the matrix doesn't cover
**What goes wrong:** A table has RLS enabled but a too-loose policy, and the isolation test never exercises that table → latent cross-user leak (CVE-2025-48757 class).
**Why it happens:** The current `rls-isolation.test.ts` covers only 8 of 14 tables.
**How to avoid:** Extend the matrix to all 14 + Storage; data-drive it off the shared constant so new tables can't escape coverage.
**Warning signs:** A table in the schema but absent from the test's table list.

### Pitfall 5: Storage exposed publicly / via `getPublicUrl`
**What goes wrong:** Statements served by a public URL bypass RLS — enumerable financial PDFs.
**Why it happens:** `getPublicUrl` is the easy default.
**How to avoid:** Bucket stays `public = false` (already so); audit grep forbids `getPublicUrl` in `src/`; cross-user `download` is denied (already proven in `import-storage-rls.test.ts` — extend/keep it).
**Warning signs:** `getPublicUrl(` anywhere in `src/`; bucket flipped public.

### Pitfall 6: PII regression — an AI/network dep sneaks in
**What goes wrong:** Someone wires the deferred LLM (CLS-02) and merchant descriptors start egressing to a third party — an LGPD/SEC-03 regression the phase is meant to lock against.
**Why it happens:** The seam (`suggestCategory`) is built to accept a model later.
**How to avoid:** Guard test asserts `package.json` has no `ai`/`@ai-sdk*` dependency AND `suggestCategory()` returns `null` AND it makes no network call. (The existing `suggest.test.ts` already asserts null + no-call; add the dependency-absence assertion.)
**Warning signs:** `ai` or `@ai-sdk/*` in `package.json`; `suggestCategory` returning non-null; any `fetch`/network in the classifier path.

## Code Examples

### `src/lib/export/transactions-csv.ts` — mirror of `mei/csv.ts`
```typescript
// Mirrors src/lib/mei/csv.ts: BOM (in code, never a literal), ';' delimiter, pt-BR
// money via formatCents, CRLF line endings. (DATA-01)
import { formatCents } from '@/lib/money'

export interface TransactionRow {
  occurred_on: string        // 'YYYY-MM-DD'
  description: string
  category_name: string      // resolved name (point-in-time on the row)
  amount_cents: number | bigint
}

const BOM = String.fromCharCode(0xfeff)
const DELIMITER = ';'
const HEADER = ['Data', 'Descrição', 'Categoria', 'Valor'] as const

/** Escape a field for `;`-delimited CSV (quote if it contains ; " or newline). */
function field(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function transactionsToCsv(rows: readonly TransactionRow[]): string {
  const lines = [HEADER.join(DELIMITER)]
  for (const r of rows) {
    lines.push(
      [
        field(r.occurred_on),
        field(r.description),
        field(r.category_name),
        formatCents(r.amount_cents), // 'R$ 1.234,56' — pt-BR comma decimal
      ].join(DELIMITER),
    )
  }
  return BOM + lines.join('\r\n') + '\r\n'
}
```

### `src/lib/supabase/admin.ts` — server-only service-role client (DELETE ONLY)
```typescript
import 'server-only' // build fails loudly if a client module imports this

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

/**
 * Service-role admin client. Bypasses RLS — the FIRST legitimate server-side use of
 * the secret in this project. Used ONLY by the account-delete Server Action for
 * `auth.admin.deleteUser` + Storage `remove`. NEVER import from a client module.
 * NEVER use for normal data reads (those go through the RLS server client).
 */
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY // server-only env var
  if (!url || !secret) throw new Error('admin client: missing SUPABASE_SECRET_KEY/URL')
  return createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

### `src/actions/delete-account.ts` — Storage first, auth last
```typescript
'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server' // RLS client → identify the caller
import { createAdminClient } from '@/lib/supabase/admin'

const ConfirmSchema = z.object({ confirm: z.literal('APAGAR') })

export async function deleteMyAccount(input: { confirm: string }) {
  const parsed = ConfirmSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: 'confirmacao_invalida' }

  // userId comes from the SESSION, never from client input.
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { ok: false as const, error: 'nao_autenticado' }

  const admin = createAdminClient()

  // 1. Storage FIRST — NOT FK-cascaded. Remove everything under {userId}/.
  const { data: files } = await admin.storage.from('statements').list(userId, { limit: 1000 })
  if (files?.length) {
    const paths = files.map((f) => `${userId}/${f.name}`)
    const { error: rmErr } = await admin.storage.from('statements').remove(paths)
    if (rmErr) return { ok: false as const, error: 'falha_storage' } // retryable, account intact
  }

  // 2. Auth LAST — cascades all 14 owned tables via ON DELETE CASCADE.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) return { ok: false as const, error: 'falha_delete' }

  return { ok: true as const } // client then signs out + redirects /login
}
```
> Note: if statement files are ever nested deeper than one level under `{userId}/`, replace the single `list` with a recursive walk. Current uploads are flat `{userId}/{uuid}.ext` (per `import-storage-rls.test.ts`), so one level suffices today — flag in the plan.

### Delete isolation test sketch — A gone, B intact
```typescript
// Build on tests/helpers/local-supabase.ts (serviceClient/userClient already exist).
// 1. Create users A and B; seed a row in EACH of the 14 tables for both + a Storage
//    object under each {id}/.
// 2. Call the delete path for A (or the Server Action's core, exercised with admin client).
// 3. Assert: every one of A's 14 tables returns 0 rows AND A's Storage object is gone
//    AND auth.admin.getUserById(A) fails.
// 4. Assert: every one of B's 14 tables STILL returns B's row AND B's Storage object
//    is still downloadable. (the load-bearing "doesn't touch B" guarantee)
```

### Storage-public audit sketch
```typescript
// (a) bucket is private:
const { data } = await admin.storage.getBucket('statements')
expect(data?.public).toBe(false)
// (b) source forbids public URLs:
const hits = execFileSync('grep', ['-rn', 'getPublicUrl', 'src/']).toString()
expect(hits.trim()).toBe('')            // grep exits non-zero when clean → wrap in try
// (c) cross-user download denied — already proven in import-storage-rls.test.ts.
```

### PII-egress guard sketch
```typescript
import pkg from '../package.json'
it('no AI/network dependency is present (CLS-02 stays deferred)', () => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  expect(Object.keys(deps).some((d) => d === 'ai' || d.startsWith('@ai-sdk'))).toBe(false)
})
it('suggestCategory returns null and makes no external call', async () => {
  expect(await suggestCategory('padaria sao joao', CATEGORIES)).toBeNull() // existing assertion
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-delete user rows table by table | `auth.admin.deleteUser` + `ON DELETE CASCADE` schema | Standard Supabase practice | Atomic, ordering-safe delete; the schema was pre-built for it. |
| Anon `get/set/remove` cookie shape | `getAll`/`setAll` (already in `server.ts`) | `@supabase/ssr` 0.x | N/A — repo already current. |
| Public bucket + `getPublicUrl` | Private bucket + signed URLs (already done) | Phase 4 | The phase audits this invariant. |

**Deprecated/outdated:** none introduced. No new packages; nothing to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Single-JSON bundle (CSVs embedded as strings) is preferable to a zip | Standard Stack / Don't Hand-Roll | LOW — if the user wants discrete `.csv` files in a `.zip`, add `jszip` (re-run legitimacy gate) and split the bundle. Pure additive change. |
| A2 | `csv_import_profiles` should be INCLUDED in the export bundle (it's user-owned but not in CONTEXT's explicit list) | Owned-Table Inventory / Open Q#1 | LOW — including a user's own saved import mappings in their export is strictly more complete (LGPD-favorable). Worst case it's redundant, never a leak. |
| A3 | Statement Storage objects are flat one level under `{userId}/` (no nested folders) | Code Examples (delete) | LOW — current uploads are flat (`import-storage-rls.test.ts`); if nesting is added later, the `list` must recurse. Flagged inline. |

**These three are LOW-risk and additive.** None blocks planning; all default to the safer/more-complete option.

## Open Questions

1. **Is `csv_import_profiles` in the LGPD export?**
   - What we know: it's a user-owned table (`user_id` + RLS + cascade), not named in CONTEXT's export list.
   - What's unclear: whether the user considers saved CSV-import column mappings "their data" for export purposes.
   - Recommendation: **include it** (A2). It's their data, including it is LGPD-favorable, and it costs nothing. The shared `owned-tables.ts` constant makes this the default — opt *out* explicitly if undesired.

2. **Does the export bundle resolve `category_id` → category name (point-in-time) for the transactions CSV?**
   - What we know: transactions store `category_id`; the human-readable export wants the name.
   - Recommendation: join/resolve category name at export time for the CSV (human-readable), but keep raw `category_id` in the JSON `tables.transactions` rows (lossless). Two representations, one source.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Local Supabase stack (`supabase start`) | All RLS/Storage/delete tests | ✓ (CLI ^2.106 in devDeps) | local Docker | — (tests are LOCAL-only by design; `local-supabase.ts` hard-guards to 127.0.0.1) |
| `SUPABASE_SECRET_KEY` (server env) | Admin client (delete) | ✓ (in `.env`/`.env.local`/`.env.example`) | — | — (blocking for delete; present) |
| `next build` (for bundle-secret audit) | `check-bundle-secrets.sh` over `.next/static` | ✓ (`npm run build`) | next 16.2.9 | Script passes when `.next/static` absent (documented "clean/absent => pass") |
| `vitest` | All tests | ✓ | ^4.1.9 | — |

**Missing dependencies with no fallback:** none. **Missing dependencies with fallback:** none. Phase adds no external dependency.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` ^4.1.9 |
| Config file | `vitest.config.ts` (jsdom env, `@`→`src` alias, `server-only`→no-op alias) |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npm test` (`vitest run`) |
| Local stack prereq | `supabase start` (RLS/Storage/delete tests read creds via `supabase status --output env`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | `transactionsToCsv` emits BOM + `;` + pt-BR comma decimals; escapes `;"\n` | unit | `npx vitest run tests/transactions-csv.test.ts` | ❌ Wave 0 |
| DATA-01 | MEI CSV export still works (regression) | unit | `npx vitest run tests/mei-report.test.ts` | ✅ (exists) |
| DATA-02 | Export bundle contains every one of the 14 owned tables; only the caller's rows | integration (local) | `npx vitest run tests/export-bundle.test.ts` | ❌ Wave 0 |
| DATA-02 | Delete removes ALL of A's rows (14 tables) + A's Storage + A's auth | integration (local) | `npx vitest run tests/delete-account.test.ts` | ❌ Wave 0 |
| DATA-02 | Delete of A leaves B's rows + B's Storage fully intact | integration (local) | `npx vitest run tests/delete-account.test.ts` | ❌ Wave 0 |
| SEC-01 | 4 verbs × 14 tables: B cannot SELECT/INSERT/UPDATE/DELETE A's rows | integration (local) | `npx vitest run tests/rls-isolation.test.ts` | ✅ EXTEND (8→14 tables) |
| SEC-01 | Storage: B cannot read/write A's objects | integration (local) | `npx vitest run tests/import-storage-rls.test.ts` (or new `storage-isolation.test.ts`) | ✅ EXTEND/keep |
| SEC-01 | Bucket private + no `getPublicUrl` in `src/` | unit + grep | `npx vitest run tests/storage-public-audit.test.ts` | ❌ Wave 0 |
| SEC-01 | No `ai`/`@ai-sdk` dep; `suggestCategory` null; no PII egress | unit | `npx vitest run tests/pii-egress-guard.test.ts` (+ existing `suggest.test.ts`) | ❌ Wave 0 (suggest.test.ts ✅) |
| SEC-01 (SEC-02 re-audit) | Secret absent from built client bundle even though delete now uses it | unit + shell | `npx vitest run tests/bundle-secret-grep.test.ts` (after `npm run build`) | ✅ EXTEND |

### Sampling Rate
- **Per task commit:** the single test file the task touches (`npx vitest run <file>`).
- **Per wave merge:** `npm test` (full vitest suite, requires `supabase start`).
- **Phase gate:** `supabase start` → `npm run build` → `npm test` all green, plus `bash scripts/check-bundle-secrets.sh` exits 0 against a freshly built `.next/static`.

### Wave 0 Gaps
- [ ] `tests/transactions-csv.test.ts` — covers DATA-01 (CSV correctness, escaping, BOM)
- [ ] `tests/export-bundle.test.ts` — covers DATA-02 (completeness: every table present, only my rows)
- [ ] `tests/delete-account.test.ts` — covers DATA-02 (A fully deleted incl. Storage+auth; B intact)
- [ ] `tests/storage-public-audit.test.ts` — covers SEC-01 (bucket private + no `getPublicUrl`)
- [ ] `tests/pii-egress-guard.test.ts` — covers SEC-01 (no AI dep; `suggestCategory` null)
- [ ] `src/lib/data/owned-tables.ts` — the shared 14-table constant (consumed by export + isolation matrix)
- [ ] EXTEND `tests/rls-isolation.test.ts` — 8→14 tables, add missing INSERT row shapes
- [ ] EXTEND `tests/bundle-secret-grep.test.ts` — keep meaningful now that delete references the secret (ideally assert against a real `next build` output)
- [ ] No framework install needed (vitest present).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth; delete via `auth.admin.deleteUser` (no custom auth). |
| V3 Session Management | yes | `userId` from `getClaims()` (session), never client input, for both export and delete. |
| V4 Access Control | **yes (core of phase)** | Postgres RLS `((select auth.uid()) = user_id)` on all 14 tables + `{user_id}/` Storage RLS — proven by the 4-verb × 14-table + Storage isolation matrix. |
| V5 Input Validation | yes | `zod` on the delete confirmation (`literal('APAGAR')`) and any export period filter. |
| V6 Cryptography | no (none hand-rolled) | No crypto introduced; secrets handled via env + `server-only`, never bundled. |
| V8/V9 Data Protection / Privacy (LGPD) | yes | Export (data portability) + delete (right to erasure) over the full owned set; PII-egress guard keeps descriptors off any external service. |

### Known Threat Patterns for Next.js + Supabase (this phase)

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Service-role secret in client bundle | Information Disclosure / Elevation | `import 'server-only'`; never `NEXT_PUBLIC_`; bundle-secret grep gate. |
| Cross-user data access (RLS gap) | Tampering / Info Disclosure | RLS on every table + 4-verb 2-user isolation matrix; central table list so no table escapes coverage. |
| Public/enumerable Storage objects | Information Disclosure | Private bucket + `{user_id}/` path RLS + signed URLs; audit forbids `getPublicUrl`. |
| Forged `user_id` in delete/export | Spoofing / Tampering | Derive `userId` from session claims, never request body. |
| Orphaned data after partial delete | Repudiation / data-integrity | Storage-remove first, `deleteUser` last; idempotent + retryable; test B-intact. |
| PII egress to third-party LLM | Information Disclosure (LGPD) | No AI dependency; `suggestCategory` null seam; guard test. |

## Sources

### Primary (HIGH confidence) — this repository
- `supabase/migrations/0001–0026` — the 14 owned tables, `ON DELETE CASCADE` to `auth.users`, RLS policy shape, private `statements` bucket + `{user_id}/` Storage RLS, cross-table FK rules (RESTRICT/SET NULL/CASCADE).
- `src/lib/mei/csv.ts`, `src/components/export-csv-button.tsx` — the CSV + download pattern to mirror.
- `src/lib/supabase/server.ts` — the RLS server-client pattern (export read) and the `server-only` guard.
- `tests/helpers/local-supabase.ts`, `tests/rls-isolation.test.ts`, `tests/import-storage-rls.test.ts` — the 2-user isolation harness to extend.
- `scripts/check-bundle-secrets.sh`, `tests/bundle-secret-grep.test.ts` — the secret-bundle audit to extend.
- `src/lib/classifier/suggest.ts` + `src/lib/classifier/suggest.test.ts` — the null AI seam + SEC-03 contract for the PII guard.
- `.env.example` / `.env.local` — `SUPABASE_SECRET_KEY` env var convention.
- `package.json` — confirms NO `ai`/`@ai-sdk` dependency (PII guard baseline) and all needed libs already present.

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — Pitfalls 2/3/4/14 (RLS, service-role leak, public Storage, LGPD export/delete) explicitly map to this phase's verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; everything verified present in `package.json`.
- Architecture (delete via cascade, export via RLS, server-only admin): HIGH — grounded in the actual migrations and existing client patterns.
- Pitfalls: HIGH — derived from project PITFALLS.md + the concrete schema/test reality.
- Bundle-format choice (A1): MEDIUM — a reasonable default, user-overridable.

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable — internal patterns; revisit only if the schema or `@supabase/*` major changes)
