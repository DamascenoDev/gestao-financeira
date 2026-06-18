---
plan: 10-03
phase: 10-abastecimento-h-brido-consumo
title: Abastecimento UI — form + picker + histórico + médias
status: complete
requirements: [CAR-03, CAR-04]
requirements_completed: [CAR-03, CAR-04]
completed: 2026-06-17
key_files:
  created:
    - src/components/abastecimento-form.tsx
    - src/components/transacao-picker.tsx
    - src/components/abastecimento-history.tsx
  modified:
    - src/app/(app)/carros/[id]/page.tsx
---

# 10-03 — Abastecimento UI

## What was built
Fatia de UI de abastecimento no `/carros/[id]` (CAR-03 + CAR-04), sobre o sistema visual travado da Phase 7:
- **AbastecimentoForm** (dialog): toggle segmentado **Da fatura | Manual** (limpa a fonte inativa ao trocar); tanque-cheio Switch default ON; combustível Select default = `combustivel_padrao` do carro; litros como input decimal simples (NUNCA MoneyInput); Manual → MoneyInput (centavos); Da fatura → **TransacaoPicker**.
- **TransacaoPicker**: busca lançamentos do usuário ainda não vinculados (por descrição/valor); ao vincular, o servidor seta `carro_id` no lançamento (combustível aparece no gasto do carro).
- **AbastecimentoHistory**: tabela densa desktop / cards mobile (padrão Phase 7), com data, odômetro, litros, custo, badge tanque-cheio, km/l do intervalo ("—" quando inválido/null), e editar/excluir por linha.
- **/carros/[id]**: ganha a seção de abastecimento + km/l médio e R$/km como números mono `tabular-nums` (lidos de `v_carro_resumo`). SEM gráfico (Phase 11).

## Verification
- `npx tsc --noEmit` clean; `npm run build` exit 0; full suite **715 passed / 5 skipped (720)**.
- Human-verify checkpoint (10-03-T3): **aprovado** pelo usuário — form/toggle/picker + sync de carro_id no extrato + histórico + médias + mobile + light/dark.

## Deviations
None.

## Notes
- Transient flake observado em `tests/lgpd-export.test.ts` na rodada full-suite (seed do stack local sob carga paralela — "invalid response from upstream server"); passa determinístico em isolamento (5/5), subsistema não-relacionado (LGPD/Phase 6), registrado em deferred-items.md. Não é regressão da Phase 10.

## Commits
- `d5a9833` feat(10-03): AbastecimentoForm dialog (segmented cost-source toggle) + TransacaoPicker
- `b7bab3a` feat(10-03): AbastecimentoHistory (table→card) + averages, wired into /carros/[id]
