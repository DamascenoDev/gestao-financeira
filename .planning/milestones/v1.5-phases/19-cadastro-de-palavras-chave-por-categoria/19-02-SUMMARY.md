---
phase: 19-cadastro-de-palavras-chave-por-categoria
plan: 02
subsystem: category-keywords (UI layer)
tags: [nextjs, rsc, client-component, dialog, shadcn, base-ui, sonner, useTransition]
status: complete
requires:
  - addKeyword / removeKeyword + AddKeywordResult/ActionResult (Plan 19-01)
  - category_keywords Row type (database.types.ts, Plan 19-01)
  - categoria-form.tsx controlled-dialog skeleton (open/onOpenChange + useTransition + toast)
  - category-filter.tsx:106-122 removable-chip recipe
  - categorias/page.tsx txCountByCategory Map idiom
provides:
  - CategoryKeywordsDialog (src/components/category-keywords-dialog.tsx) — controlled CRUD dialog (chips + add form + Empty)
  - "Palavras-chave (N)" menu item + keywordsOpen state in CategoryRowActions
  - keywordsByCategory grouped fetch (Map<category_id, {id,keyword}[]>) in categorias/page.tsx
affects:
  - Phase 20 (the keyword chips become the input space for the descriptor_norm substring match)
tech-stack:
  added: []
  patterns:
    - "Third controlled-open dialog state mirroring editOpen/deleteOpen in a RowActions menu"
    - "Grouped RSC fetch into a Map by category_id (mirrors txCountByCategory), threaded as a prop"
    - "Enter-to-add via a real <form>; clear+refocus input on {ok:true}; React 19 ref-as-prop on the shadcn Input"
key-files:
  created:
    - src/components/category-keywords-dialog.tsx
    - src/components/category-keywords-dialog.test.tsx
  modified:
    - src/components/category-row-actions.tsx
    - src/app/(app)/categorias/page.tsx
decisions:
  - "Component test DELIVERED (not skipped): Base UI portal infra works in jsdom (precedent: receita-row-actions.test.tsx), so the 4 behaviors are covered green"
  - "Chip X disabled while isPending (light optimistic-disable per UI-SPEC §Loading state); no local optimistic list — server stays source of truth via revalidatePath"
  - "Input focus on open via autoFocus; clear+refocus on add success via a useRef on the Input (React 19 passes ref through ...props)"
metrics:
  duration_sec: 212
  completed: 2026-06-19
  tasks: 3
  files: 4
requirements: [KW-01]
---

# Phase 19 Plan 02: Superfície de UI das palavras-chave — Summary

A nova `CategoryKeywordsDialog` (Dialog controlado de CRUD: chips removíveis + form "Adicionar" com Enter-to-add + Empty state), acessível por um item de menu "Palavras-chave (N)" no `CategoryRowActions` (entre Editar e o destructive Excluir), alimentada por um fetch agrupado de `category_keywords` no RSC `/categorias` (Map por `category_id`, espelhando `txCountByCategory`). Persistência imediata por ação (sem save em lote), consumindo `addKeyword`/`removeKeyword` do Plan 19-01. Reuso total do base-nova navy+gold — zero tokens/componentes/registries novos; zero superfície de Phase 20. Entrega a parte visível de KW-01.

## What Was Built

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | CategoryKeywordsDialog — chips removíveis + add form + Empty | `a5ef674` | `src/components/category-keywords-dialog.tsx` |
| 2 | Wire menu "Palavras-chave (N)" + fetch agrupado no RSC | `9a29e50` | `src/components/category-row-actions.tsx`, `src/app/(app)/categorias/page.tsx` |
| 3 | Teste de componente do dialog (4 comportamentos) | `43391d0` | `src/components/category-keywords-dialog.test.tsx` |

