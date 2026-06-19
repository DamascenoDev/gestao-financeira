# Phase 13: PDF de Fatura - Research

**Researched:** 2026-06-18
**Domain:** Server-side PDF credit-card-statement extraction (Santander) on Vercel Node runtime; normalization into the existing `ParseResult`/`RawTransaction` ingest contract
**Confidence:** HIGH (extractor choice, line layout, filter heuristic, runtime decision — all measured against the two REAL Santander PDFs); LOW only for foreign-currency layout (absent from both samples)

## Summary

The mandatory spike ran `pdf-parse@2.4.5` (`getText()` + `getTable()`) and `unpdf@1.6.2` against the two real Santander UNIQUE VISA statement PDFs in `fixtures/faturas-pdf/santander/`. Result is decisive and overturns one CLAUDE.md assumption: **`getTable()` returns ZERO tables on these PDFs** — Santander does not emit ruled tables, it emits positioned text. **`getText()` is the workhorse**: it recovered the full statement text (8.9k / 9.9k chars, 4 pages, in 24–105 ms) with every transaction line intact as `[parcela] DD/MM DESCRIPTOR [DD/MM] VALOR`. `unpdf` also extracts the text but with `mergePages: true` collapses everything to one line; it remains the image-only/zero-text fallback, not the primary line parser.

The transaction section has a clean, learnable structure: lines live between `Detalhamento da Fatura` and `Resumo da Fatura`, grouped under `Despesas` / `Pagamento e Demais Créditos` / `Parcelamentos` block headers (each preceded by a `Compra Data Descrição Parcela R$ US$` column header). Every real transaction line carries a `DD/MM` date and a comma-decimal BRL value with **no `R$` prefix**; every noise line (totals, balances, payment options, limits) either carries the `R$` prefix or is a known label (`VALOR TOTAL`, `Saldo Anterior`, `PAGAMENTO DE FATURA`, `ANUIDADE`). A prototype recipe extracted 98 and 116 transactions cleanly, correctly filtered the bill payment, counted parcelas, and detected estornos via the leading `-` sign.

On the D-08 runtime tension: parse time is **24–182 ms** for a 4-page / ~330 KB statement — three orders of magnitude under any server-action budget. There is **no timing reason** to move parse out of the synchronous server action. However, PROJECT.md/CLAUDE.md lock PDF parsing in a Node-runtime Route Handler with `maxDuration`, and Vercel already deployed with that expectation (DEPLOY-02). The recommendation reconciles both (see D-08 resolution).

**Primary recommendation:** Build a Santander-tuned `parsePdf(buffer)` extractor that runs `pdf-parse` v2 `getText()`, windows to the detail section, line-matches transactions with the `R$`-prefix + label filter, and emits the existing `ParseResult`. Wire `'pdf'` as the third `extSchema` value and the third dispatch branch in `ingestStatement` (still synchronous — timing proves it safe), while honoring the locked guidance by forcing the ingest path onto the Node runtime via `export const runtime = 'nodejs'` + `maxDuration` on the page/route that drives it. Treat `getTable()` as unused (it yields nothing here) and `unpdf` purely as the image-only fallback for PDF-04 detection.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| PDF byte storage | Database / Storage (Supabase private bucket `statements/{user_id}/`) | — | Identical to CSV/OFX; Storage RLS already isolates by `user_id` |
| PDF text extraction + line parse | API / Backend (server-side, Node runtime) | — | API keys / native pdf.js must stay off the client; CLAUDE.md locks Node runtime, parse from Storage buffer |
| Normalization → `RawTransaction` | API / Backend (pure parser fn) | — | Same pure-function tier as `parseOfx`/`parseCsv` (Supabase-free) |
| Dedup + memory classify | API / Backend (`ingestStatement` server action) | Database (merchant_patterns read) | Reuses the exact existing pipeline; PDF is just a third parser feeding it |
| Review + edit + **delete row** | Browser / Client (`import-review-table.tsx`) | — | Human-in-the-loop confirm; no auto-commit (PDF-03) |
| Confirm → persist + learn | API / Backend (`confirmImport`) | Database | Unchanged; PDF rows flow through verbatim |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PDF-01 | User uploads PDF via the same upload UI; file persists in private Storage by `user_id` | Reuse `createSignedStatementUpload` (add `'pdf'` to `extSchema`) + `upload-dropzone`/`import-uploader` accept `.pdf`. Bucket path `{user_id}/uuid.pdf`, same Storage RLS (migration 0003). §Integration Points |
| PDF-02 | Extract transaction lines (`pdf-parse` v2; `unpdf` fallback) → canonical shape (date, desc, integer cents) | MEASURED: `getText()` recovers all lines; `getTable()` yields nothing (use getText, not getTable). Normalization recipe §Normalization Recipe. `unpdf` = fallback only. |
| PDF-03 | Extracted rows appear in editable review grid BEFORE persist; never auto-committed | Reuse `ImportReviewTable` (extend with delete-row, D-02). The grid already operates on un-persisted client state; nothing lands in `transactions` until `confirmImport`. §Review Grid Extension |
| PDF-04 | Image-only/scanned PDF → clear message steering to CSV/OFX; never silent empty result | MEASURED detection: `getText().text.trim().length === 0` ⇒ image-only. Distinct from "parsed but 0 tx rows". §Image-Only Detection |
| PDF-05 | After confirm, PDF tx enter the same memory pipeline + count in metas, identical to CSV/OFX | PDF emits the identical `ParseResult`; `ingestStatement` dedup/memory-classify and `confirmImport` learn/persist are untouched. §Integration Points |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pdf-parse` | `^2.4.5` | PDF text extraction (`getText()`) | `[VERIFIED: npm registry]` v2 mehmet-kozan rewrite, pure-TS, serverless-targeted. Repo confirmed `git+https://github.com/mehmet-kozan/pdf-parse.git`. `latest` dist-tag = `2.4.5`; v1 lives under the `minor` tag (`1.1.4`) — pin `^2.4` so install can never resolve v1. No postinstall script. CLAUDE.md-locked primary. |
| `unpdf` | `^1.6.2` | Image-only / zero-text fallback (PDF-04) + edge-safe text fallback | `[VERIFIED: npm registry]` unjs lib, zero native deps. Repo `git+https://github.com/unjs/unpdf.git`. No postinstall. CLAUDE.md-locked fallback. Used ONLY to second-source the image-only check, not for line parsing (its `mergePages` collapses lines). |

