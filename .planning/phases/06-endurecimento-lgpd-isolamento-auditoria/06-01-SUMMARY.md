---
phase: 06-endurecimento-lgpd-isolamento-auditoria
plan: 01
subsystem: testing
tags: [rls, lgpd, supabase, service-role, server-only, csv, isolation, vitest, security]

# Dependency graph
requires:
  - phase: 04-importacao-classificacao
    provides: "merchant_patterns/csv_import_profiles/statements tables + suggestCategory null seam (PII guard baseline)"
  - phase: 05-mei-dasn
    provides: "src/lib/mei/csv.ts (meiReportToCsv) — the BOM+;+formatCents CSV pattern transactionsToCsv mirrors"
provides:
  - "src/lib/data/owned-tables.ts — the canonical 14-table OWNED_TABLES list + per-table ISOLATION_INSERT_SHAPES (single source consumed by both the LGPD export bundle and the isolation matrix)"
  - "src/lib/supabase/admin.ts — server-only service-role createAdminClient (DELETE ONLY, unwired; 06-03 is its sole importer)"
  - "src/lib/transactions/csv.ts — transactionsToCsv pure pt-BR serializer (DATA-01)"
  - "8 Wave-0 tests: 4 GREEN (transactions-csv, pii-guard, storage-isolation, isolation-matrix), 3 deferred-RED it.todo (lgpd-export/delete/delete-isolation), 2 extended (rls-isolation 8→14, bundle-secret-grep)"
affects: [06-02-csv-export, 06-03-lgpd-export-delete, 06-04-sec-audits-closure]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Central owned-table constant: OWNED_TABLES (as const tuple) + ISOLATION_INSERT_SHAPES (factory record) so a new table auto-extends both export completeness and the isolation matrix"
    - "Server-only service-role module: import 'server-only' line 1 + SUPABASE_SECRET_KEY (never NEXT_PUBLIC_), left unwired so the secret can't reach the client bundle"
    - "Deferred-RED tests as named it.todo referencing the owning plan (06-03/Wave-4) — no module import of not-yet-shipped actions, so collection never crashes and no false greens"

key-files:
  created:
    - src/lib/data/owned-tables.ts
    - src/lib/supabase/admin.ts
    - src/lib/transactions/csv.ts
    - src/lib/transactions/csv.test.ts
    - tests/isolation-matrix.test.ts
    - tests/storage-isolation.test.ts
    - tests/lgpd-export.test.ts
    - tests/lgpd-delete.test.ts
    - tests/lgpd-delete-isolation.test.ts
    - tests/pii-guard.test.ts
  modified:
    - tests/rls-isolation.test.ts
    - tests/bundle-secret-grep.test.ts
    - .planning/phases/06-endurecimento-lgpd-isolamento-auditoria/06-VALIDATION.md

key-decisions:
  - "csv_import_profiles INCLUDED in OWNED_TABLES (Open Question #1 → user-owned, LGPD-favorable)"
  - "CSV carries resolved category NAME (Open Question #2); raw category_id stays for the JSON bundle (06-03)"
  - "isolation-matrix.test.ts and rls-isolation.test.ts are one shared data-driven source over OWNED_TABLES under two filenames, not two divergent matrices"
  - "storage-isolation + isolation-matrix authored GREEN now (their substrate exists) per the PLAN body, not held RED — see Deviations"

patterns-established:
  - "Pattern 1: one central owned-table list drives both the LGPD export and the per-user isolation proof"
  - "Pattern 2: server-only secret module unwired until its single legitimate consumer (delete) needs it"

requirements-completed: []  # substrate only — DATA-01/02 + SEC-01 finish in 06-02/06-03/06-04

# Metrics
duration: ~6min
completed: 2026-06-17
---

# Phase 6 Plan 01: Endurecimento Substrate + Wave-0 Summary

