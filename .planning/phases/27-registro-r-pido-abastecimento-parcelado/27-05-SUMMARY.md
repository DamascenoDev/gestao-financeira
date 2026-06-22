---
phase: 27-registro-r-pido-abastecimento-parcelado
plan: 05
subsystem: ui
tags: [next-link, shadcn, dropdown-menu, navigation, carro-card]

# Dependency graph
requires:
  - phase: 27-registro-r-pido-abastecimento-parcelado
    provides: "Detalhe /carros/[id] hospedando AbastecimentoHistory + Editar (CR-01 parcelado); registro-pela-lista primário"
provides:
  - "Affordance de navegação descobrível ('Ver detalhes' no menu ⋯ do CarroCard) levando da lista /carros ao detalhe /carros/[id]"
  - "Caminho ponta-a-ponta lista→detalhe→histórico→Editar acessível pela UI"
affects: [carros, abastecimentos, ui-navigation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Card de lista → página de detalhe via DropdownMenuItem com render={<Link>} (espelha 'Ver extrato' do ReservaCard)"

key-files:
  created: []
  modified:
    - src/components/carro-card.tsx

key-decisions:
  - "Affordance idiomática (item de menu 'Ver detalhes') em vez de card-inteiro-clicável — evita capturar cliques do botão 'Novo abastecimento' e do menu ⋯"
  - "Reusar precedente do ReservaCard ('Ver extrato') — padrão já vendorizado no codebase para navegar de card para detalhe"
  - "Lista /carros segue sem hospedar histórico por design (D-01/27-04) — só faltava a navegação descobrível"

patterns-established:
  - "Navegação lista→detalhe: DropdownMenuItem render={<Link href={`/recurso/${id}`}>} como primeiro item do menu ⋯"

requirements-completed: [CAR-07, CAR-08]

# Metrics
duration: ~12min
completed: 2026-06-22
status: complete
---

# Phase 27 Plan 05: Affordance "Ver detalhes" no CarroCard Summary

**Item "Ver detalhes" no menu ⋯ de cada card em /carros, navegando para /carros/[id] — fecha a lacuna de descoberta (UAT 2/4) tornando histórico de abastecimentos + Editar (CR-01 parcelado) alcançáveis pela lista.**

## Performance

- **Duration:** ~12 min (inclui pausa de checkpoint humano)
- **Completed:** 2026-06-22
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 1

## Accomplishments
- Adicionado `DropdownMenuItem` "Ver detalhes" como PRIMEIRO item do menu ⋯ do `CarroCard`, renderizando `<Link href={`/carros/${carro.id}`}>` (espelha "Ver extrato" do `ReservaCard`)
- Fechado o gap de descoberta major do UAT da Phase 27: o histórico de abastecimentos e a ação Editar (correção CR-01) vivem só no detalhe `/carros/[id]`, e a lista não tinha caminho descobrível — agora tem
- JSDoc do componente atualizado para listar a nova ação, mantendo a doc em sincronia com o comportamento
- Interatividade existente preservada: Link do apelido, botão "Novo abastecimento", item Editar e Arquivar/Desarquivar — ordem final do menu: Ver detalhes · Editar · Arquivar/Desarquivar
- Verificação humana aprovada ("aprovado"): item descobrível, navega para o detalhe, histórico + Editar alcançáveis, card íntegro

## Task Commits

1. **Task 1: Adicionar affordance "Ver detalhes" ao DropdownMenu do CarroCard** - `a4b9259` (feat)
2. **Task 2: Human-verify — affordance torna histórico + Editar alcançáveis pela lista** - checkpoint aprovado pelo usuário ("aprovado"); sem commit de código

## Files Created/Modified
- `src/components/carro-card.tsx` - Novo `DropdownMenuItem` "Ver detalhes" (Link para `/carros/[id]`) como primeiro item do menu ⋯; JSDoc atualizado

## Decisions Made
- Item de menu dedicado em vez de card-inteiro-clicável: evita capturar cliques dos elementos interativos do card (botão "Novo abastecimento", menu ⋯)
- Espelhar o precedente "Ver extrato" do `ReservaCard` — padrão já estabelecido no codebase, sem nova dependência
- Não tocar em `/carros` page nem `v_carro_resumo`: a lista segue sem hospedar histórico por design (D-01/27-04); a correção é puramente a affordance de navegação faltante

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gap de descoberta major do UAT da Phase 27 fechado; CAR-07/CAR-08 alcançáveis ponta-a-ponta pela lista
- Orquestrador deve rodar verificação de fase + phase.complete (este plano NÃO marca a fase como completa)

## Self-Check: PASSED

- `src/components/carro-card.tsx` exists with "Ver detalhes" affordance (L74, L139)
- `27-05-SUMMARY.md` created
- Commit `a4b9259` verified in git log

---
*Phase: 27-registro-r-pido-abastecimento-parcelado*
*Completed: 2026-06-22*
