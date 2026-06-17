---
plan: 09-03
phase: 09-etiquetar-gastos-da-fatura-ao-carro
title: Etiquetagem na revisão de importação
status: complete
requirements: [CAR-02]
completed: 2026-06-17
key_files:
  created: []
  modified:
    - src/lib/schemas/import.ts
    - src/actions/import.ts
    - src/actions/import.test.ts
    - src/components/import-review-table.tsx
    - src/app/(app)/importar/[statementId]/page.tsx
---

# 09-03 — Etiquetagem na revisão de importação

## What was built
Etiquetagem carro por linha no fluxo de revisão de importação (CAR-02, success criteria #2), aditiva/não-destrutiva (D4):
- **schemas/import.ts + actions/import.ts**: `carroId` opcional por linha no schema do `confirmImport`; o persist re-deriva a posse do carro no servidor (tri-state `assertOwnedCarro`) e grava `carro_id` aditivamente — um carro forjado/alheio **rejeita o payload inteiro antes de qualquer insert**. Categoria, valor, aporte-reserva e dedupe intactos.
- **import-review-table.tsx**: Select "Carro" inline por linha (default "Nenhum"), independente da coluna Categoria.
- **importar/[statementId]/page.tsx** (RSC): carrega a lista de carros para o seletor.

## Verification
- `src/actions/import.test.ts` **30 passed** (persist de carro próprio, forged-reject sem insert, paridade sem-carro=null); `npx tsc --noEmit` clean; `npm run build` exit 0; full suite **657 passed**.
- Human-verify checkpoint (09-03-T3): **aprovado** pelo usuário — seletor por linha persiste ponta-a-ponta + D4 spot-check + light/dark.

## Deviations
- **Rule 3 (UI correctness):** o plano sugeria valor vazio para "Nenhum", mas `shadcn`/Radix `SelectItem` não aceita value string vazio. Usei o sentinela `NENHUM_CARRO = '__nenhum__'` mapeado para `null` ao etiquetar e `undefined` no payload de confirm — preserva a semântica "sem carro". Sem impacto funcional.

## Commits
- `1da73ea` feat(09-03): carroId in import row schema + confirmImport persist with ownership re-derive (TDD)
- `1eb8a15` feat(09-03): per-row carro selector in import review grid + carros wiring
