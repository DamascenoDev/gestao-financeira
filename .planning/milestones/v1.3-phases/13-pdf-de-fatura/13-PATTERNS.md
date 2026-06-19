# Phase 13: PDF de Fatura - Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 9 (1 new lib + 1 new test + 1 new fixture + 6 modified)
**Analogs found:** 9 / 9 (all in-repo — Phase 13 is overwhelmingly additive)

This phase adds a **third parser** (`pdf`) to an existing, proven `OFX/CSV → ParseResult → ingestStatement → ImportReviewTable → confirmImport` pipeline. Every new/changed file mirrors an established analog VERBATIM in shape. The ONLY genuinely-new logic is the Santander text recipe; everything downstream of `ParseResult` is reused unchanged.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/parsers/pdf.ts` (NEW) | parser/utility | file-I/O + transform | `src/lib/parsers/csv.ts` + `ofx.ts` | exact (role+flow) |
| `src/lib/parsers/pdf.test.ts` (NEW) | test | transform | `src/lib/parsers/csv.test.ts` | exact |
| `tests/fixtures/santander-sample.txt` (NEW) | test fixture | — | `tests/fixtures/generic-bank.csv` + `hostile-sample.csv` | role-match (synthetic) |
| `src/lib/parsers/types.ts` (MODIFY) | model/contract | — | self (mirror `fitid?` optional style) | exact |
| `src/actions/import.ts` (MODIFY) | controller/server-action | request-response + file-I/O | self (OFX/CSV dispatch + `confirmImport`) | exact |
| `src/lib/schemas/import.ts` (MODIFY) | model/validation | — | self (`confirmImportRowSchema`) | exact |
| `src/components/upload-dropzone.tsx` (MODIFY) | component | event-driven | self | exact |
| `src/components/import-uploader.tsx` (MODIFY) | component | event-driven | self (`fileExt`) | exact |
| `src/components/import-review-table.tsx` (MODIFY) | component | event-driven | self (`classifyRow`/`tagCarroRow`) | exact |
| `src/components/import-summary-header.tsx` (MODIFY) | component | request-response | self | exact |
| `src/app/(app)/importar/page.tsx` (MODIFY) | route/RSC | — | self | exact |

---

## Pattern Assignments

### `src/lib/parsers/pdf.ts` (NEW — parser, file-I/O + pure transform)

**Analogs:** `src/lib/parsers/csv.ts` (lines 66-100), `src/lib/parsers/ofx.ts` (lines 20-26, 65-101)

RESEARCH §"Pattern 1" mandates the **split**: `extractPdfText(buffer)` (async IO) + `parseSantanderText(text, venc)` (pure, CI-testable). Mirror the pure-parser contract of `parseCsv`/`parseOfx` exactly.

**Imports pattern** — copy from `csv.ts:7-12` (note `import type` for the contract, `@/lib/*` path aliases, relative `./types`):
```typescript
import { parseBRLToCents } from '@/lib/money'
import { normalizeDescriptor } from '@/lib/normalize'
import { MAX_PARSED_ROWS, type ParseResult, type RawTransaction } from './types'
```
NEW import (the only new dep call site): `import { PDFParse } from 'pdf-parse'` (RESEARCH §"Image-only detection").

**Date-helper pattern** — mirror `ofxDateToCivil` (`ofx.ts:20-26`) / `brDateToCivil` (`csv.ts:18-24`): a small exported pure fn, regex-validated, THROWS on bad input (the parse loop catches → `dropped`), emits `YYYY-MM-DD`. New `pdfDateToCivil(dd, mm, venc)` adds the Dec→Jan rollover (RESEARCH §"Statement-year anchor", Pitfall 1):
```typescript
// mirror ofx.ts:20-26 shape; year derived from vencimento + rollover
export function pdfDateToCivil(dd: string, mm: string, venc: { month: number; year: number }): string {
  const year = Number(mm) > venc.month ? venc.year - 1 : venc.year
  return `${year}-${mm}-${dd}`
}
```

**Core parse-loop pattern** — copy the `parseCsv` skeleton VERBATIM (`csv.ts:74-99`): `rows`/`dropped`/`capped` locals, the `rows.length >= MAX_PARSED_ROWS → capped; break` guard, the `try { rows.push({...}) } catch { dropped += 1 }` resilience. RESEARCH §"Pattern 1" gives the exact recipe (TX regex, `R$`-prefix + NOISE_LABEL filter, `Detalhamento`..`Resumo` window, sign-strip before `parseBRLToCents`, `0,00 → dropped`):
```typescript
// csv.ts:74-99 skeleton, swapped to the Santander line recipe
const rows: RawTransaction[] = []
let dropped = 0
let capped = false
for (const l of win) {
  if (rows.length >= MAX_PARSED_ROWS) { capped = true; break }
  // ...filter + TX regex...
  try {
    rows.push({
      occurred_on: pdfDateToCivil(dd, mm, venc),
      amount_cents: parseBRLToCents(val.replace('-', '')), // sign stripped — Pitfall 3
      descriptor_raw,
      descriptor_norm: normalizeDescriptor(descriptor_raw),
      kind: val.startsWith('-') ? 'credit' : 'expense', // NEW field (see types.ts)
      // no fitid → dedupeKey auto-uses the csv:<date>:<cents>:<norm> basis
    })
  } catch { dropped += 1 }
}
return { rows, dropped, capped }
```

**File-doc-comment pattern** — every parser opens with a `// ...` block stating the format, what it does NOT use, and the purity contract (see `csv.ts:1-5`, `ofx.ts:1-10`). Write the same: getText (NOT getTable — measured 0 tables), Supabase-free pure `parseSantanderText`, async-IO-only `extractPdfText`, never throws on a bad line.

**Image-only detection** (PDF-04) — RESEARCH §"Image-only detection" gives `extractPdfText` verbatim (`new PDFParse({ data: new Uint8Array(buffer) })`, `getText()`, `finally destroy()`). The `text.trim().length === 0` check lives in `import.ts` (see below), NOT in the pure fn.

---

### `src/lib/parsers/types.ts` (MODIFY — add `kind?` to `RawTransaction`)

**Analog:** self — mirror the existing optional `fitid?` field (line 46).

Add ONE additive, back-compat field after `fitid?` (OFX/CSV omit it; the comment grammar matches `fitid?`'s):
```typescript
  /** OFX bank-stable id (best dedupe basis); absent for CSV. */
  fitid?: string
  /** PDF estorno/credit marker; absent (⇒ expense) for OFX/CSV. The sign/effect
   *  derives from kind, never the (always-positive) amount_cents. */
  kind?: 'expense' | 'credit'
