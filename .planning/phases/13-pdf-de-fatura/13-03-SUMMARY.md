---
phase: 13-pdf-de-fatura
plan: 03
subsystem: api
tags: [pdf, pdf-parse, server-action, ingest, zod, supabase, nextjs, runtime, estorno, kind]

# Dependency graph
requires:
  - phase: 13-01
    provides: "src/lib/parsers/pdf.ts (extractPdfText / parseSantanderText / findStatementVencimento / pdfDateToCivil) + kind? on RawTransaction"
  - phase: 13-02
    provides: "migration 0031 widening transactions.kind CHECK to ('expense','credit') (committed; db push deferred to a later human gate)"
provides:
  - "'pdf' accepted by extSchema (z.enum(['ofx','csv','pdf']))"
  - "3-way ext detection in ingestStatement (.csv→csv, .pdf→pdf, else ofx)"
  - "PDF dispatch branch inside the existing try/catch wrapper: extractPdfText → image-only hard block → parseSantanderText"
  - "image-only PDF (empty/whitespace extract) returns a CSV/OFX-steering { error }, distinct from a text-present 0-row review"
  - "confirmImport persists kind: r.base.kind ?? 'expense' (server-derived, WR-01 safe)"
  - "/importar route pins runtime='nodejs' + maxDuration=30 (D-08), subhelper names PDF"
affects: [13-04, pdf-review-grid, import-review-table]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PDF dispatch is the 3rd branch of the existing ingest try/catch wrapper — any extractPdfText throw degrades to a friendly { error }, never a 500 (T-13-06/V12)"
    - "decodeStatement (latin1) is CSV/OFX-only — moved inside those branches so PDF Unicode text never passes the latin1 heuristic (Pitfall 7)"
    - "image-only detection (text.trim().length===0) is a HARD BLOCK, kept DISTINCT from a 0-row parse (which flows to the review grid)"
    - "estorno kind threads server-side: read from the authoritative persisted base row, never the client confirm payload (WR-01)"

key-files:
  created: []
  modified:
    - src/actions/import.ts
    - src/actions/import.test.ts
    - src/app/(app)/importar/page.tsx

key-decisions:
  - "Confirm schema (confirmImportRowSchema) NOT given a kind field — the client runConfirm payload (import-review-table.tsx:378-388) does not carry kind; the server reads it from r.base. Avoids dead schema surface (plan-sanctioned)."
  - "Runtime-pinned synchronous server action (runtime='nodejs' + maxDuration=30) instead of a Route Handler — spike measured parse at 24–182 ms (4-page / ~330 KB Santander statement), so the Route-Handler performance premise is disproved (D-08). No route.ts added."
  - "No-vencimento fallback: when findStatementVencimento returns null (layout drift, no full DD/MM/YYYY), fall back to today's civil month/year so tx DD/MM still resolve; honest counts + the review grid remain the safety net (D-01)."

patterns-established:
  - "PDF extraction lives inside the ingest dispatch try/catch so the 'use server' boundary never leaks a 500 (T-13-06)"
  - "Server-derived content (kind) sourced from base, never the client payload — mirrors how descriptor_norm/amount/occurred_on are already sourced (WR-01)"

requirements-completed: [PDF-01, PDF-02, PDF-04, PDF-05]

# Metrics
duration: 8min
completed: 2026-06-18
status: complete
---

# Phase 13 Plan 03: Wire PDF into ingestStatement Summary

**PDF wired as the third `ingestStatement` dispatch branch — `extractPdfText` + `parseSantanderText` with a PDF-04 image-only hard block (distinct from a 0-row parse), server-derived estorno `kind` threaded through `confirmImport` (WR-01 safe), and `/importar` pinned to the Node runtime with `maxDuration` (D-08, no Route Handler).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-18T17:12:05Z
- **Completed:** 2026-06-18T17:19:35Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `extSchema` accepts `'pdf'`; `createSignedStatementUpload` and all three friendly-error strings now name PDF; 3-way ext detection (`.csv`→csv, `.pdf`→pdf, else ofx).
- New `ext === 'pdf'` dispatch branch INSIDE the existing try/catch: `extractPdfText(bytes)` → image-only `{ error }` (PDF-04) when `text.trim().length === 0`, else `findStatementVencimento` + `parseSantanderText`. A residual pdf.js throw degrades to the friendly `{ error }` (T-13-06/V12). `decodeStatement` (latin1) was moved into the ofx/csv branches only — never the PDF path (Pitfall 7).
- `confirmImport` transactions insert changed from hard-coded `kind: 'expense'` to `kind: r.base.kind ?? 'expense'` — the estorno marker rides through WR-01-safely from the server-persisted base row.
- `/importar/page.tsx` pins `export const runtime = 'nodejs'` + `export const maxDuration = 30`; subhelper copy now reads "Suba o OFX, CSV ou PDF do seu banco…" per the UI-SPEC Copywriting Contract. No `route.ts` introduced.

## Task Commits

Each task was committed atomically (TDD tasks have test→feat commits):

1. **Task 1 (RED): failing tests for PDF dispatch + image-only block** - `f62a660` (test)
2. **Task 1 (GREEN): wire PDF into ingestStatement (extSchema + 3-way ext + dispatch)** - `9f550ee` (feat)
3. **Task 2 (RED): failing test for server-derived estorno kind** - `4aa85e2` (test)
4. **Task 2 (GREEN): thread server-derived estorno kind through confirmImport** - `634d527` (feat)
5. **Task 3: pin Node runtime + maxDuration on /importar; subhelper names PDF** - `5aea46c` (feat)

