---
phase: 12
slug: produ-o-live-verify
status: complete
nyquist_compliant: false
wave_0_complete: true
created: 2026-06-18
---

# Phase 12 — Validation Strategy

> Per-phase validation contract, authored retroactively (pragmatic) for the production live-verify phase. Phase 12 was validated **primarily by live production checks** via Chrome DevTools MCP against the deployed bundle, **plus** the repo vitest suite that the gap-closure plans (12-08..12-11) shipped GREEN. No fabricated test runs — live-verify plans cite live MCP / production; tested plans cite real test files only.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (project standard — `src/**/*.test.ts(x)`, `tests/**/*.test.ts`) **+ live production verification** via Chrome DevTools MCP |
| **Production URL** | https://gestao-financeira-ebon-mu.vercel.app/ (single deploy, region gru1, remote Supabase sa-east-1, RLS enforced — D-08 single-deploy contract) |
| **Config file** | existing project vitest config (root) |
| **Quick run command** | `vitest run <changed test file>` (gap-closure plans only) |
| **Full suite command** | `npm test` + `npx tsc --noEmit` + `npm run build` |
| **Live-verify method** | Chrome DevTools MCP against the production `*.vercel.app` URL (separate browser profile — see dev-env-testing-gotchas), single signed-in user (single-user v1), read-only / non-destructive for the agent |
| **Estimated runtime** | gap-closure vitest suite ran GREEN (e.g. 756/756 after migration 0030; 761/761 after the import-grid quick-task) in seconds; live walkthroughs are human-paced (minutes per surface). No precise second-count claimed |

**Honest note:** This is a LIVE-VERIFY phase. The *core* verification mechanism was manual/live production checks, NOT automated test sampling. Automated coverage exists only where the gap-closure plans (12-08..12-11) added unit tests (e.g. `select-value-label.test.tsx`, `adherence.test.ts`, `receita-row-actions.test.tsx`, `br-date-field.test.tsx`).

---

## Sampling Rate

- **Gap-closure plans (12-08..12-11):** Run the changed test file after each commit (`vitest run <file>`); full suite + `npx tsc --noEmit` + `npm run build` before redeploy.
- **Live-verify plans (12-02..12-07):** Verification cadence is per-surface live MCP walkthrough against the single production bundle (D-08 — no re-deploy between checks except the gap-closure redeploy cycle, D-08 intentionally superseded for that cycle).
- **Max feedback latency:** seconds for the gap-closure unit runs; human-paced (minutes) for each live production walkthrough. No fabricated second-count.

---

## Per-Task Verification Map

> One row per shipped 12-xx plan, grounded in each plan's SUMMARY frontmatter and `12-VERIFICATION.md`. Live-verify plans record "live MCP / production" as the method; gap-closure plans cite their real test files.

| Task ID | Plan | Wave | Requirement | Verification Method | Automated Command / Evidence | Status |
|---------|------|------|-------------|---------------------|------------------------------|--------|
| 12-01 | 01 | 1 | DEBT-01, DEBT-02 | automated (unit) + migration | `vitest run carro-consumo.test.ts` (same-odometer WR-02 regression: RED on 0028, GREEN on 0029); migration `0029_consumo_same_odometer_fix.sql` | ✅ green |
| 12-02 | 02 | 2 | DEPLOY-01, DEPLOY-02, DEPLOY-03, DEBT-01 | live MCP / production + bundle gate | live signup → /dashboard (11 seeded BR categories), session persists, logout blocks protected routes; `scripts/check-bundle-secrets.sh` (SEC-02, no secret in client JS); migrations 0001-0029 pushed to remote | ✅ live |
| 12-03 | 03 | 3 | INC-02, TXN-03, TXN-04 | live MCP / production | live walkthrough on the 12-02 bundle: income edit-choice, filter URL round-trip, bulk re-classify (source-phase IDs; no new DEPLOY/DEBT ID) | ✅ live |
| 12-04 | 04 | 4 | BUD-02 | live MCP / production | live goal-adherence (monthly + annual) on production; RSV-01/02/05 confirmed | ✅ live |
| 12-05 | 05 | 4 | DEPLOY-04, DEPLOY-05 | live MCP / production | core-value upload proven live: 22-row Nubank OFX → parse → review → classify → counts in goals (surfaced G-07/G-08) | ✅ live |
| 12-06 | 06 | 5 | MEI-01..MEI-06 | live MCP / production | MEI walkthrough live on production. **Residual:** the downloaded `dasn-2026.csv`/JSON CONTENT (BOM / `;` / pt-BR) was NOT opened — see Manual-Only | ⚠️ live, content residual |
| 12-07 | 07 | 5 | SEC-01 (DATA-01, DATA-02 human-pending) | live MCP / production | SEC-01 verified live (service-role secret absent from 24 scanned bundle chunks); gate type-to-`APAGAR` mechanism verified non-destructively. **Residual:** DATA-01 (export bundle content) + DATA-02 (destructive delete) human-pending — see Manual-Only | ⚠️ human_needed |
| 12-08 | 08 | gap | G-01 (Base UI Select value→label) | automated (unit) | `vitest run select-value-label.test.tsx` — value≠label Select renders the label, never the `__none__` sentinel | ✅ green |
| 12-09 | 09 | gap | G-02, G-03, G-04 (BUD-02) | automated (unit) | `vitest run adherence.test.ts` — `shouldRenderMetaRow` (zero-spend teto visible), calm under-teto copy, truncating CategoryBadge | ✅ green |
| 12-10 | 10 | gap | G-05 (INC-02 — receitas delete) | automated (unit) | `vitest run receita-row-actions.test.tsx` — per-row Ações menu (Editar + confirmed Excluir) reusing `deleteOccurrence` | ✅ green |
| 12-11 | 11 | gap | G-06 (pt-BR dd/mm/aaaa dates) | automated (unit) | `vitest run br-date-field.test.tsx` — masked dd/mm/aaaa field with ISO yyyy-MM-dd storage contract across all six date forms | ✅ green |

