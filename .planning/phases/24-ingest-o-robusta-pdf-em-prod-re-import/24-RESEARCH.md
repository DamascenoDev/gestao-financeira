# Phase 24: Ingestão robusta (PDF em PROD + re-import) - Research

**Researched:** 2026-06-21
**Domain:** Postgres CHECK-constraint migration (Supabase) + serverless PDF degradation testing — brownfield hardening, no new dependencies
**Confidence:** HIGH

## Summary

This phase is overwhelmingly **verification of already-shipped code plus ONE small DB migration**. The prior scout was exhaustive and every scope claim was re-verified against the live tree in this research session:

- **PDF-06** (pdfjs worker in PROD) is **code-complete** — `next.config.ts` already force-includes the worker/cmaps/fonts and sets `serverExternalPackages: ["pdf-parse"]` `[VERIFIED: read next.config.ts]`. SC1 is a deploy + live-PROD human-verify item, NOT a code build.
- **PDF-07** (clear degradation, no OCR) is **code-complete** — image-only hard-block (`import.ts:358-363`), text-present-0-rows → empty review without throw, malformed lines dropped, no OCR `[VERIFIED: read import.ts + pdf.ts behavior + pdf.test.ts]`. A **generic (non-Santander) degradation test already exists** at `pdf.test.ts:122-125`; SC2 is closed by *strengthening* that existing test, not building a parser.
- **IMP-07** (re-import of unconfirmed statements) is the **one real code build**: a new migration `0038_statements_status_imported.sql` that widens the `statements.status` CHECK to include `'imported'`. The fast-path (`import.ts:323-330`) and the `update({status:'imported'})` (`import.ts:995-998`) **already exist**; the missing CHECK value is what makes the update silently fail (logged + swallowed at `:999-1004`), leaving the fast-path permanently unreachable.

**Primary recommendation:** Write `0038` mirroring `0032` exactly (drop-if-exists the status CHECK, recreate with the 5-value set), replay-validate locally, defer the PROD `supabase db push` as an `autonomous: false` [BLOCKING] task bundled with the still-pending `0037` push. Touch NO application code, NO `next.config.ts`, NO `database.types.ts`. Add one assertion to the existing generic PDF degradation test. The whole phase is one migration file + one test edit + two deferred human items.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `status='imported'` re-import gate (IMP-07) | Database / Storage | API / Backend | The CHECK constraint is the DB-side enforcement; the fast-path branch in `ingestStatement` already lives in the Server Action and only needs the constraint widened to function. |
| pdfjs worker availability (PDF-06) | CDN / Static (serverless bundle tracing) | — | Pure build/deploy concern — `@vercel/nft` file tracing must include the dynamically-imported worker. Already configured in `next.config.ts`. |
| PDF degradation / no-OCR (PDF-07) | API / Backend | — | Extraction + parse happen server-side in the Node-runtime Route Handler / Server Action; degradation is pure-function behavior in `src/lib/parsers/pdf.ts`. |

## Project Constraints (from CLAUDE.md)

- **Tech stack:** Next.js 16 App Router, **TypeScript estrito sem JavaScript**, Supabase (auth+Postgres+Storage), Vercel.
- **Migrations:** SQL files under `supabase/migrations/`, version-controlled, applied via `supabase db push`; never click-edit schema in the dashboard. Keep `text + CHECK` shape (this phase does NOT introduce a Postgres enum).
- **RLS non-negotiable:** every domain table RLS-scoped to `auth.uid() = user_id`. This migration touches a CHECK only — it must NOT alter the existing `"own statements"` policy, grants, or index.
- **Integer cents / pt-BR:** unaffected by this phase (no money or formatting changes).
- **Typed client workflow:** `npm run gen:types` after schema changes — but see Pitfall 2: a `text+CHECK` widening produces a **zero diff** in `database.types.ts` (the generated type is already `string`), exactly as `0032` did for `format`. Confirm the empty diff; do NOT commit a regenerated-but-identical file as if it were a change.
- **GSD schema-push gate:** PROD `supabase db push` requires interactive auth / `SUPABASE_ACCESS_TOKEN` → must be an `autonomous: false` task.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Escopo: build vs verify**
- **PDF-06 = code-complete** (`next.config.ts`, commit `fb91b58`). NÃO rebuildar. SC1 vira um item de **deploy + human-verify** (subir o PDF de verdade em PROD após deploy).
- **PDF-07 = code-complete** (hard-block image-only + degradação graciosa + sem OCR, já testado em `import.test.ts` 495-529). Acrescentar **1 teste de degradação genérica** (entrada não-Santander / ruído) para travar o SC2 "robustez genérica", sem construir parser novo.
- **IMP-07 = o build:** migration que larga `'imported'` no CHECK de `statements.status`.