```
The existing `amount_cents` doc (line 39: *"the sign/effect derives from kind, never the value"*) already anticipates `kind` — this closes that contract. RESEARCH Pitfall 3 / Open Question 1: recommended shape, default `'expense'`.

---

### `src/actions/import.ts` (MODIFY — server action, request-response + file-I/O)

**Analog:** self — the OFX/CSV dispatch (lines 296-329), the ext detection (line 238), `extSchema` (line 104), and `confirmImport`'s hard-coded `kind` (line 652).

**`extSchema` extension** (line 104) — add the third value:
```typescript
const extSchema = z.enum(['ofx', 'csv', 'pdf'])
```
Update the two friendly-error strings that name the formats (lines 189, 245, 327) to include PDF.

**Ext detection** (line 238) — extend the 2-way to 3-way (CONTEXT D-08 / Claude's discretion):
```typescript
const ext = path.toLowerCase().endsWith('.csv')
  ? 'csv'
  : path.toLowerCase().endsWith('.pdf')
    ? 'pdf'
    : 'ofx'
```

**Dispatch branch** — copy the `try { if (ext === 'ofx') {...} else {...} } catch { return { error } }` wrapper (lines 299-329) and add a `pdf` branch. RESEARCH §"Image-only detection" gives the exact body: `extractPdfText` → `text.trim().length === 0 ? return { error: <CSV/OFX-steering msg> }` (PDF-04 hard block, DISTINCT from a 0-row parse) → `parseSantanderText(text, venc)`. The wrapper (V12 security) catches any residual throw → friendly `{ error }` instead of a 500. **Caveat:** `decodeStatement` (latin1 heuristic, lines 122-128) is CSV/OFX-ONLY — do NOT run it on PDF bytes (Pitfall 7: pdf.js already returns Unicode). Pass `bytes`/buffer straight to `extractPdfText`.

**`kind` threading in `confirmImport`** — line 652 currently hard-codes `kind: 'expense'`. Change to read from the authoritative base (RESEARCH Pitfall 3): `kind: r.base.kind ?? 'expense'`. The `AuthoritativeRow`/`base` content is server-persisted (`r.base`, lines 599-609), so `kind` rides through WR-01-safely (client never supplies it). Confirm the `transactions.kind` column accepts `'credit'` — if not, that is a migration task.

**Runtime pin** (D-08 resolution) — the recommended path is NOT a new Route Handler. Pin the runtime on the `importar` route segment (see page.tsx below). The action stays synchronous (parse measured 24-182 ms). Document the 24-182 ms evidence in the plan so the choice is auditable.

**Dedup** — NO change. `dedupeKey` (`dedupe.ts:34-40`) already falls through to the `csv:<occurred_on>:<amount_cents>:<descriptor_norm>` basis when `fitid` is absent — PDF rows omit `fitid`, so they auto-use the CSV basis. The `keysByRaw`/`dupSet` pre-mark loop (lines 351-361) and the memory-classify loop (lines 363-396) work unchanged.

---

### `src/lib/schemas/import.ts` (MODIFY — validation)

**Analog:** self — `confirmImportRowSchema` (lines 36-46), mirror the optional `reservaId`/`carroId` style.

If `kind` is threaded through the confirm payload, add an optional enum field mirroring the nullable/optional grammar (lines 43-45):
```typescript
  kind: z.enum(['expense', 'credit']).optional(),
