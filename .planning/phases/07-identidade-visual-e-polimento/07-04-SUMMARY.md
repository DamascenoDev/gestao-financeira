---
phase: 07-identidade-visual-e-polimento
plan: 04
subsystem: ui-tables
tags: [responsive, mobile, table-collapse, ui-07]
requires:
  - "07-01 token substrate (navy+gold; --consumption accent, --card surface)"
  - "AmountCell / CategoryBadge / AtividadeBadge / OriginBadge / ddMM cell components"
  - "src/hooks/use-mobile.ts (768px breakpoint — available, not needed here)"
provides:
  - "Branch de card <md nas 4 tabelas densas (Extrato, Import review, NF, Reserva ledger)"
  - "Padrão tabela→card responsivo via classes Tailwind (hidden md:table / md:hidden), SSR-estável"
affects:
  - "src/components/extrato-table.tsx"
  - "src/components/import-review-table.tsx"
  - "src/components/nf-table.tsx"
  - "src/components/reserva-ledger-table.tsx (já trazia o branch; sem mudança)"
tech-stack:
  added: []
  patterns:
    - "Dense table → mobile card collapse: <Table className='hidden md:table'> + <ul className='md:hidden'> de cards reusando as MESMAS células; props/seleção/actions congelados"
    - "Seleção mobile reusa o MESMO row model (row.getIsSelected/toggleSelected) → SelectionActionBar flutuante segue funcionando"
key-files:
  created: []
  modified:
    - "src/components/extrato-table.tsx"
    - "src/components/import-review-table.tsx"
    - "src/components/nf-table.tsx"
    - "src/components/nf-table.test.tsx"
decisions:
  - "Switch via classes responsivas Tailwind (hidden md:table / md:hidden) em vez de useIsMobile — SSR-estável, sem flash de hidratação e sem matchMedia no jsdom; segue o padrão já vivo no reserva-ledger-table"
  - "reserva-ledger-table já tinha o branch de card <md (entregue antes) — verificado contra os critérios e mantido intacto (zero mudança de código)"
  - "nf-table.test: getByText → getAllByText nos seletores de valor — o dual-render (desktop + card) emite cada valor nas duas branches no jsdom; o comportamento (linha por NF, badge, total) é idêntico (UI-SPEC: o teste cede ao re-skin, nunca a lógica)"
metrics:
  duration: "~12 min"
  tasks: 2
  files_created: 0
  files_modified: 4
  completed: "2026-06-17"
---

# Phase 7 Plan 04: Colapso tabela→card mobile (UI-07) Summary

Colapso responsivo tabela→card `<md` nas quatro tabelas densas (Extrato, revisão de importação, NFs do MEI, ledger de reserva) reusando as mesmas células (AmountCell, CategoryBadge/AtividadeBadge, OriginBadge, ddMM, TruncCell) — desktop `≥md` idêntico, seleção/bulk/actions e props 100% congelados.

## What Was Built

**Task 1 — Extrato + Import review (com seleção):**
- `ExtratoTable`: a `<Table>` recebe `hidden md:table` (desktop intacto); abaixo, uma `<ul className="md:hidden">` renderiza um card por linha de `table.getRowModel().rows`. Cada card reusa as MESMAS células — descrição truncada + `InlineCategoryCell` (badge de categoria editável inline) no topo, `ddMM(occurred_on)` + `<AmountCell kind="expense" signed={false}>` (mono) embaixo — e carrega o `Checkbox` ligado ao MESMO `row.getIsSelected()/toggleSelected`, então a `SelectionActionBar` flutuante segue operando no mobile (tap-select). O footer de totais por categoria colapsa num bloco compacto `md:hidden`.
- `ImportReviewTable`: mesmo padrão; o card preserva o accent âmbar de memory-miss (`border-l-2 border-l-consumption` quando `category_id === null`), a `OriginBadge`, a `RecorrenteTag`, o `descriptor_norm` mono e a `InlineReviewCategoryCell` (com o dialog "Qual reserva?" intacto). getRowId/rowSelection/classifyRow inalterados.

**Task 2 — NF table + Reserva ledger:**
- `NfTable`: `<Table>` vira `hidden md:table` dentro de um fragment; `<ul className="md:hidden">` com um card por NF — `TruncCell` (Tomador) + descrição + `AtividadeBadge` no topo e à direita o `NfRowActions` (Editar/Excluir via `deleteMeiInvoice`); embaixo `ddMM(issued_on)` + `<AmountCell kind="income">`. O total bruto do ano colapsa num card-rodapé compacto (mesmo `formatCents(totalCents)`, soma bigint-safe inalterada).
- `ReservaLedgerTable`: **já trazia** o branch de card `<md` (`hidden md:block` desktop + `<ul className="md:hidden">` cards com Tipo/Valor no topo, Data/Descrição embaixo, vínculo opcional) reusando `AmountCell`/`Badge`/`ddMM`. Verificado contra os critérios de aceite e mantido sem mudança.

## How to Verify

- `npx tsc --noEmit` — limpo.
- `npm test` — 593 passed / 71 files GREEN (baseline 07-03 mantido; nf-table 4/4).
- `npm run build` — compila ~17 rotas, exit 0.
- Grep gates: extrato-table `md:hidden`×2 + `hidden md:table`×1; import-review `md:hidden` + `border-l-consumption`×4 + OriginBadge/getRowId/rowSelection/SelectionActionBar; nf-table `md:hidden` + `hidden md:table` + AmountCell/AtividadeBadge/deleteMeiInvoice; reserva-ledger `md:hidden` + `hidden md:block` + AmountCell.
- Visual (manual, futuro human-verify): em viewport `<768px` as quatro telas mostram cards; `≥768px` as tabelas densas idênticas; seleção mobile aciona a barra flutuante.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Seletores `getByText` do nf-table.test incompatíveis com o dual-render SSR**
- **Found during:** Task 2
- **Issue:** o PATTERNS/UI-SPEC manda preferir classes responsivas (dual-render desktop+card, SSR-estável) sobre `useIsMobile`. No jsdom ambas as branches renderizam, então `getByText('Cliente A')`/`'Serviços'`/`'Receita bruta no ano'` passam a ter múltiplos matches e lançam.
- **Fix:** trocados esses seletores por `getAllByText(...).length > 0`. As asserções de comportamento (linha por NF, badge de atividade, total bruto do ano) são idênticas; nenhuma lógica de produto mudou. Conforme UI-SPEC (linha 14): "se um rename quebra um teste, o teste cede — renomeie o seletor, nunca a lógica de segurança".
- **Files modified:** src/components/nf-table.test.tsx
- **Commit:** bf6c420

Nenhum outro desvio. As outras três tabelas não têm testes de componente; a suíte de comportamento global (593) seguiu verde como gate de congelamento (T-07-09).

## Self-Check: PASSED

- FOUND: src/components/extrato-table.tsx, import-review-table.tsx, nf-table.tsx, reserva-ledger-table.tsx
- FOUND commit 3f2ac33 (Task 1), bf6c420 (Task 2)
