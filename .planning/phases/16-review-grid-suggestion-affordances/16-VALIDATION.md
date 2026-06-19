---
phase: 16
slug: review-grid-suggestion-affordances
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-18
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. This is additive UI on the existing review grid; the design contract is 16-UI-SPEC.md (no RESEARCH.md — pattern is well-understood).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (+ @testing-library/react for component render) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npx vitest run src/components/import-review-table.test.tsx src/components/suggestion-slot.test.tsx` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the touched component
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite green + `tsc --noEmit` + `npm run build`
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Pure-UI render/interaction edges. The review grid renders `row.suggestion` (Phase 15 produces it).

| Edge | Requirement | Observable Behavior | Test Type | Command |
|------|-------------|---------------------|-----------|---------|
| chip-on-ai-suggestion | CLSAI-07 | row.suggestion.categoryId non-null → SuggestionSlot renders "Aplicar sugestão: {name}" + "IA" badge | component | review-table test |
| no-chip-on-none-fits | CLSAI-07 | row.suggestion.categoryId === null → no chip, no badge (inert "—") | component | review-table test |
| memoria-badge | CLSAI-07 | memory-hit row (category_id set, classification_source 'memória') → "memória" badge, no chip; mutually exclusive with IA | component | review-table test |
| low-confidence-tag | CLSAI-08 | confidence < 0.6 → "baixa confiança" tag shown; ≥ 0.6 → no tag | component | review-table test |
| low-confidence-first-sort | CLSAI-08 | rows with low-confidence AI suggestions sort FIRST; only when AI suggestions exist | unit (comparator) | review-table/sort test |
| no-suggestions-v1.3-identical | CLSAI-07/08 | no row.suggestion anywhere → grid order + cells identical to v1.3 (no badges/chips, original order) | component | review-table test |
| apply-no-commit | CLSAI-07 | clicking "Aplicar sugestão" fills the Select (onApply sets category) but writes NO merchant_patterns (confirmImport untouched) | component | review-table test |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/import-review-table.test.tsx` — RED stubs for chip/badge/tag/sort/apply edges (the review-table currently has NO test — Wave 0 establishes it)
- [ ] (optional) `src/components/suggestion-slot.test.tsx` — if the slot is extended
- [ ] vitest + @testing-library/react already in the stack — no install (verify testing-library present; if not, Wave 0 adds it)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sugestões reais aparecem com badge IA + confiança ao vivo | CLSAI-07/08 | Precisa de chave real + upload com merchant novo (herda o smoke da Phase 15) | Com chave configurada (LOCAL), subir fatura com merchant novo → ver chip "Aplicar", badge "IA", e tag "baixa confiança" nas duvidosas; baixa-confiança no topo |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
