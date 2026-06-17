---
phase: 04-upload-classifica-o-inteligente
plan: 02
subsystem: import-upload
tags: [server-actions, storage, signed-upload, csv, ofx, dedup, classification, react, ui]

requires:
  - phase: 04-01
    provides: "parsers (ofx/csv), normalize, dedupe, classifier seam, statements/merchant_patterns/csv_import_profiles schema, RED dedup/storage-rls integration tests"
provides:
  - "createSignedStatementUpload — {user_id}/ scoped signed upload URL (browser→Storage direct)"
  - "ingestStatement — download→hash→idempotent statement→decode latin1→parse→dedup→memory-classify→review rows (NOTHING in transactions)"
  - "saveCsvProfile / lookupCsvProfile — reusable CSV layout per header signature"
  - "statements.parsed_rows + summary jsonb (the pre-persist review payload Plan 03 reads back)"
  - "/importar upload screen: dropzone + progress + signed-URL uploader + CSV column mapper + Importar nav item"
affects:
  - "Plan 04-03 (confirmImport / review screen) reads statements.parsed_rows + summary and persists+learns on confirm"

tech-stack:
  added: []
  patterns:
    - "'use server' modules export ONLY async actions — sync helpers (csvHeaderSignature) live in src/lib/csv-profile.ts"
    - "signed upload URL minted server-side, bytes uploaded direct browser→Storage (function never sees bytes)"
    - "idempotency via upsert onConflict(user_id,content_hash) + ignoreDuplicates → no returned row = '0 novas'"
    - "review payload persisted as jsonb on the statement (re-read by id, no re-parse) — nothing in transactions until confirm"

key-files:
  created:
    - supabase/migrations/0024_statements_parsed_rows.sql
    - src/actions/import.ts
    - src/actions/import.test.ts
    - src/lib/csv-profile.ts
    - src/app/(app)/importar/page.tsx
    - src/components/upload-dropzone.tsx
    - src/components/upload-progress.tsx
    - src/components/csv-column-mapper.tsx
    - src/components/import-uploader.tsx
  modified:
    - src/lib/parsers/types.ts
    - src/lib/parsers/csv.ts
    - src/components/app-sidebar.tsx
    - src/types/database.types.ts
    - tests/import-dedup.test.ts
    - tests/import-storage-rls.test.ts

key-decisions:
  - "Parsed-rows payload persisted as additive jsonb on statements (0024) so the review RSC re-reads by id without re-parsing"
  - "ingestStatement is SYNCHRONOUS (download+parse inside the action) — adequate for LOCAL synthetic sizes; kept pure enough to later move behind a Route Handler + after()"
  - "saveCsvProfile takes the raw headers (server derives the signature) so the client never needs node:crypto"

patterns-established:
  - "Sync helpers cannot be exported from a 'use server' module — extract to a plain lib module"
  - "ParsedReviewRow.duplicate pre-marks cross-statement dups at ingest for the Plan-03 summary J count"

requirements-completed: [IMP-01, IMP-02, IMP-03, IMP-04, CLS-01]

duration: 13min
completed: 2026-06-16
---

# Phase 4 Plan 02: Upload slice Summary

**A real OFX/CSV upload that lands a parsed, deduplicated, memory-classified review payload — browser uploads bytes direct to the private Storage bucket by signed URL, the server downloads → decodes latin1 → parses → two-layer-dedups → classifies memory-first, persisting the rows on the statement (nothing in `transactions`) and routing to the review route; a byte-identical re-upload yields "0 novas".**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-06-17T00:10:41Z
- **Completed:** 2026-06-17T00:24:00Z
- **Tasks:** 2 (Task 1 TDD)
- **Files created:** 9 / modified: 6

## Accomplishments

