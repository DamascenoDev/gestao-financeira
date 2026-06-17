---
phase: 6
slug: endurecimento-lgpd-isolamento-auditoria
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-17
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit + RLS integration against local Supabase) — installed |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` |
| **Full suite command** | `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run && npx tsc --noEmit` |
| **Estimated runtime** | ~35 seconds |

---

## Sampling Rate

- **After every task commit:** quick run
- **After every plan wave:** full suite + tsc
- **Before verify:** full suite green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Wave | Requirement | Secure/Correct Behavior | Test Type | Automated Command | Status |
|---------|------|-------------|-------------------------|-----------|-------------------|--------|
| 6-W0-01 | 0 | DATA-01 | transactionsToCsv: pt-BR BOM + `;` + comma decimals; category name resolved; period-scoped | unit | `npx vitest run transactions-csv` | ⬜ |
| 6-W0-02 | 0 | DATA-02 | export bundle completeness: every one of the 14 owned tables present; only the caller's rows (RLS-scoped) | integration | `npx vitest run lgpd-export` | ⬜ |
| 6-W0-03 | 0 | DATA-02 | delete: removes ALL my rows (14 tables, via CASCADE) + Storage `{user_id}/` files + auth user | integration | `npx vitest run lgpd-delete` | ⬜ |
| 6-W0-04 | 0 | DATA-02/SEC-01 | deleting user A leaves user B's rows + Storage intact (no collateral) | integration | `npx vitest run lgpd-delete-isolation` | ⬜ |
| 6-W0-05 | 0 | SEC-01 | comprehensive isolation matrix: user B cannot SELECT/INSERT/UPDATE/DELETE any of user A's rows — 4 verbs × all 14 tables (data-driven over owned-tables.ts) | integration | `npx vitest run isolation-matrix` | ⬜ |
| 6-W0-06 | 0 | SEC-01 | Storage isolation: user B cannot read/list/delete user A's `{user_id}/` objects; faturas only via signed URL (no getPublicUrl) | integration | `npx vitest run storage-isolation` | ⬜ |
| 6-W0-07 | 0 | SEC-01 | secret audit: service-role/secret key absent from the built client bundle (even though delete uses it server-side) | unit/script | `npx vitest run bundle-secret-grep` | ⬜ |
| 6-W0-08 | 0 | SEC-01 | PII→AI guard: no `ai`/`@ai-sdk` dep; suggestCategory returns null; no external egress | unit | `npx vitest run pii-guard` | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/data/owned-tables.ts` — the central 14-table list (drives export + isolation matrix)
- [ ] `tests/transactions-csv.test.ts` (or src/lib/transactions/csv.test.ts) — DATA-01
- [ ] `tests/lgpd-export.test.ts` — bundle completeness + only-my-rows
- [ ] `tests/lgpd-delete.test.ts` — full delete (DB+Storage+auth)
- [ ] `tests/lgpd-delete-isolation.test.ts` — delete A leaves B intact
- [ ] `tests/isolation-matrix.test.ts` — 4 verbs × 14 tables (data-driven)
- [ ] `tests/storage-isolation.test.ts` — Storage 2-user + signed-URL-only
- [ ] `tests/bundle-secret-grep.test.ts` (extend) — secret audit incl. service-role
- [ ] `tests/pii-guard.test.ts` — no AI dep / null seam / no egress
- [ ] Reuse `tests/helpers/local-supabase.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Conta screen: "Baixar meus dados" downloads the bundle | DATA-02 | Browser file download | Click export; confirm a JSON+CSV bundle downloads with all sections |
| Apagar conta: type-to-confirm "APAGAR" → delete → sign out | DATA-02 | Dangerous UI flow | Confirm the dialog requires the phrase, deletes, and signs out (use a throwaway local user) |
| Export CSV de transações from Extrato/Conta | DATA-01 | Browser file | Export the period; confirm pt-BR CSV fields |

*All export/delete/isolation/audit logic is automated; manual items are browser-download confirmations. Run the delete walkthrough only against a throwaway LOCAL user.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