```
(Server re-reads `kind` from `r.base` per WR-01, so this is belt-and-suspenders; confirm whether the payload even carries it before adding.)

---

### `src/components/upload-dropzone.tsx` (MODIFY — component)

**Analog:** self (whole file).

- `ACCEPTED_EXTS` (line 21): `['ofx', 'csv', 'pdf'] as const`.
- `<input accept=".ofx,.csv">` (line 116) → `accept=".ofx,.csv,.pdf"`; `aria-label` (line 118) → `Selecionar arquivo OFX, CSV ou PDF`.
- Wrong-type error (line 55) → UI-SPEC copy: `Formato não suportado. Envie um arquivo OFX, CSV ou PDF.`
- Helper line (line 110) → UI-SPEC: `ou arraste aqui · OFX (recomendado), CSV ou PDF · até {limit}` + the muted best-effort hint `PDF é leitura aproximada — revise as linhas antes de salvar.` in the existing `space-y-1` block (lines 101-112).
- The inline `text-destructive role="alert"` error treatment (lines 123-127) is reused verbatim.

---

### `src/components/import-uploader.tsx` (MODIFY — component)

**Analog:** self — `fileExt` (lines 29-34) and the `if (ext === 'csv')` pre-read branches (lines 117-121, 149-157).

- `fileExt` return type → `'ofx' | 'csv' | 'pdf' | null`; accept `'pdf'`.
- The CSV-only header pre-read (lines 117-121) and mapper-seed (lines 149-157) branches are gated on `ext === 'csv'` — PDF skips both (UI-SPEC §1: no column mapping for PDF). No other change; PDF rides the same `createSignedStatementUpload → uploadToSignedUrl → ingestStatement → handleIngestResult` lifecycle (lines 125-160).

---

### `src/components/import-review-table.tsx` (MODIFY — component, delete-row + summary fix)

**Analogs:** self — `classifyRow`/`tagCarroRow` callbacks (lines 188-212), the `summary` memo (lines 219-230), the `columns` array (lines 232-348), the desktop+mobile row rendering (lines 482-561), and the already-imported `sonner` `toast` (line 14) + `Button` (line 37).

**Delete-row callback** — mirror `tagCarroRow` (lines 208-212) exactly (a `setRows` filter + a sonner toast with `Desfazer`, UI-SPEC §2):
```typescript
const deleteRow = React.useCallback((id: string) => {
  setRows((prev) => {
    const removed = prev.find((r) => r.id === id)
    const next = prev.filter((r) => r.id !== id)
    if (removed) toast('Linha removida', { action: { label: 'Desfazer', onClick: () => setRows((p) => [...p, removed]) } })
    return next
  })
}, [])
```
**Delete-row column** — add a trailing `actions` column to the `columns` memo (lines 232-348), `w-10`, empty header; cell = a `Button variant="ghost" size="icon"` + lucide `Trash2 size-4`, `text-muted-foreground hover:text-destructive`, `aria-label="Remover linha"` (UI-SPEC §2). Mirror the existing inline-cell pattern (`InlineReviewCarroCell` cell, lines 322-332). Add the matching mobile affordance in the `<li>` bottom row (lines 547-557). NO add-row (D-03).

**Summary BUG FIX** (UI-SPEC §3, RESEARCH Open Question 4) — the `summary` memo (lines 226-227) computes `novas: rows.length` and `duplicadas: Math.max(0, initialRows.length - rows.length)`. Delete-row shrinks `rows.length` → user deletes mis-counted as duplicates. **Fix:** base `duplicadas`/`descartadas` on the SERVER-provided `summary` value (passed in as a new prop from the review RSC, sourced from `statements.summary`), NOT the `initialRows.length - rows.length` delta. Track deletes separately. `descartadas` (J) must stay STABLE across deletes.

**Estorno/credit row color** — the `AmountCell` cells (lines 336-344, 556) hard-code `kind="expense"`. For a `credit` row, pass `kind="income"` (UI-SPEC §Color: estorno renders with the green `income` token, never red) — read `row.original.kind`. This requires `kind` on the client `ReviewRow` type (lines 99-114, add `kind: 'expense' | 'credit'`).

**Honest-counters header** — see `import-summary-header.tsx` below; this component passes the server-sourced summary through.

---

### `src/components/import-summary-header.tsx` (MODIFY — add `descartadas`)

**Analog:** self (whole file) + the server `IngestSummary` type (`import.ts:64-79`, which ALREADY has `descartadas: number`).

`ImportSummary` (lines 21-30) currently lacks `descartadas`; add it (mirror the `duplicadas` jsdoc + render). UI-SPEC §3 contract: a distinct `{J} descartadas` count, `text-muted-foreground` (calm — mirror the existing `duplicadas ignoradas` muted span, lines 100-103), NEVER overloading the `duplicadas` slot. Server-provided + fixed. Add it as a new `·`-separated segment after `duplicadas`.

---

### `src/app/(app)/importar/page.tsx` (MODIFY — runtime pin, D-08)

**Analog:** self.

Add the runtime exports at the top (RESEARCH §"D-08 Resolution" — satisfies the Node-runtime + maxDuration letter of the locked CLAUDE.md guidance WITHOUT a Route Handler):
```typescript
export const runtime = 'nodejs'   // pdf-parse needs Node APIs — never Edge
export const maxDuration = 30     // generous margin; measured parse <0.2s
```
Update the helper copy (lines 18-20) to include PDF per UI-SPEC copy table. The image-only `Empty` state (PDF-04) lives on the `[statementId]` review route, reusing the existing `ui/empty` vocabulary (UI-SPEC §4) — verify that route's Empty usage when planning.

---

### `src/lib/parsers/pdf.test.ts` (NEW — test) + `tests/fixtures/santander-sample.txt` (NEW — fixture)

**Analog:** `src/lib/parsers/csv.test.ts` (whole file) + `tests/fixtures/*.csv`.

Mirror `csv.test.ts` structure VERBATIM: Vitest (`describe`/`it`/`expect`, confirmed runner — `vitest.config.ts` present, `npm test` = `vitest run`), the `fixture(name)` helper reading `tests/fixtures/` (`csv.test.ts:6-17`), and the `dropped`/`capped` assertions (`csv.test.ts:36-40`). REAL Santander PDFs stay gitignored (`fixtures/faturas-pdf/santander/`); the **committed synthetic text fixture** (`tests/fixtures/santander-sample.txt`, hand-authored from RESEARCH §"Wave 0 Gaps" — block headers, `Detalhamento`/`Resumo` markers, a bill-payment line, estornos, parcelas, `VALOR TOTAL`, `R$`-prefixed noise, NO real merchant data) is what feeds the pure `parseSantanderText` — this is exactly why the parser MUST split (text in, no PDF needed).

Cover (RESEARCH §"Test Map"): correct `RawTransaction[]` (date/desc/cents); filter precision (`PAGAMENTO DE FATURA`/`ANUIDADE`/`VALOR TOTAL`/`R$`-lines dropped, estornos KEPT as `kind:'credit'`); `pdfDateToCivil` Dec→Jan rollover; parcela = single line value; the `dropped`/resilience pattern mirroring `csv.test.ts:83-103`. Extend `src/lib/dedupe.test.ts` with a no-fitid PDF-shaped row asserting the csv basis.

---

## Shared Patterns

### Pure-parser → ParseResult contract
**Source:** `src/lib/parsers/csv.ts:74-99`, `ofx.ts:65-101`, contract `types.ts:23-47`
**Apply to:** `pdf.ts`
The single most-reused pattern: every parser returns `{ rows, dropped, capped }`, SKIPS a malformed row into `dropped` (never throws), stops at `MAX_PARSED_ROWS → capped`. `pdf.ts` differs only in taking a buffer (async extraction split out) and emitting the new `kind`.

### Server Action boundary (Zod safeParse → `{ error }` → getClaims → ownership re-derive)
**Source:** `src/actions/import.ts:179-207` (createSignedStatementUpload), `222-421` (ingestStatement), `501-756` (confirmImport)
**Apply to:** all `import.ts` modifications
Every action: `extSchema`/`pathSchema` safeParse at the boundary → friendly `{ error }` (never throws across `'use server'`), `getClaims()` for `userId`, the `path.startsWith(`${userId}/`)` defense-in-depth (line 236), and in confirm the per-FK ownership re-derive (lines 522-570). PDF inherits ALL of this verbatim — no new security surface.

### WR-01 trusted-content re-read (anti learning-poisoning)
**Source:** `src/actions/import.ts:578-609`
**Apply to:** `confirmImport` `kind` threading
`confirmImport` re-reads server-persisted `parsed_rows` and keys by `dedupe_key`; the client supplies ONLY category/reserva/carro CHOICE. `kind` is server-derived content → read it from `r.base.kind`, NEVER from the client payload. Mirrors how `descriptor_norm`/`amount`/`occurred_on` are already sourced from `base`.

### Inline client-state row mutation (setRows callback)
**Source:** `src/components/import-review-table.tsx:188-212` (classifyRow, tagCarroRow)
**Apply to:** delete-row
`setRows((prev) => prev.map/filter(...))`, memoized `useCallback`, nothing persisted until confirm. delete-row is a `.filter`; the sonner undo toast re-inserts (UI-SPEC §2). Same grammar, orthogonal to category.

### Money & date normalization (do NOT hand-roll)
**Source:** `parseBRLToCents` (`@/lib/money`), `normalizeDescriptor` (`@/lib/normalize`)
**Apply to:** `pdf.ts`
PDF amounts are pt-BR comma format → `parseBRLToCents` (the CSV path, NOT OFX dot). It throws on negative/zero (Pitfall 3) → strip the `-` first, special-case `0,00 → dropped`. `normalizeDescriptor` is the SINGLE merchant-key source — memory match depends on it being identical across all three parsers.

---

## No Analog Found

None. Every file has an exact in-repo analog. The PDF text-extraction call (`extractPdfText` via `pdf-parse`) is the only line with no prior art, and RESEARCH §"Image-only detection" provides the verbatim recipe (measured against the real Santander PDFs).

## Metadata

**Analog search scope:** `src/lib/parsers/`, `src/actions/`, `src/lib/schemas/`, `src/components/`, `src/lib/`, `src/app/(app)/importar/`, `tests/fixtures/`
**Files scanned:** 11 source files read in full (parsers trio + types, import action, schemas, 4 components, dedupe, importar page) + csv.test.ts for the test layout
**Pattern extraction date:** 2026-06-18