- `import.ts` Server Actions: `createSignedStatementUpload` (mints a `${userId}/${uuid}.${ext}` signed upload URL — the function only ever sees the path), `ingestStatement` (download → `contentHash` → idempotent `statements` upsert → `decodeStatement` latin1-fallback → `parseOfx`/`parseCsv` → `normalizeDescriptor` → `dedupeKey` → memory-first `lookupMemory` → review rows persisted as jsonb on the statement, NOTHING in `transactions`), `saveCsvProfile`/`lookupCsvProfile`.
- The "0 novas" path: a content_hash hit (upsert ignoreDuplicates returns no row) → `{ rows: [], alreadyImported: true }` with no re-parse side effects.
- The ambiguous-CSV `needsMapping` branch → the `CsvColumnMapper` dialog (auto-map skips it for recognizable headers; a saved profile reuses the mapping silently).
- `/importar` upload screen: real labeled `<input accept=".ofx,.csv">` dropzone with client type/size validation, upload progress (Enviando…→Processando… aria-live), the signed-URL uploader orchestrator, the CSV mapper, and the **Importar** nav item.
- Flipped the two Plan-01 `it.todo` integration markers (dedup "0 novas" upsert + storage signed-URL round-trip) to live GREEN assertions against the LOCAL stack.

## Task Commits

1. **Schema substrate (additive parsed_rows/summary)** — `4c7f8a4` (chore)
2. **Task 1: import.ts signed-upload + ingestStatement + CSV profiles** — `7dc86b9` (feat; TDD test+impl in one commit)
3. **Task 2: upload screen — dropzone, progress, uploader, CSV mapper, nav** — `48e5122` (feat)

**Plan metadata:** (this commit — docs)

## Files Created/Modified

- `supabase/migrations/0024_statements_parsed_rows.sql` — additive `parsed_rows` + `summary` jsonb on statements (the pre-persist review payload)
- `src/actions/import.ts` — the upload Server Actions (signed URL, ingest, CSV profiles)
- `src/actions/import.test.ts` — 15 mocked-Supabase unit tests (ext validation, path-prefix rejection, "0 novas", memory hit/miss, needsMapping, profile save)
- `src/lib/csv-profile.ts` — `csvHeaderSignature` (pure; lives outside the 'use server' module)
- `src/lib/parsers/types.ts` — `ParsedReviewRow.duplicate` pre-mark field
- `src/lib/parsers/csv.ts` — `parseCsvRaw` (header-keyed records for the mapper preview)
- `src/app/(app)/importar/page.tsx` — RSC shell + ImportUploader
- `src/components/upload-dropzone.tsx` — labeled file input + drag area + client validation
- `src/components/upload-progress.tsx` — progress bar + status transitions + error retry
- `src/components/csv-column-mapper.tsx` — Data/Descritor/Valor mapping dialog + live preview + profile switch
- `src/components/import-uploader.tsx` — the upload lifecycle orchestrator ('use client')
- `src/components/app-sidebar.tsx` — Importar nav item (lucide Upload)
- `tests/import-dedup.test.ts`, `tests/import-storage-rls.test.ts` — two `it.todo` → live GREEN

## Decisions Made

- **Parsed-rows persistence via additive jsonb (0024):** chosen over re-deriving at review time — the review RSC reads the rows by statementId with no second download/parse. Additive, so `db:reset` replays clean; existing `statements` RLS already covers the new columns.
- **Synchronous ingest:** download+parse inside the Server Action (RESEARCH A5) — adequate for LOCAL synthetic sizes; documented in-code as a later Route-Handler+`after()` swap if files grow.
- **`saveCsvProfile(headers, …)` not `(signature, …)`:** the server derives the signature, so the client uploader never imports `node:crypto`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `csvHeaderSignature` cannot be exported from a `'use server'` module**
- **Found during:** Task 2 (the build)
- **Issue:** The plan implied `csvHeaderSignature` as an export of `import.ts`; the client uploader imported it, and Turbopack failed — a `'use server'` module may only export async Server Actions, and `node:crypto` is not browser-safe anyway.
- **Fix:** Extracted `csvHeaderSignature` to `src/lib/csv-profile.ts` (pure, server-only use); changed `saveCsvProfile` to accept the raw `headers` array and derive the signature server-side, so the client never needs the helper. Updated the unit test accordingly (+1 case for the empty-header guard).
- **Files modified:** src/actions/import.ts, src/lib/csv-profile.ts, src/components/import-uploader.tsx, src/actions/import.test.ts
- **Verification:** `npm run build` compiles `/importar`; tsc + the new-file lint clean; 15 unit tests GREEN.
- **Committed in:** `48e5122` (Task 2 commit)

