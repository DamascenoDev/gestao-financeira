---
phase: 22-sugest-o-de-palavra-chave-inline-batch
verified: 2026-06-20T20:55:00Z
status: human_needed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "On the import review grid, hand-classify a row (pick a category so origin becomes 'manual'), click '+ palavra-chave', edit/confirm the term, click Salvar; then open /categorias and confirm the keyword now appears under that category."
    expected: "The popover flips to 'criada ✓'; the keyword is persisted and visible in /categorias under the just-picked category (RLS-scoped to the user)."
    why_human: "Unit tests mock addKeyword, so the live Supabase round-trip (insert + RLS + appearance in /categorias) is not exercised by an automated test. addKeyword itself was proven live in earlier phases, but the inline path's end-to-end persistence on a real upload needs one live confirmation."
  - test: "On /categorias, click 'Sugerir palavras-chave', confirm the dialog lists candidates mined from your confirmed merchant_patterns with a suggested category, select a few, edit a term, click 'Aprovar selecionadas (N)'; then verify the approved keywords are persisted in /categorias and that descriptors already covered by an existing keyword did NOT appear as candidates."
    expected: "Candidates load on open; approve toasts the created/skipped count and removes approved rows; approved keywords persist under their categories; already-covered descriptors are absent from the list; discard removes a row with no persistence side-effect."
    why_human: "The dialog tests mock getKeywordSuggestions/approveKeywordSuggestions, so the live candidate computation over real merchant_patterns and the real batch insert are not exercised end-to-end. The server logic (matchKeyword exclusion, owner-gate, RLS insert) is unit-tested with the real matcher, but the live data round-trip needs one human pass."
---

# Phase 22: Sugestão de palavra-chave (inline + batch) Verification Report

