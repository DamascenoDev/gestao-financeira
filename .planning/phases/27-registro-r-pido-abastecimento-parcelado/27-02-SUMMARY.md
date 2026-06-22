---
phase: 27-registro-r-pido-abastecimento-parcelado
plan: 02
subsystem: actions
tags: [server-action, abastecimento, parcelado, idor, double-count, defense-in-depth]
requires:
  - "src/lib/schemas/abastecimento.ts (AbastecimentoInput expõe valorTotalCents?/parcelasTotal? — 27-01)"
  - "supabase/migrations/0039_abastecimento_parcelado.sql (abastecimentos_cost_xor CHECK)"
provides:
  - "abastecimentoWriteFields parcelado-aware: 3 estados de custo materializados no write"
  - "createAbastecimento persiste um parcelado IDOR-safe e sem double-count"
affects:
  - "27-03 (form) e 27-04 envia parcelado pela mesma action"
tech_stack:
  added: []
  patterns:
    - "write por estado de custo (single object shape, number|null em toda coluna de custo) espelhando um CHECK do DB"
key_files:
  created: []
  modified:
    - src/actions/abastecimentos.ts
    - src/actions/abastecimentos.test.ts
decisions:
  - "Discrição C: à-vista grava parcelas_total = null (o CHECK 0039 trata null-ou-1 como não-parcelado). Documentado no comentário do helper."
  - "Shape único do retorno (number|null em parcelas_total/valor_total_cents/transaction_id/amount_cents) em vez de branches que retornam literais null incompatíveis — necessário para o overload de insert/update do Supabase type-checar idêntico nos dois estados (Rule 3 — type error de branch-union resolvido)."
metrics:
  duration: "~3 min"
  completed: "2026-06-21"
  tasks: 2
  files: 2
status: complete
---

# Phase 27 Plan 02: abastecimentoWriteFields parcelado-aware Summary

`abastecimentoWriteFields` reescrito para materializar no write os **3 estados de custo** (à-vista por fatura | à-vista manual | parcelado) do `AbastecimentoInput` de 27-01. Um parcelado grava `parcelas_total` (>= 2) + `valor_total_cents` (centavos) com `transaction_id` E `amount_cents` ambos NULL — custo contado uma única vez, IDOR-safe pelo `assertOwnedCarro` já existente, sem disparar o pre-check de tx 1:1. Via TDD RED→GREEN.

## What Was Built

- **`abastecimentoWriteFields` por estado:** detecção `parcelasTotal !== undefined && parcelasTotal > 1` (mesmo critério do schema 27-01).
  - PARCELADO → `parcelas_total = input.parcelasTotal`, `valor_total_cents = input.valorTotalCents`, `transaction_id = null`, `amount_cents = null`.
  - À-VISTA → `parcelas_total = null`, `valor_total_cents = null`, cost XOR (`transaction_id`/`amount_cents`) inalterado.
- **`createAbastecimento`/`updateAbastecimento` intactos além da chamada ao helper:** o gate `assertOwnedCarro` (L85) cobre o parcelado de graça (mesma action), e o pre-check de tx 1:1 (L95-109) só roda com `transactionId` — o parcelado pula naturalmente.
- **Comentário-doutrina do helper** documenta os 3 estados + a convenção à-vista (`parcelas_total` null = não-parcelado, espelhando o `0039`).
- **Testes:** fixture `parceladoInput` + describe `createAbastecimento — parcelado` (write payload, ausência de carro_id sync / select probe em transactions, gate de posse com carroId forjado) + asserções de não-regressão `valor_total_cents: null` nos dois caminhos à-vista.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | RED — testes do write parcelado + não-regressão à-vista | e7d6f07 | src/actions/abastecimentos.test.ts |
| 2 | GREEN — abastecimentoWriteFields parcelado-aware | 09537be | src/actions/abastecimentos.ts |

## Verification

- `npm test -- src/actions/abastecimentos.test.ts` → 20 passed (3 novos parcelado + 17 existentes; os 2 à-vista agora asseguram `valor_total_cents: null`).
- `npx tsc --noEmit` → limpo (exit 0).
- Insert parcelado: `parcelas_total: 3`, `valor_total_cents: 60000`, `transaction_id: null`, `amount_cents: null` (sem double-count).
- Parcelado NÃO faz update em transactions nem select-probe de link 1:1 (sem `transactionId`).
- `assertOwnedCarro` rejeita parcelado com carroId forjado (`carrosSelect` vazio) → `Carro inválido.` sem nenhum insert.

## Threat Mitigations Verified

- **T-27-05 (IDOR):** parcelado usa a mesma action; `assertOwnedCarro` re-deriva posse antes do insert — carroId forjado escreve nada (teste de teto verde).
- **T-27-06 (double-count):** `transaction_id`/`amount_cents` ambos NULL no write parcelado; pre-check 1:1 não roda sem `transactionId`.
- **T-27-07 (estado misto):** o write nunca mistura custo à-vista com `valor_total_cents`; CHECK `abastecimentos_cost_xor` do `0039` é o guard final (defense-in-depth).
- **T-27-08 (supply-chain):** nenhum pacote novo.

## TDD Gate Compliance

- RED gate: `test(27-02)` commit `e7d6f07` — 3 testes falham contra o helper antigo.
- GREEN gate: `feat(27-02)` commit `09537be` após o RED — toda a suíte passa + tsc limpo.
- REFACTOR: não necessário.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shape único do retorno do helper (branch-union type error)**
- **Found during:** Task 2 (tsc após GREEN)
- **Issue:** A primeira implementação retornava dois objetos distintos (branch parcelado com `transaction_id: null` literal vs branch à-vista com `transaction_id: string | null`). O overload de `.update()` do Supabase inferiu o tipo do branch parcelado e rejeitou o à-vista (`Type 'string' is not assignable to type 'null'`) em `updateAbastecimento` (L148). Tests passavam, tsc falhava.
- **Fix:** Colapsei para um único objeto de retorno com `number | null` em toda coluna de custo, escolhendo os valores por `isParcelado ? ... : ...`. Mesma semântica de write, tipo único, overload type-checa idêntico nos dois estados.
- **Files modified:** src/actions/abastecimentos.ts
- **Commit:** 09537be

## Self-Check: PASSED

- FOUND: src/actions/abastecimentos.ts
- FOUND: src/actions/abastecimentos.test.ts
- FOUND commit: e7d6f07
- FOUND commit: 09537be
