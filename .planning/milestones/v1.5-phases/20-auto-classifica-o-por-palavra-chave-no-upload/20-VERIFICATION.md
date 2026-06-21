---
phase: 20-auto-classifica-o-por-palavra-chave-no-upload
verified: 2026-06-19T17:40:00Z
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 20: Auto-classificação por palavra-chave no upload — Verification Report

**Phase Goal:** Ao subir uma fatura, um descritor que contém uma palavra-chave cadastrada já chega pré-classificado para aquela categoria — sem clique, sem chamar a IA, e ainda corrigível antes de confirmar. Pipeline memória→palavra-chave→IA.
**Verified:** 2026-06-19T17:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | Descritor que CONTÉM keyword chega pré-classificado, source='palavra-chave', sem IA (KW-02) | ✓ VERIFIED | `import.ts:494-506` memory-miss `else` → `matchKeyword` hit sets `categoryId = kw.categoryId`, `source = 'palavra-chave'`, NOT added to missNorms. Test `import.test.ts:654` asserts `uber.classification_source === 'palavra-chave'` |
| 2   | Pipeline memória → palavra-chave → IA: memória prevalece, keyword só roda no memory-miss (KW-03) | ✓ VERIFIED | `import.ts:490-507` — `if (hit) {source='memória'} else {matchKeyword...}`; keyword only in else. Test `import.test.ts:716` "memória prevalece" asserts source stays memória + `netflix com` not in AI batch |
| 3   | Linha de keyword NÃO entra no missNorms → lote de IA menor (KW-03/CLSAI-03) | ✓ VERIFIED | `import.ts:498-505` — keyword hit branch never calls `missNorms.add`; only the true-miss `else` does. Test `import.test.ts:679` asserts the keyword descriptor is absent from `classifyDescriptors.mock.calls[0][0]` |
| 4   | Keyword mais longa vence; empate de comprimento → menor sort; tie-break final em categoryId (KW-04/WR-01) | ✓ VERIFIED | `keywords.ts:41-55` length > then sort < then categoryId < (WR-01 fix present, commit 6697a10). Tests: unit longest-wins + end-to-end `import.test.ts:685` |
| 5   | matchKeyword('', rules) → null; rule com keyword '' nunca casa (guard) | ✓ VERIFIED | `keywords.ts:36` `if (descriptorNorm === '') return null`; `keywords.ts:39` `if (rule.keyword === '') continue`. Unit tests cover both |
| 6   | Grid de revisão deriva origin do classification_source persistido (KW-02) | ✓ VERIFIED | `page.tsx:204-213` ternary reads `r.classification_source === 'palavra-chave'` (the load-bearing fix; no longer hardcodes 'memória') |
| 7   | ProvenanceBadge (célula Categoria) renderiza pill neutro lowercase 'palavra-chave' sem ícone (KW-05) | ✓ VERIFIED | `import-review-table.tsx:142-147` branch `row.origin === 'palavra-chave'` → `<AffordancePill className="bg-secondary text-secondary-foreground">palavra-chave</AffordancePill>`. Test `keyword-provenance-badge` green |
| 8   | OriginBadge (coluna Origem) renderiza variante 'Palavra-chave' Title-Case, ícone Tags, neutro (KW-05) | ✓ VERIFIED | `origin-badge.tsx:35-39` VARIANT entry: label 'Palavra-chave', `bg-muted text-muted-foreground`, `Icon: Tags` (Brain reserved for memória, never bg-primary gold). Test `keyword-origin-badge` green |
| 9   | Linha de keyword é sobrescrevível na grid (Select → 'manual'); sem auto-commit; confirmImport aprende como hoje (KW-05) | ✓ VERIFIED | `import-review-table.tsx:344,353` `classifyRow` sets `origin: 'manual'` on category change (unchanged); learn loop `import.ts:885-910` untouched (git diff confirms only a comment line in that region) |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Prohibitions (must-NOT)

