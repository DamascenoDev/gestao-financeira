---
plan: 09-02
phase: 09-etiquetar-gastos-da-fatura-ao-carro
title: Etiquetagem no extrato (seletor no form + ação de linha + bulk)
status: complete
requirements: [CAR-02]
completed: 2026-06-17
key_files:
  created:
    - src/components/carro-picker.tsx
  modified:
    - src/components/transacao-form.tsx
    - src/components/extrato-table.tsx
    - src/components/selection-action-bar.tsx
    - src/app/(app)/extrato/page.tsx
---

# 09-02 — Etiquetagem no extrato

## What was built
UI de etiquetagem carro→lançamento na superfície de extrato (CAR-02), não-destrutiva (D4):
- **CarroPicker** (`carro-picker.tsx`, novo): seletor reusável de carro, opcional, com "Nenhum" para limpar; livre de categoria.
- **transacao-form**: seletor "Carro" opcional montado incondicionalmente (não preso a categoria); grava/limpa `carro_id` via `updateTransaction`/`createTransaction`.
- **extrato-table**: ação de linha "Vincular a carro" (kebab DropdownMenu → CarroPicker dialog) que liga/desliga um lançamento reenviando categoria/valor/data reais (schema valida, nenhum campo de contabilidade muda).
- **selection-action-bar**: controle "Vincular a carro" em massa → `bulkTagCarro` ("Nenhum" desvincula a seleção).
- **extrato/page** (RSC): carrega carros não-arquivados + `carro_id` por linha, alimenta form + tabela.

## Verification
- `npx tsc --noEmit` clean; `npm run build` exit 0; full suite **654 passed**.
- Human-verify checkpoint (09-02-T4): **aprovado** pelo usuário — seletor/row/bulk + D4 dashboard spot-check + light/dark grammar confirmados.

## Deviations
None.

## Commits
- `30eee9d` feat(09-02): CarroPicker + optional Carro selector in transacao-form
- `65eb55b` feat(09-02): row "Vincular a carro" action + bulk carro mode in SelectionActionBar
- `fa80b72` feat(09-02): wire extrato RSC — load carros + carro_id, pass to form + table
