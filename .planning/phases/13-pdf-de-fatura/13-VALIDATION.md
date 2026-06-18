---
phase: 13
slug: pdf-de-fatura
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard — see `src/**/*.test.ts(x)`) |
| **Config file** | (existing project vitest config) |
| **Quick run command** | `npm test -- <changed test file>` |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `npm run build` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run the changed test file (`npm test -- <file>`)
- **After every plan wave:** Run the full suite (`npm test`) + `tsc --noEmit`
- **Before `/gsd-verify-work`:** Full suite + build must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

> Populated by the planner / gsd-nyquist-auditor once PLAN.md tasks exist. Skeleton below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | PDF-02 | — | normalize Santander text → RawTransaction is deterministic | unit | `npm test -- pdf` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Committed **synthetic** Santander-shaped text fixtures for CI (the real `fixtures/faturas-pdf/santander/*.pdf` are gitignored personal data and cannot run in CI).
- [ ] Test stubs for PDF-02 (normalization), PDF-04 (image-only/zero-text path), PDF-05 (contract conformance → memory pipeline).

*Existing vitest infrastructure covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Santander PDF extracts the right line items end-to-end | PDF-02 | Real PDFs are gitignored personal data — cannot ship to CI | Upload a real `fixtures/faturas-pdf/santander/*.pdf` locally; confirm extracted rows match the statement |
| Foreign-currency line maps to converted BRL value | PDF-02/D-06 | Both spike samples had US$ 0,00 — layout unobservable (RESEARCH A1/LOW) | Locally upload a fatura containing a real foreign-currency purchase; confirm the BRL value is captured |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