**Phase Goal:** O usuário deixa de cadastrar palavras-chave só no braço: ao confirmar um padrão merchant→categoria na grid, recebe a opção inline de virar aquele descritor numa keyword; e em `/categorias` há um painel que varre os padrões já confirmados (`merchant_patterns`) e sugere keywords candidatas para aprovar ou descartar em lote.
**Verified:** 2026-06-20T20:55:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criteria) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Ao confirmar um padrão no review grid, o usuário vê uma opção inline (opt-in, nunca automática) de criar uma palavra-chave; aceitando, a keyword aparece cadastrada na categoria. | ✓ VERIFIED | `import-review-table.tsx:1033` gate `row.origin === 'manual' && row.category_id !== null`; `KeywordInlineSuggest` (pill → popover → Salvar) calls `addKeyword(row.category_id!, value)` at line 1134; error keeps popover open (1135-1138), success/duplicate flip to "criada ✓" (1140-1147). Tests: `import-review-table.test.tsx` "Salvar calls addKeyword(...)" asserts `toHaveBeenCalledWith('cat-transporte','uber trip 99')` + criada-✓ flip. (Live DB appearance → human item 1.) |
| 2 | Em `/categorias`, um painel analisa `merchant_patterns` e lista candidatas com a categoria sugerida. | ✓ VERIFIED | `getKeywordSuggestions()` (`category-keywords.ts:129`) RLS-scoped reads of merchant_patterns/category_keywords/categories, excludes already-covered via real `matchKeyword` (181), sorts hit_count desc (188), returns `{descriptorNorm,categoryId,categoryName,hitCount}`. Dialog loads on open (`keyword-suggestions-dialog.tsx:110`) and lists rows. Tests: action test "excludes descriptors already covered… returns candidate shape" + "sorts by hit_count desc"; dialog test "loads candidates on open and lists them". |
| 3 | No painel, aprova/descarta em lote; aprovadas viram keywords (user_id + RLS), descartadas somem sem efeito colateral. | ✓ VERIFIED | `approveKeywordSuggestions` (`category-keywords.ts:202`) one owner-gate (208-210), per-item validate/normalize/dedup, insert carrying `user_id` from claims (250), one `revalidatePath` after loop (264), `{created,skipped}`, single bad item never aborts (continue). Discard is local-state-only filter (`keyword-suggestions-dialog.tsx:159`, 0 server calls). Tests: action "creates… revalidates ONCE", "duplicate… skipped never aborts", "invalid… skipped rest proceed"; dialog "discard makes NO server call". |
| 4 | Nenhuma keyword é criada sem ação explícita — inline e batch ambos opt-in. | ✓ VERIFIED | Inline create only fires behind pill click → popover Salvar (no auto-effect). Batch create only behind checkbox select → "Aprovar selecionadas" click; `onApprove` early-returns at 0 selected (165); button disabled at 0. No `addKeyword`/`approveKeywordSuggestions` call on render or in a load effect (load effect calls only the read `getKeywordSuggestions`). |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/components/import-review-table.tsx` | Inline KW-07 control gated on `manual`, reuses `addKeyword`, per-row "criada ✓" | ✓ VERIFIED | Gate at 1033; `addKeyword` import (78) + call (1134); session `Set<string> createdKeywordRows`; copy "+ palavra-chave"/"criada ✓"/"Criar palavra-chave para esta categoria" present. |
| `src/actions/category-keywords.ts` | `getKeywordSuggestions` + `approveKeywordSuggestions` + types | ✓ VERIFIED | Both exported (129, 202); `compileRule`/`matchKeyword` imported + used (9, 169, 181); KeywordSuggestion + ApproveSuggestionsResult exported. WR-02 archived-category drop present (177). IN-03 read-error surfacing present (156). |
| `src/lib/schemas/category-keyword.ts` | `keywordSuggestionItemSchema` | ✓ VERIFIED | Schema + `KeywordSuggestionItem` type at 27/32; existing `keywordSchema` untouched. |
| `src/components/keyword-suggestions-dialog.tsx` | Load-on-open, multi-select, edit, bulk approve, session discard, Empty | ✓ VERIFIED | `'use client'`; calls both actions (111, 168); discard local-only (159, 0 removeKeyword); Empty "Nenhuma sugestão por enquanto" (206); WR-01 cause-neutral toast "ignoradas" (178). |
| `src/components/keyword-suggestions-launcher.tsx` | Client launcher owning open state, outline trigger | ✓ VERIFIED | `'use client'`; `React.useState(false)` (23); `variant="outline"` "Sugerir palavras-chave" (27-28); mounts dialog. |
| `src/app/(app)/categorias/page.tsx` | RSC mounting the launcher | ✓ VERIFIED | 0 `'use client'`; `KeywordSuggestionsLauncher` imported (5) + mounted in header (98). |
| Test files (3) | KW-07 inline + KW-08 server + KW-08 client coverage | ✓ VERIFIED | 51 tests pass across the 3 files (run below). |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| import-review-table.tsx (KeywordInlineSuggest) | category-keywords.ts (addKeyword) | `await addKeyword(row.category_id!, value)` | ✓ WIRED | Line 1134; reuses existing action verbatim, no new server surface. |
| category-keywords.ts (getKeywordSuggestions) | keywords.ts (matchKeyword/compileRule) | exclude where `matchKeyword(...) !== null` | ✓ WIRED | Lines 169, 181 — real pure matcher imported, not re-implemented. |
| category-keywords.ts (approveKeywordSuggestions) | category_keywords table | per-item insert behind one owner-gate + one revalidate | ✓ WIRED | Insert at 249-253 with `user_id` from claims; one revalidate at 264. |
| keyword-suggestions-dialog.tsx | category-keywords.ts (get/approve) | get on open, approve on bulk | ✓ WIRED | 111 (load), 168 (approve). |
| categorias/page.tsx | keyword-suggestions-launcher.tsx | rendered in header beside CategoriaForm | ✓ WIRED | Import 5, mount 98; page stays RSC. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| KW-07 | 22-01 | Inline opt-in keyword create on review grid (no auto-create) | ✓ SATISFIED | Truth 1 + import-review-table.tsx gate/control/tests. REQUIREMENTS.md:13/63 mark Complete. |
| KW-08 | 22-02, 22-03 | /categorias panel mining merchant_patterns → batch approve/discard | ✓ SATISFIED | Truths 2-3 + server actions + dialog/launcher + tests. REQUIREMENTS.md:14/64 mark Complete. |

No orphaned requirements: REQUIREMENTS.md maps only KW-07/KW-08 to Phase 22, both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TODO/FIXME/XXX/HACK/TBD/PLACEHOLDER in any of the 6 modified source files | ℹ️ Info | Clean. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Type safety across changeset | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| Phase-22 test suites green | `npx vitest run` (3 phase files) | 3 files / 51 tests passed | ✓ PASS |
| No migration / gen:types | `git diff --stat 1db2061..HEAD -- supabase/migrations/ src/types/database.types.ts` | empty | ✓ PASS |
| No package change | `git diff --stat 1db2061..HEAD -- package.json package-lock.json` | empty | ✓ PASS |
| import.ts / confirmImport untouched | `git diff --stat 1db2061..HEAD -- src/actions/import.ts` | empty | ✓ PASS |

### Human Verification Required

1. **Inline keyword persists to /categorias** — Hand-classify a review row (origin → manual), use "+ palavra-chave" → Salvar, then open /categorias and confirm the keyword is cadastrada under that category.
   - Expected: popover flips to "criada ✓"; keyword visible in /categorias (RLS-scoped).
   - Why human: addKeyword is mocked in tests; the live Supabase insert + appearance on a real upload is not automated.

2. **Batch panel mines real patterns and persists approvals** — On /categorias open "Sugerir palavras-chave", confirm candidates come from confirmed merchant_patterns with suggested category, approve a selection, confirm persistence; confirm already-covered descriptors are absent and discard has no side-effect.
   - Expected: candidates load; approve persists + toasts created/skipped; covered descriptors excluded; discard local-only.
   - Why human: get/approve actions are mocked in dialog tests; live candidate computation + batch insert need one human pass.

### Gaps Summary

No gaps. All four ROADMAP success criteria are implemented and wired, both requirement IDs (KW-07, KW-08) are satisfied, the no-migration/no-gen:types/no-package/`import.ts`-unmodified contract holds, `tsc` is clean, and all 51 phase-22 tests pass. Post-SUMMARY code-review fixes (WR-02 archived-category drop, IN-03 read-error surfacing, WR-01 cause-neutral skipped toast) are present in the committed code and do not regress any must-have.

The two human-verification items are NOT failures: the relevant server actions are present, owner-gated, RLS-scoped, and unit-tested with the real matcher — but the unit tests mock the Supabase boundary, so the live end-to-end persistence round-trip (inline keyword appearing in /categorias; batch approve persisting real candidates) is the one thing grep/tests cannot prove. Per the methodology these route to human verification, making the overall status `human_needed`.

---

_Verified: 2026-06-20T20:55:00Z_
_Verifier: Claude (gsd-verifier)_
