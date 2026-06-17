---
phase: 5
slug: m-dulo-mei-dasn-simei
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-16
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit + RLS integration against local Supabase) — installed |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` |
| **Full suite command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** quick run
- **After every plan wave:** full suite + tsc
- **Before verify:** full suite green
- **Max feedback latency:** 40 seconds

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Secure/Correct Behavior | Test Type | Automated Command | Status |
|---------|------|-------------|-------------------------|-----------|-------------------|--------|
| 5-W0-01 | 0 | MEI-02 | applicable limit: full-year = R$81.000; SQL view value == `lib/mei/rules.ts` (never hardcoded 81k literal) | unit | `npx vitest run src/lib/mei/rules` | ✅ |
| 5-W0-02 | 0 | MEI-02 | proportional first year: start mid-year (e.g. Jul→6mo) → R$40.500; opening month counts full | unit/integration | `npx vitest run src/lib/mei/limit` | ✅ |
| 5-W0-03 | 0 | MEI-02 | 20% band tiers: verde <80%, âmbar 80-100%, vermelho ≤R$97.200 (migrate) vs >R$97.200 (desenquadramento) | unit | `npx vitest run src/lib/mei/status` | ✅ |
| 5-W0-04 | 0 | MEI-01/03 | NF CRUD: issued_on, amount_cents, tomador, descricao, activity_type (comércio/indústria vs serviços); RLS two-user isolation | integration | `npx vitest run mei-invoice-rls` | ✅ |
| 5-W0-05 | 0 | MEI-04 | yearly report: gross total + split comércio-indústria vs serviços + has_employee — exact DASN fields | integration | `npx vitest run mei-report` | ✅ |
| 5-W0-06 | 0 | MEI-02 | v_mei_year_summary security_invoker — user B sees 0 of user A's revenue/limit | integration | `npx vitest run mei-view-leak` | ✅ |
| 5-W0-07 | 0 | MEI-05 | alert flag at ≥80% of the applicable limit | unit | `npx vitest run src/lib/mei/status` | ✅ |
| 5-W0-08 | 0 | MEI-01 | IDOR: forged mei_invoice_id / mei_settings of another user rejected server-side | integration | `npx vitest run mei-idor` | ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/lib/mei/rules.test.ts` — SQL↔TS parity + never-hardcode-fiscal-literal guard
- [x] `src/lib/mei/limit.test.ts` — first-year proportional cap + opening month full + band
- [x] `src/lib/mei/status.test.ts` — tiered status + 20% band edges + 80% alert (folds mei-alert)
- [x] `tests/mei-invoice-rls.test.ts` — NF CRUD + activity_type + two-user RLS
- [x] `tests/mei-report.test.ts` — DASN report fields (gross + split + employee) + limit parity
- [x] `tests/mei-view-leak.test.ts` — v_mei_year_summary security_invoker
- [x] `src/lib/mei/csv.test.ts` — DASN-ready CSV export (BOM + ; + pt-BR money)
- [x] `tests/mei-idor.test.ts` — IDOR rejection
- [x] Reuse `tests/helpers/local-supabase.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Registrar NF form → list updates; limite gauge reflects | MEI-01/02 | Browser interaction | Add NFs; confirm gauge + status color change |
| Relatório DASN view + CSV export | MEI-04 | Browser + file | Open report; export CSV; confirm fields |
| Disclaimer visible on every MEI screen | MEI-06 | Visual | Navigate all MEI screens; confirm the informativo banner is visible (not a footer) |

*All limit/status/report/IDOR logic is automated; manual items are browser-render confirmations.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