**2. [Rule 2 - Missing Critical] `ParsedReviewRow.duplicate` field for the Plan-03 J count**
- **Found during:** Task 1
- **Issue:** ingest pre-marks cross-statement duplicates (dedupe_key already present) for the summary, but `ParsedReviewRow` had no place to carry that flag — a `_duplicate` cast hack would have leaked into the persisted payload.
- **Fix:** added an optional `duplicate?: boolean` to the `ParsedReviewRow` contract (pure parsers leave it unset; ingest sets it).
- **Files modified:** src/lib/parsers/types.ts, src/actions/import.ts
- **Verification:** unit test asserts `summary.duplicadas` + `novas = total − duplicadas`.
- **Committed in:** `7dc86b9` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical)
**Impact on plan:** Both necessary for a building + type-clean slice. No scope creep — the behavior matches the plan; only the module boundary moved.

## Issues Encountered

- The `ingestStatement` result union narrowing: the `needsMapping` branch had to use a plain `'needsMapping' in result` discriminant (not `&& result.needsMapping`) for TS to narrow out that member before the statement-bearing branches. Resolved without `any`.

## User Setup Required

None — no external service configuration. The LOCAL Supabase stack (API 127.0.0.1:55321, migrations 0001-0024) is left RUNNING for Plan 03.

## Known Stubs

- `csvSampleRows(text, n)` server helper now reads real sample rows via `parseCsvRaw` (not a stub). The mapper's rich preview is read **client-side** from the File (UI-SPEC) — the server returns headers + (an available) sample on the `needsMapping` branch.
- `suggestCategory` remains the deferred-AI seam returning `null` (CLS-02, inherited from 04-01 — intentional, resolved post-v1). The ingest pipeline calls it on a memory miss so the seam is exercised; no PII egress (SEC-03 holds by construction).

## Deferred Issues

- Pre-existing lint error in `src/hooks/use-mobile.ts:14` (`react-hooks/set-state-in-effect`) — a shadcn-vendored hook untouched by this plan. Logged to `deferred-items.md`. Not caused by this slice; out of scope per the plan's `<done>` (which scopes verification "modulo the known pre-existing React-Compiler warning").

## Verification

- **Unit:** `src/actions/import.test.ts` — 15 passed (ext validation, path-prefix rejection, "0 novas"/alreadyImported, memory hit→source 'memória', memory miss→null, duplicate pre-mark, needsMapping, profile save/guards/session).
- **Integration (LOCAL stack):** `tests/import-dedup.test.ts` ("0 novas" upsert + cross-statement dedupe_key) + `tests/import-storage-rls.test.ts` (signed-URL round-trip into the `{user_id}/` bucket) — GREEN; the two `it.todo` markers flipped to live assertions.
- **Full suite:** **364 passed | 7 todo | 0 failed** (47 files). `tsc --noEmit` clean. `eslint` clean on all new files (only the pre-existing `use-mobile.ts` error + the known useReactTable warning remain).
- **Build:** `npm run build` compiles `/importar` (dynamic route). The Importar nav item is present (`grep` confirms).

## Next Phase Readiness

- Plan 04-03 (review + confirm) can read `statements.parsed_rows` + `summary` by statementId and render the `ImportReviewTable`; `confirmImport` will persist transactions (ON CONFLICT dedupe_key DO NOTHING) + learn `merchant_patterns` on human confirm. The `ParsedReviewRow.duplicate` pre-mark feeds the J count.
- LOCAL stack RUNNING (migrations 0001-0024). No remote push.

## Self-Check: PASSED

- All 9 created files verified present on disk (migration, import.ts + test, csv-profile, page, 4 components).
- All three task commits present in git log: `4c7f8a4`, `7dc86b9`, `48e5122`.

---
*Phase: 04-upload-classifica-o-inteligente*
*Completed: 2026-06-16*
