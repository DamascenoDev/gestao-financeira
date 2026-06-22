---
phase: 27-registro-r-pido-abastecimento-parcelado
plan: 03
subsystem: ui
tags: [form, abastecimento, parcelado, manual-only, tabs, preview-display-only, carros]
requires:
  - "src/lib/schemas/abastecimento.ts (AbastecimentoInput expõe valorTotalCents?/parcelasTotal?, bounds 2–24 — 27-01)"
  - "src/components/money-input.tsx (MoneyInput + isValidMoney)"
  - "src/lib/money.ts (parseBRLToCents + formatCents)"
provides:
  - "AbastecimentoForm com aba 'Parcelado' (valor total + nº de parcelas + preview valor-por-parcela display-only)"
  - "prop manualOnly que esconde a aba 'Da fatura' e inicia o CostSource em 'manual' (reuso pela lista /carros — 27-04)"
  - "CostSource de 3 estados ('fatura' | 'manual' | 'parcelado') com clear XOR no onSourceChange"
  - "buildInput parcelado-aware (emite valorTotalCents/parcelasTotal no parcelado, undefined nos à-vista)"
affects:
  - "27-04 (lista /carros) consome o prop manualOnly para reusar o form sem buscar transações"
  - "Phase 28 (casamento por fatura) usa o modelo mental do preview ~total/N"
tech_stack:
  added: []
  patterns:
    - "preview display-only (valor÷N via formatCents) que NÃO entra no buildInput nem persiste — só renderiza com inputs válidos"
    - "prop booleano de modo (manualOnly) condicionando TabsList + initial source + re-seed do handleOpenChange"
    - "onSourceChange de 3 estados limpando as fontes inativas (XOR estrutural na UI espelhando o XOR do schema/DB)"
key_files:
  created: []
  modified:
    - src/components/abastecimento-form.tsx
decisions:
  - "CostSource ganhou o literal 'parcelado'; TabsList renderiza [Manual | Parcelado] quando manualOnly, [Da fatura | Manual | Parcelado] caso contrário."
  - "Helper parseParcelas valida inteiro no intervalo [2,24] espelhando os bounds do schema 27-01; o preview e o guard de submit reusam o mesmo critério."
  - "O preview valor-por-parcela é puramente display: computado de parseBRLToCents(valorTotal)÷N e exibido com formatCents, sem entrar no buildInput (D-08)."
metrics:
  duration: "~4 min (execução) + checkpoint human-verify"
  completed: "2026-06-21"
  tasks: 3
  files: 1
status: complete
---

# Phase 27 Plan 03: Form Parcelado tab + manual-only mode Summary

O `AbastecimentoForm` ganhou a terceira aba de custo **Parcelado** (valor total via `MoneyInput` + nº de parcelas via `Input` inteiro + preview "valor por parcela" ao vivo, display-only) e um prop **`manualOnly`** que esconde a aba "Da fatura" e inicia o `CostSource` em `'manual'` — exatamente o que a lista `/carros` (27-04) precisa para reusar o form sem buscar `transacoes`. O `CostSource` passou a ter 3 estados com clear XOR no `onSourceChange`, e o `buildInput` emite `valorTotalCents`/`parcelasTotal` no parcelado e `undefined` nos caminhos à-vista (preservando o XOR de 27-01). O detalhe `/carros/[id]` (que não passa o prop) preserva as 3 abas e o comportamento atual.

## What Was Built

