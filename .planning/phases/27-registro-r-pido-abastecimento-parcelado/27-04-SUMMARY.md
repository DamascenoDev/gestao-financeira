---
phase: 27-registro-r-pido-abastecimento-parcelado
plan: 04
subsystem: ui
tags: [carros, carro-card, abastecimento, registro-rapido, manual-only, rsc]
requires:
  - "src/components/abastecimento-form.tsx (prop manualOnly + carroId + combustivelPadrao + transacoes — 27-03)"
  - "src/components/carro-card.tsx (CarroCardData já expõe id + combustivelPadrao — Phase 11)"
  - "src/actions/abastecimentos.ts (createAbastecimento IDOR-safe + revalidatePath('/carros'))"
provides:
  - "Botão 'Novo abastecimento' visível na face de cada CarroCard na lista /carros (CAR-07, D-03)"
  - "AbastecimentoForm hospedado manual-only (Manual | Parcelado, sem 'Da fatura') reusando carroId + combustivelPadrao (D-01/D-02)"
  - "Lista /carros confirmada SEM fetch de lançamentos não-vinculados (D-01) — page lê só carros + v_carro_resumo"
affects:
  - "Phase 28 (vínculo por valor) adiciona o picker de lançamentos só no detalhe /carros/[id], não na lista"
tech_stack:
  added: []
  patterns:
    - "form compartilhado hospedado uncontrolled na face do card com trigger custom (outline + FuelIcon), reusando a mesma server action do detalhe"
    - "manual-only reuse: transacoes={[]} (o branch manual-only nunca renderiza o picker) mantém a RSC da lista leve"
key_files:
  created: []
  modified:
    - src/components/carro-card.tsx
    - src/app/(app)/carros/page.tsx
decisions:
  - "Trigger custom outline + FuelIcon (size sm, w-full) abaixo da faixa de KPIs dl, dentro do CardContent — visível na face, NÃO no DropdownMenu (D-03); o menu ⋯ segue só Editar/Arquivar."
  - "transacoes={[]} passado ao form: o modo manual-only nunca renderiza o TransacaoPicker, então a lista não precisa (e deliberadamente não faz) o fetch de lançamentos não-vinculados (D-01)."
  - "page /carros: Task 2 foi asserção de não-mudança — id + combustivel_padrao já eram selecionados/mapeados; só um comentário JSDoc foi adicionado documentando a omissão deliberada do fetch de lançamentos (verify grep retorna 0)."
checkpoint:
  type: human-verify
  gate: blocking
  result: approved
  approved_by: user
  approved_on: "2026-06-22"
metrics:
  duration: "~execução inline (Agent/Bash classifier outage) + checkpoint human-verify"
  completed: "2026-06-22"
  tasks: 3
  files: 2
status: complete
---

# Phase 27 Plan 04: Registro rápido pela lista /carros (host form manual-only no CarroCard) Summary

## What was built

`CarroCard` (`src/components/carro-card.tsx`) passou a hospedar o `AbastecimentoForm`
em modo **manual-only** na FACE do card, com um botão **"Novo abastecimento"** visível
(trigger custom: `Button` outline, `size="sm"`, `w-full`, com `FuelIcon`) renderizado
abaixo da faixa de KPIs `dl`, dentro do `CardContent`. O botão NÃO foi para o
`DropdownMenu` — o menu ⋯ segue só com Editar/Arquivar (D-03). O form recebe
`carroId={carro.id}`, `combustivelPadrao={carro.combustivelPadrao}` e `transacoes={[]}`
(o branch manual-only nunca renderiza o `TransacaoPicker`).

A page `/carros` (`src/app/(app)/carros/page.tsx`) foi confirmada **sem** fetch de
lançamentos não-vinculados (D-01): a query L46-50 já seleciona `id` + `combustivel_padrao`,
o map os popula em `CarroCardData` — nenhuma nova query. Adicionado um comentário JSDoc
documentando a omissão deliberada (o vínculo fatura↔abastecimento, que precisaria do
picker, é a Phase 28, escopo do detalhe).

O registro pela lista reusa `createAbastecimento` (a MESMA action do detalhe):
`assertOwnedCarro` re-deriva posse antes de qualquer write (IDOR-safe, T-27-13), e
`revalidatePath('/carros')` já existente faz o novo registro aparecer sem fetch extra.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Host AbastecimentoForm manual-only na face do CarroCard + botão "Novo abastecimento" (D-03/D-01) | 0e08daf |
| 2 | Confirmar /carros NÃO busca lançamentos + comentário JSDoc (D-01) | b68afd0 |
| 3 | Human-verify checkpoint (botão na face + form manual-only + registro ponta-a-ponta) — APROVADO pelo usuário | (sem commit de código) |

## Verification

- `npx tsc --noEmit` → exit 0 (limpo).
- `npx eslint src/components/carro-card.tsx "src/app/(app)/carros/page.tsx"` → exit 0.
- `grep -v '^[[:space:]]*//' 'src/app/(app)/carros/page.tsx' | grep -c 'transacoes'` → 0 (a lista não busca lançamentos).
- Checkpoint human-verify (`gate=blocking`): usuário aprovou ao vivo em 2026-06-22 — botão "Novo abastecimento" visível na face de cada card, form abre manual-only (sem "Da fatura"), registro à-vista e parcelado pela lista persistem e aparecem no histórico, lista segue leve.

## Notes / deviations

- **Execução inline (não via gsd-executor):** uma indisponibilidade prolongada do classificador de auto-mode do Opus 4.8 (claude-opus-4-8[1m] "temporarily unavailable") bloqueou o spawn de `Agent` e, depois, chamadas `Bash`. O orquestrador caiu para o caminho de execução inline sancionado (runtime_compatibility) — este é o ÚLTIMO plano da fase, modo sequencial, escopo pequeno (2 arquivos). Commits atômicos, hooks e verificação preservados.
- Task 2 foi uma asserção de não-mudança (a page já fornecia tudo) + um comentário; nenhuma query nova foi adicionada.

## Self-Check: PASSED
