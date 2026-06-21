---
phase: 27-registro-r-pido-abastecimento-parcelado
plan: 01
subsystem: schemas
tags: [zod, validation, abastecimento, parcelado, defense-in-depth]
requires:
  - "supabase/migrations/0039_abastecimento_parcelado.sql (abastecimentos_cost_xor truth table)"
provides:
  - "abastecimentoSchema com 3 estados de custo (à-vista fatura | à-vista manual | parcelado)"
  - "AbastecimentoInput expõe valorTotalCents? e parcelasTotal?"
affects:
  - "27-02 (action) e 27-03 (form) consomem o schema relaxado"
tech_stack:
  added: []
  patterns:
    - "superRefine multi-estado espelhando um CHECK do DB (defense-in-depth)"
key_files:
  created: []
  modified:
    - src/lib/schemas/abastecimento.ts
    - src/lib/schemas/abastecimento.test.ts
decisions:
  - "Discrição D: no estado à-vista, parcelasTotal é tratado como ausente OU 1 = não-parcelado, espelhando o 0039 (parcelas_total null-ou-1). Documentado no schema para a action 27-02 seguir."
  - "parcelasTotal === 1 é rejeitado pelo bound .min(2) antes do superRefine — um parcelado precisa de >= 2 parcelas (alinha ao CHECK parcelas_total > 1)."
metrics:
  duration: "~1 min"
  completed: "2026-06-21"
  tasks: 2
  files: 2
status: complete
---

# Phase 27 Plan 01: Schema do abastecimento parcelado (3 estados) Summary

`abastecimentoSchema` (Zod) relaxado dos 2 estados XOR para os **3 estados de custo** do CHECK `abastecimentos_cost_xor` do `0039` — à-vista por fatura, à-vista manual e parcelado — com os campos `valorTotalCents` + `parcelasTotal` adicionados ao `AbastecimentoInput`, via TDD RED→GREEN.

## What Was Built

- **Campos novos no objeto Zod:** `valorTotalCents` (int positivo, D-09) e `parcelasTotal` (int [2, 24], D-07), ambos optional, com mensagens pt-BR.
- **superRefine de 3 estados** espelhando a truth table do `0039`:
  - PARCELADO (`parcelasTotal > 1`) → exige `valorTotalCents` E ambos `transactionId`/`amountCents` ausentes.
  - À-VISTA (else) → XOR exato de `transactionId`/`amountCents` (COST_SOURCE_MESSAGE preservada) E `valorTotalCents` ausente.
- **AbastecimentoInput** reflete `valorTotalCents?`/`parcelasTotal?` automaticamente via `z.infer` (sem tipo manual).
- **Comentário-cabeçalho** documenta os 3 estados + a convenção do à-vista (`parcelasTotal` ausente ou `1` = não-parcelado) que a action 27-02 vai seguir.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | RED — testes do estado parcelado + estados mistos + bounds | 639ee45 | src/lib/schemas/abastecimento.test.ts |
| 2 | GREEN — superRefine de 3 estados + valorTotalCents/parcelasTotal | 7e019d0 | src/lib/schemas/abastecimento.ts |

## Verification

- `npm test -- src/lib/schemas/abastecimento.test.ts` → 26 passed (6 novos parcelado + 20 existentes, sem regressão).
- `npx tsc --noEmit` → limpo (exit 0).
- `AbastecimentoInput` expõe `valorTotalCents?: number` e `parcelasTotal?: number`.
- O superRefine rejeita todo estado misto que o CHECK `abastecimentos_cost_xor` do `0039` rejeitaria (parcelado+tx, parcelado+amount, à-vista+valorTotal, parcelado-sem-valorTotal).

## TDD Gate Compliance

- RED gate: `test(27-01)` commit `639ee45` — 6 testes falham contra o schema antigo.
- GREEN gate: `feat(27-01)` commit `7e019d0` após o RED — toda a suíte passa.
- REFACTOR: não necessário (código limpo, sem duplicação).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/lib/schemas/abastecimento.ts
- FOUND: src/lib/schemas/abastecimento.test.ts
- FOUND commit: 639ee45
- FOUND commit: 7e019d0
