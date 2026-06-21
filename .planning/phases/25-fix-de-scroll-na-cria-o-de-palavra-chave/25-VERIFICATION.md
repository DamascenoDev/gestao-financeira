---
phase: 25-fix-de-scroll-na-cria-o-de-palavra-chave
verified: 2026-06-21T18:25:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 25: Fix de scroll na criação de palavra-chave — Verification Report

**Phase Goal:** Criar uma palavra-chave inline na grid de revisão de importação (`/importar/[id]`) deixa de jogar o scroll da página pro topo (escopar/remover o `revalidatePath('/categorias')` cross-page de `addKeyword` sem quebrar o refresh legítimo da página `/categorias`); + ao criar a keyword inline, re-classificar ao vivo as outras linhas da grid client-side (sem refresh, reusando `compileRule`/`matchKeyword`) — aplicando a não-classificadas e sobrescrevendo memória/IA, nunca tocando `origin === 'manual'`.
**Verified:** 2026-06-21T18:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                      | Status     | Evidence |
| --- | -------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| 1   | `addKeywordInline` persiste a keyword (mesmas 4 guards + dup + insert) SEM `revalidatePath`               | ✓ VERIFIED | `category-keywords.ts:126-131` delega a `insertKeyword` (L51-102, sem `revalidatePath`); 4 guards na ordem L55/62/67/71 |
| 2   | `addKeyword` continua chamando `revalidatePath('/categorias')` no sucesso (SC3 inalterado)                | ✓ VERIFIED | `category-keywords.ts:110-117` — `if ('ok' in result) revalidatePath(CATEGORIAS_PATH)` |
| 3   | Ambas as actions retornam a mesma union `AddKeywordResult`                                                | ✓ VERIFIED | `AddKeywordResult` L32; ambas tipadas `Promise<AddKeywordResult>` (L113, L128) |
| 4   | Caller inline usa `addKeywordInline` → criar keyword inline NÃO reseta o scroll (UX-01/SC1)               | ✓ VERIFIED | `import-review-table.tsx:1230` chama `addKeywordInline`; zero chamadas `router.refresh`/`revalidatePath` no path inline (só comentários) |
| 5   | Outras linhas casando re-classificadas ao vivo client-side sem refresh (UX-02/SC4)                        | ✓ VERIFIED | `reclassifyRowsWithKeyword` (L322-339) via `compileRule`/`matchKeyword`; `reclassifyWithKeyword` → `setRows` (L417-424); disparado em `onSubmit` L1246 |
| 6   | Re-classify aplica em `category_id===null` + sobrescreve memória/palavra-chave; NUNCA toca `manual` (SC5) | ✓ VERIFIED | `import-review-table.tsx:330` guard duro `if (r.origin === 'manual') return r` ANTES do match; alvo L331-334 |
| 7   | Linhas recém-casadas recebem `origin==='palavra-chave'` e nenhum `confidence`                             | ✓ VERIFIED | `import-review-table.tsx:337` — `{...r, category_id, origin: 'palavra-chave' as const}`; `confidence` nunca atribuído; `suggestion` intacto |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/actions/category-keywords.ts` | Helper privado `insertKeyword` + export `addKeywordInline`; `addKeyword` preservado | ✓ VERIFIED | `insertKeyword` não-exportado (L51), sem `revalidatePath`; `addKeywordInline` exportado (L126); `addKeyword` preservado (L110) |
| `src/actions/category-keywords.test.ts` | Asserts: inline NÃO revalida + paridade; addKeyword ainda revalida | ✓ VERIFIED | 21 referências a `addKeywordInline`; describe block com sucesso/contraste/guards/dup/23505 |
| `src/components/import-review-table.tsx` | Export `reclassifyRowsWithKeyword` + lift-state + swap caller | ✓ VERIFIED | `reclassifyRowsWithKeyword` exportada (L322); `onKeywordPersisted` threaded 3 níveis (L633/929/1031/1127); caller swap L1230 |
| `src/components/import-review-table.test.tsx` | Testes da função pura | ✓ VERIFIED | `describe('reclassifyRowsWithKeyword')` L593 com 10 casos (unclassified/memória/palavra-chave/manual/no-match/provenance/glob/degenerate/empty/imutabilidade) |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `addKeyword` | `insertKeyword` | delega + `revalidatePath` no `{ok}` | ✓ WIRED (L114-115) |
| `addKeywordInline` | `insertKeyword` | delega SEM revalidate | ✓ WIRED (L130) |
| `KeywordInlineSuggest.onSubmit` | `addKeywordInline` | swap do caller | ✓ WIRED (L1230) |
| `KeywordInlineSuggest` (ramo ok/duplicate) | `setRows` | callback pai → `reclassifyRowsWithKeyword` | ✓ WIRED (onPersisted L1246 → reclassifyWithKeyword L417-424); só sucesso, nunca `'error' in r` |
| `reclassifyRowsWithKeyword` | `compileRule`/`matchKeyword` | matcher puro client-safe | ✓ WIRED (L327, L336) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase test suites | `npx vitest run import-review-table.test.tsx category-keywords.test.ts` | 2 files / 78 tests passed | ✓ PASS |
| Type safety | `npx tsc --noEmit` | exit 0, no errors | ✓ PASS |
| RED/GREEN commits exist | `git cat-file -t 543a229 37cdfa5 aa37e8f e8e9d67` | all 4 present | ✓ PASS |

State transition truths (5, 6, 7) are exercised by the pure-function tests (`reclassifyRowsWithKeyword` cases: override/preserve-manual/provenance/immutability) — behavioral evidence present, so VERIFIED rather than PRESENT_BEHAVIOR_UNVERIFIED. The runtime Router-Cache scroll behavior (UX-01) that jsdom cannot reproduce was human-verified live on 2026-06-21 (Plan 25-02 Task 3 checkpoint, user "approved").

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| UX-01 | 25-01, 25-02 | Criar keyword inline preserva scroll | ✓ SATISFIED | `addKeywordInline` sem revalidate + caller swap; REQUIREMENTS.md marked `[x]` Complete; human-verified live |
| UX-02 | 25-02 | Re-classificação ao vivo da grid, nunca `manual` | ✓ SATISFIED | `reclassifyRowsWithKeyword` + lift-state; REQUIREMENTS.md marked `[x]` Complete; human-verified live |

No orphaned requirements: REQUIREMENTS.md maps only UX-01/UX-02 to Phase 25, both claimed by the plans.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX` debt markers in modified files. All `revalidatePath` references in the component are explanatory comments, not calls. No `router.refresh()` in the inline path.

### Human Verification Required

None outstanding. Plan 25-02 Task 3 (browser UAT) already run and approved by the user on 2026-06-21: scroll preserved, live re-classify, manual untouched, `/categorias` reflects the keyword, duplicate path re-aligns.

### Gaps Summary

No gaps. Both plans implemented exactly as specified. Server-side root-cause fix (`addKeywordInline` via shared `insertKeyword`, no `revalidatePath`) and client-side live re-classify (`reclassifyRowsWithKeyword` via `compileRule`/`matchKeyword`, manual-preserving) are present, substantive, wired, and covered by 78 passing tests + tsc clean. Runtime behavior human-verified. Phase goal achieved.

---

_Verified: 2026-06-21T18:25:00Z_
_Verifier: Claude (gsd-verifier)_