- **`CostSource` de 3 estados:** `'fatura' | 'manual'` → `'fatura' | 'manual' | 'parcelado'`.
- **Prop `manualOnly`:** quando ligado, a `initialSource` + o re-seed do `handleOpenChange` iniciam em `'manual'` (sem derivar de `edit?.transactionId`), e o segmento "Da fatura" + o ramo `source === 'fatura'` (TransacaoPicker) não renderizam. Sem o prop → 3 abas intactas.
- **Aba "Parcelado" na TabsList:** condicional — `[Manual | Parcelado]` em manual-only; `[Da fatura | Manual | Parcelado]` caso contrário.
- **States controlados do parcelado:** valor total (string pt-BR para o MoneyInput) + nº de parcelas (string para o Input inteiro), incluídos no re-seed do `handleOpenChange` (limpos no open).
- **`onSourceChange` de 3 estados:** ao entrar em parcelado limpa `transactionId` E `amount`; ao sair de parcelado limpa os campos de parcelamento; mantém o clear de fatura/manual.
- **Inputs do parcelado:** valor total via `MoneyInput` (reusando `isValidMoney`/`parseBRLToCents` como o caminho manual) + nº de parcelas via `Input` (inputMode numeric).
- **Preview "valor por parcela" display-only:** computa `parseBRLToCents(valorTotal) ÷ N` e exibe com `formatCents`; só aparece quando o valor total é válido (`isValidMoney`) E o nº de parcelas é inteiro no intervalo válido — some com input inválido/vazio. Nunca entra no `buildInput`, nunca persiste (D-08).
- **`parseParcelas` helper:** valida inteiro em `[2,24]` (espelha o schema 27-01), reusado pelo preview e pelo guard de submit.
- **`buildInput` parcelado-aware:** no parcelado emite `valorTotalCents` (parseBRLToCents quando válido, senão undefined) + `parcelasTotal` (parse inteiro quando válido) com `transactionId`/`amountCents` undefined; nos demais estados `valorTotalCents`/`parcelasTotal` undefined (preserva o XOR de 27-01).
- **Guard de pre-submit do `onSubmit`:** no caminho parcelado, se o valor total estiver presente mas inválido, seta erro antes do `safeParse` (espelha o guard manual). O `abastecimentoSchema.safeParse(buildInput())` segue como guard autoritativo.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | CostSource 3-state + prop manualOnly + aba Parcelado + clear de fonte (D-01/D-02/D-04/D-05) | 0e53e66 | src/components/abastecimento-form.tsx |
| 2 | Inputs do parcelado + preview valor-por-parcela display-only + buildInput/onSubmit parcelado-aware (D-06/D-08/D-09) | e57f544 | src/components/abastecimento-form.tsx |
| 3 | Human-verify — aba Parcelado (preview ao vivo + bounds 2–24) + modo manual-only | (checkpoint) | — |

## Verification

- `npx tsc --noEmit` → limpo (exit 0).
- `npm test -- src/lib/schemas/abastecimento.test.ts` → 26 passed (o input parcelado emitido pelo buildInput é aceito).
- A aba Parcelado renderiza valor total + nº parcelas; o preview "valor por parcela" aparece só com inputs válidos e some quando inválidos/vazios.
- Com `manualOnly` ligado, a aba "Da fatura" não renderiza e o CostSource inicia em `'manual'`.
- O detalhe `/carros/[id]` (sem o prop) mantém as 3 abas e o comportamento atual.

## Human-Verify Checkpoint (Task 3)

**Status: APROVADO pelo usuário em 2026-06-21.**

O usuário rodou o dev server e confirmou ao vivo todos os critérios do checkpoint:
1. Três abas de custo presentes ("Da fatura", "Manual", "Parcelado").
2. No parcelado, o preview "valor por parcela" aparece ao vivo e correto (ex.: 600,00 ÷ 6 → R$ 100,00) e some ao apagar valor ou nº de parcelas.
3. A faixa 2–24 é validada — nº de parcelas 1 e 25 fazem o submit falhar.
4. Salvar um parcelado válido (odômetro/litros + valor total + parcelas) → toast de sucesso e o abastecimento aparece no histórico do carro.

Resposta do usuário: **"aprovado"**. Nenhum problema reportado, nenhuma mudança de código necessária pós-verificação.

## Threat Mitigations Verified

- **T-27-09 (Tampering — preview):** o preview valor-por-parcela é display-only (formatCents sobre valor÷N); não entra no buildInput nem persiste (D-08). Sem vetor de gravação de dado derivado.
- **T-27-10 (Tampering — buildInput parcelado):** buildInput emite `transactionId`/`amountCents` undefined no parcelado e `valorTotalCents`/`parcelasTotal` undefined no à-vista → exatamente um estado carregado; `abastecimentoSchema.safeParse` (27-01) é o guard autoritativo.
- **T-27-11 (Information Disclosure — manualOnly):** manual-only esconde "Da fatura" e não requer `transacoes` → a page `/carros` (27-04) não passa a buscar lançamentos não-vinculados (D-01).
- **T-27-12 (supply-chain):** nenhum pacote novo (MoneyInput/formatCents/Tabs já presentes).

## Deviations from Plan

None — plan executado exatamente como escrito. Ambas as tasks de código passaram com tsc/lint/test limpos; o checkpoint foi aprovado sem gaps.

## Self-Check: PASSED

- FOUND: src/components/abastecimento-form.tsx
- FOUND commit: 0e53e66
- FOUND commit: e57f544