*Status: ✅ green (automated) · ✅ live (live MCP, production) · ⚠️ live-with-residual / human_needed*

**G-07 / G-08 (import-grid residuals):** closed by quick-task `20260618-import-grid-gaps` (commit `2ae93fb`) — `items` map on `InlineReviewCarroCell` + branched confirm toast via `confirmToastMessage`. Pinned by `select-value-label.test.tsx` + `import-review-confirm-toast.test.tsx` (GREEN locally, 761/761). The live-in-production re-confirmation of G-07/G-08 is SC1 of phase 17.

---

## Wave 0 Requirements

- [x] Local stack green before the production deploy: migrations 0001-0029 applied locally, `carro-consumo` suite GREEN, 0029 (WR-02) present (12-01).
- [x] Gap-closure unit fixtures shipped GREEN for every G-fix that gained automated coverage: `select-value-label.test.tsx` (G-01/G-07), `adherence.test.ts` (G-02/G-03/G-04), `receita-row-actions.test.tsx` (G-05), `br-date-field.test.tsx` (G-06), `import-review-confirm-toast.test.tsx` (G-08).
- [x] `scripts/check-bundle-secrets.sh` present as the SEC-02 client-bundle gate.

*Phase 12 is a live-verify phase; "Wave 0" here means the local-green + bundle-gate preconditions that the production deploy and gap-closure cycle depended on. Those are satisfied.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Closure |
|----------|-------------|------------|-------------------|---------|
| MEI DASN download CONTENT — `dasn-2026.csv` / JSON file body (BOM / `;` separator / pt-BR formatting) | MEI-* (12-06) | File-download content inspection is hands-on; 12-06 confirmed the surface live but did NOT open the downloaded file | Trigger the DASN CSV/JSON export on `/mei/relatorio` in production; open the file and confirm UTF-8 BOM, `;` delimiter, and pt-BR number/date formatting | Closed within **phase 17 plan 02** (MEI walkthrough — downloads CSV/JSON) |
| LGPD export bundle CONTENT — transactions CSV + data-bundle JSON body | DATA-01 (12-07) | Export-content inspection is hands-on; 12-07 left it human-pending | On `/conta` in production, "Baixar meus dados" + "Exportar CSV"; open both and confirm the personal data export is complete and well-formed | Closed within **phase 17 plan 04** (LGPD walkthrough — export half) |
| Destructive throwaway-account delete | DATA-02 (12-07) | Destructive production action under strict safety protocol (backup → throwaway `user_id` → double-confirm gate → prod UI only → RLS-scoped cascade check); the agent NEVER runs it | Execute the SC3 safety runbook on a throwaway account in production; verify the cascade is scoped to the throwaway `user_id` via RLS | Delivered as the SC3 safety runbook in **phase 17 plan 04**; human executes (may be deferred per CONTEXT — DATA-02 stays open only on that item) |

**Traceability note:** the three residuals above are themselves closed within THIS phase (17) — plans 02 (MEI content) and 04 (LGPD export content + destructive delete runbook). They are referenced here for the map's traceability and are NOT claimed done in this document.

---

## Validation Sign-Off

- [x] All shipped plans have a verification method recorded (automated `vitest run` for 12-01/12-08..12-11; live MCP / production for 12-02..12-07)
- [x] Sampling continuity: gap-closure plans each carry a real test command; live-verify plans carry a per-surface live walkthrough — no plan is unverified
- [x] Wave 0 covers the local-green + bundle-gate preconditions the deploy depended on
- [x] No watch-mode flags (all automated commands are `vitest run`, non-watch)
- [x] Feedback latency acceptable (gap-closure units in seconds; live walkthroughs human-paced; honest qualitative note, no fabricated second-count)
- [ ] `nyquist_compliant: true` — **NOT set.** Honest `nyquist_compliant: false`: Phase 12's core verification was manual/live production checks (Chrome DevTools MCP), NOT automated test sampling, AND DATA-01 / DATA-02 remained human-pending at authoring time. Automated coverage exists only for the gap-closure plans. The residual live-content + destructive-delete items belong in Manual-Only and are closed within phase 17 (plans 02 + 04), not here.

**Approval:** approved (retroactive, pragmatic) for the automated + live-verified surface. `nyquist_compliant: false` is the honest flag — Phase 12 was a live-verify phase whose core proof is live production, not automated sampling; the human-pending residuals (DATA-01/02, MEI download content) are tracked to phase-17 plans 02 + 04.
