---
phase: 06-endurecimento-lgpd-isolamento-auditoria
plan: 03
subsystem: api
tags: [lgpd, data-02, export, account-delete, service-role, server-only, rls, supabase, type-to-confirm, ptbr]

# Dependency graph
requires:
  - phase: 06-endurecimento-lgpd-isolamento-auditoria
    plan: 01
    provides: "src/lib/data/owned-tables.ts (OWNED_TABLES 14) the export+delete iterate; src/lib/supabase/admin.ts (server-only service-role createAdminClient — this plan is its first+sole importer); src/lib/transactions/csv.ts (transactionsToCsv); the 3 deferred-RED lgpd-* it.todo tests this plan flips GREEN"
  - phase: 06-endurecimento-lgpd-isolamento-auditoria
    plan: 02
    provides: "src/app/(app)/conta/page.tsx shell with TODO(06-03) placeholders for the bundle button + delete zone; ExportTransactionsButton (the subordinate tx CSV affordance); the Conta nav + UserMenu link"
  - phase: 05-mei-dasn
    provides: "src/lib/mei/csv.ts (meiReportToCsv) + src/lib/mei/limit.ts (applicableLimitCents) reused for the bundle's per-year MEI CSV"
provides:
  - "src/lib/export/bundle.ts — buildExportBundle: iterates OWNED_TABLES via the RLS server client (bare select('*'), no manual user_id filter), assembles a single-JSON bundle + embedded pt-BR transactions/MEI CSVs"
  - "src/actions/export-data.ts — exportMyData Server Action (RLS-scoped; userId from getClaims; NEVER imports admin.ts)"
  - "src/actions/delete-account.ts — deleteMyAccount Server Action: z.literal('APAGAR') gate, userId from session, Storage remove FIRST then auth.admin.deleteUser LAST (cascade); the ONLY importer of the server-only service-role admin client"
  - "src/components/export-data-button.tsx — ExportDataButton (LGPD bundle download)"
  - "src/components/delete-account-form.tsx — AccountDeleteZone + type-to-confirm APAGAR dialog → deleteMyAccount → signOut"
  - "Completed Conta screen: Section A (bundle + tx CSV) + Section B (destructive delete zone)"
  - "3 LGPD integration tests GREEN (lgpd-export, lgpd-delete, lgpd-delete-isolation) + the delete unit test"
affects: [06-04-sec-audits-closure, 06-05-browser-walkthrough]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Export reads via the RLS server client with a bare select('*') over OWNED_TABLES — 'only my rows' is structural (no manual user_id filter that could leak if forgotten); admin.ts is never imported on the export path"
    - "Delete = Storage-remove FIRST (not FK-cascaded; failure leaves the account intact + idempotently retryable) then auth.admin.deleteUser LAST (ON DELETE CASCADE empties all 14 tables atomically); NO hand-rolled per-table DELETE loop"
    - "Single-JSON bundle (zero new packages): { exportedAt, userId, tables: {raw cents + raw category_id}, csv: {transactions, mei} } — machine-faithful JSON + human-readable pt-BR CSV views, two representations of one source"
    - "Type-to-confirm destructive dialog extends the Phase-2 alert-dialog grammar via layout+friction (border-destructive zone, bulleted irreversibility <ul> in AlertDialogDescription, exact case-sensitive APAGAR gate, initialFocus on Cancelar), never a second/brighter red"
    - "The service-role secret stays server-only by construction: deleteMyAccount imports admin.ts (server-only), the UI imports ONLY the action — verified the freshly-built .next/static is secret-marker-free"

key-files:
  created:
    - src/lib/export/bundle.ts
    - src/actions/export-data.ts
    - src/actions/delete-account.ts
    - src/actions/delete-account.test.ts
    - src/components/export-data-button.tsx
    - src/components/delete-account-form.tsx
  modified:
    - src/app/(app)/conta/page.tsx
    - tests/lgpd-export.test.ts
    - tests/lgpd-delete.test.ts
    - tests/lgpd-delete-isolation.test.ts

