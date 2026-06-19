---
phase: 16-review-grid-suggestion-affordances
verified: 2026-06-18T22:40:00Z
status: passed
closed_by: quick-task 260619-d68 (PROD live smoke, 2026-06-19)
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: null
human_verification:
  - test: "Com uma chave de IA configurada (LOCAL ou PROD), subir uma fatura com um merchant NOVO (cache-miss) e abrir a review grid"
    expected: "As linhas sugeridas pela IA mostram o chip 'Aplicar sugestão: {Categoria}', a badge gold 'IA' + Sparkles, e a tag amber 'baixa confiança' nas linhas com confidence < 0.6 — com as linhas de baixa confiança ordenando primeiro. Memory-hits mostram a badge neutra 'memória' (sem chip)."
    why_human: "É puro READ de row.suggestion — a UI está provada por teste de componente (7/7 GREEN), mas o end-to-end depende da Phase 15 produzir suggestions reais com chave real (smoke real-key deferido da Phase 15). O render foi observado incidentalmente em PROD (grid renderiza), mas a aparição das suggestions IA ao vivo não foi eyeballed com chave real."
---

# Phase 16: Review-Grid Suggestion Affordances Verification Report

**Phase Goal:** A review grid renderiza `row.suggestion` (Phase 15) no `SuggestionSlot` existente, mostra procedência (memória vs IA) + dica de confiança por linha, com baixa-confiança ordenando primeiro — pura UI, SEM auto-commit (`confirmImport` intacto). Reqs CLSAI-07, CLSAI-08.
**Verified:** 2026-06-18T22:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cada linha sem categoria mostra a sugestão no `SuggestionSlot`; clicar "Aplicar sugestão" preenche a categoria (sem commit) | ✓ VERIFIED | `InlineReviewCategoryCell` (import-review-table.tsx:873-927) resolve `suggestion.categoryId`→name (guarded: `.find(...)?.name ?? id`, no throw), passa `{categoryId,name}` ao `SuggestionSlot`; `onApply` → `onClassify(row.id, catId, null)` = client `setRows` fill, NO DB write. Tests `chip-on-ai-suggestion` + `apply-no-commit` GREEN (`confirmImport` not called). Route threads `suggestion: r.suggestion` (page.tsx:214 — previously dropped). |
| 2 | Usuário vê a procedência (badge "memória" vs "IA"), distingue IA de padrão confirmado | ✓ VERIFIED | `ProvenanceBadge` (lines 131-151): `category_id !== null && origin === 'memória'` → neutral "memória" pill; unapplied non-null suggestion on `category_id === null` → gold "IA" + Sparkles. Mutual exclusivity falls out of the `category_id === null` gate. Tests `memoria-badge` + `chip-on-ai-suggestion` GREEN. |
| 3 | Dica de confiança por linha + linhas de baixa confiança ordenam PRIMEIRO | ✓ VERIFIED | `ConfidenceTag` (159-172): amber "baixa confiança" only when `confidence < LOW_CONFIDENCE (0.6)` — never a number, never red. `lowConfidenceFirst` stable-partition (189-197) wired into `visibleRows` memo, gated on `hasAiSuggestions`. Tests `low-confidence-tag` + `low-confidence-first-sort` GREEN. |
| 4 | Aplicar sugestão IA + confirmar passa pelo mesmo gate do pick manual — nenhum `merchant_patterns` sem confirmação | ✓ VERIFIED | apply = `onClassify` (client state only); `import.ts` NOT touched in Phase 16 (last commit `6cf28f7` = Phase 15). The single `merchant_patterns` upsert stays at import.ts:841 (confirmImport LEARN path). Test `apply-no-commit` proves `confirmImport` never fires on apply. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/import-review-table.tsx` | `ReviewRow.suggestion?` + bridge + badges + sort | ✓ VERIFIED | `suggestion?: {categoryId: string\|null; confidence: number; source:'ia'}` added; `ProvenanceBadge`/`ConfidenceTag`/`lowConfidenceFirst` substantive; SuggestionSlot wired in cell. Imported + used. |
| `src/app/(app)/importar/[statementId]/page.tsx` | thread `suggestion` onto reviewRows | ✓ VERIFIED | `reviewRows.map()` sets `suggestion: r.suggestion` (page.tsx:214). Previously dropped — now plumbed. |
| `src/components/import-review-table.test.tsx` | the grid's first component test, 7 edges | ✓ VERIFIED | 207 lines; 7/7 tests GREEN covering all VALIDATION edges. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `parsed_rows` (Phase 15 persist) | route page.tsx | `r.suggestion` in reviewRows.map | ✓ WIRED | `ParsedReviewRow.suggestion` type exists (parsers/types.ts:82); threaded at page.tsx:214 |
| route | `ImportReviewTable` | `initialRows` prop | ✓ WIRED | `suggestion` carried in `ReviewRow` |
| cell | `SuggestionSlot` | `suggestionForSlot` ({categoryId,name}\|null) | ✓ WIRED | null-guarded (null categoryId → inert "—", v1.3) |
| apply chip | client state | `onClassify(id, catId, null)` | ✓ WIRED | NO DB write; `confirmImport` is sole merchant_patterns path |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| ImportReviewTable | `row.suggestion` | `statements.parsed_rows[].suggestion` (Phase 15 wire) | Live-produced only with a real AI key (Phase 15 real-key smoke deferred) | ⚠️ STATIC for tests / depends on Phase 15 wire live |

The rendering path is fully wired and proven by component tests with fixtures. Whether real AI suggestions flow into `parsed_rows.suggestion` in production is the Phase-15 wire's responsibility (code-complete, LOCAL-verified, real-key smoke deferred) — see Human Verification.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Component edges (7) | `npx vitest run src/components/import-review-table.test.tsx` | 7 passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Full suite | `npm test` | 819 passed (96 files) | ✓ PASS |

Full suite ran 819/819 GREEN — the env-flaky Supabase integration test (`tests/adherence-zero-spend.test.ts`, noted in SUMMARY as "1 file errored") passed in this run, confirming it is not a Phase-16 regression.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CLSAI-07 | 16-01 | Procedência (memória vs IA) na review grid | ✓ SATISFIED | ProvenanceBadge + SuggestionSlot bridge; tests memoria-badge, chip-on-ai-suggestion, no-chip-on-none-fits |
| CLSAI-08 | 16-01 | Dica de confiança + baixa-confiança ordena primeiro | ✓ SATISFIED | ConfidenceTag + lowConfidenceFirst; tests low-confidence-tag, low-confidence-first-sort |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| import-review-table.tsx | 895, 1010 | `placeholder=` | ℹ️ Info | Pre-existing Select UI placeholder props ("Classificar"/"Nenhum") — not data stubs. Confirmed in code context. |

No debt markers (TODO/FIXME/XXX/TBD/HACK) in the modified files. No stubs. Scope fence verified: the 3 Phase-16 commits (16f1040, bcec85d, f690ba9) touch ONLY the 3 planned files — no import.ts/classify.ts/pipeline/migration/Settings changes.

### Human Verification Required

#### 1. Sugestões reais da IA renderizam ao vivo com badge IA + confiança

**Test:** Com uma chave de IA configurada, subir uma fatura com um merchant NOVO (cache-miss) e abrir a review grid.
**Expected:** Linhas sugeridas pela IA mostram o chip "Aplicar sugestão: {Categoria}", a badge gold "IA" + Sparkles, e a tag "baixa confiança" nas linhas com confidence < 0.6 — com baixa-confiança no topo. Memory-hits mostram a badge "memória" (sem chip).
**Why human:** A UI (render de `row.suggestion`) está totalmente provada por teste de componente (7/7 GREEN) e o grid renderiza em PROD. Mas o end-to-end depende da Phase 15 produzir suggestions reais — o smoke real-key foi deferido na Phase 15. Este é o único item manual, herdado do smoke da Phase 15 (16-VALIDATION.md §Manual-Only); não bloqueia a entrega de UI desta fase.

### Gaps Summary

Nenhum gap. As 4 success criteria do ROADMAP e os reqs CLSAI-07/08 estão satisfeitos: o render, os badges de procedência mutuamente exclusivos, a tag de confiança, a ordenação baixa-confiança-primeiro e a ausência de auto-commit estão todos implementados de forma substantiva, corretamente wired, e exercitados por 7 testes de componente GREEN. O fence de escopo está intacto (`import.ts`/`confirmImport`/`merchant_patterns` não tocados). tsc clean, build ok, full suite 819/819.

O status é `human_needed` (não `passed`) por um único item manual deferido: ver as suggestions IA renderizarem AO VIVO com chave real — herdado do real-key smoke deferido da Phase 15. A UI em si está provada; o que falta é o eyeball do end-to-end com o wire da IA produzindo dados reais.

---

_Verified: 2026-06-18T22:40:00Z_
_Verifier: Claude (gsd-verifier)_

---

## Live Smoke Closure — 2026-06-19 (quick-task 260619-d68)

**Status flipped `human_needed → passed`.** The single deferred item — AI suggestions rendering live with real data (inherited from the Phase-15 real-key smoke) — is confirmed: a new-merchant OFX upload in PROD produced real `gemini-2.5-flash-lite` suggestions, and the review grid rendered the gold **"IA"** badge + Sparkles and the **"Aplicar sugestão: {Categoria}"** chip on the suggested rows (the UI was already proven by the 7/7 component test; this confirms it end-to-end on live data).

**New feature request captured (not in scope here):** a bulk **"Aplicar todas as sugestões"** action on the grid (filed as a backlog/seed item — see quick-task SUMMARY).

Verified live by the user against `https://gestao-financeira-ebon-mu.vercel.app`.