**A migration do IMP-07**
- **Espelhar `0032_statements_format_pdf.sql`:** novo arquivo `0038_statements_status_imported.sql` → `drop constraint if exists statements_status_check` (e qualquer nome prévio) → recriar `check (status in ('uploaded','parsing','parsed','failed','imported'))`. Mantém `text` + CHECK (não converte para enum Postgres).
- **Sem `gen:types`:** `status` é `text + CHECK`, então o tipo TS gerado permanece `string` (idêntico ao que `0032` fez para `format`). Verificar que o diff de `database.types.ts` é vazio.
- **Sem backfill:** statements existentes ficam como estão; só confirmações futuras gravam `'imported'`.
- **PROD push é human-gated:** `supabase db push` precisa de auth interativa / `SUPABASE_ACCESS_TOKEN` (igual ao `0037`, que segue pendente de push em PROD). Escrever + replay-validar local; o push em PROD é uma task `autonomous:false`, diferida e documentada (não bloqueia o fechamento da fase em código).

**Verificação & testes**
- **IMP-07:** os testes de action mockados já asseguram o contrato (`import.test.ts` 410-432: confirmado → `alreadyImported`; não-confirmado → re-parse). Mantê-los verdes; o replay da migration é a prova do lado-DB. **Pular** um teste de integração live-Supabase novo (env-flaky no histórico do projeto).
- **PDF em PROD (SC1):** item de **human-verify** (UAT diferido, igual à Phase 22) — rodar um upload de PDF ao vivo depois do deploy.
- **Validação local da migration:** replay-validar (`supabase db reset`/diff se o stack local estiver de pé; senão dry-parse do SQL). Não exigir PROD rodando.

### Claude's Discretion
- Nome exato do constraint a dropar (provável `statements_status_check`; usar `drop ... if exists` defensivo para nomes alternativos, como o `0032` fez).
- Forma exata do teste de degradação genérica do PDF-07 (estender `pdf.test.ts`/`import.test.ts` com um texto não-Santander que degrada a 0 linhas sem throw).
- Como replay-validar a migration dado o ambiente (local stack vs dry-parse) — seguir o que estiver disponível.
- Texto/observabilidade: manter o log do `confirmImport` (line ~1001) como rede de segurança; após a migration o update passa a suceder.

### Deferred Ideas (OUT OF SCOPE)
- OCR para PDF image-only — fora do escopo do v1 (steer para CSV/OFX).
- Parser per-bank novo — só quando aparecer um banco real falhando.
- Teste de integração live-Supabase para o dedupe por status — env-flaky; mock tests + replay cobrem.
- PROD `supabase db push` de `0037` + `0038` + `npm run gen:types` — etapa humana (token), diferida.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PDF-06 | Upload de fatura PDF funciona em **produção** (Vercel): worker do `pdfjs` disponível no bundle serverless, sem erro de "worker faltando". | **Code-complete** — `next.config.ts` `outputFileTracingIncludes` force-includes `pdf.worker.mjs`+cmaps+fonts on `/importar` and `/importar/[statementId]`; `serverExternalPackages: ["pdf-parse"]` keeps pdf-parse as an external runtime require (verified by reading the file). No code task. SC1 = deploy + live PROD upload (human-verify). |
| PDF-07 | Parser de PDF degrada de forma clara/previsível em entradas ruins (image-only / 0 linhas), sem travar nem produzir linhas erradas — robustez genérica, **sem OCR**. | **Code-complete** — image-only hard-block `import.ts:358-363`; text-present-0-rows → review vazio sem throw `import.ts:365-375` + `parseSantanderText`; generic-garbage already covered `pdf.test.ts:122-125`. Plan adds ONE assertion to lock SC2. No new parser. |
| IMP-07 | Re-upload do mesmo arquivo permitido quando a importação anterior **não foi confirmada**; `content_hash` só bloqueia o já-confirmado. | **The build** — fast-path `import.ts:323-330` + `update({status:'imported'})` `import.ts:995-998` already exist. Migration `0038` widens the `statements.status` CHECK (`0019:20-21`) to include `'imported'`, making the update succeed and the fast-path reachable. Mock tests `import.test.ts:410-432` already assert the contract. |
</phase_requirements>

## Standard Stack

**No new packages.** This phase installs nothing. It adds one SQL migration and one test assertion against the existing stack.