### Supporting (all already in the project — reuse, do not re-add)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| existing `normalizeDescriptor` | in-repo | merchant key derivation | Every extracted `descriptor_raw` → `descriptor_norm`. Do NOT re-derive elsewhere. |
| existing `parseBRLToCents` | in-repo | comma-decimal BRL → cents | The PDF amounts are pt-BR comma format (`1.234,56`) — same path as CSV, NOT the OFX dot path. |
| existing `dedupeKey` | in-repo | per-tx dedup | PDF has no FITID → falls through to the `csv:<occurred_on>:<amount_cents>:<descriptor_norm>` basis automatically (just omit `fitid`). |
| `@tanstack/react-table`, `sonner`, shadcn `AlertDialog` | in-repo | review grid + delete affordance | Already imported by `import-review-table.tsx`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `getText()` + manual line parse | `getTable()` | **MEASURED to return 0 tables on Santander PDFs.** Not viable here. Keep in mind a future issuer might emit real tables, but for D-07 Santander-first, getText is the only path that works. |
| `pdf-parse` v2 | raw `pdfjs-dist` legacy | CLAUDE.md "What NOT to Use": worker/native-binary breakage on Vercel. Avoid. |
| `pdf-parse` v2 | `pdf-parse` v1 | CLAUDE.md "What NOT to Use": canvas/native bindings break on serverless. The `^2.4` pin guards this. |

**Installation:**
```bash
npm install pdf-parse@^2.4.5 unpdf@^1.6.2
```
After install, verify provenance (CLAUDE.md directive):
```bash
node -e "const p=require('pdf-parse/package.json'); console.log(p.version, p.repository.url)"
# must print: 2.4.x  git+https://github.com/mehmet-kozan/pdf-parse.git
```

## Package Legitimacy Audit

| Package | Registry | Age | Last publish | Source Repo | Verdict | Disposition |
|---------|----------|-----|--------------|-------------|---------|-------------|
| `pdf-parse` | npm | mature (v2 rewrite) | 2025-10-29 | github.com/mehmet-kozan/pdf-parse | OK | Approved (CLAUDE.md-locked) |
| `unpdf` | npm | mature (unjs) | 2026-04-29 | github.com/unjs/unpdf | OK | Approved (CLAUDE.md-locked) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
Both packages have no `postinstall` script (verified via `npm view`), resolve to their stated authoritative repos, and are the exact packages named in CLAUDE.md's locked stack. The provenance-verify command above is the install-time gate the planner should encode as a task step.

## Architecture Patterns

### System Architecture Diagram

```
[Browser: upload-dropzone accepts .pdf]
        │  file bytes (direct-to-Storage via signed URL)
        ▼
[Supabase Storage: statements/{user_id}/uuid.pdf]   ◀── Storage RLS auth.uid()=path[0]
        │  (server downloads buffer)
        ▼
[ingestStatement server action (runtime=nodejs, maxDuration set)]
        │  ext === 'pdf'  ──────────────┐
        │                               ▼
        │                    [parsePdf(buffer): NEW pure-ish fn]
        │                         1. pdf-parse getText() → full text
        │                         2. trim().length === 0 ? → IMAGE-ONLY signal (PDF-04)
        │                         3. window: "Detalhamento da Fatura" .. "Resumo da Fatura"
        │                         4. per line: drop R$-prefixed + label noise
        │                         5. TX regex → {parcela?, DD, MM, desc, value}
        │                         6. normalize → RawTransaction (cents, civil date, norm)
        │                         ▼
        │                    ParseResult { rows, dropped, capped }   ◀── SAME contract as OFX/CSV
        ▼                               │
[dedup (content_hash + dedupe_key) + memory-first classify]  ◀── lookupMemory / suggestCategory(null)
        ▼
[ParsedReviewRow[] persisted on statements.parsed_rows]
        ▼
[Browser: ImportReviewTable — edit category + DELETE row (D-02), honest N/J counts]
        │  user confirms (NEVER auto-commit — PDF-03)
        ▼
[confirmImport: re-read server-persisted rows, insert transactions, LEARN merchant_patterns]
        ▼
[transactions → metas (Fase 3) reflect automatically — PDF-05]
```

### Recommended File Layout (additive — mirrors the existing parser trio)
```
src/lib/parsers/
├── types.ts          # UNCHANGED — the shared contract
├── ofx.ts            # existing
├── csv.ts            # existing
└── pdf.ts            # NEW — parsePdf(buffer) + exported helpers (Santander recipe)
src/lib/parsers/__tests__/   (or src/lib/parsers/*.test.ts per repo convention)
└── pdf.test.ts       # NEW — against committed SYNTHETIC text fixtures (real PDFs stay gitignored)
```

