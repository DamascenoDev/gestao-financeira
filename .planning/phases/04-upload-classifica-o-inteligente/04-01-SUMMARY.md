---
phase: 04
plan: 01
subsystem: import-substrate
tags: [migrations, parsers, classification, rls, dedup, tdd, wave-0]
requires:
  - "Phase 1-3 schema (categories.is_reserva, transactions, reservas, reserva_ledger)"
  - "src/lib/money.ts (parseBRLToCents), src/lib/month.ts"
  - "tests/helpers/local-supabase.ts harness"
provides:
  - "statements / merchant_patterns / csv_import_profiles tables + transactions ALTER"
  - "v_recurring_descriptors security_invoker view (CLS-06)"
  - "normalizeDescriptor (the single shared merchant key)"
  - "contentHash + dedupeKey (two-layer dedup basis)"
  - "in-house parseOfx + papaparse parseCsv"
  - "lookupMemory point-read + suggestCategory deferred-AI null seam + validateSuggestion enum wrapper"
  - "import Zod schemas (csvMappingSchema, confirmImportRowSchema)"
  - "10 Wave-0 tests + 5 synthetic fixtures"
affects:
  - "Plan 04-02 (ingestStatement / signed upload) builds on parsers + dedup + memory"
  - "Plan 04-03 (confirmImport / review) builds on schema + learn-on-confirm substrate"
tech-stack:
  added: [papaparse@5.5, "@types/papaparse@5.5"]
  patterns:
    - "in-house OFX SGML walk (no third-party OFX lib — supply-chain directive)"
    - "OFX dot-decimal vs CSV comma-decimal kept on separate money paths"
    - "partial unique dedupe index mirrors reserva_ledger_txn_uniq discipline"
    - "deferred-AI seam returns null + enum-validation wrapper (SEC-03 by construction)"
key-files:
  created:
    - supabase/migrations/0019_statements.sql
    - supabase/migrations/0020_transactions_import.sql
    - supabase/migrations/0021_merchant_patterns.sql
    - supabase/migrations/0022_csv_import_profiles.sql
    - supabase/migrations/0023_recurring_view.sql
    - src/lib/normalize.ts
    - src/lib/normalize.test.ts
    - src/lib/dedupe.ts
    - src/lib/dedupe.test.ts
    - src/lib/classifier/memory.ts
    - src/lib/classifier/suggest.ts
    - src/lib/classifier/suggest.test.ts
    - src/lib/schemas/import.ts
    - src/lib/parsers/types.ts
    - src/lib/parsers/ofx.ts
    - src/lib/parsers/ofx.test.ts
    - src/lib/parsers/csv.ts
    - src/lib/parsers/csv.test.ts
    - tests/fixtures/itau-sample.ofx
    - tests/fixtures/nubank-sample.ofx
    - tests/fixtures/generic-bank.csv
    - tests/fixtures/ambiguous-cols.csv
    - tests/fixtures/injection.csv
    - tests/import-dedup.test.ts
    - tests/import-storage-rls.test.ts
    - tests/import-idor.test.ts
    - tests/import-reserva-aporte.test.ts
    - tests/import-point-in-time.test.ts
    - tests/import-recurring.test.ts
    - tests/import-learn-on-confirm.test.ts
  modified:
    - supabase/migrations/0003_storage_statements.sql
    - src/types/database.types.ts
    - package.json
    - .planning/phases/04-upload-classifica-o-inteligente/04-VALIDATION.md
decisions:
  - "OFX parsed by an in-house SGML walker; no ofx-data-extractor / no AI SDK installed"
  - "merchant|location split on 2+ spaces in normalizeDescriptor so MEMO city/UF tail collapses to the NAME key"
  - "integration tests assert live-schema substrate GREEN now; downstream action behavior is it.todo naming Plan 02-03"
metrics:
  duration: "~10 min"
  completed: 2026-06-16
---

# Phase 4 Plan 01: Upload/classificação substrate Summary