| Already-present tool | Version (verified) | Role in this phase |
|----------------------|--------------------|---------------------|
| `supabase` CLI | `^2.106.0` (`package.json:58`) `[VERIFIED: package.json]` | Authoring + local replay (`db:reset`) + the deferred PROD `db:push`. |
| `vitest` | (existing test runner; `"test": "vitest run"` `package.json:13`) | Runs the strengthened PDF degradation test. |
| `pdf-parse` v2 / `pdfjs-dist` | (already installed; external via `serverExternalPackages`) | Untouched — PDF-06 config already correct. |

### Package Legitimacy Audit

> **Not applicable** — this phase installs zero external packages. No registry verification needed.

## Architecture Patterns

### What changes (the entire phase footprint)

```
NEW   supabase/migrations/0038_statements_status_imported.sql   ← the only production artifact
EDIT  src/lib/parsers/pdf.test.ts (~line 122-125)               ← +1 assertion (SC2 lock)
                                                                   (or import.test.ts — see Pattern 3)
DEFER supabase db push (0037 + 0038) to PROD + gen:types        ← autonomous:false [BLOCKING]
DEFER live PDF upload in PROD after deploy                      ← autonomous:false human-verify (UAT)
```

NO change to: `import.ts`, `next.config.ts`, `database.types.ts`, RLS policies, grants, indexes.

### Data flow that the migration unlocks (IMP-07)

```
re-upload same bytes
        │
        ▼
ingestStatement: upsert statements onConflict(user_id, content_hash), ignoreDuplicates
        │
        ├─ inserted row?  ── yes ─→ fresh import (parse → review)
        │
        └─ no row (hash hit) → read back existing { id, status }   [import.ts:307-317]
                                       │
                                       ├─ status === 'imported'  ─→ FAST-PATH: { alreadyImported:true, 0 novas }   [import.ts:323-330]
                                       │     (reachable ONLY after 0038 lets confirmImport WRITE 'imported')
                                       │
                                       └─ status ∈ {uploaded,parsing,parsed,failed} ─→ RE-PARSE, reuse existing id   [import.ts:331-333]
```

Before `0038`, `confirmImport`'s `update({status:'imported'})` violates the CHECK (SQLSTATE 23514), is logged-and-swallowed (`import.ts:999-1004`), so `status` is never `'imported'` and the fast-path branch can never be taken. The migration is the *only* thing that bootstraps the existing logic.

### Pattern 1: CHECK-widening migration (mirror 0032 exactly)

**What:** drop-if-exists the inline-defined CHECK, then add a named widened CHECK as a strict superset. `text + CHECK`, never an enum.

**The exact constraint name:** `0019:20-21` defines `status` with an **inline (unnamed)** CHECK:
```sql
status text not null default 'parsed'
       check (status in ('uploaded','parsing','parsed','failed')),
```
Postgres auto-names an inline column CHECK by the convention `<table>_<column>_check` → **`statements_status_check`** `[VERIFIED: Postgres naming convention + confirmed by the sibling 0037, which empirically verified the identical convention produced `transactions_classification_source_check` for an inline CHECK on `transactions.classification_source`]`. `0032` relied on the same convention for `statements_format_check` and shipped to PROD successfully.

**Defensive drop:** mirror `0032`'s two-drop pattern (canonical name + the about-to-be-added named constraint) so the migration is re-runnable and tolerant of a divergent live name. `0037` went further with a `pg_constraint` DO-block loop; for `status` the canonical-name drop is sufficient (the convention is well-established and twice-confirmed), but adding the named-target drop makes re-runs idempotent.

