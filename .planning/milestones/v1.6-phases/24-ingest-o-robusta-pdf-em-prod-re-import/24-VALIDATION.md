---
phase: 24
slug: ingest-o-robusta-pdf-em-prod-re-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + jsdom (already configured) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/lib/parsers/pdf.test.ts src/actions/import.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Migration replay** | `supabase db reset` (if local stack up) OR SQL dry-parse of `0038_statements_status_imported.sql` |
| **Estimated runtime** | ~20 seconds (targeted), full suite a few minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~20 seconds (targeted run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | IMP-07 | — | `0038` migration widens `statements.status` CHECK to include `'imported'`; idempotent (drop-if-exists + named add); replay applies cleanly | migration replay | `supabase db reset` or SQL dry-parse | ✅ new | ⬜ pending |
| 24-01-02 | 01 | 1 | IMP-07 | — | confirmed statement → re-upload returns `alreadyImported` (0 novas); unconfirmed → re-parse | unit (mock) | `npx vitest run src/actions/import.test.ts` | ✅ | ⬜ pending |
| 24-01-03 | 01 | 1 | PDF-07 | — | image-only PDF hard-blocks with CSV/OFX steering; generic non-Santander noise degrades to 0 rows without throw (no OCR) | unit | `npx vitest run src/lib/parsers/pdf.test.ts src/actions/import.test.ts` | ✅ | ⬜ pending |
| 24-01-04 | 01 | 1 | PDF-06 | — | `next.config.ts` `outputFileTracingIncludes` includes the pdfjs worker for `/importar` routes (config assertion) | source assertion | grep `pdf.worker.mjs` + `outputFileTracingIncludes` in `next.config.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* vitest + jsdom already configured; `import.test.ts` (dedupe-by-status 410-432, PDF image-only/0-rows 495-529) and `pdf.test.ts` (degradation 122-125) already exist. No new framework install. The only new file is the migration; the only test change is strengthening the existing generic degradation case.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF upload parses successfully in PROD (Vercel) — pdfjs worker present in the serverless bundle | PDF-06 | Requires a real Vercel deploy; the worker-in-bundle fix can only be proven against the deployed function | After deploy, upload a real PDF statement in PROD `/importar`; confirm it parses to a review grid with no "worker missing" 500 |
| `0037` + `0038` applied to PROD Supabase | IMP-07 (+ prior 0037) | `supabase db push` needs interactive auth / `SUPABASE_ACCESS_TOKEN` — human-gated; deferred | Run `supabase db push` against the linked PROD project (bundles the pending `0037` and the new `0038`); confirm `statements.status` accepts `'imported'` and a re-upload of a confirmed file returns "0 novas" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