### Pattern 1: Pure-ish parser returning `ParseResult`
**What:** `parsePdf` mirrors `parseOfx`/`parseCsv`: takes already-loaded input, returns `{ rows, dropped, capped }`, never throws on a bad line (counts it in `dropped`), stops at `MAX_PARSED_ROWS`. The one difference: it takes the **PDF buffer** (or pre-extracted text) rather than decoded text, because extraction is async. Recommended signature: `async function parsePdf(buffer: Buffer): Promise<ParseResult>` OR split into `extractPdfText(buffer): Promise<string>` (the only async/IO part) + `parseSantanderText(text): ParseResult` (pure, fully unit-testable against committed text fixtures). **Prefer the split** — it keeps the regex/filter logic pure and CI-testable without shipping a real PDF.

**Example (recipe core, validated by spike4):**
```typescript
// Source: spike measurement against fixtures/faturas-pdf/santander/*.pdf (2026-06-18)
const TX = /^(?:(\d{1,2})\s+)?(\d{2})\/(\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/
const NOISE_LABEL = /pagamento de fatura|^anuidade|valor total|saldo anterior|total de|total despesas|saldo desta|^resumo|limite/i

export function parseSantanderText(text: string, statementYear: number): ParseResult {
  const lines = text.split('\n').map((l) => l.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())
  const start = lines.findIndex((l) => /detalhamento da fatura/i.test(l))
  const end = lines.findIndex((l, i) => i > start && /^resumo da fatura/i.test(l))
  const win = lines.slice(start >= 0 ? start : 0, end >= 0 ? end : lines.length)

  const rows: RawTransaction[] = []
  let dropped = 0, capped = false
  for (const l of win) {
    if (rows.length >= MAX_PARSED_ROWS) { capped = true; break }
    if (!l || /R\$\s?\d/.test(l) || NOISE_LABEL.test(l)) continue   // summary/balance noise
    const m = TX.exec(l)
    if (!m) continue
    const [, , dd, mm, descField, val] = m
    // strip a trailing " DD/MM" (the original-purchase/conversion date) before norm
    const descriptor_raw = descField.replace(/\s+\d{2}\/\d{2}$/, '').trim()
    try {
      const cents = parseBRLToCents(val.replace('-', ''))   // positive cents; sign handled below
      if (cents === 0) { dropped += 1; continue }            // ANUIDADE 0,00 etc.
      rows.push({
        occurred_on: pdfDateToCivil(dd, mm, statementYear),  // see Normalization Recipe
        amount_cents: cents,
        descriptor_raw,
        descriptor_norm: normalizeDescriptor(descriptor_raw),
        // NOTE: no fitid → dedupeKey uses the csv:<date>:<cents>:<norm> basis
      })
    } catch { dropped += 1 }
  }
  return { rows, dropped, capped }
}
```
*(parseBRLToCents rejects 0/negative by throwing — that is why the recipe strips the sign first and special-cases `0,00`; see Normalization Recipe for the kind/sign decision.)*

### Anti-Patterns to Avoid
- **Using `getTable()`** — returns 0 rows on Santander PDFs (measured). Do not build on it.
- **Using `unpdf` for line parsing** — `mergePages: true` collapses the statement to one line; per-page splitting is brittle vs. `getText()`'s native line breaks. Use `unpdf` ONLY as the image-only/zero-text second opinion.
- **Re-deriving `descriptor_norm` in the grid or a query** — `normalizeDescriptor` is the single source (CLAUDE.md / normalize.ts directive).
- **Auto-committing any PDF row** — PDF-03 hard rule. Everything goes through the review grid + confirm.
- **Float money** — route values through `parseBRLToCents`; never `Number(...)*100` outside it.
- **Inferring the transaction year from "today"** — use the statement's own vencimento year + cycle logic (see Normalization Recipe). A May fatura legitimately contains March purchases.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF text extraction | Custom pdf.js worker wiring | `pdf-parse` v2 `getText()` | CLAUDE.md "What NOT to Use"; v2 is the serverless-safe wrapper |
| BRL string → cents | New parser | existing `parseBRLToCents` | Already handles `1.234,56`, R$ prefix, rejects ambiguous grouping (WR-05), positive-int invariant |
| Merchant key | New normalizer | existing `normalizeDescriptor` | Single deterministic key; memory match depends on it being identical to OFX/CSV |
| Dedup key | New hash | existing `dedupeKey` (omit fitid) | Cross-statement collapse already proven; PDF auto-uses the CSV basis |
| Review/confirm/learn loop | New flow | existing `ingestStatement` + `confirmImport` + `ImportReviewTable` | The whole point of the generic `ParseResult` contract (D-07) |

**Key insight:** Phase 13 is overwhelmingly *additive*. The only genuinely new code is `parsePdf`/`parseSantanderText` (one file), the `'pdf'` dispatch wiring, the delete-row grid affordance, and the Node-runtime/maxDuration enforcement. Everything downstream of `ParseResult` is reused unchanged.

## Runtime State Inventory

