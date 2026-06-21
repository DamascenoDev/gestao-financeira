# Phase 27: Registro rápido + abastecimento parcelado - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 27-registro-r-pido-abastecimento-parcelado
**Areas discussed:** Forma na lista, Posição do botão, UI do parcelado, Regras do parcelado

---

## Forma na lista

| Option | Description | Selected |
|--------|-------------|----------|
| Manual/parcelado só | Form da lista sem aba "Da fatura"; page /carros não busca transacoes; vincular fatura fica no detalhe + Phase 28; prop manualOnly | ✓ |
| Form completo | Mesmo form do detalhe com "Da fatura"; exige buscar lançamentos não-vinculados na page /carros | |

**User's choice:** Manual/parcelado só (recomendado)
**Notes:** Casa com o frame "registrar antes da fatura chegar"; mantém a page da lista leve. A aba "Da fatura" segue no form do detalhe; vínculo por valor é a Phase 28.

---

## Posição do botão

| Option | Description | Selected |
|--------|-------------|----------|
| Botão na face | Visível na face do card (abaixo dos KPIs); AbastecimentoForm com próprio trigger; 1 clique | ✓ |
| Item no dropdown | Mais um item no DropdownMenu (Editar/Arquivar); card mais limpo mas ação principal a 2 cliques | |
| Ambos / depende | Descrever posicionamento visual exato | |

**User's choice:** Botão na face (recomendado)
**Notes:** Ação central da fase → descoberta imediata. Layout fino (ícone/label/variante) fica como discrição.

---

## UI do parcelado

| Option | Description | Selected |
|--------|-------------|----------|
| Terceira aba | Tabs [Da fatura \| Manual \| Parcelado]; reusa onSourceChange (clear das outras fontes); CostSource ganha 'parcelado' | ✓ |
| Switch dentro do Manual | Aba Manual com Switch 'Parcelado' que troca valor à-vista por total+parcelas; estado aninhado | |
| Outro / descrever | Descrever layout exato dos campos | |

**User's choice:** Terceira aba (recomendado)
**Notes:** Parcelado tratado como fonte de custo de primeira classe; XOR estrutural de graça via o clear já existente. Na lista manual-only vira [Manual | Parcelado].

---

## Regras do parcelado

### Teto de parcelas

| Option | Description | Selected |
|--------|-------------|----------|
| Máx 24 | 2 a 24 parcelas; cobre folgado o real e barra digitação absurda | ✓ |
| Máx 12 | 2 a 12 (teto clássico de cartão BR) | |
| Sem teto (≥2) | Só inteiro ≥ 2, sem limite superior | |

**User's choice:** Máx 24 (recomendado)
**Notes:** Mínimo 2 já é exigido pelo CHECK parcelas_total > 1 do 0039.

### Preview "valor por parcela"

| Option | Description | Selected |
|--------|-------------|----------|
| Mostrar | Linha derivada ao vivo (valor_total ÷ N, formatCents), display-only, não persiste | ✓ |
| Não mostrar | Só os campos, sem linha derivada | |

**User's choice:** Mostrar (recomendado)
**Notes:** Antecipa o valor que a Phase 28 casa por fatura (~total/N); nada novo no banco.

---

## Claude's Discretion

- Shape exato do `superRefine` 3-estados do `abastecimentoSchema` espelhando o CHECK do `0039`.
- Nomes do prop (`manualOnly`?), dos campos novos no `AbastecimentoInput`
  (`valorTotalCents`/`parcelasTotal`?) e do valor de `CostSource` para parcelado.
- `parcelas_total` no caso à-vista: gravar `null` ou `1` (CHECK trata igual).
- Mapeamento dos novos campos em `abastecimentoWriteFields`.
- Layout visual fino do botão na face e da linha de preview.

## Deferred Ideas

- CAR-09/10/11 (vínculo reverso por valor + uma parcela por fatura sem double-count) — Phase 28.
- CAR-12 (relatório de consumo refletindo manuais + vinculados) — Phase 28.
- CAR-13 (projeção de parcelas futuras não vinculadas) — v2.
- CAR-14 (edição/relink de custo de abastecimento já criado) — v2.
- Botão de abastecimento no Extrato — fora de escopo (decisão do founder; só na lista /carros).