**Central 14-table OWNED_TABLES constant + server-only service-role admin client (unwired) + transactionsToCsv pt-BR serializer, plus all 8 Wave-0 tests — 4 GREEN, 3 deferred-RED it.todo for 06-03, rls-isolation promoted 8→14 tables.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-17T10:18:12Z
- **Completed:** 2026-06-17T10:24:08Z
- **Tasks:** 3
- **Files modified:** 13 (10 created, 3 modified)

## Accomplishments

- **Single source of truth for the owned-table set** — `OWNED_TABLES` (14 tables, `as const` tuple → literal-union type) + `ISOLATION_INSERT_SHAPES` (per-table minimal RLS-rejectable INSERT factories). The isolation matrix and the future LGPD export both iterate it, so no table can ship without an isolation test or escape the export (Pitfalls 3+4 closed structurally).
- **Server-only service-role admin client** — `createAdminClient()` reads `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_`), guarded by `import 'server-only'` on line 1, left UNWIRED (imported nowhere — 06-03 is its sole consumer). The first legitimate server-side use of the secret; never reaches the client bundle.
- **`transactionsToCsv` (DATA-01)** — mirrors `src/lib/mei/csv.ts` exactly: BOM via `String.fromCharCode(0xFEFF)`, `;` delimiter, CRLF, money ONLY through `formatCents`, RFC-4180 field escaping, Data dd/MM/yyyy, Tipo Consumo/Alocação, "Sem categoria" fallback. 4 behaviors GREEN.
- **All 8 Wave-0 tests authored** — rls-isolation promoted 8→14 tables data-driven over `OWNED_TABLES`; isolation-matrix + storage-isolation + pii-guard GREEN; lgpd-export/delete/delete-isolation as named `it.todo` pinning the exact 06-03 behavior; bundle-secret-grep extended (marker assertions + real-build it.todo). 06-VALIDATION marked `wave_0_complete: true` + `nyquist_compliant: true`.

## Task Commits

1. **Task 1: Central owned-tables list + server-only admin client** — `e515651` (feat)
2. **Task 2: transactionsToCsv pt-BR serializer + unit test** — `9fa3068` (feat, TDD RED→GREEN in one increment)
3. **Task 3: Author the 8 Wave-0 tests** — `2a907f2` (test)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified

- `src/lib/data/owned-tables.ts` — OWNED_TABLES (14) + ISOLATION_INSERT_SHAPES + isolationInsertShape() + OwnedTable type
- `src/lib/supabase/admin.ts` — server-only createAdminClient (service-role, DELETE ONLY, unwired)
- `src/lib/transactions/csv.ts` — transactionsToCsv + TransactionCsvRow (BOM/;/CRLF/formatCents/RFC-4180)
- `src/lib/transactions/csv.test.ts` — 4 DATA-01 behaviors (GREEN)
- `tests/rls-isolation.test.ts` — data-driven over OWNED_TABLES (14) + isolationInsertShape (was 8 inline)
- `tests/isolation-matrix.test.ts` — named entry point, same 4-verb × 14-table data-driven matrix (GREEN)
- `tests/storage-isolation.test.ts` — cross-user denial + getPublicUrl audit + private-bucket (GREEN)
- `tests/lgpd-export.test.ts` — bundle completeness it.todo for 06-03 (RED), guards the central list NOW
- `tests/lgpd-delete.test.ts` — full-erasure it.todo for 06-03 (RED)
- `tests/lgpd-delete-isolation.test.ts` — delete-A-leaves-B-intact it.todo for 06-03 (RED)
- `tests/bundle-secret-grep.test.ts` — extended: marker assertions + real-build it.todo (Wave 4)
- `tests/pii-guard.test.ts` — no ai/@ai-sdk dep + suggestCategory null + no fetch (GREEN)
- `.planning/phases/.../06-VALIDATION.md` — wave_0_complete + nyquist_compliant

## Decisions Made

