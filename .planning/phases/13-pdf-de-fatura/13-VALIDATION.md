---
phase: 13
slug: pdf-de-fatura
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-18
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Finalized retroactively (pragmatic) against `13-VERIFICATION.md` (status: passed, 9/9 must-haves). No fabricated test runs — every command below references a real test artifact present in the repo.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard — see `src/**/*.test.ts(x)` and `tests/**/*.test.ts`) |
| **Config file** | existing project vitest config (root) |
| **Quick run command** | `vitest run <changed test file>` (e.g. `vitest run pdf.test.ts`) |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `npm run build` |
| **Estimated runtime** | full vitest suite runs in seconds (PDF + dedupe units = 27 passed; import seam = 36 passed; `npx tsc --noEmit` exits 0). Precise wall-clock not recorded at authoring time — qualitatively fast (sub-minute units; build dominates) |

---

## Sampling Rate

- **After every task commit:** Run the changed test file (`vitest run <file>`)
- **After every plan wave:** Run the full suite (`npm test`) + `npx tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite + build must be green
- **Max feedback latency:** seconds for the changed-file unit run; under a minute for the full vitest suite. `npm run build` is the slowest gate (best-effort/PDF parsing). No precise second-count is claimed — only the actual commands and their honest qualitative latency.

---

## Per-Task Verification Map

> Grounded in `13-VERIFICATION.md` (9/9 verified) and the 13-01..13-04 plan requirements. Each automated command references a real test artifact: `pdf.test.ts`, `import.test.ts`, `dedupe.test.ts`, or `npx tsc --noEmit`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | PDF-02 | — | `parseSantanderText` deterministically maps Santander text → `RawTransaction[]` (estorno→credit, noise dropped, positive cents, Dec→Jan rollover) | unit | `vitest run pdf.test.ts` | ✅ | ✅ green |
| 13-01-02 | 01 | 1 | PDF-04 | — | Image-only / empty-text extract returns a CSV/OFX-steering `{ error }` BEFORE parse, distinct from a 0-row review | unit | `vitest run import.test.ts` | ✅ | ✅ green |
| 13-02-01 | 02 | 1 | PDF-05 | — | Confirmed PDF rows reuse the same dedup/memory pipeline as OFX/CSV (dedupe-key contract holds) | unit | `vitest run dedupe.test.ts` | ✅ | ✅ green |
| 13-03-01 | 03 | 2 | PDF-01 / PDF-02 | — | `.pdf` routes through `ingestStatement` → PDF dispatch branch (extSchema accepts 'pdf', 3-way ext detection, `extractPdfText` → `parseSantanderText`) | unit | `vitest run import.test.ts` | ✅ | ✅ green |
| 13-03-02 | 03 | 2 | PDF-04 / PDF-05 | — | `confirmImport` persists estorno rows with the server-derived `kind` ('credit') from `r.base.kind`, never the client payload; DB accepts `kind='credit'` + `format='pdf'` (no 23514) | unit | `vitest run import.test.ts` | ✅ | ✅ green |
| 13-04-01 | 04 | 2 | PDF-01 / PDF-03 | — | Uploader accepts `.pdf` and PDF skips the CSV column-mapper; rows land in the editable review grid before persist (no auto-commit); type safety holds across the additive `kind` field | unit + types | `vitest run import.test.ts` && `npx tsc --noEmit` | ✅ | ✅ green |
| 13-04-02 | 04 | 2 | PDF-03 / PDF-04 | — | Each review row has a delete affordance + undo toast; descartadas/duplicadas read from server summary (stable on delete); estorno renders income-green, text-present 0-row is NOT a hard block | unit | `vitest run import.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

All rows green per `13-VERIFICATION.md` behavioral spot-checks: `vitest run pdf.test.ts dedupe.test.ts` → 27 passed; `vitest run import.test.ts` → 36 passed; `npx tsc --noEmit` → exit 0.

---

## Wave 0 Requirements

- [x] Committed **synthetic** Santander-shaped text fixture for CI: `tests/fixtures/santander-sample.txt` exists (contains both `Detalhamento da Fatura` + `Resumo da Fatura` markers; no real personal data). The real `fixtures/faturas-pdf/santander/*.pdf` are gitignored personal data and cannot run in CI.
- [x] Test stubs/coverage for PDF-02 (normalization — `pdf.test.ts` GREEN, parser exercised 5 rows / 0 dropped), PDF-04 (image-only/zero-text seam — covered in `import.test.ts`), PDF-05 (contract conformance → memory/dedup pipeline — `dedupe.test.ts` GREEN).

*Existing vitest infrastructure covers the rest. Wave 0 complete: synthetic fixture present and the three seams are behaviorally exercised.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Santander PDF extracts the right line items end-to-end | PDF-02 | Real PDFs are gitignored personal data — cannot ship to CI | Upload a real `fixtures/faturas-pdf/santander/*.pdf` locally; confirm extracted rows match the statement. (Full pipeline already confirmed live via MCP on production: 98 rows, honest counts, estorno-green, confirm → /extrato → metas — but that run was the operator's personal data, not a CI artifact.) |
| Foreign-currency line maps to converted BRL value (`convertido` suffix) | PDF-02 / D-06 | Both real Santander statements carried US$ 0,00 — the foreign-currency layout is unobservable against real data (RESEARCH A1 / LOW) | Locally upload a fatura containing a real foreign-currency purchase; confirm the BRL value is captured and the muted `convertido` suffix renders. The graceful default (no tag, layout intact) is verified present; the populated path surfaces only the day a real foreign-currency purchase appears. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (every Per-Task row maps to a real `vitest run` / `tsc --noEmit` command; Wave 0 fixture + stubs shipped)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task carries a unit/type command)
- [x] Wave 0 covers all MISSING references (synthetic fixture + PDF-02/04/05 seams committed and green)
- [x] No watch-mode flags (all commands are `vitest run` / `npm test` / `tsc --noEmit`, non-watch)
- [x] Feedback latency acceptable (changed-file units in seconds; full suite under a minute; honest qualitative note, no fabricated second-count)
- [x] `nyquist_compliant: true` set in frontmatter — honest: the parser is behaviorally tested (`pdf.test.ts` GREEN, 5 rows / 0 dropped) AND the full ingest → review → confirm → classify → /extrato → metas pipeline was live-verified on production (MCP). The two residual items (real-Santander-PDF end-to-end, foreign-currency `convertido`) are gitignored-personal-data / never-observed sub-paths recorded in Manual-Only, not compliance blockers.

**Approval:** approved (retroactive, pragmatic) — grounded in `13-VERIFICATION.md` 9/9. Residual manual-only items are documented expected scope, not gaps.
