---
phase: 04-upload-classifica-o-inteligente
reviewed: 2026-06-16T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - src/actions/import.ts
  - src/lib/ownership.ts
  - src/lib/parsers/ofx.ts
  - src/lib/parsers/csv.ts
  - src/lib/parsers/types.ts
  - src/lib/normalize.ts
  - src/lib/dedupe.ts
  - src/lib/csv-profile.ts
  - src/lib/classifier/memory.ts
  - src/lib/classifier/suggest.ts
  - src/lib/schemas/import.ts
  - src/lib/money.ts
  - src/app/(app)/importar/[statementId]/page.tsx
  - src/components/import-review-table.tsx
  - src/components/import-uploader.tsx
  - src/components/csv-column-mapper.tsx
  - supabase/migrations/0003_storage_statements.sql
  - supabase/migrations/0019_statements.sql .. 0024_statements_parsed_rows.sql
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: findings
---

# Phase 4: Code Review Report — Upload + Classificação por memória

**Reviewed:** 2026-06-16
**Depth:** deep (cross-file, Storage/IDOR/parse-robustness/dedup/learning traced end-to-end)
**Files Reviewed:** 18
**Status:** findings

## Summary

The Storage and IDOR substrate is genuinely strong: the `statements` bucket is private with
per-verb `{user_id}/` RLS (0003), the signed-upload path is minted server-side scoped to the
caller's uid, `ingestStatement` rejects a non-prefixed path as defense-in-depth, and
`confirmImport` re-derives ownership of `statement_id`, every `category_id`, and every
`reserva_id` under the RLS-active client before any FK write (a single forged id rejects the
whole payload). Money flows through `money.ts` bigint/cents, OFX dot-decimal and CSV comma-decimal
are correctly NOT crossed, and the SEC-03 suggestion seam returns null with an enum wrapper so no
PII egress and no injection path exists. Dedup is DB-enforced two-layer (content_hash + partial
unique dedupe_key) and the 23505-skip path is correct and idempotent on retry.

The dominant defect is **parse robustness against hostile/malformed input** (the explicit
top-priority concern for this phase): the in-house OFX/CSV parsers throw on the FIRST malformed
date or amount, and `ingestStatement` wraps the parse calls in NO try/catch — so one garbage row
aborts the entire import AND the throw escapes the Server Action's documented `{ error }` contract
(BLOCKER CR-01). Secondary concerns: `confirmImport` trusts the client-supplied row CONTENT
(`descriptor_norm`, `dedupe_key`, `amount`, `occurred_on`) instead of re-reading the persisted
parse, which lets a client poison learning / forge dedupe within their own data (WR-01); no row
cap anywhere allows an unbounded jsonb persist + N sequential queries (WR-02); and a Reserva row
missing its `reservaId` server-side persists the transaction THEN returns an error (partial state,
WR-03).

---

## Critical Issues

### CR-01: Parsers throw on the first malformed row and the throw escapes `ingestStatement` (one garbage line aborts the whole import + leaks a raw server error)

**File:** `src/lib/parsers/ofx.ts:21,38` · `src/lib/parsers/csv.ts:19,77` · `src/actions/import.ts:281-298`

**Issue:** This is the phase's highest-risk surface (parsing untrusted statement files). Every
field converter throws on bad input — `ofxDateToCivil` (`throw new Error('DTPOSTED inválido')`),
`ofxAmountToCents` (`throw ... 'TRNAMT inválido'`), `brDateToCivil` (`throw ... 'Data pt-BR
inválida'`), and `parseBRLToCents` inside `parseCsv`. `parseOfx`/`parseCsv` iterate rows and call
these inline with **no per-row guard**, so the FIRST malformed row (a `DTPOSTED` of `00000000`, a
`TRNAMT` of `N/A`, a non-pt-BR date, a non-money valor cell, an empty-but-present cell that the
auto-map mis-routed) throws out of the whole parse. Worse, `ingestStatement` calls
`parseOfx(text)` (line 282) and `parseCsv(text, resolved)` (line 297) **with no try/catch** — the
action's own docstring promises "Zod safeParse at the boundary → { error } (never throws/leaks)",
but a thrown parse error propagates out of the `'use server'` function and surfaces to the client
as an opaque framework 500, not the friendly `{ error: 'Não foi possível ler este arquivo...' }`.
A real bank export with a single odd line (a reversal, a header row papaparse mis-detected, a
trailing balance line) takes the entire upload down. This is both a robustness failure (one bad
row should be skipped, not abort N good rows) and a contract/leak violation.

**Fix:** Skip-and-count bad rows in the parsers, and wrap the parse dispatch in `ingestStatement`
so any residual throw becomes the friendly `{ error }`:

