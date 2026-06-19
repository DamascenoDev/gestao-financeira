---
phase: 13-pdf-de-fatura
verified: 2026-06-18T18:55:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 13: PDF de Fatura Verification Report

**Phase Goal:** Usuário sobe fatura em PDF pela mesma UI de upload e, após revisar/confirmar no grid, as transações entram no mesmo pipeline de classificação e metas — best-effort, com confirmação humana obrigatória (nunca auto-commit de linha PDF). O PDF flui pelo MESMO ingest → review → confirm → classify(memory) → /extrato → metas que OFX/CSV.
**Verified:** 2026-06-18T18:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The phase goal is achieved. PDF flows through the same `ingestStatement` → persisted `parsed_rows` → `[statementId]` review grid → `confirmImport` → `transactions` → `/extrato` → metas pipeline as OFX/CSV. The only PDF-specific additions are a third parser (`parseSantanderText`), a third dispatch branch, two CHECK-constraint widenings, the image-only hard block, and five new review-UI surfaces — all verified present, substantive, wired, and (for the parser) behaviorally exercised.

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A `.pdf` routes through `ingestStatement` to the PDF dispatch branch (extSchema accepts 'pdf', 3-way ext detection) | ✓ VERIFIED | `import.ts:109` `extSchema = z.enum(['ofx','csv','pdf'])`; `:245-249` 3-way ext (`.csv`→csv, `.pdf`→pdf, else ofx); `:322` `if (ext === 'pdf')` branch calls `extractPdfText` then `parseSantanderText`. `import.test.ts` 36 pass incl. PDF-accept + dispatch cases |
| 2 | `parseSantanderText` deterministically maps Santander text → correct `RawTransaction[]` (estorno→credit, noise dropped, positive cents, Dec→Jan rollover) | ✓ VERIFIED | Behavioral spot-check against `tests/fixtures/santander-sample.txt`: 5 rows, 0 dropped — 4 `expense` + 1 `credit` (estorno R$100,38), all `amount_cents > 0`, PAGAMENTO/ANUIDADE/VALOR TOTAL/R$ lines filtered. `pdf.test.ts` GREEN (state-transition + rollover cases exercised) |
| 3 | Image-only PDF (empty/whitespace extract) returns a CSV/OFX-steering `{ error }`, distinct from a text-present 0-row review | ✓ VERIFIED | `import.ts:327-333` `text.trim().length===0 → { error }` steering to CSV/OFX, BEFORE parse. `[statementId]/page.tsx:103-119` separate `Nenhuma transação reconhecida` Empty for text-present-0-rows. `import.test.ts` covers both seams |
| 4 | A text-present 0-row PDF is NOT a hard block — flows to the review grid with honest 0/J counts + recognized-nothing Empty | ✓ VERIFIED | `[statementId]/page.tsx:103-119` renders `ImportSummaryHeader` + `Nenhuma transação reconhecida` Empty (not an error). Distinct from the image-only `{ error }` upstream |
| 5 | `confirmImport` persists estorno rows with the server-derived `kind` ('credit'), read from `r.base.kind`, never the client payload | ✓ VERIFIED | `import.ts:707` `kind: r.base.kind ?? 'expense'` in the `TxnInsert` built from `authoritativeRows` (server-persisted base, WR-01). Confirm schema unchanged (client payload carries no kind — verified in 13-03 SUMMARY decision) |
| 6 | The DB accepts `kind='credit'` and `format='pdf'` on local + prod (no 23514) | ✓ VERIFIED | Migrations `0031` (kind → expense,credit) + `0032` (format → ofx,csv,pdf) both present, idempotent named-constraint drop-then-add, `amount_cents > 0` retained. Committed `e0e1091`/`4cfea22`. Applied LOCAL (`pg_constraint`) + PROD (user `db push`), confirmed by live MCP end-to-end (98 rows incl. estornos persisted). *DB-state fact — not in generated types (string), correctly not flagged as type gap* |
| 7 | The uploader accepts `.pdf` alongside `.ofx/.csv` (input accept, ACCEPTED_EXTS, aria-label, best-effort hint) and PDF skips the CSV column-mapper | ✓ VERIFIED | `upload-dropzone.tsx:21` ACCEPTED_EXTS incl. 'pdf'; `:119` `accept=".ofx,.csv,.pdf"`; `:121` aria-label names PDF; `:113` "PDF é leitura aproximada" hint. `import-uploader.tsx:29-32` `fileExt` returns 'pdf'; `:117/:149` CSV pre-read gated on `ext==='csv'` (PDF skips) |
| 8 | Each review row has a delete affordance (Trash2 + undo toast) with no row-add; deleting does NOT mis-count descartadas/duplicadas (server-sourced, stable) | ✓ VERIFIED | `import-review-table.tsx:246` `deleteRow` + `:253` "Desfazer" sonner toast; `:415/:418` Trash2 `aria-label="Remover linha"` (desktop + mobile `:650`); no row-add control. `:278-279` `duplicadas`/`descartadas` read from `serverSummary` prop (passed from route `:219-225`), NOT the rows-length delta (D-01 fix) |
| 9 | An estorno/credit row renders income-green (never red); foreign-currency row shows a muted `convertido` suffix without breaking layout | ✓ VERIFIED (with noted unexercised sub-path) | `import-review-table.tsx:398/:642` `kind={row.original.kind === 'credit' ? 'income' : 'expense'}`; route threads `kind: r.kind ?? 'expense'` (`[statementId]/page.tsx:209`). `:339/:610` muted `convertido` suffix, graceful when flag absent. Estorno-green confirmed live (MCP). `convertido` real-data path UNEXERCISED (both real statements US$ 0,00 — RESEARCH A1, documented expected scope; graceful default holds, no break) |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/parsers/pdf.ts` | extractPdfText/parseSantanderText/pdfDateToCivil/findStatementVencimento | ✓ VERIFIED | 132 lines, all 4 exports present, imports `PDFParse` (not getTable), `parseBRLToCents`, `normalizeDescriptor`, `ParseResult`. Wired into `import.ts:23-25`. Behaviorally exercised |
| `src/lib/parsers/types.ts` | `kind?: 'expense' \| 'credit'` on RawTransaction | ✓ VERIFIED | `:49` additive optional field; flows onto `ParsedReviewRow extends RawTransaction`. OFX/CSV omit it (tsc clean) |
| `tests/fixtures/santander-sample.txt` | synthetic fixture | ✓ VERIFIED | Exists, contains both `Detalhamento da Fatura` + `Resumo da Fatura` markers; no real data |
| `supabase/migrations/0031_*.sql` | widen kind → ('expense','credit') | ✓ VERIFIED | Idempotent, non-destructive, `amount_cents>0` retained; committed |
| `supabase/migrations/0032_*.sql` | widen format → ('ofx','csv','pdf') | ✓ VERIFIED | Gate-2 discovery; same idempotent pattern; committed |
| `src/actions/import.ts` | extSchema+3-way+dispatch+image-block+kind threading | ✓ VERIFIED | All present + wired; insError logging surfaces real Postgres error |
| `src/app/(app)/importar/page.tsx` | runtime='nodejs' + maxDuration | ✓ VERIFIED | `:12` runtime, `:13` maxDuration=30; subhelper names PDF; no route.ts |
| `src/components/import-review-table.tsx` | delete-row + summary fix + estorno color + convertido | ✓ VERIFIED | All present incl. serverSummary prop |
| `src/components/import-summary-header.tsx` | descartadas (J) on ImportSummary | ✓ VERIFIED | `:35` descartadas field; `:114-115` distinct muted segment, not overloading duplicadas |
| `src/components/upload-dropzone.tsx` | 'pdf' in ACCEPTED_EXTS + accept + hint | ✓ VERIFIED | All present |
| `src/app/(app)/importar/[statementId]/page.tsx` | kind threading + 0-rows Empty | ✓ VERIFIED | `:209` kind threaded; `:110` recognized-nothing Empty; serverSummary passed |
| `next.config.ts` | serverExternalPackages: ['pdf-parse'] | ✓ VERIFIED | `:9` present — Gate-2 bundling-bug fix |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `import.ts` | `pdf.ts` | `ext==='pdf'` → extractPdfText → parseSantanderText | ✓ WIRED (`:326/:341`) |
| `pdf.ts` | `money.ts` | parseBRLToCents on sign-stripped value | ✓ WIRED (`:113`) |
| `pdf.ts` | `normalize.ts` | normalizeDescriptor (merchant key) | ✓ WIRED (`:122`) |
| `confirmImport` | transactions.kind | `kind: r.base.kind ?? 'expense'` (server-derived) | ✓ WIRED (`:707`) |
| `[statementId]/page.tsx` | review-table | `kind: r.kind ?? 'expense'` → green AmountCell | ✓ WIRED (`:209` → `:398/:642`) |
| `[statementId]/page.tsx` | summary-header | duplicadas/descartadas from serverSummary, not length delta | ✓ WIRED (`:219-225` → `:278-279`) |
| `0031/0032` | live DB | supabase db push (local + prod) | ✓ WIRED (pg_constraint + live MCP persist) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Parser produces real rows from synthetic fixture | `parseSantanderText(fixture, venc)` | 5 rows / 0 dropped: 4 expense + 1 credit(R$100,38), all positive cents | ✓ PASS |
| estorno → kind:'credit' state transition | (same) | `credit:10038:estorno exemplo` present | ✓ PASS |
| noise-label filtering (PAGAMENTO/ANUIDADE/VALOR TOTAL/R$) | (same) | dropped=0, no noise rows in output | ✓ PASS |
| PDF + dedupe unit tests | `vitest run pdf.test.ts dedupe.test.ts` | 27 passed | ✓ PASS |
| Ingest action seam (dispatch/image-only/kind) | `vitest run import.test.ts` | 36 passed | ✓ PASS |
| Type safety | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| pdf-parse provenance | read package.json | 2.4.5 + mehmet-kozan repo | ✓ PASS |
| No Route Handler introduced | `test -f src/app/api/import/route.ts` | absent | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PDF-01 | 13-03, 13-04 | PDF uploads via same UI, persists in Storage by user_id | ✓ SATISFIED | Truth 1+7; uploader accepts .pdf, same signed-URL → Storage → ingestStatement lifecycle; live MCP confirmed |
| PDF-02 | 13-01, 13-03 | Extracts transaction lines, normalizes to canonical shape (date, desc, cents) | ✓ SATISFIED | Truth 2; parser behaviorally verified (getText, not getTable per spike) |
| PDF-03 | 13-04 | Rows appear in editable review grid BEFORE persist; no auto-commit | ✓ SATISFIED | Truth 8; `[statementId]` review grid from persisted parsed_rows; nothing lands in `transactions` until confirmImport; live MCP confirmed (98 rows reviewed→confirmed→/extrato). **NOTE: REQUIREMENTS.md line 26 + traceability line 72 still mark PDF-03 `[ ]`/Pending — documentation lag, not an implementation gap (roadmap + 13-04 SUMMARY mark it complete)** |
| PDF-04 | 13-01, 13-03, 13-04 | Image-only PDF → clear CSV/OFX message, never silent empty | ✓ SATISFIED | Truth 3+4; hard block + recognized-nothing Empty both verified |
| PDF-05 | 13-01, 13-02, 13-03 | After confirm, PDF rows enter same memory pipeline + count in metas | ✓ SATISFIED | Truth 5+6; server-derived kind, CHECK widenings live, dedup/memory loop reused verbatim; live MCP confirmed (99FOOD→Alimentação, metas reflect spend) |

All 5 requirement IDs from every plan's frontmatter (PDF-01..05) accounted for. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| import-review-table.tsx | 753, 854 | `placeholder=` | ℹ️ Info | Legitimate shadcn Select `placeholder` props (UI hint text), NOT stub markers — no impact |

No debt markers (TBD/FIXME/XXX/HACK/TODO). No empty-return stubs. No unwired artifacts.

### Documentation Note (Info)

REQUIREMENTS.md still shows PDF-03 as `[ ]` (line 26) and `Pending` in the traceability table (line 72), while ROADMAP.md (Phase 13 = 4/4 complete) and 13-04-SUMMARY mark it complete and the implementation is fully present + wired + live-verified. This is a documentation lag, not a goal gap. Recommend flipping PDF-03 to `[x]`/Complete in REQUIREMENTS.md for traceability hygiene.

### Human Verification Required

None blocking. All goal-critical behaviors verified via tests, spot-checks, and the documented live MCP end-to-end prod run. One sub-path is unexercised by design:

- **Foreign-currency `convertido` suffix (RESEARCH A1):** both real Santander statements carried US$ 0,00, so the foreign-currency render path has never run against real data. The graceful default (no `convertido` tag, layout intact) is verified present and does not break. This is documented expected scope, not a gap — surfaces only the day a real foreign-currency purchase appears. No action required now.

### Gaps Summary

No gaps. The phase goal — PDF flowing through the same ingest → review → confirm → classify(memory) → /extrato → metas pipeline as OFX/CSV, best-effort with mandatory human confirmation — is achieved and behaviorally verified. The two CHECK-constraint widenings (a Gate-2 discovery for `statements.format`) are applied live; the parser is exercised against a synthetic fixture and produces correct estorno/expense/noise-filtered output; the full pipeline was confirmed live on production via MCP (98 rows, honest counts, estorno-green, confirm → /extrato → metas, memory auto-classification).

---

_Verified: 2026-06-18T18:55:00Z_
_Verifier: Claude (gsd-verifier)_