In-house OFX/CSV ingestion substrate: 5 migrations (statements, transactions ALTER, merchant_patterns, csv_import_profiles, recurring view) applied LOCAL + types regenerated, `papaparse` as the only new dep, and the pure Supabase-free libraries (deterministic `normalizeDescriptor`, two-layer dedup, in-house OFX SGML parser, papaparse CSV parser, memory point-read + a deferred-AI null seam with an enum-validation wrapper) — all pinned by 5 unit suites GREEN + 7 integration suites whose live-schema substrate is GREEN and whose downstream ingest/confirm behavior is `it.todo` for Plans 02-03.

## What Shipped

**Task 1 — Schema substrate (commit `d0749e5`):**
- `0019_statements.sql`: statements table with `unique(user_id, content_hash)` idempotency + uniform RLS/grants/index.
- `0020_transactions_import.sql`: additive ALTER (statement_id, dedupe_key, descriptor_norm, classification_source ['memória'/'manual'/'sugerida'], is_recurring) + partial unique `transactions_dedupe_uniq (user_id, dedupe_key) where dedupe_key is not null` + statement_id index. Existing manual rows stay valid (statement_id null).
- `0021_merchant_patterns.sql`: memory table, `unique(user_id, descriptor_norm)` one-mapping-per-merchant, nullable reserva_id (RSV-06).
- `0022_csv_import_profiles.sql`: reusable CSV layout per `unique(user_id, header_signature)` (resolves RESEARCH Open Question 2).
- `0023_recurring_view.sql`: `v_recurring_descriptors with (security_invoker = true)`, ≥3 distinct civil months (CLS-06).
- `0003_storage_statements.sql`: the deferred `for all` → per-verb (select/insert/update/delete) policy split (threat T-04-03), `{user_id}/` path scope preserved verbatim on every verb.
- `papaparse` + `@types/papaparse` installed; **no `ofx-data-extractor`, no `ai`/`@ai-sdk`**. `db:reset` replays 0001-0023 clean; `gen:types` sees all new tables/columns/view.

**Task 2 — Pure libs (commit `c2db97f`):**
- `normalize.ts` — THE single deterministic `normalizeDescriptor` (accent strip via NFKD, payment-rail tokens, dates, card `*` noise, long digit runs, trailing UF, merchant|location split on 2+ spaces).
- `dedupe.ts` — `contentHash(bytes)` sha256 + `dedupeKey(userId, row)` (OFX `ofx:<fitid>` vs CSV `csv:<date>:<cents>:<norm>` basis, user-scoped).
- `classifier/memory.ts` — `lookupMemory` merchant_patterns point-read (RLS-scoped, 0|1).
- `classifier/suggest.ts` — `suggestCategory` returns null for every input (no network call); `validateSuggestion` enum wrapper present now (SEC-03 future-LLM contract pinned).
- `schemas/import.ts` — `csvMappingSchema` (distinct cols refine) + `confirmImportRowSchema`.

**Task 3 — Parsers + fixtures + integration tests (commit `2ab41ad`):**
- `parsers/types.ts` — `RawTransaction` + `ParsedReviewRow` contract.
- `parsers/ofx.ts` — in-house SGML STMTTRN walker; `ofxDateToCivil` (YYYYMMDD→civil), `ofxAmountToCents` (dot-decimal, abs positive cents — NOT parseBRLToCents). MEMO preferred over NAME.
- `parsers/csv.ts` — papaparse header mode + delimiter auto-detect; `brDateToCivil` (DD/MM), comma-decimal via `parseBRLToCents`; `readCsvHeaders` for the mapper.
- 5 synthetic fixtures (itau/nubank OFX sharing FITID `20260120003` for cross-statement dedup; generic/ambiguous/injection CSV).
- 7 integration tests (dedup, storage-rls, idor, reserva-aporte, point-in-time, recurring, learn-on-confirm) — substrate assertions GREEN, downstream `it.todo` naming Plan 02-03.

## Verification