**Recommended `0038_statements_status_imported.sql`:**
```sql
-- 0038_statements_status_imported.sql
-- IMP-07 (re-import). 0019_statements.sql:20-21 created `status` with an INLINE
-- (unnamed) CHECK → Postgres auto-named it `statements_status_check`, with the value
-- set ('uploaded','parsing','parsed','failed'). confirmImport (import.ts:995-998)
-- marks a consumed statement `update({status:'imported'})`, but 'imported' is NOT in
-- that set, so the update fails the CHECK (SQLSTATE 23514) and is logged-and-swallowed
-- (import.ts:999-1004). Result: status never becomes 'imported', and the
-- "already confirmed → block re-review" FAST-PATH (import.ts:323-330) is UNREACHABLE,
-- while an UNCONFIRMED statement can already be re-imported. This migration WIDENS the
-- CHECK to include 'imported' so the update succeeds and the fast-path activates.
--
-- Mirrors 0032_statements_format_pdf.sql (same table, same drop-if-exists + named-add
-- pattern). NON-DESTRUCTIVE + IDEMPOTENT: pure superset (every existing
-- uploaded/parsing/parsed/failed row stays valid), re-runnable (drop-if-exists then add).
-- NO backfill — existing statements keep their status; only future confirmations write
-- 'imported'.
--
-- Like 0031/0032/0037 this is part of the SCHEMA PUSH GATE: `tsc --noEmit` and
-- `npm run build` PASS without it (the generated `status` type is `string` — untyped),
-- so the gap only shows at runtime against the live constraint. Takes effect only after
-- `supabase db push`. gen:types diff is EMPTY (text+CHECK → string, unchanged).
--
-- ACTION REQUIRED AFTER MERGE (human, autonomous:false): `supabase db push` against the
-- LIVE production project (needs interactive auth / SUPABASE_ACCESS_TOKEN). Apply
-- together with the still-pending 0037 in the same push.

-- Drop the inline (auto-named) CHECK from 0019. Drop-if-exists keeps this re-runnable
-- and also covers a prior run of THIS migration's named-add below.
alter table public.statements drop constraint if exists statements_status_check;

-- Add the widened five-value CHECK under the same canonical name (so a future migration
-- can target it deterministically and a re-run drops it cleanly above). Superset of the
-- old constraint → non-destructive.
alter table public.statements
  add constraint statements_status_check
  check (status in ('uploaded', 'parsing', 'parsed', 'failed', 'imported'));
```

> **Naming note (Discretion call):** `0032` added its widened constraint under a *new* descriptive name (`statements_format_ofx_csv_pdf_check`) rather than re-using the canonical `statements_format_check`. For `0038` I recommend re-using the canonical name `statements_status_check` (as shown) because (a) it keeps the drop-if-exists and the add symmetric and self-covering on re-run, and (b) it matches what `0037` did for `transactions_classification_source_check`. Either choice is correct; the canonical-name approach is marginally cleaner for idempotency. If the planner prefers exact `0032` mimicry, a second `drop ... if exists statements_status_uploaded_..._imported_check` defensive line + a descriptive add-name is acceptable — but unnecessary.

### Pattern 2: Local replay validation (no PROD required)

**What:** prove the SQL applies cleanly and the previously-failing update now succeeds — on the LOCAL stack only.

**Project precedent (verified):** prior migrations were applied locally with `supabase migration up --local` (STATE.md line 262: "0036 aplicado no stack LOCAL via 'supabase migration up --local' (db:push é PROD)") or `db:reset` (`package.json:11` `"db:reset": "supabase db reset"`). `0037` was "replay-validated" locally and its PROD push deferred (STATE.md:179).

**Recommended concrete step (environment-adaptive — Discretion call):**
1. **If the local Supabase stack is up** (the project frequently leaves it running — STATE.md notes "Stack local deixado RODANDO (API 127.0.0.1:55321)"): run `npm run db:reset` (replays `0001…0038` from scratch) OR `supabase migration up --local` (applies only the new file). A clean exit proves the migration applies and is ordered correctly. Then assert the behavior directly with `psql` against the local DB:
   ```sql
   -- pick any existing local statement id
   update public.statements set status = 'imported' where id = '<some-local-id>';
   -- BEFORE 0038: ERROR 23514 check constraint "statements_status_check"
   -- AFTER  0038: UPDATE 1
   ```
   This is the DB-side proof the CONTEXT calls for ("o replay da migration é a prova do lado-DB").
2. **If the local stack is NOT up / cannot be started:** do a SQL dry-parse — confirm the file is syntactically valid and idempotent by reading it against the `0032`/`0037` templates (the pattern is proven). Do NOT block phase closure on a running PROD or live integration test.

**Do NOT** add a new live-Supabase integration test — the project history flags these as env-flaky (CONTEXT "Pular um teste de integração live-Supabase novo"; MEMORY: "Supabase integration tests are env-flaky").

### Pattern 3: PDF-07 generic-degradation test (lock SC2)

**Finding:** a generic (non-Santander) degradation test **already exists** `[VERIFIED: read pdf.test.ts:116-126]`:
```ts
describe('parseSantanderText — resilience', () => {
  it('returns an empty result on empty text without throwing (image-only seam)', () => {
    expect(() => parseSantanderText('', VENC)).not.toThrow()
    expect(parseSantanderText('', VENC)).toEqual({ rows: [], dropped: 0, capped: false })
  })
  it('does not throw on garbage text and yields no rows', () => {
    const { rows } = parseSantanderText('total garbage\nno tx lines here\n', VENC)
    expect(rows).toHaveLength(0)   // ← asserts rows only
  })
})
```