| Prohibition | Status | Evidence |
| ----------- | ------ | -------- |
| Hit de memória NUNCA sobrescrito por keyword | ✓ VERIFIED | keyword runs only in memory-miss `else` (`import.ts:494`) |
| Linha de keyword NUNCA entra no missNorms / passa a classifyDescriptors | ✓ VERIFIED | `import.ts:498-505`; test asserts absence from AI batch |
| Keyword NUNCA seta reserva_id (category-only) | ✓ VERIFIED | `import.ts:500-501` reservaId stays null |
| Matcher NUNCA re-normaliza keyword/descriptor_norm | ✓ VERIFIED | `keywords.ts` uses raw `.includes`, no normalize call |
| PASS 2 NUNCA sobrescreve linha de keyword | ✓ VERIFIED | `import.ts:549` `if (row.category_id !== null) continue` |
| Pill de keyword NUNCA usa gold bg-primary | ✓ VERIFIED | `origin-badge.tsx:37` bg-muted; ProvenanceBadge bg-secondary |
| OriginBadge de keyword NUNCA reusa ícone Brain | ✓ VERIFIED | `origin-badge.tsx:38` `Icon: Tags` |
| page.tsx NUNCA descarta classification_source | ✓ VERIFIED | `page.tsx:211` reads the source |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/classifier/keywords.ts` | matchKeyword + types | ✓ VERIFIED | 58 lines, exports matchKeyword/KeywordRule/KeywordMatch, WR-01 tie-break present |
| `src/lib/classifier/keywords.test.ts` | matcher unit tests | ✓ VERIFIED | substring/longest/no-match/''/sort-tie/''-guard + collision case — green |
| `src/lib/parsers/types.ts` | ClassificationSource += 'palavra-chave' | ✓ VERIFIED | line 57 union member |
| `src/actions/import.ts` | fetch + keyword pass | ✓ VERIFIED | `from('category_keywords')` :445, `matchKeyword` :498, no user_id filter (RLS) |
| `src/app/(app)/importar/[statementId]/page.tsx` | origin from classification_source | ✓ VERIFIED | :204-213 |
| `src/components/origin-badge.tsx` | OriginVariant += variant | ✓ VERIFIED | :18 union, :35-39 VARIANT entry |
| `src/components/import-review-table.tsx` | ReviewRow.origin + ProvenanceBadge branch | ✓ VERIFIED | :227 union, :142-147 branch |
| `src/components/import-review-table.test.tsx` | two-surface badge tests | ✓ VERIFIED | 3 new tests green |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| import.ts | keywords.ts | `matchKeyword(raw.descriptor_norm, keywordRules)` :498 | ✓ WIRED |
| import.ts | category_keywords (RLS) | `from('category_keywords').select(...)` :445 | ✓ WIRED |
| page.tsx | import-review-table (ReviewRow.origin) | `classification_source === 'palavra-chave'` :211 | ✓ WIRED |
| import-review-table | origin-badge (VARIANT map) | origin prop → VARIANT['palavra-chave'] | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Keyword pre-fill + AI-batch exclusion + memória precedence (state-transition invariants) | `vitest run keywords.test.ts import.test.ts import-review-table.test.tsx` | 66/66 passed | ✓ PASS |
| Strict-TS soundness | `npx tsc --noEmit` | exit 0, 0 errors | ✓ PASS |

Truths 1-3 and 9 are behavior-dependent (state transition / precedence / cleanup-on-override). Each is exercised by a passing named test (`import.test.ts:654/685/716`, `classifyRow` override path) — VERIFIED on behavioral evidence, not presence alone.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| KW-02 | 20-01, 20-02 | Descritor com keyword auto-classificado, source='palavra-chave', sem clique | ✓ SATISFIED | Truths 1, 6, 7, 8 |
| KW-03 | 20-01 | Ordem memória→palavra-chave→IA; IA só nos restantes | ✓ SATISFIED | Truths 2, 3 |
| KW-04 | 20-01 | Keyword mais longa vence | ✓ SATISFIED | Truth 4 |
| KW-05 | 20-01, 20-02 | Sobrescrevível; nada persiste até confirm; learn merchant→categoria como hoje | ✓ SATISFIED | Truth 9 |

All 4 declared requirement IDs (KW-02/03/04/05) are mapped to Phase 20 in REQUIREMENTS.md (lines 59-62) and accounted for. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER or stub patterns in any modified file |

### Notes

- **WR-02 (persisted source coarsening):** A confirmed keyword row persists `classification_source: 'memória'` in `transactions` (`import.ts:829`) because the migration-0020 CHECK does not permit `'palavra-chave'`. This is documented as intentional (review-time signal only; widening the enum is out-of-scope migration + PROD push) with an explicit code comment. Pre-dates Phase 20 and does not affect KW-05's category-gated learn loop. NOT a gap.

### Gaps Summary

None. All 9 must-have truths, all 8 prohibitions, all 8 artifacts, and all 4 key links verified against the codebase. All 4 requirement IDs satisfied. tsc clean; 66/66 tests green on the three touched suites; all tests mocked/pure (no live Supabase). No PROD dependency, no migration this phase.

---

_Verified: 2026-06-19T17:40:00Z_
_Verifier: Claude (gsd-verifier)_
