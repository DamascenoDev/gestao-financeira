---
phase: 22
slug: sugest-o-de-palavra-chave-inline-batch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + jsdom (already configured) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/actions/category-keywords.test.ts src/lib/classifier/keywords.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (targeted), full suite a few minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (targeted run)

---

## Per-Task Verification Map

> Populated by the planner from RESEARCH.md `## Validation Architecture`. Existing infrastructure (vitest) covers all units; no new framework install.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | KW-07 | — | inline affordance renders only when `row.origin === 'manual'`; never auto-creates | unit/component | `npx vitest run src/components/import-review-table.test.tsx` | ✅ | ⬜ pending |
| 22-02-01 | 02 | 1 | KW-08 | — | candidate computation excludes descriptors already covered by an existing keyword; orders by `hit_count` desc | unit | `npx vitest run src/actions/category-keywords.test.ts` | ✅ | ⬜ pending |
| 22-02-02 | 02 | 1 | KW-08 | — | batch approve creates RLS-scoped keywords (owner-gate), dedupes, discard has no side effect | unit | `npx vitest run src/actions/category-keywords.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new framework install — vitest + jsdom already configured; analog test files (`category-keywords.test.ts`, `keywords.test.ts`, `import-review-table.test.tsx`, `category-keywords-dialog.test.tsx`) exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline "criada ✓" toast + state flip feels right end-to-end on a real upload | KW-07 | Full upload→classify→confirm UX; live PROD signal | Upload a statement, manually pick a category on a new-merchant row, click "+ palavra-chave", confirm the keyword appears in `/categorias` under that category |
| Batch dialog lists real confirmed `merchant_patterns` candidates and bulk-approve persists | KW-08 | Depends on accumulated live `merchant_patterns` data | In `/categorias`, open "Sugerir palavras-chave", approve a couple, confirm they appear as keyword chips; discard one, confirm it leaves the list without side effect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