```ts
// parsers/ofx.ts — inside the while loop, guard the converters
try {
  rows.push({
    occurred_on: ofxDateToCivil(dtposted),
    amount_cents: ofxAmountToCents(trnamt),
    descriptor_raw,
    descriptor_norm: normalizeDescriptor(descriptor_raw),
    fitid: readTag(block, 'FITID'),
  })
} catch {
  continue // a malformed STMTTRN is skipped, not fatal (track a dropped count if surfaced)
}

// parsers/csv.ts — same per-row try/catch around brDateToCivil + parseBRLToCents

// actions/import.ts — belt-and-suspenders around the dispatch (lines 281-298)
let rawRows: RawTransaction[]
try {
  if (ext === 'ofx') {
    rawRows = parseOfx(text)
  } else {
    // ...resolve mapping...
    rawRows = parseCsv(text, resolved)
  }
} catch {
  return { error: 'Não foi possível ler este arquivo. Verifique se é um extrato OFX/CSV válido e tente de novo.' }
}
```

Consider surfacing the dropped-row count in `IngestSummary` so a file that parsed 0 usable rows
(all malformed) reports honestly instead of silently importing nothing.

---

## Warnings

### WR-01: `confirmImport` trusts client-supplied row CONTENT — learning poisoning + dedupe forgery within the user's own data

**File:** `src/actions/import.ts:469-643` · `src/lib/schemas/import.ts:34-43`