> Greenfield-feature phase (additive). One pre-existing runtime constraint matters:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — PDF rows persist via the existing `statements.parsed_rows` jsonb + `transactions` table; no new schema | none |
| Live service config | Vercel deployment (DEPLOY-02) expects `maxDuration` on parsing routes; ingest currently runs in a server action with NO explicit `runtime`/`maxDuration` | Set `export const runtime = 'nodejs'` + `export const maxDuration` on the route/page that triggers ingest (D-08) |
| OS-registered state | None | none |
| Secrets/env vars | None — no AI key (IA deferred); pdf-parse/unpdf need no credentials | none |
| Build artifacts | `package.json` gains two deps; `package-lock.json` updates | `npm install` in CI/Vercel picks them up automatically |

## Common Pitfalls

### Pitfall 1: Transaction-year inference across the cycle boundary
**What goes wrong:** DD/MM lines carry no year. Naively stamping "current year" mis-dates December purchases that appear on a January fatura (and vice-versa), pushing them into the wrong budget month (metas).
**Why it happens:** A statement closing in month M contains purchases from M and M-1 (and parcela "original purchase" dates further back). The samples confirm this: a May/June fatura holds March–May dates.
**How to avoid:** Anchor on the vencimento (full `DD/MM/YYYY`, present in the text — measured `07/06/2026`, `07/05/2026`). Derive the statement reference month from it. For a transaction `DD/MM`: if its month ≤ vencimento month, use the vencimento year; if its month > vencimento month, it belongs to the previous year (December rollover). Pin this in a pure, tested `pdfDateToCivil(dd, mm, vencimento)` helper. Civil-date discipline: emit `YYYY-MM-DD` (SP), never slice as MM/DD (mirror `ofxDateToCivil`/`brDateToCivil`).
**Warning signs:** Imported transactions landing in a month with no spending, or January metas spiking from December purchases.

### Pitfall 2: Distinguishing the bill payment from a real estorno/credit
**What goes wrong:** Importing `PAGAMENTO DE FATURA-INTERNET` (a large negative) as an expense/credit corrupts the spend total. Filtering ALL negatives would drop legitimate estornos (D-04 says import estornos).
**Why it happens:** Both the bill payment AND estornos appear under the `Pagamento e Demais Créditos` block, both negative.
**How to avoid:** Filter by LABEL, not by sign/block. `PAGAMENTO DE FATURA` (and `ANUIDADE`, `IOF`, `ENCARGOS`, `JUROS`, `MULTA`) → drop. A negative value that is NOT one of those labels → import as a credit/estorno. Measured: this cleanly kept the `-0,02`/`-100,38` estornos while dropping the `-4.701,97` bill payment.
**Warning signs:** A statement total that doesn't reconcile, or a giant negative "transaction" in the grid.

### Pitfall 3: The `kind` / sign mapping vs. `parseBRLToCents`'s positive-only invariant
**What goes wrong:** `parseBRLToCents` THROWS on negative/zero (it enforces strictly-positive cents). Feeding it `-120,63` drops a real estorno into `dropped`.
**Why it happens:** The OFX/CSV paths only ever see positive magnitudes; the PDF estorno sign is in-band.
**How to avoid:** Strip the leading `-` before `parseBRLToCents`; record the sign separately. **Open contract question for the planner:** `RawTransaction` has no `kind` field today, and `confirmImport` hard-codes `kind: 'expense'`. Decide how an estorno/credit is represented end-to-end — either (a) add an optional `kind` to `RawTransaction` + thread it through `confirmImport` (cleanest, but touches the shared contract — a small, tested change), or (b) for v1.3 import estornos as `expense` with the understanding they net against spend only if represented as negative cents (NOT allowed — cents are positive by invariant). **Recommendation: (a)** — add `kind?: 'expense' | 'credit'` to `RawTransaction`, default `'expense'`, and have `confirmImport` use `r.base.kind ?? 'expense'`. This is the only change to the shared contract and it is additive/back-compatible (OFX/CSV omit it).
**Warning signs:** Estornos missing from the grid (silently in `dropped`), or estornos inflating spend instead of reducing it.

