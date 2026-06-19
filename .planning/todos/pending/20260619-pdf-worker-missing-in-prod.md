---
created: 2026-06-19
title: PDF statement upload broken in PROD — pdfjs-dist worker not bundled
area: import / pdf parsing / deploy
severity: bug (PROD regression risk)
found_by: quick-task 260619-d68 (PROD live smoke)
files:
  - next.config.ts (serverExternalPackages / outputFileTracingIncludes)
  - src/actions/import.ts (pdf dispatch)
  - src/lib/parsers (pdf path)
---

# PDF upload fails in PROD: "Cannot find module pdf.worker.mjs"

## Problem

Uploading a PDF statement in PROD fails parsing. Vercel function log (260619-d68):

```
Warning: Cannot load "@napi-rs/canvas" package: Cannot find module '@napi-rs/canvas'
[ingestStatement] parse failed (ext=pdf, file=...pdf): Error: Setting up fake worker
failed: "Cannot find module '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
imported from /var/task/node_modules/pdfjs-dist/legacy/build/pdf.mjs".
```

The `pdfjs-dist` **worker module** (`pdf.worker.mjs`) is not present in the deployed
serverless function (`/var/task/node_modules/...`), so PDF text extraction throws.
This is the classic serverless pdfjs worker-resolution problem (CLAUDE.md warns about
it). v1.3 shipped Santander PDF working in PROD via `serverExternalPackages` — so this
may be a regression (a dependency/Next/bundling change dropped the worker from the
trace) rather than a never-worked case. NOT image-only (the file produced a worker
error, not an empty-text result).

User-facing symptom: the generic "Não foi possível ler este arquivo. Verifique se é um
extrato OFX, CSV ou PDF válido…" message. OFX/CSV ingestion is unaffected.

## Solution (sketch)

Ensure the pdf-parse / pdfjs-dist worker (and the optional `@napi-rs/canvas`) are
included in the Vercel Node-runtime function bundle:
- verify `serverExternalPackages` still lists `pdf-parse` (and/or pdfjs-dist),
- add `outputFileTracingIncludes` for `pdfjs-dist/legacy/build/pdf.worker.mjs` on the
  importar route segment if tracing is dropping it,
- re-test a known text-extractable PDF (e.g. the v1.3 Santander sample) in PROD.

Out of scope: OCR for image-only PDFs (steer to OFX/CSV — existing v1 decision).
