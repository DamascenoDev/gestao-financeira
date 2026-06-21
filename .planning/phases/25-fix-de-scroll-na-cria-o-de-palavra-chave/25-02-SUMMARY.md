---
phase: 25-fix-de-scroll-na-cria-o-de-palavra-chave
plan: 02
subsystem: ui
tags: [react, nextjs, import-review-grid, keyword-classification, client-state]

# Dependency graph
requires:
  - phase: 25-01
    provides: "addKeywordInline (Server Action sem revalidatePath) usada pelo caller inline"
provides:
  - "Export puro reclassifyRowsWithKeyword(rows, categoryId, normalizedKeyword): re-classifica a grid client-side via compileRule/matchKeyword"
  - "Caller inline troca addKeyword → addKeywordInline (sem revalidate, scroll preservado — UX-01/SC1)"
  - "Lift-state onKeywordPersisted threaded ImportReviewTable → cell → KeywordInlineSuggest, dispara setRows(reclassify…) ao vivo em sucesso (UX-02/SC4)"
affects: [import-review-table, keyword-classification, grid-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Função pura exportada para lógica de grid (espelha lowConfidenceFirst/confirmToastMessage) — testável sem render"
    - "Lift-state via callback threaded por 3 níveis para atualização client-side imutável sem refetch/remount"

key-files:
  created: []
  modified:
    - src/components/import-review-table.tsx
    - src/components/import-review-table.test.tsx

key-decisions:
  - "reclassifyRowsWithKeyword é pura (sem hooks/IO): no-op quando compileRule retorna null; guard duro origin==='manual' antes de qualquer match; casadas → category_id=categoryId + origin='palavra-chave', nunca atribui confidence"
  - "Re-classify dispara também em {duplicate} (A2/Open Question 1) — re-alinha a grid quando a keyword já existe; confirmado no UAT como comportamento desejado"
  - "Caminho inline nunca usa router.refresh()/revalidatePath — corta o scroll jump na raiz (UX-01)"

patterns-established:
  - "Pure grid transform export: lógica de re-classificação isolada como função pura para teste direto + reuso imutável em setRows"
  - "3-level lift-state callback (onKeywordPersisted, distinto de onKeywordCreated) para propagar persistência → re-classify ao vivo"

requirements-completed: [UX-01, UX-02]

# Metrics
duration: ~10min
completed: 2026-06-21
status: complete
---

# Phase 25 Plan 02: Live re-classify + caller inline sem scroll jump (UX-01/UX-02) Summary

**Criar palavra-chave inline na grid de importação agora preserva o scroll (caller via addKeywordInline, sem revalidate) e re-classifica ao vivo as outras linhas casando (pure reclassifyRowsWithKeyword via compileRule/matchKeyword), sem refresh, respeitando linhas manuais.**

## Performance

- **Duration:** ~10 min (Tasks 1-2 commit window 14:41–14:47, prior executor)
- **Started:** 2026-06-21T17:41:20Z
- **Completed:** 2026-06-21T17:50:00Z
- **Tasks:** 3 (2 código + 1 checkpoint human-verify aprovado)
- **Files modified:** 2

## Accomplishments
- `reclassifyRowsWithKeyword` exportada e pura: aplica a keyword nova em `category_id===null` OU `origin ∈ {memória, palavra-chave}`, NUNCA toca `origin==='manual'`, marca casadas com `origin:'palavra-chave'` sem confidence; keyword degenerada (`*`/`''`) → `compileRule` null → no-op (D-03/D-04/D-05).
- Caller inline trocado `addKeyword → addKeywordInline` (Plan 01): sem `revalidatePath` no path inline → scroll preservado (UX-01/SC1).
- Lift-state `onKeywordPersisted` threaded ImportReviewTable → cell → InlineReviewCategoryCell → KeywordInlineSuggest; disparado SÓ no sucesso (`{ok}`/`{duplicate}`), nunca em `'error' in r`; pai roda `setRows((prev) => reclassifyRowsWithKeyword(prev, categoryId, normalized))` → demais linhas atualizam ao vivo sem refresh (UX-02/SC4).
- UAT ao vivo (Task 3) aprovado pelo usuário: scroll preservado, re-classify ao vivo, manual intocado, `/categorias` reflete a keyword, e o caminho duplicate re-alinha a grid (A2).

## Task Commits

1. **Task 1: RED — failing reclassifyRowsWithKeyword pure-fn specs** - `aa37e8f` (test)
2. **Task 2: GREEN — export pure fn + lift-state + swap caller para addKeywordInline** - `e8e9d67` (feat)
3. **Task 3: UAT vivo — scroll preservado + re-classify ao vivo (checkpoint:human-verify)** - aprovado pelo usuário ("approved"), nada a implementar

_Pause-marker commit `6955ac0` (docs) registrou a pausa no checkpoint Task 3 — esperado._

## Files Created/Modified
- `src/components/import-review-table.tsx` - export puro `reclassifyRowsWithKeyword`; imports `compileRule`/`matchKeyword`; caller inline → `addKeywordInline`; handler de lift-state `onKeywordPersisted` (useCallback + setRows) threaded por 3 níveis + incluído nas deps do useMemo das colunas.
- `src/components/import-review-table.test.tsx` - novo `describe('reclassifyRowsWithKeyword', …)` cobrindo não-classificada/memória/palavra-chave sobrescrevem, manual preserva, provenance 'palavra-chave' sem confidence, glob casa, degenerada no-op, imutabilidade; testes de render KW-07 atualizados para `addKeywordInline`.

## Decisions Made
- Re-classify dispara também no ramo `{duplicate}` (A2/Open Question 1) para re-alinhar a grid quando a keyword já existe — confirmado no UAT.
- Função de re-classify mantida pura (sem hooks/IO) para teste direto sem render e reuso imutável em `setRows`.
- Nenhum `router.refresh()`/`revalidatePath` no caminho inline (reintroduziria o scroll jump).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Automated Verification (re-run at finalize)
- `npx vitest run src/components/import-review-table.test.tsx src/actions/category-keywords.test.ts` → **2 files / 78 tests passed**.
- `npx tsc --noEmit` → **exit 0, no errors**.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 25 plans 2/2 complete. UX-01 + UX-02 satisfeitos e human-verified ao vivo.
- Nenhum schema delta (`database.types.ts` inalterado); nada a fazer em deploy/migração.

---
*Phase: 25-fix-de-scroll-na-cria-o-de-palavra-chave*
*Completed: 2026-06-21*

## Self-Check: PASSED
- FOUND: src/components/import-review-table.tsx (modified, e8e9d67)
- FOUND: src/components/import-review-table.test.tsx (modified, aa37e8f + e8e9d67)
- FOUND commit: aa37e8f (RED)
- FOUND commit: e8e9d67 (GREEN)
- FOUND commit: 6955ac0 (pause-marker)