- `npm run db:reset` replays 0001-0023 clean; `npm run gen:types` regenerated `database.types.ts` (statements, merchant_patterns, csv_import_profiles, v_recurring_descriptors, new transactions columns all present).
- Unit suites (OFX, CSV, normalize, dedupe, suggest) — **GREEN now**.
- Integration suites — live-schema substrate **GREEN**; ingest/confirm action behavior is `it.todo` (RED-pending the Plan 02-03 actions, by design — Nyquist: every behavior has a named test).
- **Full suite: 347 passed | 9 todo | 0 failed** (46 files). `tsc --noEmit` clean. `eslint` clean on the new files.
- `grep` confirms `ofx.ts` has no `ofx-data-extractor` literal/import; `package.json` has no `ofx-data-extractor` / `ai` / `@ai-sdk`.
- Local stack left RUNNING (API 127.0.0.1:55321, migrations 0001-0023) for Plans 02-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixture file-read encoding in parser tests**
- **Found during:** Task 3 (csv.test.ts initially read UTF-8 fixtures as latin1 → mojibake header mismatch).
- **Fix:** `parseCsv` consumes already-decoded text (the latin1→UTF-8 decode lives in the Plan-02 ingest action), so the CSV test reads fixtures as UTF-8. Documented in the test. OFX fixture is ASCII-only so latin1 read is equivalent.
- **Commit:** `2ab41ad`.

**2. [Rule 3 - Blocking] Fixture path resolution under vitest**
- **Found during:** Task 3 — `new URL('...', import.meta.url)` resolved to a `/`-rooted path under the vitest transform (ENOENT / "URL must be of scheme file").
- **Fix:** read fixtures via `join(process.cwd(), 'tests/fixtures', name)` (robust, cwd is the repo root in vitest).
- **Commit:** `2ab41ad`.

**3. [Rule 1 - Bug] Own-test expectation conflicting with the merchant|location split**
- **Found during:** Task 2 — a normalize test asserted `'   ABC    DEF   '` → `'abc def'`, but the deliberate 2+-space merchant|location rule keeps only the first segment (`ABC`). The function is correct; the test fixture was wrong.
- **Fix:** replaced with a single-space collapse case + an explicit multi-space-tail case that documents the rule.
- **Commit:** `c2db97f`.

**4. [Rule 3 - Blocking] tsc-strict undefined on test array index**
- **Found during:** Task 2 — `CATEGORIES[0].id` flagged possibly-undefined under strict tsc.
- **Fix:** hoisted a `MERCADO_ID` const.
- **Commit:** `c2db97f`.

### Intentional plan interpretation

- **Test filenames follow the PLAN** (`src/lib/parsers/ofx.test.ts`, `src/lib/normalize.test.ts`, `tests/import-*.test.ts`, etc.), which supersedes the different literal names in 04-VALIDATION.md's Wave 0 Requirements list — no duplicate files created (per the directive).
- **Comment rewording in `ofx.ts`** so the literal string `ofx-data-extractor` does not appear anywhere in source (avoids a future `grep` false-positive on the package name); behavior unchanged.
- **`normalizeDescriptor` merchant|location split:** the plan's behavior requires `"PADARIA SÃO JOÃO  SAO PAULO BR"` and `"PADARIA SAO JOAO"` to collapse to one key. BR exports separate `MERCHANT  CITY UF` with a multi-space gap, so the function keeps only the first 2+-space segment — a deterministic, real-export-grounded rule (marked `[ASSUMED]`/tunable in the code).

## Authentication Gates

None.

## Known Stubs

- `suggestCategory` returns `null` for every input by design (CLS-02 deferred per CONTEXT D-scope_decision). NOT a stub-to-fix: it is the intentional deferred-AI seam; the `validateSuggestion` enum wrapper is present and tested so a future LLM slots in without reworking the pipeline. Resolved (completed) in a post-v1 AI follow-up, not in Phase 4.

## Self-Check: PASSED

- All created files verified present on disk (migrations, libs, parsers, fixtures, tests).
- All three task commits present in git log: `d0749e5`, `c2db97f`, `2ab41ad`.