### `CategoryKeywordsDialog` (`src/components/category-keywords-dialog.tsx`)
- `'use client'`; props `{ open, onOpenChange, category: {id,name}, keywords: {id,keyword}[] }`; sempre controlado (sem trigger inline).
- Anatomia: `DialogHeader` (título "Palavras-chave — {nome}" + descrição) → região de chips (ou `Empty` quando `keywords.length===0`) → `<form>` com `Field`/`Input` (maxLength=60, placeholder "Ex.: uber", `autoFocus`) + `Button type="submit"` "Adicionar" → `DialogFooter` com um único `DialogClose` "Fechar".
- Chips: `Badge variant="secondary" className="gap-1"` + botão `X` (`size-3`) muted com `aria-label="Remover palavra-chave {keyword}"` (recipe verbatim de `category-filter.tsx`, sem `CategoryDot`).
- `useTransition` + sonner: add → em `{ok:true}` `toast.success('Palavra-chave adicionada.')` + limpa+refoca o input (não fecha); `{duplicate:true}` → `toast.info('"{valor}" já está cadastrada nesta categoria.')`; `{error}` → `toast.error`. Validação local de vazio ("Informe uma palavra-chave.") via `FieldError`. Remove → `toast.success('Palavra-chave removida.')` / `toast.error`.
- Botão pendente: `{isPending ? 'Adicionando…' : 'Adicionar'}` + `disabled`; o X do chip também é `disabled={isPending}` (optimistic-disable leve, UI-SPEC §Loading state).

### `CategoryRowActions` (modificado)
- Import de `CategoryKeywordsDialog`; `keywords: {id,keyword}[]` adicionado ao tipo `Category`; estado `keywordsOpen` junto de `editOpen`/`deleteOpen`.
- Item de menu "Palavras-chave (N)" (ou "Palavras-chave" quando N=0) ENTRE "Editar" e o destructive "Excluir" — destructive segue por último.
- Render do `<CategoryKeywordsDialog open={keywordsOpen} …>` controlado junto dos outros dois dialogs.

### `categorias/page.tsx` (modificado, RSC)
- Após o fetch de `totals`: `supabase.from('category_keywords').select('id, category_id, keyword').order('keyword')` — RLS é o gate (sem `.eq('user_id', …)`, igual aos fetches de categories/totals).
- `keywordsByCategory = new Map<string, {id,keyword}[]>()` agrupado por `category_id` (pula `!row.category_id`), espelhando o idiom de `txCountByCategory`.
- Dentro de `rows.map`: `const keywords = keywordsByCategory.get(row.id) ?? []`, threaded como `keywords` no objeto `category` do `<CategoryRowActions>`. Sem join/view/segundo-count query (RESEARCH A3).

## Verification

- `npx tsc --noEmit` → **clean** (gate TS-estrito de todo o wiring de UI; rodado após cada task).
- `npx vitest run src/components/category-keywords-dialog.test.tsx` → **4/4 green** (chips+aria, Empty, add→addKeyword+success, remove→removeKeyword).
- `npx vitest run` (suite completa) → **844/844 green, 98 arquivos** (inclui o novo teste de componente + a suite de actions 19-01). O failure de seed-categories deferido no 19-01 já foi corrigido pelo commit `1009ee0` (11→12) — a suite está integralmente verde agora.

## Deviations from Plan

None — o plano executou exatamente como escrito.

**Nota sobre a Task 3 (opcional):** o plano marcava o teste de componente como opcional (gate fica na suite de actions 19-01 se a infra de portal exigisse setup ausente). A infra de Base UI portal em jsdom já funciona (precedente: `receita-row-actions.test.tsx` exercita um AlertDialog aberto), então o teste foi ENTREGUE e está verde — os 4 comportamentos de `<behavior>` estão cobertos. O gate de segurança de KW-01/KW-06 permanece, como planejado, na suite mockada de actions.

## Known Stubs

None. O dialog está totalmente fiado às actions reais (`addKeyword`/`removeKeyword`), aos primitivos shadcn já vendados e ao fetch agrupado real do RSC. Nenhum caminho de dado placeholder/vazio introduzido. Nenhuma superfície de Phase 20 (sem preview de match, contagem de transações casadas, `source='palavra-chave'` ou sugestão automática).

## Threat Flags

None. As fronteiras de confiança continuam idênticas ao threat register do plano: a UI só repassa args para `addKeyword`/`removeKeyword` (toda validação — uuid WR-06, owner getClaims, RLS, normalização — está no servidor, Plan 19-01); o fetch RSC de `category_keywords` é escopado pela RLS do caller (sem filtro `user_id` na app, T-19-05 mitigado pelo Postgres). Zero pacotes/registries novos (T-19-SC accept mantido).

## Self-Check: PASSED
- Files: `src/components/category-keywords-dialog.tsx`, `src/components/category-keywords-dialog.test.tsx`, `src/components/category-row-actions.tsx`, `src/app/(app)/categorias/page.tsx` — all present on disk.
- Commits: `a5ef674`, `9a29e50`, `43391d0` — all in git history.
