# Phase 28: Vínculo reverso por valor + consumo sem double-count - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 28-v-nculo-reverso-por-valor-consumo-sem-double-count
**Areas discussed:** Tolerância do match, Desambiguação, Sugestão na grid, Gravação no confirm

---

## Tolerância do match por valor

### Predicado do match (arredondamento de parcela)

| Option | Description | Selected |
|--------|-------------|----------|
| Conjunto exato {floor,ceil} | Parcela casa se valor ∈ {floor(total÷N), ceil(total÷N)}; à-vista == amount_cents. Determinístico, sem N arbitrário, cobre o split padrão de cartão | ✓ |
| Janela ± centavos | Casa se \|valor − alvo\| ≤ N centavos. Robusto a arredondamento atípico, mas precisa escolher N e arrisca falso-positivo | |
| Você decide | Deixar o predicado para o researcher/planner | |

**User's choice:** Conjunto exato {floor,ceil}
**Notes:** Alinhado à trava "correto e simples" da P26; aritmética inteira (sem float).

### Janela de data nos candidatos

| Option | Description | Selected |
|--------|-------------|----------|
| Só valor (data não trava) | Candidatos = não-vinculados que casam por valor, sem filtro de data; data só desempata | ✓ |
| Janela de data (±X dias) | Só sugerir se occurred_on do abastecimento ≤ X dias do lançamento | |
| Você decide | Deixar a decisão de janela para o researcher/planner | |

**User's choice:** Só valor (data não trava)
**Notes:** Parcelado chega ao longo de meses — janela de data quebraria parcelas tardias.

---

## Desambiguação + uma parcela por fatura (CAR-11)

### >1 abastecimento casa o mesmo valor

| Option | Description | Selected |
|--------|-------------|----------|
| Um — mais próximo por data | Sugerir UM: occurred_on mais próximo; empate → mais antigo não-vinculado (FIFO) | ✓ |
| Todos — usuário escolhe | Listar candidatos num seletor por linha | |
| Você decide | Deixar a regra de desempate para o planner | |

**User's choice:** Um — mais próximo por data
**Notes:** Mantém 1 sugestão/linha espelhando a sugestão única da IA.

### Garantir "uma parcela por fatura"

| Option | Description | Selected |
|--------|-------------|----------|
| Atribuição 1:1 no match | Greedy: cada abastecimento consumido por ≤1 linha; parcelado conta junção + atribuídas-nesta-fatura → ≤1 parcela nova/fatura | ✓ |
| Validar na gravação | Permitir múltiplas sugestões e rejeitar a 2ª parcela no confirmImport | |
| Você decide | Deixar a estratégia anti-duplo-link para o planner | |

**User's choice:** Atribuição 1:1 no match
**Notes:** CAR-11 estrutural no pass de match; índice único da junção como backstop.

---

## Sugestão na grid (surfacing + categoria Combustível)

### Onde a sugestão ancora

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar a coluna Carro | Célula de Carro vira o ponto da sugestão (confirmar/descartar); confirmar seta carro_id + marca vínculo + aplica Combustível | ✓ |
| Coluna 'Abastecimento' nova | Coluna dedicada separada de Carro e Categoria | |
| Você decide | Deixar o local exato para o researcher/planner/UI | |

**User's choice:** Reusar a coluna Carro
**Notes:** Sem 3ª coluna numa grid já densa.

### Precedência da categoria Combustível

| Option | Description | Selected |
|--------|-------------|----------|
| Sempre Combustível (sobrescreve) | Confirmar pré-preenche Combustível, sobrescrevendo IA E memória/keyword; editável até o commit final | ✓ |
| Só se não-classificada | Aplica só quando sem categoria; senão respeita a existente | |
| Você decide | Deixar a regra de precedência para o planner | |

**User's choice:** Sempre Combustível (sobrescreve)
**Notes:** Vínculo é ação explícita do usuário > auto-classificação; sem auto-commit (estado cliente).

### Lote

| Option | Description | Selected |
|--------|-------------|----------|
| Por linha + 'Vincular todos' | Por linha E botão de lote (espelha applyAllSuggestions); match 1:1 exato é seguro | ✓ |
| Só por linha | Cada vínculo confirmado individualmente | |
| Você decide | Deixar a existência do lote para o planner/UI | |

**User's choice:** Por linha + 'Vincular todos'

---

## Gravação no confirm

### Onde gravar o vínculo

| Option | Description | Selected |
|--------|-------------|----------|
| Estender o confirmImport | Após inserir as tx: à-vista → update transaction_id; parcelado → insert abastecimento_parcelas. Reusa insertedByKey + re-derive de posse | ✓ |
| Ação separada pós-confirm | Nova action chamada pelo cliente depois do confirmImport com os tx ids | |
| Você decide | Deixar o local para o researcher/planner | |

**User's choice:** Estender o confirmImport
**Notes:** O id e a posse já estão no seam; o cliente passa abastecimentoId/kind no payload da linha; servidor re-deriva posse como faz com carro_id.

### Linha dedupe-skipped com vínculo confirmado

| Option | Description | Selected |
|--------|-------------|----------|
| Vincular a tx existente | Buscar tx id por dedupe_key e gravar o vínculo; índices únicos impedem duplo-link | ✓ |
| Só linhas novas | Vincular apenas as recém-inseridas; dedupe-skipped não vincula | |
| Você decide | Deixar o tratamento para o planner | |

**User's choice:** Vincular a tx existente
**Notes:** Cobre "parcela importada solta antes"; evita falha silenciosa de um vínculo confirmado.

---

## Claude's Discretion

- Shape exato do campo de sugestão de match na `ParsedReviewRow` + extensão do `ReviewRow`/`InlineReviewCarroCell`.
- Funções batched do pass de match em `ingestStatement` (fetch não-vinculados + índice por valor-alvo + greedy 1:1).
- Helper `assertOwnedAbastecimento` (ou reuso) para o IDOR re-derive no `confirmImport`.
- Atribuição de `parcela_num` + payload do insert da junção (schema 0039).
- Semântica de falha parcial se o write do vínculo falhar após o insert da tx (surfacing-but-keep vs outro).
- Lookup batched por `dedupe_key` para o caso dedupe-skipped.
- Se o à-vista re-link reusa `updateAbastecimento` ou um update estreito.
- Design visual do affordance na célula de Carro + botão "Vincular todos".

## Deferred Ideas

- CAR-13 (projeção de parcelas futuras não vinculadas) — v2.
- CAR-14 (edição/relink de custo de abastecimento já criado pela UI) — v2.
- Match por descrição/merchant — out of scope (só por valor).
- OCR de cupom/nota de posto — out of scope.
- Nova tela/relatório de consumo — out of scope (views já alimentadas na P26).
- Botão de abastecimento no Extrato — out of scope (founder).
- Janela de data como filtro de elegibilidade — rejeitada (D-02); data só desempata.
