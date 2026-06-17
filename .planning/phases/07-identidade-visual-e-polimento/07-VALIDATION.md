---
phase: 7
slug: identidade-visual-e-polimento
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-17
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Re-skin-only phase:
> the 559 behavior tests (which do NOT assert on color) are the regression gate; the new
> unit tests guard structure/behavior of new components; color/contrast is a human-verify
> gate (jsdom has no rendering engine).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 + @testing-library/react 16 + jsdom |
| **Config file** | vitest config in repo (`npm test` → `vitest run`) |
| **Quick run command** | `npm test -- <file>` (single component/file) |
| **Full suite command** | `npm test` (baseline 559 passed / 12 todo) |
| **Estimated runtime** | ~30-60 seconds (full); <10s single file |

Build gate: `npm run build` (next build). Type gate: `npx tsc --noEmit`. Secret gate: `bash scripts/check-bundle-secrets.sh .next/static`.

---

## Sampling Rate

- **After every task commit:** Run `npm test -- <touched component>` + `npx tsc --noEmit`.
- **After every plan wave:** Run `npm test` (full suite must stay ≥559 green) + `npm run build`.
- **Before `/gsd-verify-work`:** Full suite green + `next build` clean + `check-bundle-secrets.sh` exit 0 (Plan 07 phase gate).
- **Max feedback latency:** ~60 seconds (full suite).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | UI-02 | T-07-03 | ThemeToggle mount-guard, no hydration leak | unit/component | `npm test -- theme-toggle` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | UI-01, UI-02 | T-07-02 | token rewrite color-only, suite stays green | regression+build | `npm test && npm run build` | ✅ existing | ⬜ pending |
| 07-02-01 | 02 | 2 | UI-03 | T-07-04 | nav behavior frozen | regression | `npm test && npm run build` | ✅ existing | ⬜ pending |
| 07-02-02 | 02 | 2 | UI-07 | T-07-05 | theme client-only, no data exposure | regression | `npm test && npm run build` | ✅ existing | ⬜ pending |
| 07-03-01 | 03 | 2 | UI-04/05/06 | T-07-07, T-07-SC | recharts no secret in bundle; react-is override | build+secret | `npm run build && bash scripts/check-bundle-secrets.sh .next/static` | ✅ existing | ⬜ pending |
| 07-03-02 | 03 | 2 | UI-04, UI-05 | T-07-06 | charts read only RSC data, formatCents | unit/component | `npm test -- receita-gasto-chart category-distribution-chart` | ❌ W0 | ⬜ pending |
| 07-03-03 | 03 | 2 | UI-04/05/06 | T-07-06 | no new query/view/migration; gauge/adherence aria intact | regression+build | `npm test && npm run build` | ✅ existing | ⬜ pending |
| 07-04-01 | 04 | 2 | UI-07 | T-07-09 | selection/bulk frozen in card mode | component | `npm test -- extrato-table import-review-table` | ⚠️ table tested; card branch new | ⬜ pending |
| 07-04-02 | 04 | 2 | UI-07 | T-07-09 | NF/ledger actions frozen | component | `npm test -- nf-table reserva-ledger` | ⚠️ table tested; card branch new | ⬜ pending |
| 07-05-01 | 05 | 3 | UI-03 | T-07-11 | auth inverse guard preserved; form frozen | regression+build | `npm test && npm run build` | ✅ existing | ⬜ pending |
| 07-06-01 | 06 | 4 | UI-08 | T-07-14 | skeletons not spinners | unit/component | `npm test -- table-skeleton` | ❌ W0 | ⬜ pending |
| 07-06-02 | 06 | 4 | UI-08 | T-07-13 | error blocks no raw stack; loading.tsx Suspense | regression+build | `npm test && npm run build` | ✅ existing | ⬜ pending |
| 07-07-01 | 07 | 5 | UI-01..08 | T-07-SC, T-07-15 | phase gate + no hardcoded color | regression+build+secret | `npm test && npm run build && bash scripts/check-bundle-secrets.sh .next/static` | ✅ existing | ⬜ pending |
| 07-07-02 | 07 | 5 | UI-01..08 | T-07-15 | contrast/flip-integrity (human) | manual | human-verify | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/theme-toggle.test.tsx` — mount-guard + 3-way render + setTheme (UI-02) — authored RED in Plan 01 Task 1, GREEN in Task 2.
- [ ] `src/components/receita-gasto-chart.test.tsx` / `src/components/category-distribution-chart.test.tsx` — data + empty-state render, cents formatting, aria-label (UI-04/05) — authored RED in Plan 03 Task 2.
- [ ] `src/components/table-skeleton.test.tsx` — TableSkeleton header + N rows + skeleton smoke for chart/card (UI-08) — authored RED in Plan 06 Task 1.

*Existing infrastructure (vitest + 559 tests) covers the regression gate for every token/re-skin change; only the new components need new unit tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Token contrast ≥4.5:1 text / ≥3:1 non-text in BOTH light and dark | UI-01, UI-02 | jsdom has no rendering engine; OKLCH values are author-estimated (RESEARCH A2) | Plan 07 Task 2 step 2 — flip light↔dark across all routes, confirm money/status semantics legible |
| Dark-mode flip has no FOUC and persists across refresh | UI-02 | Visual/timing behavior not observable in jsdom | Plan 07 Task 2 step 2 — toggle theme, F5, confirm no flash + persistence |
| Charts render correct colors + theme-flip + readable tooltips | UI-04, UI-05, UI-06 | Recharts SVG layout/colors not measurable in jsdom | Plan 07 Task 2 step 3 — inspect dashboard/mei charts in both themes |
| Mobile table→card + BottomNav usability (≥48px targets) | UI-07 | Responsive layout/touch targets need a real viewport | Plan 07 Task 2 step 4 — narrow to <768px, confirm cards + bottom-nav |
| Auth identity (navy panel, gold "Financeira", value prop) | UI-03 | Visual identity judgment | Plan 07 Task 2 step 5 — inspect /auth/login two-panel layout |
| Skeletons (not spinners) + empty/error consistency + 150ms transitions | UI-08 | Loading/transition timing not observable in jsdom | Plan 07 Task 2 step 6 — reload heavy routes, inspect empty states + hover/focus |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (charts/skeleton/toggle authored RED in their plans; manual-only items gated in Plan 07)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has tsc/test/build; human-verify is the final task only)
- [x] Wave 0 covers all MISSING references (theme-toggle, both charts, table-skeleton)
- [x] No watch-mode flags (`vitest run`, not watch)
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