**Recommendation:** SC2's "robustez genérica" is *substantially* covered already. To lock it explicitly and unambiguously, **strengthen the existing garbage test** (do not create a new file — the home is `src/lib/parsers/pdf.test.ts`, the pure-function seam):
- Add `.not.toThrow()` around the garbage call (currently only the empty-text case asserts no-throw).
- Assert the **full shape** `{ rows: [], dropped: <n>, capped: false }` so the test pins "no silently-wrong rows" (rows AND counts), matching the empty-text case's rigor.
- Optionally add a second non-Santander noise fixture (e.g., a CSV-shaped or bank-statement-shaped text from a *different* layout) that exercises the line-skip path and asserts `dropped` reflects skipped lines without throwing.

The **import.test.ts** layer (`:508-531`) already covers the *action-level* degradation seam: image-only hard-block (`/imagem|digitaliza/`) and text-present-0-rows-not-a-block. Those need no change. Keep the new assertion at the **pure pdf.test.ts layer** — it is deterministic and not env-dependent.

### Anti-Patterns to Avoid
- **Rebuilding PDF-06 / re-architecting the worker bundling.** Explicitly out of scope. The config is correct; SC1 is a deploy+verify item only.
- **Building a new per-bank parser for PDF-07.** Out of scope until a real bank fails. The degradation behavior is the deliverable, not new coverage.
- **Converting `status` to a Postgres enum.** Would change `database.types.ts` and break the zero-diff invariant. Keep `text + CHECK`.
- **Running `gen:types` and committing the output.** The diff is empty (Pitfall 2). Running it is fine; committing a "change" that is byte-identical is noise — verify `git diff --quiet src/types/database.types.ts` exits 0.
- **Auto-pushing to PROD inside an autonomous task.** The push needs interactive auth — it MUST be `autonomous: false` and deferred.
- **Adding a live-Supabase integration test.** Env-flaky; mock tests + local replay are the agreed proof.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verify the constraint name | A live `pg_constraint` probe migration | The known convention `statements_status_check` + defensive `drop if exists` | Convention twice-confirmed (0032 format, 0037 classification_source). Defensive drop already covers a divergent name. |
| Prove the re-import contract | A new live-Supabase E2E test | Existing mock tests `import.test.ts:410-432` + local migration replay | Mock tests already assert confirmed→`alreadyImported` and unconfirmed→re-parse; replay proves the DB side. Live tests are flaky here. |
| Generic PDF robustness | A new parser / new test file | Strengthen the existing `pdf.test.ts:122-125` garbage test | The seam and a generic case already exist; one assertion locks SC2. |

**Key insight:** the prior scout fully derived the scope. The planner's job is *prescription and sequencing*, not re-discovery. The single risk surface is the constraint name (mitigated by the defensive drop) and the human-gated PROD push (mitigated by deferring it as `autonomous: false`).

## Runtime State Inventory

> This is a migration/refactor-adjacent phase (CHECK-widening). The inventory below is explicit per category.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `statements` rows in LOCAL and PROD carry `status ∈ {uploaded,parsing,parsed,failed}` today. The PROD account was **deleted** after Phase 17 (MEMORY: "PROD account DELETED — re-signup required"), so PROD likely has near-zero statement rows. | **None — no backfill.** The widened CHECK is a pure superset; all existing rows stay valid. Future `confirmImport` calls write `'imported'`. |
| Live service config | None. No external service stores `statements.status` outside Postgres. | None — verified by scope (single Supabase Postgres, no other consumer of this column). |
| OS-registered state | None. No scheduler/daemon references `status`. | None. |
| Secrets/env vars | The PROD push needs `SUPABASE_ACCESS_TOKEN` / interactive auth — a *credential*, not a renamed value. | None to migrate; the token gates the deferred push task. |
| Build artifacts | `src/types/database.types.ts` is generated from the schema. A `text+CHECK` widening does NOT change it (status stays `string`). | **Verify empty diff** (`git diff --quiet`), do not regenerate-and-commit a no-op. The pre-commit hook is known to rewrite `database.types.ts` (MEMORY/dev-env-testing-gotchas) — confirm it stays byte-identical. |

**The canonical question — after every file is updated, what runtime state still has the old value?** Only the LOCAL Postgres `statements_status_check` constraint (refreshed by replay) and the PROD constraint (refreshed by the deferred `db push`). No app cache, no other store.

