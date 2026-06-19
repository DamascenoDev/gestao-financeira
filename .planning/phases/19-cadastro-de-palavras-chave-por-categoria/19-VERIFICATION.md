---
phase: 19-cadastro-de-palavras-chave-por-categoria
verified: 2026-06-19T16:40:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: # No previous VERIFICATION.md existed
deploy_followups:
  - "PROD `supabase db push` of migration 0036 is the owner's deploy action — NOT a phase-19 gate. KW-01/KW-06 pass entirely on local/mocked verification."
---

# Phase 19: Cadastro de palavras-chave por categoria — Verification Report

**Phase Goal:** O usuário consegue manter, na tela `/categorias`, a lista de palavras-chave de cada categoria — adicionar e remover keywords manualmente — com os dados isolados por usuário (RLS).
**Verified:** 2026-06-19T16:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Em `/categorias`, adicionar uma palavra-chave persiste e ela aparece na lista (SC1, KW-01) | ✓ VERIFIED | Form `onSubmit` → `addKeyword(category.id, raw)` (`category-keywords-dialog.tsx:94`); action insere `{user_id, category_id, keyword normalizado}` + `revalidatePath('/categorias')` (`category-keywords.ts:72-85`); RSC re-fetch renderiza chips (`page.tsx:60-74,128`). Teste de ação asserta payload+revalidate; teste de componente asserta `addKeyword('cat-1','ifood')` no submit. tsc clean; 20/20 testes verdes. |
| 2 | Remover uma palavra-chave a faz sumir da lista (SC2, KW-01) | ✓ VERIFIED | X do chip → `removeKeyword(kw.id)` (`category-keywords-dialog.tsx:71`); action `delete().eq('id', keywordId)` + revalidate (`category-keywords.ts:99-106`). Teste de ação asserta `filters` contém `['id', KW_ID]` + revalidate; teste de componente asserta `removeKeyword('kw-9')` no clique do X. |
| 3 | As palavras-chave são isoladas por usuário via RLS (SC3, KW-06) | ✓ VERIFIED | Migration 0036: policy "own category_keywords" `for all to authenticated using ((select auth.uid())=user_id) with check (...)` (`0036:31-35`); grants (`0036:28-29`); FK `user_id`/`category_id ON DELETE CASCADE`; `unique(user_id,category_id,keyword)`. Action seta `user_id` SÓ de `getClaims().claims.sub` (`category-keywords.ts:60,73`) — teste `owner` asserta `user_id==='user-1'`. WR-06 `idSchema.uuid()` guarda `categoryId`/`keywordId` antes de qualquer `.eq` (`category-keywords.ts:38,45,90`). Estrutural + mocked-suite é o gate acordado (live cross-user test = opcional/env-flaky). |
| 4 | addKeyword guarda keyword NORMALIZADA (normalizeDescriptor, chamada uma vez) com owner + revalidate | ✓ VERIFIED | `normalizeDescriptor(parsed.data)` chamado uma vez (`category-keywords.ts:55`); teste `normalizes the input via the real normalizeDescriptor` asserta `payload.keyword === normalizeDescriptor(raw)` e `!== raw`. |
| 5 | Duplicata é no-op amigável `{duplicate:true}` (pré-check maybeSingle + backstop 23505); vazio/normaliza-''/>60 rejeitados sem inserir | ✓ VERIFIED | Pré-check `maybeSingle` → `{duplicate:true}` (`category-keywords.ts:64-70`); backstop `error.code==='23505'` (`:80`). Empty/whitespace/`'***'`(→'')/61-char todos retornam `{error}` sem insert — 5 testes verdes (`category-keywords.test.ts:139-176`). |
| 6 | Erros de DB nunca vazam crus — sempre mensagem pt-BR | ✓ VERIFIED | insert→'Não foi possível salvar a palavra-chave.' (`:81`); delete→'Não foi possível remover a palavra-chave.' (`:103`); testes 23502/delete-error confirmam mapeamento amigável. |
| 7 | `database.types.ts` contém bloco `category_keywords` (Row/Insert/Update) e `npx tsc --noEmit` passa limpo | ✓ VERIFIED | Bloco em `database.types.ts:241` (Row/Insert/Update + FK). `npx tsc --noEmit` → exit 0. Migration 0036 aplicada ao stack LOCAL (`to_regclass('public.category_keywords')` retorna `category_keywords`). |
| 8 | UI: item de menu "Palavras-chave (N)" entre Editar e Excluir; Dialog com chips removíveis + Empty + form Enter-to-add; fetch agrupado no RSC sem `.eq('user_id')` | ✓ VERIFIED | Menu item entre Editar/destructive Excluir, label `(N)` quando >0 (`category-row-actions.tsx:65-69`); dialog renderiza chips/Empty/form (`category-keywords-dialog.tsx`); RSC fetch agrupado em Map sem filtro user_id (`page.tsx:60-74`). DialogFooter só `DialogClose "Fechar"` (sem Salvar); X muted sem alert-dialog. tsc + 4 testes de componente verdes. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/0036_category_keywords.sql` | Tabela + índices + RLS "own" + grants + unique | ✓ VERIFIED | Tabela + 2 índices + policy using/with-check + grants + unique(user_id,category_id,keyword) + FK cascade; sem handle_new_user/seed; keyword text puro. Aplicada ao LOCAL. |
| `src/lib/schemas/category-keyword.ts` | keywordSchema (trim/min1/max60) + KeywordInput | ✓ VERIFIED | Exporta `keywordSchema` + `KeywordInput`; mensagens pt-BR. |
| `src/actions/category-keywords.ts` | addKeyword/removeKeyword + tipos | ✓ VERIFIED | Exporta `addKeyword`, `removeKeyword`, `AddKeywordResult`, `ActionResult`; `'use server'`. Wired a normalize + schema + supabase. |
| `src/actions/category-keywords.test.ts` | Testes mockados | ✓ VERIFIED | 16 testes (todos os 11+ comportamentos KW-01/KW-06); normalizeDescriptor REAL. |
| `src/types/database.types.ts` | Bloco category_keywords | ✓ VERIFIED | Bloco presente em :241. |
| `src/components/category-keywords-dialog.tsx` | Dialog CRUD (chips + input + Empty) | ✓ VERIFIED | Exporta `CategoryKeywordsDialog`; chips removíveis + Empty + form. |
| `src/components/category-row-actions.tsx` | Menu item + keywordsOpen + render dialog | ✓ VERIFIED | Import + tipo keywords + estado keywordsOpen + item de menu + render controlado. |
| `src/app/(app)/categorias/page.tsx` | Fetch agrupado + thread keywords | ✓ VERIFIED | `keywordsByCategory` Map + `const keywords` + prop threaded. |
| `src/components/category-keywords-dialog.test.tsx` | Teste de componente (opcional) | ✓ VERIFIED | Entregue (não pulado); 4 comportamentos verdes. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| category-keywords.ts | lib/normalize.ts | `normalizeDescriptor` antes do insert | ✓ WIRED | `:55` chamada única. |
| category-keywords.ts | migration 0036 | `from('category_keywords')` insert/select/delete | ✓ WIRED | `:64,72,100`. |
| category-keywords.ts | schemas/category-keyword.ts | `keywordSchema.safeParse` | ✓ WIRED | `:51`. |
| page.tsx | category-row-actions.tsx | `keywords={keywords}` no objeto category | ✓ WIRED | `page.tsx:149`. |
| category-row-actions.tsx | category-keywords-dialog.tsx | `<CategoryKeywordsDialog open={keywordsOpen} …>` | ✓ WIRED | `:89-94`. |
| category-keywords-dialog.tsx | category-keywords.ts | `addKeyword`/`removeKeyword` em useTransition | ✓ WIRED | `:71,94`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| categorias/page.tsx | `keywordsByCategory` | `supabase.from('category_keywords').select(...)` (tabela real, aplicada ao LOCAL) | Yes (query real, sem fallback estático) | ✓ FLOWING |
| category-keywords-dialog.tsx | `keywords` prop | Threaded do RSC via `category.keywords` | Yes (não hardcoded `[]` no call site; `keywordsByCategory.get(row.id) ?? []`) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Keyword tabela existe no stack LOCAL | `psql to_regclass('public.category_keywords')` | `category_keywords` | ✓ PASS |
| TS-estrito limpo | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Suite de ações + componente | `npx vitest run category-keywords.test.ts category-keywords-dialog.test.tsx` | 20/20 passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| KW-01 | 19-01, 19-02 | Usuário adiciona/remove palavras-chave numa categoria em `/categorias` (cadastro manual, editável) | ✓ SATISFIED | Truths 1,2,4,5,6,8 — actions + dialog + RSC fetch wired e testados. |
| KW-06 | 19-01 | Regras de palavra-chave escopadas por `user_id` + RLS (multi-user-ready) | ✓ SATISFIED | Truth 3 — policy "own" using+with-check, owner de getClaims, WR-06 guard. |

No orphaned requirements: REQUIREMENTS.md maps exactly KW-01 + KW-06 to Phase 19; both claimed by the plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| category-keywords-dialog.tsx | 160 | `placeholder="Ex.: uber"` | ℹ️ Info | Legitimate HTML `<Input placeholder>` attribute — not a stub. No action needed. |

No TBD/FIXME/XXX/TODO/HACK debt markers. No empty-data stubs, no `return null`/`[]` stub paths, no `console.log`-only handlers.

### Human Verification Required

None. Both requirements are code + locally verifiable; the structural RLS policy SQL + the owner/WR-06 mocked assertions are the agreed gate for KW-06 (the live cross-user RLS test is optional/env-flaky and not a phase gate).

### Deploy Follow-Up (non-gate)

The PROD `supabase db push` of migration 0036 is the owner's manual deploy action — explicitly NOT a Phase-19 verification gate. KW-01/KW-06 pass entirely on local/mocked verification. Migration 0036 is applied to the LOCAL stack and `database.types.ts` is regenerated/committed.

### Gaps Summary

No gaps. All 8 must-have truths are verified in the codebase with behavioral evidence (tsc clean, 20/20 targeted tests green, table present locally). End-to-end wiring confirmed: dialog form/X → actions → `category_keywords` table (real DB) → `revalidatePath` → RSC grouped fetch → chips. RLS isolation (KW-06) enforced structurally (policy using+with-check) and at the action layer (user_id from getClaims only + WR-06 uuid guard), proven by the mocked owner assertion. The previously deferred seed-categories count drift (11→12) was fixed in commit `1009ee0`, so the full suite is reported green.

---

_Verified: 2026-06-19T16:40:00Z_
_Verifier: Claude (gsd-verifier)_
