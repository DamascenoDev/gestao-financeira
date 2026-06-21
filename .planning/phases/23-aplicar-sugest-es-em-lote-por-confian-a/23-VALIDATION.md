---
phase: 23
slug: aplicar-sugest-es-em-lote-por-confian-a
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-21
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + jsdom (already configured) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run src/components/import-review-table.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds (targeted), full suite a few minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds (targeted run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | CLSAI-10 | — | `applyAllSuggestions` fills only rows with `confidence >= LOW_CONFIDENCE`; `< 0.6` stay `category_id null` + pending; origin→manual; NO DB write (`confirmImport` never called) | unit/component | `npx vitest run src/components/import-review-table.test.tsx` | ✅ | ⬜ pending |
| 23-01-02 | 01 | 1 | CLSAI-10 | — | button label/count = confident-pending only; hidden when 0 confident even if low-confidence rows remain; toast copy "{N} sugestões confiáveis aplicadas" | unit/component | `npx vitest run src/components/import-review-table.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* vitest + jsdom already configured; `import-review-table.test.tsx` exists with the CLSAI-08 confidence cases to mirror. No new framework install. NOTE: the existing "Aplicar 2 sugestões" apply-all test (0.9 + 0.3 fixture) MUST be updated to expect confident-only behavior — that update is part of the task, not Wave 0.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Batch-apply-by-confidence feels right on a real multi-row upload with a mix of high/low IA confidence | CLSAI-10 | End-to-end UX over real AI-suggested rows; live signal | Upload a statement that yields several IA suggestions of mixed confidence; click "Aplicar N sugestões confiáveis"; confirm only the confident rows fill, the amber baixa-confiança rows stay pending+uncategorized, and the button hides once no confident rows remain |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