## Common Pitfalls

### Pitfall 1: Constraint name mismatch on the live DB
**What goes wrong:** the migration drops `statements_status_check` but PROD/local actually named it something else → the drop is a silent no-op and the `add` fails with "constraint already exists" OR the widening never takes effect.
**Why it happens:** inline (unnamed) CHECKs are auto-named by convention, but a hand-edit or prior migration could have diverged it.
**How to avoid:** `drop constraint if exists` for the canonical name (proven correct by 0032/0037) is sufficient here. The named `add` then re-creates it deterministically. If extra paranoia is wanted, mirror 0037's `pg_constraint` DO-block loop — but it is unnecessary given two prior confirmations of the convention.
**Warning signs:** `add constraint` errors with `42710 (duplicate_object)`, or a post-replay `update set status='imported'` still throws 23514.

### Pitfall 2: Treating the gen:types no-op as a real change
**What goes wrong:** running `gen:types` and committing `database.types.ts` as if the schema changed, creating a misleading diff (or fighting the pre-commit hook that rewrites it).
**Why it happens:** habit — schema changed, so "regenerate types." But `text+CHECK` value-set widening does NOT change the TS type (`status` is already `string`), exactly as `0032` did for `format`.
**How to avoid:** do NOT run `gen:types` as a required step. If run, assert `git diff --quiet src/types/database.types.ts` (exit 0). The known pre-commit hook that rewrites this file (MEMORY: dev-env-testing-gotchas) should leave it byte-identical.
**Warning signs:** a non-empty diff on `database.types.ts` after this migration → something else changed; investigate, don't commit blindly.

### Pitfall 3: Pushing to PROD inside an autonomous task
**What goes wrong:** an autonomous task tries `supabase db push`, hits the interactive auth gate, and either hangs or fails the run.
**Why it happens:** the push looks like a normal build step but requires `SUPABASE_ACCESS_TOKEN` / interactive login.
**How to avoid:** encode the PROD push as a single `autonomous: false` [BLOCKING] task that bundles **0037 + 0038** (0037 is still pending — STATE.md:179) and the empty-diff gen:types check. This mirrors how Phase 21 handled 0037 (STATE.md:179: "21-03 Task 2 (db push de 0037 ao PROD linkado) bloqueada no gate human-action").
**Warning signs:** any plan task that names `db push` / `db:push` without `autonomous: false`.

### Pitfall 4: Forgetting 0037 is still un-pushed
**What goes wrong:** 0038 is pushed alone, but 0037 (the `classification_source` 'palavra-chave' widening) was never pushed to PROD → PROD schema drifts behind the repo.
**Why it happens:** 0037's push was deferred in Phase 21 and is still pending (STATE.md:179).
**How to avoid:** the deferred push task MUST apply 0037 **and** 0038 in the same `supabase db push` (which replays all un-applied migrations in order anyway). Document both in the task body.
**Warning signs:** a deferred-push task that mentions only 0038.

## Code Examples

### The migration (full file)
See **Pattern 1** above for the complete `0038_statements_status_imported.sql`.

### The behavior it unlocks (existing code — DO NOT EDIT, shown for the planner's traceability)
```ts
// import.ts:323-330 — fast-path, reachable ONLY after 0038
if (existing.status === 'imported') {
  return {
    statementId: existing.id,
    rows: [],
    summary: { total: 0, novas: 0, naoClassificadas: 0, duplicadas: 0, descartadas: 0 },
    alreadyImported: true,
  }
}

// import.ts:995-1004 — the update that currently fails the CHECK and is swallowed
const { error: statusError } = await supabase
  .from('statements')
  .update({ status: 'imported' })
  .eq('id', statementId)
if (statusError) {
  console.error(`[confirmImport] status='imported' update failed (statementId=${statementId}):`, statusError)
}
// ↑ keep this log as a safety net (CONTEXT Discretion). After 0038 the update succeeds.
```

