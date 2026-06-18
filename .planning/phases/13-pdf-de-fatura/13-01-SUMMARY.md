---
phase: 13-pdf-de-fatura
plan: 01
subsystem: parsers
tags: [pdf, parser, santander, tdd, ingest-contract]
requires:
  - "src/lib/money.ts: parseBRLToCents (comma-decimal BRL → positive cents)"
  - "src/lib/normalize.ts: normalizeDescriptor (single merchant-key source)"
  - "src/lib/parsers/types.ts: ParseResult / RawTransaction / MAX_PARSED_ROWS"
provides:
  - "src/lib/parsers/pdf.ts: extractPdfText, parseSantanderText, pdfDateToCivil, findStatementVencimento"
  - "src/lib/parsers/types.ts: RawTransaction.kind? ('expense' | 'credit')"
affects:
  - "src/actions/import.ts (13-03 will dispatch ext==='pdf' through extractPdfText + parseSantanderText)"
  - "confirmImport kind threading (13-03)"
tech-stack:
  added:
    - "pdf-parse@2.4.5 (mehmet-kozan v2 rewrite — getText() text extraction, serverless-safe)"
    - "unpdf@1.6.2 (image-only / zero-text edge-safe fallback)"
  patterns:
    - "Pure-parser split: extractPdfText (async IO) + parseSantanderText (pure, CI-testable)"
    - "ParseResult contract reuse — PDF is a third parser feeding the unchanged pipeline"
    - "Filter-by-LABEL not by sign (estornos kept, bill payment dropped)"
    - "Positive-cents invariant preserved — sign lives in kind, never in amount_cents"
key-files:
  created:
    - "src/lib/parsers/pdf.ts"
    - "src/lib/parsers/pdf.test.ts"
    - "tests/fixtures/santander-sample.txt"
  modified:
    - "src/lib/parsers/types.ts (added kind?)"
    - "src/lib/dedupe.test.ts (no-fitid PDF row asserts csv basis)"
    - "package.json / package-lock.json (pdf-parse, unpdf)"
decisions:
  - "kind? added to RawTransaction as additive/back-compatible (OFX/CSV omit it ⇒ expense)"
  - "getText() used, NOT getTable() — spike measured 0 tables on Santander PDFs"
  - "Provenance gate read package.json from disk (require('pkg/package.json') blocked by the package's exports field)"
metrics:
  duration: "~4 min"
  completed: "2026-06-18"
  tasks: 3
  files: 6
requirements: [PDF-02, PDF-04, PDF-05]
status: complete
---

# Phase 13 Plan 01: Santander PDF Text Parser Summary

Santander credit-card-statement text parser as a pure, CI-testable split (`extractPdfText` async IO + `parseSantanderText` pure) emitting the existing `ParseResult` contract, plus the additive `kind?: 'expense' | 'credit'` field on `RawTransaction` so estornos/credits flow end-to-end.

## What Was Built

- **`extractPdfText(buffer)`** — the only async/IO part. Uses `pdf-parse` v2 `getText()` (NOT `getTable()` — the spike measured 0 tables on real Santander PDFs), returns `''` on image-only/zero-text input without throwing, destroys the parser in `finally`.
- **`findStatementVencimento(text)`** — first full `DD/MM/YYYY` → `{ month, year }`; anchors the statement year.
- **`pdfDateToCivil(dd, mm, venc)`** — vencimento-anchored civil date with the Dec→Jan rollover (a tx month after the vencimento month belongs to the previous year); emits `YYYY-MM-DD`.
- **`parseSantanderText(text, venc)`** — pure line parser: windows `Detalhamento da Fatura`…`Resumo da Fatura` (with a whole-doc fallback if the start marker is absent), drops `R$`-prefixed + `NOISE_LABEL` lines (PAGAMENTO DE FATURA / ANUIDADE / VALOR TOTAL / saldo / limite / IOF / encargos / juros / multa), matches the TX regex, strips a trailing ` DD/MM` from the descriptor, routes money through `parseBRLToCents` on the sign-stripped value, treats `0,00` as `dropped`, sets `kind` from the leading `-`, omits `fitid`, and caps at `MAX_PARSED_ROWS`. Resilient: per-line throws → `dropped`.
- **`RawTransaction.kind?`** — additive optional field; OFX/CSV keep compiling unchanged.

## TDD Gate Compliance

- RED commit `ee77f9f` (`test(13-01): ...`) — failing tests + synthetic fixture, confirmed RED (`./pdf` exports absent).
- GREEN commit `24787e3` (`feat(13-01): ...`) — implementation; `pdf.test.ts` + `dedupe.test.ts` GREEN (27), full suite 778 GREEN, `tsc --noEmit` clean.
- Gate sequence (test → feat) present in git log.

## Verification

- `npx vitest run src/lib/parsers/pdf.test.ts src/lib/dedupe.test.ts` → 27 passed.
- `npx vitest run` (full) → 778 passed / 91 files.
- `npx tsc --noEmit` → clean.
- pdf-parse provenance gate: `2.4.5` + `git+https://github.com/mehmet-kozan/pdf-parse.git`, no postinstall (unpdf `1.6.2`, unjs, no postinstall).
- No real Santander PDF committed — only the synthetic `santander-sample.txt`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Provenance gate command failed on the package `exports` field**
- **Found during:** Task 1
- **Issue:** The plan/RESEARCH verify command `node -e "require('pdf-parse/package.json')"` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` — both `pdf-parse` and `unpdf` restrict subpath access via the `exports` field, so `require('<pkg>/package.json')` is no longer resolvable under Node 24.
- **Fix:** Ran the equivalent gate by reading `node_modules/<pkg>/package.json` from disk with `fs.readFileSync`. The substantive check (version `2.4.x` + `mehmet-kozan/pdf-parse` repo URL) passed identically; also verified neither package declares a `postinstall` script.
- **Files modified:** none (verification-only).
- **Commit:** n/a (gate procedure, not code).

The plan's `<automated>` verify for Task 1 (`node -e "...require('pdf-parse/package.json')..."`) would fail for the same reason; the provenance guarantee it encodes is satisfied via the disk read. 13-03 (or any later install verification) should read `package.json` from disk rather than `require()` the subpath.

## Self-Check: PASSED

- FOUND: src/lib/parsers/pdf.ts
- FOUND: src/lib/parsers/pdf.test.ts
- FOUND: tests/fixtures/santander-sample.txt
- FOUND: src/lib/parsers/types.ts (kind? present)
- FOUND commit 963c791 (Task 1)
- FOUND commit ee77f9f (Task 2 RED)
- FOUND commit 24787e3 (Task 3 GREEN)