- **csv_import_profiles INCLUDED** in OWNED_TABLES (Open Question #1 → it is user-owned and LGPD-favorable; costs nothing to include).
- **CSV carries the resolved category name** (Open Question #2); the raw category_id stays for the JSON bundle in 06-03.
- **One shared matrix source, two filenames** — isolation-matrix.test.ts and rls-isolation.test.ts both iterate OWNED_TABLES + isolationInsertShape rather than authoring two divergent matrices.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a brittle literal-string money assertion in the CSV test**
- **Found during:** Task 2 (transactionsToCsv test)
- **Issue:** The test asserted `first.toContain('R$ 1.234,56')` with a regular ASCII space. `formatCents` (via `Intl.NumberFormat('pt-BR')`) emits a non-breaking space (U+00A0) after `R$`, so the literal never matched even though the serializer was correct (the parallel `toContain(formatCents(123456))` assertion passed).
- **Fix:** Replaced the literal with `toMatch(/R\$\s1\.234,56/)` (whitespace-class), keeping the `formatCents(...)` parity assertion as the authoritative check. Implementation unchanged.
- **Files modified:** src/lib/transactions/csv.test.ts
- **Verification:** csv.test.ts 4/4 GREEN.
- **Committed in:** 9fa3068 (Task 2 commit)

### Reconciliation note (not a code change)

The PLAN-CHECKER pre-note suggested holding `isolation-matrix`, `storage-isolation`, and `pii-guard` as RED/it.todo "owned by 06-04." The PLAN's own Task 3 `<done>` + `<verify>` (which runs exactly those four expecting them to PASS) and the fact that all of their substrate genuinely exists this plan (owned-tables.ts, the Phase-4 Storage RLS + private bucket, the no-AI-dep reality, the existing suggestCategory null seam) make GREEN the correct state. I followed the PLAN body and authored them GREEN. 06-04 still owns the phase-gate closure (the real-`next build` secret audit + the full-suite SEC-01 sign-off), which remains it.todo in bundle-secret-grep.

---

**Total deviations:** 1 auto-fixed (1 test bug) + 1 documented reconciliation.
**Impact on plan:** No scope change. The test fix corrected an assertion, not behavior. The reconciliation followed the PLAN's authoritative Task 3 verify command.

## Issues Encountered

None — the local Supabase stack was already running; all RLS/Storage tests read live local credentials via `supabase status`.

## Known Stubs

`src/lib/supabase/admin.ts` is intentionally UNWIRED (imported nowhere). This is by design, not a stub gap: it is the server-only secret holder whose sole legitimate consumer is the account-delete Server Action shipping in 06-03. The `import 'server-only'` guard makes any client import fail the build. Verified imported nowhere via grep.

## Threat Flags

None — no security surface introduced beyond the plan's `<threat_model>`. admin.ts is the only new secret-bearing surface and matches T-06-01 (server-only, unwired, bundle-audit-covered).

## User Setup Required

None — no external service configuration required. The local stack was left RUNNING for the downstream plans.

## Next Phase Readiness

- **06-02 (CSV export slice):** `transactionsToCsv` ready to wire into an ExportTransactionsButton.
- **06-03 (LGPD export+delete):** `OWNED_TABLES` ready for the bundle iteration; `createAdminClient` ready for the delete action (its first import). The 3 deferred it.todo tests (lgpd-export/delete/delete-isolation) name the exact behaviors to flip GREEN.
- **06-04 (SEC-01 audits closure):** the isolation matrix + storage + pii-guard are already GREEN; remaining is the phase-gate real-`next build` secret audit (it.todo in bundle-secret-grep) + the full-suite SEC-01 sign-off.
- **Wave-0 status:** full suite 558 passed | 13 todo | 0 failed; `tsc --noEmit` clean. Local stack left RUNNING. No remote push.

## Self-Check: PASSED

All 11 created files verified present on disk; all 3 task commits (e515651, 9fa3068, 2a907f2) verified in git history.

---
*Phase: 06-endurecimento-lgpd-isolamento-auditoria*
*Completed: 2026-06-17*