### The PDF-07 test edit (the only test change)
```ts
// src/lib/parsers/pdf.test.ts — strengthen the existing generic case (~line 122)
it('does not throw on garbage text and yields no rows (generic degradation, SC2)', () => {
  expect(() => parseSantanderText('total garbage\nno tx lines here\n', VENC)).not.toThrow()
  expect(parseSantanderText('total garbage\nno tx lines here\n', VENC))
    .toEqual({ rows: [], dropped: expect.any(Number), capped: false })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline unnamed CHECK on `statements.status` (0019) | Named, widened CHECK via drop-if-exists + add (this phase) | 2026-06 | Re-import fast-path becomes reachable; future migrations can target the constraint by name. |
| pdf-parse bundled by Next default (broke worker resolution in PROD) | `serverExternalPackages: ["pdf-parse"]` + `outputFileTracingIncludes` for the worker/cmaps/fonts (0036-era / `fb91b58`) | Already shipped | PDF parsing works in serverless PROD. This phase only deploys + verifies it live. |

**Deprecated/outdated:** none relevant to this phase.

## Validation Architecture

> `workflow.nyquist_validation` not disabled in config → section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` (existing; `"test": "vitest run"` `package.json:13`) |
| Config file | `vitest.config.ts` (existing; `include` matches `tests/**/*.test.ts` + `src/**/*.test.{ts,tsx}` — verified via STATE.md Phase 11 note) |
| Quick run command | `npx vitest run src/lib/parsers/pdf.test.ts src/actions/import.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Observable behaviors to validate
| Behavior | Test Type | Automated Command | Status |
|----------|-----------|-------------------|--------|
| (a) Migration replay applies the widened CHECK; `update set status='imported'` succeeds where it failed before | migration replay + manual SQL assert | `npm run db:reset` then `psql` `update ... set status='imported'` → `UPDATE 1` (was 23514) | Wave 0 — local replay (no new test file) |
| (b) Confirmed statement → re-upload returns `alreadyImported` (0 novas) | unit (mock) | `npx vitest run src/actions/import.test.ts -t "CONFIRMED"` | ✅ exists `import.test.ts:410-420` |
| (c) Unconfirmed statement → re-parse, reuse id | unit (mock) | `npx vitest run src/actions/import.test.ts -t "UNCONFIRMED"` | ✅ exists `import.test.ts:422-432` |
| (d) Image-only PDF hard-blocks with CSV/OFX-steering message | unit (mock) | `npx vitest run src/actions/import.test.ts -t "image-only"` | ✅ exists `import.test.ts:508-518` |
| (e) Generic non-Santander noise → 0 rows, no throw, honest counts | pure unit | `npx vitest run src/lib/parsers/pdf.test.ts -t "garbage"` | ⚠️ exists `pdf.test.ts:122-125` — **strengthen** (add `.not.toThrow()` + full-shape assert) |
| (f) PDF text-present-0-rows is NOT a block (shows empty review) | unit (mock) | `npx vitest run src/actions/import.test.ts -t "0 matching"` | ✅ exists `import.test.ts:520-531` |
| (g) PDF works live in PROD after deploy (SC1) | manual / human-verify | deferred UAT — upload a real PDF in PROD post-deploy | ❌ `autonomous: false` (like Phase 22) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/parsers/pdf.test.ts src/actions/import.test.ts` (fast, deterministic).
- **Per wave merge:** `npm test` (full suite green).
- **Phase gate:** full suite green + local migration replay clean + `git diff --quiet src/types/database.types.ts` (empty) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `supabase/migrations/0038_statements_status_imported.sql` — the migration (the one production artifact, covers IMP-07).
- [ ] Strengthen `src/lib/parsers/pdf.test.ts:122-125` — generic degradation assertion (covers PDF-07 SC2). **No new file.**
- [ ] Local replay step (`db:reset` if stack up, else SQL dry-parse) — the DB-side proof of (a).

*(No framework install needed; no new fixtures strictly required — the inline garbage string suffices.)*

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `supabase` CLI | local replay + deferred PROD push | ✓ (dep `^2.106.0`) | 2.106.x | — |
| Local Supabase stack (Docker) | migration replay validation (Pattern 2) | likely ✓ (often left running per STATE.md) | — | SQL dry-parse against 0032/0037 template if down |
| `SUPABASE_ACCESS_TOKEN` / interactive auth | **PROD** `supabase db push` | ✗ (human-gated) | — | **None — defer as `autonomous: false`** |
| `vitest` | PDF-07 test | ✓ | existing | — |

**Missing dependencies with no fallback:** PROD push auth — by design deferred to a human task (not a blocker for code-side phase closure).
**Missing dependencies with fallback:** local stack — if not running, validate by SQL dry-parse against the proven 0032/0037 pattern.

## Security Domain