key-decisions:
  - "Bundle MEI CSV is built per-year in-memory from raw mei_invoices (gross + comercio/servicos split by activity_type), reusing meiReportToCsv (header once + a data row per year) and applicableLimitCents off mei_settings.mei_start_date — no DB view dependency, no serializer rebuild"
  - "Integration tests exercise the delete CORE (Storage-remove first, auth.admin.deleteUser last) directly with the seeded userId, because the action's userId derives from a request session (getClaims) unavailable off-request; the session→userId derivation is unit-tested separately in delete-account.test.ts"
  - "The delete dialog's confirm uses e.preventDefault() + an async handler so the dialog stays open across the async delete and on failure (clears the input, sonner error) — never silently partial-succeeds"

patterns-established:
  - "Pattern 1: RLS-structural export (no admin client, no user_id filter) vs service-role delete (the single legitimate secret use) — two opposite trust postures on one LGPD surface"
  - "Pattern 2: Storage-first / auth-last delete ordering proven by an A-gone + B-intact integration pair driven off OWNED_TABLES"

requirements-completed: [DATA-02]

# Metrics
duration: ~9min
completed: 2026-06-17
---

# Phase 6 Plan 03: DATA-02 LGPD Export + Delete Slice Summary

**The complete data-subject-rights vertical: `exportMyData` assembles a single-JSON bundle of all 14 owned tables (RLS-scoped — only my rows) + embedded pt-BR transactions/MEI CSVs, and `deleteMyAccount` (the app's most dangerous op) removes Storage `{userId}/` FIRST then `auth.admin.deleteUser` LAST behind a type-to-confirm APAGAR gate that signs the user out — flipping the three deferred Wave-0 LGPD tests GREEN and proving the delete is both complete (A fully gone) and surgical (B untouched).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-17T10:44:43Z
- **Completed:** 2026-06-17T10:53:00Z (approx)
- **Tasks:** 3
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments

- **`buildExportBundle` + `exportMyData` (DATA-02 export)** — iterates `OWNED_TABLES` (14) via the RLS-scoped server client doing a bare `select('*')` per table (NO `.eq('user_id', …)` — RLS is the boundary, so "only my rows" is structural and a forgotten filter can't leak). Assembles `{ exportedAt, userId, tables, csv: { transactions, mei } }` as a single JSON (zero new packages, 06-RESEARCH A1). The JSON `tables` keep raw integer cents + raw `category_id` (machine-faithful); the embedded CSVs are the human-readable pt-BR view (transactions resolve the point-in-time category name in-memory; MEI rebuilds a per-year DASN report and reuses `meiReportToCsv`). The action derives userId from `getClaims` and NEVER imports `admin.ts`.
- **`deleteMyAccount` (DATA-02 delete — the dangerous op)** — the ONLY importer of the server-only service-role `admin.ts`. `z.literal('APAGAR')` confirm gate; userId from the SESSION (`getClaims`), never input; Storage `list`+`remove` under `{userId}/` FIRST (not FK-cascaded; a failure leaves the account intact + retryable, remove-on-absent is a no-op), then `auth.admin.deleteUser` LAST (the `ON DELETE CASCADE` schema empties all 14 tables atomically — no hand-rolled per-table loop). Returns a specific error per failure; the client signs out after success.
- **Conta LGPD UI (UI-SPEC §1+§2)** — `ExportDataButton` ("Baixar meus dados", calls the action, downloads `meus-dados-{yyyy-MM-dd}.json`, sonner success / inline `text-destructive` + sonner on failure). `AccountDeleteZone`: a persistent `border-destructive` region (never behind a toggle) with a `triangle-alert` glyph + the type-to-confirm `AccountDeleteDialog` — bulleted irreversibility `<ul>` inside `AlertDialogDescription` (a screen reader hears it before the input), exact case-sensitive APAGAR gate (confirm `disabled`+`aria-disabled` until match), `initialFocus` on Cancelar (a stray Enter cancels, never deletes), Escape cancels, "Apagando…" → `deleteMyAccount` → `signOut`. Wired into the Conta page replacing the 06-02 placeholders: Section A bundle (primary) + tx CSV (subordinate), Section B delete zone. The UI imports ONLY the actions — the secret never reaches the client.
- **3 LGPD tests + the delete unit test GREEN (18 assertions)** — `lgpd-export` (completeness over OWNED_TABLES + only-my-rows + CSVs embedded), `lgpd-delete` (A's 14 tables 0 rows via cascade + Storage gone + auth removed), `lgpd-delete-isolation` (deleting A leaves every B row + B's Storage + B's auth intact — the load-bearing "doesn't touch B" guarantee), and `delete-account.test.ts` (confirm gate, userId-from-session, Storage→auth order, falha_storage aborts before auth delete).

## Task Commits

Each task was committed atomically:

1. **Task 1: Export bundle + exportMyData (RLS — only my rows), lgpd-export GREEN** — `d99ce86` (feat, TDD impl+test in one increment against the live local stack)
2. **Task 2: deleteMyAccount (Storage first, auth last) + delete tests GREEN** — `2fbd0ad` (feat)
3. **Task 3: Conta screen — ExportDataButton + AccountDeleteZone (type-to-confirm)** — `e848ccc` (feat)

**Plan metadata:** final docs commit — see below.

## Files Created/Modified

- `src/lib/export/bundle.ts` — buildExportBundle: OWNED_TABLES iteration (RLS select('*')) + embedded pt-BR transactions/MEI CSVs; single-JSON ExportBundle
- `src/actions/export-data.ts` — exportMyData '`use server`' (RLS, getClaims userId, no admin.ts)
- `src/actions/delete-account.ts` — deleteMyAccount '`use server`' (APAGAR gate, Storage-first/auth-last; sole admin.ts importer)
- `src/actions/delete-account.test.ts` — mocked-client unit test: confirm gate, userId-from-session, call order, failure modes
- `src/components/export-data-button.tsx` — ExportDataButton (LGPD bundle Blob download)
- `src/components/delete-account-form.tsx` — AccountDeleteZone + type-to-confirm APAGAR dialog → deleteMyAccount → signOut
- `src/app/(app)/conta/page.tsx` — replaced 06-02 placeholders: Section A (bundle + tx CSV) + Section B (delete zone)
- `tests/lgpd-export.test.ts` — flipped GREEN: 14-table seed for A+B, bundle completeness + only-my-rows + CSVs embedded
- `tests/lgpd-delete.test.ts` — flipped GREEN: A fully erased (14 tables + Storage + auth)
- `tests/lgpd-delete-isolation.test.ts` — flipped GREEN: delete A leaves every B row + B Storage + B auth intact

## Decisions Made

- **MEI CSV in the bundle is built per-year in-memory** from raw `mei_invoices` (summing gross + the `activity_type` comercio/servicos split), with `applicableLimitCents` off `mei_settings.mei_start_date` and `has_employee` from `mei_year_flags`, then serialized via `meiReportToCsv` (one header + a data row per year). This keeps the bundle dependency-free (no `v_mei_year_summary` DB view round-trip) and reuses the Phase-5 serializer rather than rebuilding it.
- **Integration tests drive the delete CORE directly** (Storage-remove first, `auth.admin.deleteUser` last) with the seeded userId, since the action's userId derives from a request session (`getClaims`) that isn't available off-request. The session→userId derivation + the confirm gate + the call order are unit-tested with mocked clients in `delete-account.test.ts`, so both the wrapper contract and the live erasure/isolation are covered.
- **The confirm button uses `e.preventDefault()` + an async handler** so the alert-dialog stays open across the async delete and on failure (input cleared, sonner error) — the UI-SPEC "never silently partial-succeed" rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seed `profiles` via upsert, not insert (DB trigger pre-creates the row)**
- **Found during:** Task 1 (lgpd-export seeding) — recurred in Task 2's seeders
- **Issue:** A `profiles` row is auto-created on user signup by a DB trigger, so seeding each test user with a plain `insert` into `profiles` threw `duplicate key value violates unique constraint "profiles_pkey"`, failing `beforeAll`.
- **Fix:** Seed `profiles` with `upsert({ id, user_id, display_name })` (idempotent) in all three integration test seeders; the other 13 tables still use `insert`.
- **Files modified:** tests/lgpd-export.test.ts, tests/lgpd-delete.test.ts, tests/lgpd-delete-isolation.test.ts
- **Verification:** all 3 integration files GREEN.
- **Committed in:** d99ce86 (export) / 2fbd0ad (delete)

**2. [Rule 1 - Bug] Assert B's Storage object survives by presence/size, not an exact byte string**
- **Found during:** Task 2 (lgpd-delete-isolation)
- **Issue:** Under jsdom, `storage.upload(new Blob([...]))` does not round-trip the raw bytes the way a real browser would — the stored object's text came back as `[object FormData]`, so an exact `toBe('B-payload')` assertion failed even though B's object was fully intact after A's delete.
- **Fix:** Assert the load-bearing guarantee instead — after deleting A, B's object still downloads (`error` null, `blob.size > 0`) AND is still listed under B's prefix. The exact payload bytes are a jsdom artifact, not the property under test.
- **Files modified:** tests/lgpd-delete-isolation.test.ts
- **Verification:** lgpd-delete-isolation GREEN; the "B Storage object survives A's delete" guarantee is asserted via download+list.
- **Committed in:** 2fbd0ad (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 test bugs). Both corrected test-harness assumptions, not product behavior.
**Impact on plan:** No scope change. The actions/components shipped exactly as planned; the fixes made the integration seed + isolation assertion correct against the local stack's real signup trigger and jsdom's Blob handling.

## Issues Encountered

- `Multiple GoTrueClient instances detected` warnings appear in the test stderr (multiple per-user clients in one jsdom context). Cosmetic only — every assertion passes; the harness creates a distinct client per seeded user by design.

## Known Stubs

None — the 06-02 `TODO(06-03)` placeholders on the Conta screen are now fully replaced with live, wired affordances (`ExportDataButton` + `AccountDeleteZone`). No remaining stubs.

## Threat Flags

None — no security surface introduced beyond the plan's `<threat_model>`. The two new server primitives match the register exactly: export is RLS-only (no secret), delete is the single legitimate service-role use behind `server-only` + the APAGAR gate + session-derived userId, Storage-first ordering, and the cascade (no manual DELETE loop). The bundle-secret audit stays green against a freshly-built `.next/static`.

## User Setup Required

None — no external service configuration. For LOCAL tests the admin client's secret is read from the running stack via `supabase status`; no real/remote secret is committed. The local stack was left RUNNING for 06-04/06-05.

## Next Phase Readiness

- **06-04 (SEC-01 audits closure):** the secret is now actually *used* server-side (delete) yet still absent from `.next/static` — the real-`next build` bundle-secret audit (it.todo in bundle-secret-grep) is ready to finalize; `createAdminClient` is verified imported ONLY by `delete-account.ts`.
- **06-05 (browser walkthrough):** the full DATA-02 surface is live on `/conta` — the dangerous type-to-confirm → delete → sign-out path can be walked against a throwaway LOCAL user; export downloads `meus-dados-{date}.json`.
- **Verification status:** `npx tsc --noEmit` clean; `npm run build` compiles `/conta` (17 routes); the 4 target tests (lgpd-export/delete/delete-isolation + delete unit) GREEN (18/18); `bash scripts/check-bundle-secrets.sh` exits 0. Local stack left RUNNING. No remote push.

## Self-Check: PASSED

- FOUND: src/lib/export/bundle.ts
- FOUND: src/actions/export-data.ts
- FOUND: src/actions/delete-account.ts
- FOUND: src/actions/delete-account.test.ts
- FOUND: src/components/export-data-button.tsx
- FOUND: src/components/delete-account-form.tsx
- FOUND commit: d99ce86 (Task 1)
- FOUND commit: 2fbd0ad (Task 2)
- FOUND commit: e848ccc (Task 3)

---
*Phase: 06-endurecimento-lgpd-isolamento-auditoria*
*Completed: 2026-06-17*