### Pitfall 4: Parcela value semantics (D-05)
**What goes wrong:** Importing the full installment-plan total, or expanding future installments, double-counts spend.
**Why it happens:** A parcela line shows a leading installment index (`3 DD/MM OUTBACK ... 92,73`) and sometimes a second date.
**How to avoid:** The VALOR on the line IS the amount charged on THIS fatura (measured — it's the per-installment value, not the plan total). Import exactly that one row, exactly that value. Do NOT parse the leading index into multiple rows. The leading `N` is informational only; you may keep it out of the descriptor (the TX regex already captures it separately).
**Warning signs:** Spend > the fatura total.

### Pitfall 5: Repeated descriptors collapsing under exact-tuple dedup
**What goes wrong:** A statement legitimately has the same merchant + same amount on the same day twice (e.g. two `ALIEXPRESS -0,02` estornos). The `csv:<date>:<cents>:<norm>` dedupe basis makes them collide → only one imports.
**Why it happens:** No FITID; the dedupe key is the normalized tuple, and same-day/same-amount/same-merchant rows are indistinguishable.
**How to avoid:** This is an ACCEPTED limitation already present for CSV (same basis). Surface it honestly via the counts; the review grid + delete-row let the user reason about it. Do NOT invent a synthetic per-row salt — that would break the cross-statement collapse that dedup exists for. Document as a known v1.3 limitation (same as CSV).
**Warning signs:** "J duplicadas" higher than the user expects on a single fresh PDF.

### Pitfall 6: Multi-page / repeated block headers
**What goes wrong:** The `Despesas` / `Compra Data Descrição Parcela R$ US$` header and the `@ GABRIEL FAQUIM - ...` cardholder line repeat per page; a `VALOR TOTAL X 0,00` subtotal appears per block.
**Why it happens:** 4-page statement; pdf-parse concatenates page text with the page markers (`-- 2 of 4 --`).
**How to avoid:** The header rows don't match the TX regex (no leading DD/MM + trailing bare BRL) and the subtotals are caught by the `VALOR TOTAL` label filter. Measured: no header/subtotal leaked into the 98/116 extracted rows. The window between `Detalhamento da Fatura` and `Resumo da Fatura` plus the line filters handle multi-page transparently. Verify the window markers exist; if `Detalhamento da Fatura` is absent (layout drift), fall back to "first TX-matching line .. first `Resumo`/`VALOR TOTAL` after the last TX line" rather than failing.
**Warning signs:** Column-header strings or `VALOR TOTAL` appearing as a transaction descriptor.

### Pitfall 7: Encoding / accents from pdf.js
**What goes wrong:** Merchant accents could corrupt `descriptor_norm`.
**Why it happens:** PDF text extraction returns Unicode; unlike CSV/OFX there is no latin1 ambiguity (pdf.js decodes to proper Unicode). Measured text was clean UTF-8 (`Olá`, `Crédito`, `Pagamentos`).
**How to avoid:** Do NOT run the `decodeStatement` latin1 heuristic on PDF text — it's already Unicode. Feed the extracted string straight to `normalizeDescriptor` (which NFKD-strips accents anyway). The latin1 path is CSV/OFX-only.
**Warning signs:** U+FFFD (`�`) in descriptors — would indicate a wrong decode step was applied.

## Code Examples

### Image-only detection (PDF-04)
```typescript
// Source: spike measurement (2026-06-18). text-bearing PDFs returned 8936/9921 chars;
// an image-only PDF would return an empty/whitespace string from getText().
import { PDFParse } from 'pdf-parse'

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const { text } = await parser.getText()
    return text ?? ''
  } finally {
    await parser.destroy?.()
  }
}

// In ingestStatement, ext === 'pdf':
const text = await extractPdfText(bytes)
if (text.trim().length === 0) {
  return {
    error:
      'Não foi possível ler o texto deste PDF — provavelmente é uma imagem/digitalização. ' +
      'Envie o extrato em CSV ou OFX desse banco.',
  }
}
const result = parseSantanderText(text, statementYear)
// IMPORTANT: image-only (text.trim()==='') is DISTINCT from "parsed 0 rows".
//   - zero text  → hard block with the CSV/OFX message (PDF-04)
//   - text present but result.rows.length === 0 → NOT a block; show the review screen
//     with the honest "0 extraídas / J descartadas" counts (D-01 safety net). The user
//     sees the file was read but no transaction lines matched (likely a non-Santander
//     layout) and can fall back to CSV/OFX themselves.
```

### Statement-year anchor from the vencimento
```typescript
// Source: spike — both samples expose a full DD/MM/YYYY vencimento (07/06/2026, 07/05/2026).
export function findStatementVencimento(text: string): { month: number; year: number } | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)   // first full date = vencimento region
  if (!m) return null
  return { month: Number(m[2]), year: Number(m[3]) }
}

export function pdfDateToCivil(dd: string, mm: string, venc: { month: number; year: number }): string {
  const month = Number(mm)
  // a tx whose month is AFTER the vencimento month belongs to the previous year (Dec→Jan rollover)
  const year = month > venc.month ? venc.year - 1 : venc.year
  return `${year}-${mm}-${dd}`
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLAUDE.md assumed `getTable()` is the primary for line items | `getText()` is primary; `getTable()` yields 0 tables on Santander | Measured 2026-06-18 | The plan must NOT depend on `getTable()`. CLAUDE.md's table-API expectation does not hold for this issuer. |
| `pdf-parse` v1 (canvas/native) | `pdf-parse` v2 (pure-TS, serverless) | v2 stable | Pin `^2.4` so install never resolves the v1 `minor` tag |
| Assume parse needs a Route Handler for time | Parse is 24–182 ms — server-action-safe | Measured 2026-06-18 | Runtime move is a *correctness/guidance* choice, not a performance one (see D-08) |

**Deprecated/outdated:**
- `pdf-parse` v1, raw `pdfjs-dist` legacy builds — CLAUDE.md "What NOT to Use".
- `@supabase/auth-helpers-nextjs` — already off this codebase; not relevant to P13.

## D-08 Resolution: Server Action vs. Node Route Handler + maxDuration

**Evidence:** PDF parse (getText + recipe) measured **24–182 ms** for a 4-page / ~330 KB Santander statement. That is negligible against any server-action or function timeout. There is **no performance reason** to extract parsing into a Route Handler.

**Constraint:** PROJECT.md/CLAUDE.md *lock* "PDF parsing in a Node-runtime Route Handler + `export const maxDuration`", and DEPLOY-02 already shipped to Vercel expecting `maxDuration` on parsing routes. The locked guidance has two substantive requirements that DO matter: (1) **Node runtime, not Edge** (pdf-parse needs Node APIs), and (2) **a raised `maxDuration`** as a safety margin.

**Recommendation (reconciles both):** Keep `ingestStatement` as the **synchronous server action** — it is simple, proven, and timing makes a refactor unjustified (do NOT introduce the first `route.ts` just to satisfy a guidance whose performance premise the spike disproved). **Honor the locked guidance by pinning the runtime on the route segment that hosts the ingest:** add to the `/importar` page/route segment (the Server Component that renders the uploader and whose Server Actions run server-side):
```typescript
export const runtime = 'nodejs'   // pdf-parse needs Node APIs — never Edge
export const maxDuration = 30     // generous margin; measured parse is <0.2s
```
This satisfies the **Node-runtime** and **maxDuration** letters of the locked guidance (the parts that protect correctness) without the unjustified architectural churn of a Route Handler. **If the plan-checker insists on the literal Route Handler:** the fallback is a `src/app/api/import/route.ts` (Node runtime, `maxDuration`) that wraps the same `extractPdfText` + `parseSantanderText` + dedup/classify logic, with the client calling it via `fetch` instead of the server action — but flag this as added complexity buying nothing measurable, and the server action remains the recommended path. Document the decision + the 24–182 ms evidence in the plan so the choice is auditable.

**Note on `after()`:** not needed — there is no post-response work; the parse completes well within the request.

## Normalization Recipe (Santander layout → `RawTransaction`)

For each TX-matched line `[N] DD/MM DESCRIPTOR [DD/MM] VALOR`:

| Field | Derivation |
|-------|-----------|
| `occurred_on` | `pdfDateToCivil(dd, mm, vencimento)` → `YYYY-MM-DD` (SP civil). Year from vencimento + Dec→Jan rollover rule (Pitfall 1). |
| `amount_cents` | `parseBRLToCents(VALOR.replace('-',''))` → positive int cents. `0,00` → skip (count in `dropped`). |
| `kind` (NEW, see Pitfall 3) | leading `-` on VALOR ⇒ `'credit'` (estorno), else `'expense'`. Recommend adding `kind?` to `RawTransaction`, default expense; thread through `confirmImport` (currently hard-codes `'expense'`). |
| `descriptor_raw` | the DESCRIPTOR field with a trailing ` DD/MM` (original-purchase/conversion date) stripped. Keep the merchant text verbatim otherwise. |
| `descriptor_norm` | `normalizeDescriptor(descriptor_raw)` — unchanged shared fn. |
| `fitid` | omitted → `dedupeKey` auto-uses `csv:<occurred_on>:<amount_cents>:<descriptor_norm>` basis. |

**Line filter (D-04..D-06), measured-precise:**
- DROP if line matches `/R\$\s?\d/` (balance/summary/payment-option lines all carry the `R$` prefix; transaction values never do).
- DROP if line matches label `/pagamento de fatura|^anuidade|valor total|saldo anterior|total de|total despesas|saldo desta|^resumo|limite|iof|encargos|juros|multa/i`.
- DROP if outside the `Detalhamento da Fatura` … `Resumo da Fatura` window.
- KEEP everything else matching the TX regex — these are compras + estornos (D-04).
- Parcela = the single line's value (D-05); do not expand.
- Foreign currency (D-06): import the BRL value (the R$ column, left of US$). **Caveat:** both samples have US$=0,00 throughout, so the foreign-currency line layout could NOT be empirically observed — see Open Questions / Assumptions. The recipe takes the first/BRL value, which is correct for the BRL-converted amount per D-06, but the planner should add a `checkpoint:human-verify` for the first real foreign-currency statement.

## Review Grid Extension (D-02 / D-03)

- **Add delete-row** to `import-review-table.tsx`: a per-row destructive affordance (trash icon button in a new trailing column, or in the existing row context) that removes the row from the `rows` client state (`setRows((prev) => prev.filter((r) => r.id !== id))`). Pure client-state mutation — nothing persisted; confirm sends only the surviving rows. Mirror the existing `classifyRow`/`tagCarroRow` callback pattern. Reuse shadcn `Button` + an `AlertDialog` confirm (already imported) ONLY if you want a guard; a single-row delete can be immediate with an undo toast (sonner is already wired) — recommend immediate delete + sonner undo to keep cleanup fast (deleting spurious lines is the central PDF cleanup mechanism per D-02).
- **Do NOT add manual add-row** (D-03). The grid stays best-effort, not a mini-editor.
- **Honest counts (D-01):** `ParseResult.dropped` already flows into `IngestSummary.descartadas`. Surface "N extraídas / J descartadas" — the existing `ImportSummaryHeader` already renders the summary; ensure `descartadas` is visible for the PDF path (it's already in the type). No new gate; the grid is the safety net.
- The summary recompute in `ImportReviewTable` derives `duplicadas` from `initialRows.length - rows.length`. **Watch:** deleting rows will now also shrink `rows.length`, which would mis-attribute deletes as duplicates in that local `summary` memo. The planner must adjust the summary logic so a user-deleted row is NOT counted as a duplicate (track an explicit deleted count, or base `duplicadas` on the server-provided value rather than the length delta). This is a real bug-vector introduced by D-02 — call it out as a task.

## Quality-Bar Recommendation (D-01)

Based on the two real samples, `getText()` extraction completeness is **effectively complete** for text-based Santander PDFs: 98/116 transaction lines parsed with correct date+descriptor+amount, zero noise leakage, zero malformed-tx drops (the only `dropped` rows were intentional `0,00` ANUIDADE lines). On this evidence:

- **The only hard block is image-only / zero extractable text** (PDF-04): `getText().text.trim().length === 0` → the CSV/OFX-steering message. This is the user's stated single hard gate (D-01).
- **No numeric completeness threshold.** Do not refuse on partial coverage. If text extracts but few/no lines match (a non-Santander layout, or a future Santander redesign), show the review grid with honest counts; the user sees the file was read and self-selects CSV/OFX. The grid + `dropped` counts + delete-row ARE the safety net.
- **Confidence caveat:** completeness is HIGH for the UNIQUE VISA layout in both 2026 samples. Other Santander card products / older layouts are unverified (D-07 keeps the contract generic but calibration is UNIQUE-VISA-shaped). The window-marker fallback (Pitfall 6) and honest counts protect against layout drift without a hard refusal.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo convention — existing `*.test.ts` for `ofx`, `csv`, `normalize`, `money`, `dedupe`, `suggest`) — confirm in `package.json`/`vitest.config` (Wave 0 if absent) |
| Config file | `vitest.config.*` (verify; the repo has extensive co-located `.test.ts`) |
| Quick run command | `npx vitest run src/lib/parsers/pdf.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PDF-02 | Santander text → correct `RawTransaction[]` (date/desc/cents); parcela value; estorno kind | unit | `npx vitest run src/lib/parsers/pdf.test.ts` | ❌ Wave 0 |
| PDF-02 | filter precision: `PAGAMENTO DE FATURA`/`ANUIDADE`/`VALOR TOTAL`/`R$`-lines dropped; estornos kept | unit | same | ❌ Wave 0 |
| PDF-02 | `pdfDateToCivil` determinism incl. Dec→Jan rollover | unit | same | ❌ Wave 0 |
| PDF-04 | empty/whitespace extracted text ⇒ image-only error (distinct from 0-row parse) | unit | `npx vitest run src/lib/parsers/pdf.test.ts` (text-level) | ❌ Wave 0 |
| PDF-05 | PDF `RawTransaction` dedup key uses csv-basis (no fitid) — same as CSV | unit | `npx vitest run src/lib/dedupe.test.ts` (extend) | partial |
| PDF-01/03/05 | contract conformance: `parsePdf` returns `ParseResult`; flows through `ingestStatement` unchanged | unit/type | `npx tsc --noEmit` + parser test | ❌ Wave 0 |
| PDF-03 (D-02) | delete-row removes from confirm payload; summary not mis-counting deletes as duplicates | unit (component or pure helper) | extend import-review-table tests | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/parsers/pdf.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** full suite green + `npx tsc --noEmit` before `/gsd-verify-work`. **Manual gate:** one real Santander PDF uploaded locally end-to-end (review grid → confirm → /extrato → metas) — the real PDFs stay local/gitignored.

### Wave 0 Gaps
- [ ] `src/lib/parsers/pdf.test.ts` — covers PDF-02/04, filter precision, date rollover, parcela/estorno
- [ ] **Committed SYNTHETIC text fixtures** — a hand-authored `santander-sample.txt` (or inline template literal) that REPRODUCES the observed line structure (block headers, `Despesas`/`Pagamento e Demais Créditos`/`Parcelamentos`, `Detalhamento`/`Resumo` markers, a bill-payment line, estornos, parcelas, a `VALOR TOTAL`, `R$`-prefixed noise) WITHOUT any real merchant/card data. CI runs against this; the real PDFs never enter git. This is why the parser MUST split into `extractPdfText` (IO) + `parseSantanderText` (pure, fed the synthetic text).
- [ ] Verify Vitest is the configured runner; if a parser-test harness is missing, `Wave 0: confirm vitest config`.
- [ ] Extend `dedupe.test.ts` with a no-fitid PDF-shaped row asserting the csv basis.

## Security Domain

> `security_enforcement` absent in config ⇒ enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `getClaims()` in `ingestStatement`/`confirmImport` (existing) |
| V4 Access Control | yes | Storage RLS `auth.uid()=path[0]` + defense-in-depth path-prefix check (existing); PDF reuses verbatim. IDOR re-derive in `confirmImport` (existing). |
| V5 Input Validation | yes | `extSchema` extended to `'pdf'` via Zod; `parseBRLToCents` rejects malformed money; `parseSantanderText` skips malformed lines (`dropped`); `MAX_PARSED_ROWS` cap. Per-line resilience = never throws across the `'use server'` boundary (wrap dispatch, existing pattern). |
| V12 Files & Resources | yes | Parse from the downloaded buffer (never trust client bytes); Node runtime; `maxDuration` bounds parse time; row cap bounds memory + jsonb size. A malformed/hostile PDF must degrade to `{ error }` or `dropped`, never a 500 or unbounded loop. |
| V6 Cryptography | no | none (no new crypto; `dedupeKey`/`contentHash` reuse existing sha256) |

### Known Threat Patterns for {Node PDF parsing on Vercel}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious/huge PDF → memory/CPU exhaustion | DoS | `MAX_PARSED_ROWS` cap + `maxDuration`; parse is single-pass over extracted text |
| PDF with embedded scripts/XXE-style payloads | Tampering | pdf-parse v2 is text extraction only (no JS execution); no XML entity expansion in our path |
| Learning-poisoning via forged descriptor | Tampering | UNCHANGED existing WR-01: `confirmImport` re-reads server-persisted `parsed_rows`; client supplies only category/reserva choice. `descriptor_norm` is server-derived. PDF inherits this. |
| Cross-user file access | Info disclosure | Storage RLS + path-prefix re-check (existing); PDF path is `{user_id}/uuid.pdf` |
| `getText()` throwing escaping the server-action boundary as a 500 | Info disclosure | Wrap the PDF dispatch in the existing try/catch → friendly `{ error }` (mirror the OFX/CSV dispatch wrapper in `ingestStatement`) |

## Environment Availability
| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (Vercel Node runtime) | pdf-parse v2 (native Node APIs) | ✓ | v24 local / Vercel Node | none needed — Edge is forbidden, not a fallback |
| `pdf-parse` | PDF-02 extraction | ✓ (installs cleanly, repo verified) | 2.4.5 | `unpdf` text for the image-only check |
| `unpdf` | PDF-04 fallback | ✓ | 1.6.2 | — |
| Vitest | validation | verify in package.json | — | Wave 0: confirm config |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none material.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Foreign-currency (US$) line layout takes the BRL value to the left of US$ | Normalization Recipe / D-06 | MEDIUM — both samples have US$=0,00 so the layout is UNOBSERVED. A real foreign-currency statement could place columns differently. Mitigation: `checkpoint:human-verify` on first foreign-currency PDF. `[ASSUMED]` |
| A2 | The vencimento (first full DD/MM/YYYY) reliably anchors the statement year for all Santander faturas | Pitfall 1 | LOW-MEDIUM — measured present in both; a layout without it falls back to the rollover heuristic only. `[VERIFIED: spike for these 2; ASSUMED for general]` |
| A3 | Other Santander card products / older layouts share the UNIQUE VISA structure (window markers, block headers, `R$`-prefix discriminator) | Quality Bar / D-07 | MEDIUM — calibration is UNIQUE-VISA-shaped. The window-marker fallback + honest counts + grid prevent a hard failure; worst case is low extraction → user uses CSV/OFX. `[ASSUMED]` |
| A4 | Adding `kind?` to `RawTransaction` + threading through `confirmImport` is the right way to represent estornos | Pitfall 3 / Recipe | LOW — it's additive and back-compatible; the alternative (drop estornos) violates D-04. Planner decides the exact shape. `[ASSUMED]` |
| A5 | Vitest is the test runner | Validation Architecture | LOW — co-located `*.test.ts` everywhere; confirm in Wave 0. `[ASSUMED]` |

## Open Questions

1. **`kind`/estorno representation in the shared contract.**
   - Known: `RawTransaction` has no `kind`; `confirmImport` hard-codes `kind:'expense'`; D-04 requires importing estornos.
   - Unclear: add `kind?` to `RawTransaction` (recommended) vs. another encoding.
   - Recommendation: add `kind?: 'expense'|'credit'` (default expense), thread through `confirmImport` — small, tested, additive. Plan as an explicit task.
2. **Foreign-currency layout (A1).**
   - Known: D-06 says import the converted BRL value.
   - Unclear: exact column layout — unobserved (US$=0,00 in both samples).
   - Recommendation: implement per the BRL-left-of-US$ assumption + add a human-verify checkpoint for the first real foreign-currency statement.
3. **Literal Route Handler vs. runtime-pinned server action (D-08).**
   - Known: parse is 24–182 ms; guidance says Route Handler + maxDuration.
   - Recommendation: runtime-pinned server action (`runtime='nodejs'` + `maxDuration`) satisfies the correctness-bearing parts of the guidance without churn; document the evidence. Defer to plan-checker if it demands the literal handler (fallback documented in D-08 section).
4. **Summary mis-count after delete-row.**
   - Known: `ImportReviewTable` infers `duplicadas` from `initialRows.length - rows.length`; deleting rows breaks that.
   - Recommendation: track deletes explicitly; plan as a task (called out in Review Grid Extension).

## Sources

### Primary (HIGH confidence — measured this session)
- **Spike against `fixtures/faturas-pdf/santander/1781778251757.pdf` and `1781778281400.pdf`** — `pdf-parse@2.4.5` `getText()`/`getTable()` + `unpdf@1.6.2`; line structure, filter precision, parse timing, image-only behavior, year anchor. (2026-06-18)
- `npm view pdf-parse / unpdf` — versions, repo URLs, dist-tags, postinstall absence (2026-06-18)
- In-repo: `src/lib/parsers/{types,ofx,csv}.ts`, `src/actions/import.ts`, `src/lib/{normalize,money,dedupe}.ts`, `src/lib/classifier/{memory,suggest}.ts`, `src/components/import-review-table.tsx`, `src/lib/schemas/import.ts` — contract + reuse points (read this session)

### Secondary (MEDIUM)
- `CLAUDE.md` Deep Dives §1 + "What NOT to Use" — locked stack/runtime guidance (note: its `getTable()`-primary assumption is contradicted by the spike for Santander)
- `.planning/phases/13-pdf-de-fatura/13-CONTEXT.md` — locked decisions D-01..D-08

### Tertiary (LOW)
- Foreign-currency layout (A1, A3) — not observable in the available samples; flagged ASSUMED.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions/repos verified; packages CLAUDE.md-locked; install + provenance confirmed.
- Extractor choice (getText over getTable): HIGH — directly measured (getTable=0 tables, getText=full text on both files).
- Line layout + filter heuristic: HIGH — prototype extracted 98/116 tx cleanly with zero noise leakage on the real PDFs.
- Runtime decision (D-08): HIGH — parse timing measured (24–182 ms).
- Foreign-currency handling: LOW — unobserved in samples (US$=0,00 throughout).
- Cross-product/layout generality: MEDIUM — calibrated on UNIQUE VISA only (D-07 scope).

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (stack stable; re-spike if Santander changes statement layout or a 2nd issuer is added)
