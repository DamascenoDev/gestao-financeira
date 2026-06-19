---
phase: 13-pdf-de-fatura
plan: 04
subsystem: ui
tags: [pdf, upload, review-grid, react-table, delete-row, descartadas, estorno, sonner, empty-state, nextjs, serverExternalPackages]

# Dependency graph
requires:
  - phase: 13-01
    provides: "RawTransaction.kind? → ParsedReviewRow carries r.kind"
  - phase: 13-03
    provides: "ingestStatement PDF dispatch + persisted ParsedReviewRow with kind"
  - phase: 13-02
    provides: "live kind='credit' + format='pdf' constraints (0031+0032) — required for the end-to-end persist"
provides:
  - "uploader accepts .pdf (ACCEPTED_EXTS + accept=.ofx,.csv,.pdf + best-effort hint); PDF skips the CSV column-mapper pre-read"
  - "review grid delete-row (Trash2 + aria-label 'Remover linha') + sonner undo toast; no manual row-add (D-03)"
  - "descartadas (J) counter on ImportSummary, sourced from the SERVER summary (stable across deletes) — D-01 bug fix"
  - "estorno/credit rows render with the income (green) AmountCell; route threads kind: r.kind ?? 'expense'"
  - "'Nenhuma transação reconhecida' Empty for the text-present-0-rows case (distinct from the image-only hard block)"