> `security_enforcement` not disabled in config → section included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth change. |
| V3 Session Management | no | — |
| V4 Access Control | yes (preserve) | RLS `"own statements" using/with check (auth.uid()=user_id)` on `statements` (0019:33-37) is **untouched** — the migration alters only a CHECK, not the policy. Verify grants/policy unchanged post-migration. |
| V5 Input Validation | yes (already enforced) | `status` value set is now `{uploaded,parsing,parsed,failed,imported}` — the CHECK is itself a server-side input-validation control; only the app writes these values, never user input. |
| V6 Cryptography | no | `content_hash` (sha256) dedupe is unchanged. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Migration accidentally drops/loosens RLS while editing the table | Elevation of Privilege | This migration touches ONLY the CHECK — no `alter policy`, no `grant`, no `disable row level security`. Verify the diff is constraint-only. |
| Schema drift (0037 unpushed) leaves PROD inconsistent | Tampering / integrity | Bundle 0037+0038 in the same deferred push (Pitfall 4). |
| Status value injection via the app | Tampering | `status` is set only by server code (`ingestStatement`/`confirmImport`), never from client input; the CHECK backstops it. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Live constraint name is `statements_status_check` (Postgres inline-CHECK convention) | Pattern 1 | LOW — defensive `drop if exists` makes a wrong name a harmless no-op; the named `add` would then fail only if a *differently-named* live constraint already enforces the old set. Convention confirmed twice (0032, 0037). Mitigated by replay catching `42710`. |
| A2 | `gen:types` produces an empty diff for a `text+CHECK` widening | Pitfall 2, Project Constraints | LOW — directly precedented by 0032 (format widening left the type `string`). Verified by the same generation mechanism; planner gates on `git diff --quiet`. |
| A3 | The local Supabase stack is available for replay | Pattern 2 | LOW — STATE.md repeatedly notes the stack left running; if down, SQL dry-parse is the documented fallback. |

**Note:** All three assumptions are LOW-risk and have explicit fallbacks. No user confirmation required before planning — the CONTEXT already locks the approach.

## Open Questions

1. **Exact add-constraint name: canonical `statements_status_check` vs a new descriptive name (0032-style).**
   - What we know: 0032 used a *new* descriptive name; 0037 re-used the canonical name. Both shipped.
   - What's unclear: purely stylistic; no functional difference.
   - Recommendation: re-use the canonical `statements_status_check` (symmetric drop/add, cleaner idempotency). Planner may choose either; this is Claude's Discretion per CONTEXT.

2. **Whether to add a second non-Santander noise fixture beyond the strengthened inline garbage test.**
   - What we know: the inline garbage string already exercises the line-skip + no-throw path.
   - What's unclear: whether SC2 reviewers want a fixture from a visibly different bank layout.
   - Recommendation: the strengthened inline assertion is sufficient for SC2; add a fixture only if the planner wants belt-and-suspenders. Low cost either way.

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/0019_statements.sql` (lines 11-37) — the `status` inline CHECK and RLS shape this phase widens/preserves.
- `supabase/migrations/0032_statements_format_pdf.sql` — the exact drop-if-exists + named-add template to mirror.
- `supabase/migrations/0037_transactions_classification_source_palavra_chave.sql` — second confirmation of the inline-CHECK naming convention + the deferred-push precedent.
- `next.config.ts` — PDF-06 config (worker tracing + `serverExternalPackages`) confirmed code-complete.
- `src/actions/import.ts` (307-336, 353-375, 992-1010) — fast-path, image-only block, swallowed status update.
- `src/actions/import.test.ts` (402-432, 495-531) — existing re-import + PDF degradation mock coverage.
- `src/lib/parsers/pdf.test.ts` (116-126) — existing generic degradation test to strengthen.
- `.planning/REQUIREMENTS.md` (24-29) — PDF-06/PDF-07/IMP-07 definitions.
- `.planning/STATE.md` (179, 262) — 0037 deferred-push precedent + local-replay precedent.

### Secondary (MEDIUM confidence)
- Project MEMORY (dev-env-testing-gotchas, ai-classification) — pre-commit hook rewrites `database.types.ts`; Supabase integration tests env-flaky; PROD account deleted post-P17.

### Tertiary (LOW confidence)
- None — all claims verified against the live tree or project records.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing stack verified in `package.json`.
- Architecture (the migration): HIGH — mirrors two shipped migrations against the exact same table; constraint name confirmed by convention + twice empirically.
- Pitfalls: HIGH — each is grounded in a verified prior occurrence (0032/0037, gen:types no-op, deferred 0037 push).
- PDF-07 scope: HIGH — degradation behavior + a generic test already exist in-tree.

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable; the only volatility is whether the deferred 0037 push happens out-of-band — re-check STATE.md before the deferred-push task).