## Files Created/Modified
- `src/actions/import.ts` - `'pdf'` in extSchema; 3-way ext detection; PDF dispatch branch with image-only hard block; `decodeStatement` scoped to ofx/csv only; `confirmImport` insert reads `kind: r.base.kind ?? 'expense'`.
- `src/actions/import.test.ts` - PDF seam mock (`extractPdfText` returns a controllable `pdfText`); rejected-ext test switched from `'pdf'` to `'xml'`; new positive PDF-accept test; PDF dispatch tests (text-present parse, image-only hard block, text-present-0-rows review); estorno `kind` tests (credit from base, expense default); typed `ConfirmRow` row() helper with optional `kind`.
- `src/app/(app)/importar/page.tsx` - `runtime='nodejs'` + `maxDuration=30` exports (D-08); subhelper copy includes PDF.

## Decisions Made
- **Confirm schema unchanged.** Verified `import-review-table.tsx` `runConfirm` (lines 378-388) builds the payload without `kind`; the server re-reads `kind` from the authoritative `r.base` per WR-01, so adding an optional `kind` enum to `confirmImportRowSchema` would be dead schema surface. Plan explicitly sanctioned NOT adding it in that case.
- **Runtime-pinned server action, not a Route Handler (D-08).** Spike evidence: parse measured 24–182 ms for a 4-page / ~330 KB Santander statement — three orders of magnitude under any server-action budget. The locked CLAUDE.md guidance's substantive requirements (Node runtime, raised maxDuration) are honored via route-segment exports; the Route Handler's only premise (latency) was disproved, so no `route.ts` was introduced.
- **No-vencimento fallback (added in Task 1).** `findStatementVencimento` can return null on layout drift; rather than failing, the branch falls back to today's civil month/year so transaction DD/MM still resolve. Honest counts + the review grid are the D-01 safety net.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated the existing 'rejects an ext outside {ofx,csv}' test that used 'pdf' as its invalid example**
- **Found during:** Task 1
- **Issue:** `import.test.ts` had a test asserting `createSignedStatementUpload('x.pdf', 'pdf')` returns `{ error }`. Adding `'pdf'` to `extSchema` makes that call succeed, so the existing test would have produced a false failure.
- **Fix:** Switched the rejected-ext example to `'xml'` (genuinely invalid) and added a positive `accepts pdf as a valid ext` test asserting the `{user_id}/….pdf` scoped URL is minted.
- **Files modified:** src/actions/import.test.ts
- **Verification:** `npx vitest run src/actions/import.test.ts` green (50 tests).
- **Committed in:** `9f550ee` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Typed the confirmImport test `row()` helper so `kind` is a known field**
- **Found during:** Task 2
- **Issue:** The test `row()` helper inferred its return type from a literal with no `kind` key, so `r.kind` access and `kind` destructuring in the new tests/`persist()` were `tsc` errors (TS2339), blocking the GREEN gate.
- **Fix:** Added an explicit `ConfirmRow` type (with optional `kind?: 'expense' | 'credit'`) as the `row()` return type.
- **Files modified:** src/actions/import.test.ts
- **Verification:** `npx tsc --noEmit` clean; full suite green.
- **Committed in:** `634d527` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 bug — stale test using the now-valid ext; 1 blocking — test-helper typing).
**Impact on plan:** Both are confined to the test file and were direct consequences of the planned code changes (accepting `'pdf'`; threading `kind`). No scope creep, no production-code deviation.

## Issues Encountered
None — all three tasks executed as planned. The only friction was the two test-side adjustments documented above (a stale test and a helper type), both required by the planned changes.

## Verification
- `npx tsc --noEmit` — clean.
- `npx vitest run` (full) — **784 tests passed** (91 files), including the new PDF dispatch + estorno-kind cases.
- `npm run build` — **Compiled successfully**; `/importar` route present.
- Grep gates: `'pdf'` + `extractPdfText` present in import.ts; `r.base.kind ?? 'expense'` present; `runtime = 'nodejs'` + `maxDuration` present in page.tsx; no `src/app/api/import/route.ts`; `decodeStatement` confined to the ofx/csv branches.

**Note on automated-check scope (per the plan's dependency note):** 13-02's `supabase db push` is deferred to a later human gate, so the live `transactions.kind` CHECK does not yet accept `'credit'`. `database.types.ts` types `kind` as `string`, so tsc/build/unit pass at the code level regardless. The `kind: 'credit'` persist is verified here at the unit level (mocked insert payload asserts `kind === 'credit'`); the live-DB constraint behavior is exercised after the deferred push + the manual upload (VALIDATION manual gate).

## Next Phase Readiness
- The PDF ingest path is wired end-to-end at the server-action level and emits the identical `ParseResult`/`ParsedReviewRow` contract, so Plan 13-04 (review-grid UI: estorno color via `row.original.kind`, delete-row) can build directly on it.
- **Blocker for live PDF→credit persist:** the deferred `supabase db push` of migration 0031 must run before a real estorno can land as `kind:'credit'` in the DB; until then the constraint rejects `'credit'` at runtime. This is the expected, planned sequencing (13-02 human gate later this phase).

## Self-Check: PASSED

All modified files exist on disk; all five task commits (`f62a660`, `9f550ee`, `4aa85e2`, `634d527`, `5aea46c`) are present in git history.

---
*Phase: 13-pdf-de-fatura*
*Completed: 2026-06-18*