affects: [pdf-import-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "review-grid counts (descartadas/duplicadas) read from the server-provided statements.summary, NOT the rows-length delta — deleting a row never mis-counts as duplicate/descartada (D-01)"
    - "estorno color = computed kind on AmountCell (kind={row.original.kind === 'credit' ? 'income' : 'expense'}) reading the route-threaded persisted kind"
    - "Next serverExternalPackages: pdf-parse must NOT be bundled (pdfjs worker/font path resolution) — runtime='nodejs' is necessary but not sufficient"

key-files:
  created: []
  modified:
    - src/components/upload-dropzone.tsx
    - src/components/import-uploader.tsx
    - src/components/import-review-table.tsx
    - src/components/import-summary-header.tsx
    - src/app/(app)/importar/[statementId]/page.tsx
    - src/components/upload-progress.tsx
    - next.config.ts
    - src/actions/import.ts

key-decisions:
  - "ReviewRow.kind made optional (kind?) so Task 2 compiles before Task 3 threads it; every read is null-safe. Estorno cell uses the codebase's computed-kind idiom (kind={... ? 'income' : 'expense'}) rather than a literal kind='income'."
  - "Gate-2 (real Santander PDF on prod, MCP-driven) surfaced a blocking runtime bug NOT visible to tsc/build/unit: Next bundled pdf-parse, breaking pdfjs worker/font resolution → PDFParse threw, swallowed by a bare catch → generic error. Fixed with serverExternalPackages: ['pdf-parse'] + error logging."

patterns-established:
  - "Server-action error branches must log the underlying error (parse catch + statements insert) — best-effort PDF failures are otherwise undiagnosable behind the generic friendly message"
  - "Client error UI surfaces the server-provided { error } message (image-only steering etc.), overriding the generic label"

requirements-completed: [PDF-01, PDF-03, PDF-04]

# Metrics
duration: ui-build + gate-2 end-to-end (prod, MCP-driven)
completed: 2026-06-18
status: complete
---

# Phase 13 Plan 04: PDF Review-Grid UI + End-to-End Verify Summary

**The five PDF upload/review surfaces plus the route `kind` threading, verified end-to-end against a REAL Santander fatura on production (MCP-driven): 98 rows parsed, honest counts (98 · 98 novas · 0 dup · 1 descartada), delete-row keeps descartadas stable (D-01 fix), estorno rows render green, confirm persists to `/extrato` (Maio 2026, R$ 3.627,01) and counts in metas, with memory auto-classifying known merchants (99FOOD → Alimentação).**

## Accomplishments
- **Task 1 — uploader:** `ACCEPTED_EXTS` + `accept=".ofx,.csv,.pdf"` + aria-label + best-effort hint ("PDF é leitura aproximada — revise as linhas antes de salvar."); `fileExt` returns `'pdf'`; PDF skips the CSV header/sample pre-read.
- **Task 2 — review grid:** `deleteRow` (Trash2 ghost icon, `aria-label="Remover linha"`, mobile affordance) + sonner undo toast ("Linha removida" / "Desfazer"); no manual row-add (D-03). `descartadas` added to `ImportSummary` as a distinct muted `·`-segment, sourced from the **server** summary; the post-delete mis-count bug (D-01) fixed. Estorno/credit AmountCell renders income-green.
- **Task 3 — route wiring + Empty:** `[statementId]/page.tsx` threads `kind: r.kind ?? 'expense'` into `reviewRows.map()` (makes the estorno-green cell fire) and adds the `Nenhuma transação reconhecida` Empty for text-present-0-rows (distinct from the image-only hard block).

## Task Commits
1. **Task 1: uploader accepts .pdf, skips CSV column-mapper** — `a9fba91`
2. **Task 2: review grid delete-row + summary fix + descartadas + estorno green** — `76a94e0`
3. **Task 3: thread estorno kind + 0-rows recognized-nothing Empty** — `da1302d`

### Gate-2 gap-closure commits (defects found during the human-verify)
4. **`fix(13): externalize pdf-parse so PDF upload works in the Next server`** — `c008e76` (next.config.ts serverExternalPackages + parse-catch logging)
5. **`fix(13): surface server error message in upload UI; add PDF to copy`** — `e90ee53` (upload-progress.tsx message + import-uploader.tsx threading + copy)
6. **`fix(13): log the real statements-insert error`** — `45d1f03` (insError logging that pinned the format-constraint gap → 0032)

## Verification (end-to-end, production, MCP-driven)
- **Upload → register → parse:** real `1781778251757.pdf` → 98 rows in the review grid.
- **Honest counts:** `98 transações · 98 novas · 0 duplicadas · 1 descartada` (descartada matches the parser's 1 dropped line).
- **Estorno green:** R$0,02/0,03 credit rows render `text-income` (green); expenses `text-foreground` — verified via computed style.
- **Delete-row:** removing a row drops novas 98→97 while **descartada stays 1** (D-01 fix); undo toast confirmed in source (`import-review-table.tsx:251`).
- **Confirm → persist:** "Importar sem classificar?" guard → confirm → `/extrato` Maio 2026 shows the merchants (DISTBAIANO, OUTBACK, QUATTROCENTO, TIM*TIM, BL TIJU, ASSAI), total R$ 3.627,01.
- **Memory + metas:** 99FOOD auto-classified to Alimentação; dashboard "Metas e aderência" (Maio) shows per-category spend (Alimentação R$ 194,84 …) + total R$ 3.627,01.
- **tsc** clean; **build** compiles (pdf-parse externalized); **784 tests** pass.

## Issues Encountered (Gate-2)
1. **pdf-parse bundled by Next (blocking).** PDFParse threw in the server runtime (worked in plain Node) → swallowed by a bare `catch {}` → generic "Não foi possível ler". Root cause: missing `serverExternalPackages: ['pdf-parse']`. Fixed (`c008e76`); also un-swallowed the catch.
2. **statements.format constraint (blocking).** After fixing #1, the statements insert rejected `format='pdf'` (0019 CHECK) → "Não foi possível registrar". Fixed by migration 0032 (see 13-02). Logging added (`45d1f03`) pinned it.
3. **Stale client error copy.** The uploader showed a hardcoded "OFX/CSV" label and discarded the server message; now surfaces the server `{ error }` + says "OFX, CSV ou PDF" (`e90ee53`).
4. **Foreign-currency `convertido`: unverified.** Both real statements have US$ 0,00 (RESEARCH A1) — the graceful default holds (no `convertido` tag, layout intact); the path remains unexercised by design until a real foreign-currency statement appears.

## Self-Check: PASSED
All five planned files + the three gap-fix files modified and committed; end-to-end flow verified live on production.

---
*Phase: 13-pdf-de-fatura*
*Completed: 2026-06-18*