**Issue:** `confirmImport(statementId, rows)` validates SHAPE (`confirmImportRowSchema`) and
re-derives FK OWNERSHIP, but it never cross-checks the row CONTENT against the
`statements.parsed_rows` that `ingestStatement` actually persisted. `descriptor_norm`,
`dedupe_key`, `amount`, and `occurred_on` all come straight from the client payload
(`import-review-table.tsx:323-332` round-trips them from client state). A crafted request can
therefore: (a) write an arbitrary `descriptor_norm` into `merchant_patterns` (line 612-616) —
poisoning the memory so a future legitimate merchant auto-classifies wrong; (b) supply a forged
`dedupe_key` to defeat or fake cross-statement dedup; (c) set an arbitrary `amount`/`occurred_on`
divorced from the parsed file. Blast radius is self-scoped (RLS + ownership keep it inside the
caller's own rows), so it is not a cross-tenant IDOR — but it directly defeats the phase's stated
"learning correctness / no poisoning" and "dedup integrity" invariants, which are correctness
guarantees, not just hardening.

**Fix:** Re-read the authoritative parsed rows from the statement and key the confirm by the
persisted row identity rather than trusting client content. Minimum: load
`statements.parsed_rows` for `statementId`, build a `Map` by `dedupe_key`, and for each incoming
row use the PERSISTED `descriptor_norm`/`amount`/`occurred_on`/`dedupe_key` — let the client
payload contribute ONLY the user's chosen `categoryId`/`reservaId`. Reject any incoming
`dedupe_key` not present in the persisted set.

```ts
const { data: stmt } = await supabase
  .from('statements').select('parsed_rows').eq('id', statementId).maybeSingle()
const persisted = new Map(
  ((stmt?.parsed_rows ?? []) as ParsedReviewRow[]).map((p) => [p.dedupe_key, p]),
)
for (const r of parsedRows) {
  const base = persisted.get(r.dedupe_key)
  if (!base) return { error: 'Linha não pertence a esta importação.' }
  // use base.descriptor_norm / base.amount_cents / base.occurred_on; r.categoryId/r.reservaId only
}
```

### WR-02: No row-count cap — unbounded jsonb persist + N sequential per-row queries on a hostile file

**File:** `src/lib/parsers/ofx.ts:60-85` · `src/lib/parsers/csv.ts:60-83` · `src/actions/import.ts:309-371`

**Issue:** Neither parser caps the number of rows, and `ingestStatement` then (1) runs a per-row
`transactions` dedupe SELECT plus a `merchant_patterns` SELECT **sequentially inside the loop**
(lines 313-323 → 2 round-trips × N rows), and (2) persists the entire `rows` array into the
`statements.parsed_rows` jsonb column (line 363) with no size limit. A hostile file with hundreds
of thousands of `<STMTTRN>` blocks (cheap to generate, well under the 4.5 MB note for OFX since
each block is tiny) produces an unbounded in-memory array, an enormous jsonb write, and 2·N
serial DB calls — a self-inflicted DoS / memory-pressure vector even before `confirmImport`. The
phase scope explicitly calls out "no crash / unbounded memory" for untrusted input.

**Fix:** Cap parsed rows (e.g. `MAX_ROWS = 10_000`) and reject (friendly `{ error }`) or truncate
with a surfaced warning when exceeded; do the dedupe pre-check as ONE `.in('dedupe_key', keys)`
query instead of N point-reads:

```ts
const MAX_ROWS = 10_000
if (rawRows.length > MAX_ROWS) {
  return { error: 'Arquivo muito grande. Divida o extrato em períodos menores.' }
}
const keys = rawRows.map((r) => dedupeKey(userId, r))
const { data: dup } = await supabase
  .from('transactions').select('dedupe_key').in('dedupe_key', keys)
const dupSet = new Set((dup ?? []).map((d) => d.dedupe_key))
```

### WR-03: Reserva row missing `reservaId` persists the transaction, THEN returns an error (server-side partial state)

**File:** `src/actions/import.ts:562-599` · `src/lib/ownership.ts:154-156`

**Issue:** Transactions are inserted in the loop at lines 562-573 BEFORE the reserva-aporte sync
runs at 580-599. If a row is classified into an `is_reserva` category but arrives with no
`reservaId` (the UI dialog enforces it, but the Server Action must not depend on the client),
`syncReservaLedgerForTransaction` returns `{ error: 'Selecione uma reserva.' }` and
`confirmImport` does `if ('error' in sync) return sync` (line 597) — AFTER the transaction row
already landed. The user sees an error, but a category-less-of-aporte transaction is now persisted
(and on retry the dedupe index skips it, so the aporte is never created — a silently
under-recorded reserva). The same applies if `syncReservaLedgerForTransaction`'s ledger insert
fails mid-batch: earlier rows are committed, later ones are not, and the action returns an error.

**Fix:** Validate the reserva precondition BEFORE any transaction insert — fold a
`reservaId`-present check for every `is_reserva` row into the IDOR re-derive pass (lines 494-518),
so a Reserva-classified row without a reservaId rejects the WHOLE payload up front, exactly like a
forged id:

```ts
for (const r of parsedRows) {
  if (r.categoryId && (await isReservaCategory(supabase, r.categoryId)) && !r.reservaId) {
    return { error: 'Selecione uma reserva para os lançamentos de Reserva.' }
  }
}
```

### WR-04: `lookupCsvProfile` is exported from a `'use server'` module — it is a callable Server Action, not an internal helper

**File:** `src/actions/import.ts:414-426`

**Issue:** `lookupCsvProfile` is `export async` inside a `'use server'` file, so Next.js registers
it as a network-callable Server Action even though it is only meant as an internal helper for
`ingestStatement` (line 288). It is RLS-scoped (safe re-derive), so there is no data-leak, but it
needlessly widens the action surface (any client can POST arbitrary `headerSignature` strings to
probe whether a profile exists) and muddies the boundary the rest of the file is careful about.

**Fix:** Move the pure lookup logic out, or inline the query into `ingestStatement`. If it must
stay async + DB-touching, relocate it to a non-`'use server'` server-only module that
`ingestStatement` imports, so it is not exposed as an endpoint.

---

## Info

### IN-01: OFX credits (positive TRNAMT — refunds, PIX received, salary) silently import as `kind: 'expense'`

**File:** `src/lib/parsers/ofx.ts:35-42` · `src/actions/import.ts:544`

**Issue:** `ofxAmountToCents` drops the sign and `confirmImport` hardcodes `kind: 'expense'`. This
is consistent with the v1 domain (the `transactions.kind` CHECK is `in ('expense')` — income is
out of scope), and all fixtures are debits, so tests pass. But a real statement mixes credits and
debits; a refund/credit line is imported as a spend of the same magnitude, quietly inflating
expenses. Acceptable for v1 only if intended.

**Fix:** When income lands in scope, branch `kind` on the original TRNAMT sign (and the CSV valor
sign). For v1, at minimum drop positive-TRNAMT rows or flag them in the review so a credit is not
booked as an expense. Document the limitation if accepting.

### IN-02: `normalizeDescriptor` strips a real trailing 2-letter word as if it were a UF code

**File:** `src/lib/normalize.ts:51`

**Issue:** `.replace(/\s+[a-z]{2}\s*$/g, ' ')` removes any trailing 2-letter token, intended for
the UF state code. After the multi-space merchant split this rarely fires, but a legitimate
merchant whose key ends in a 2-letter word (e.g. "padaria do ze" → "padaria do", "bar xv" → "bar")
is over-stripped, collapsing two distinct merchants to one key (mis-classification) or producing
an empty/odd key. Deterministic and test-pinned, so low impact, but a known false-merge vector.

**Fix:** Constrain to an actual UF allow-list, or only strip when preceded by the city-gap split,
e.g. `.replace(/\s(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\s*$/,' ')`.

### IN-03: `lookupMemory` typed with bare `SupabaseClient` (loses the generated `Database` typing)

**File:** `src/lib/classifier/memory.ts:20-22`

**Issue:** The parameter is `supabase: SupabaseClient` (untyped) whereas `ownership.ts` uses the
`Client = SupabaseClient<Database>` alias. The bare type erases column/row typing on the
`merchant_patterns` query, so a schema drift (a renamed column) would not be caught at compile
time. Minor type-safety regression versus the rest of the module.

**Fix:** Type it `supabase: SupabaseClient<Database>` (or reuse the `Client` alias from
`ownership.ts`) so the `merchant_patterns` select is type-checked.

---

_Reviewed: 2026-06-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
