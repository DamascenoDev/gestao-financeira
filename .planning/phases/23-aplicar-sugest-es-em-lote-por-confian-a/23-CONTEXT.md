# Phase 23: Aplicar sugestões em lote por confiança - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Refina a ação de aplicar-em-lote da grid de revisão (CLSAI-10): em vez de aplicar **todas** as sugestões de IA não-aplicadas de uma vez (comportamento atual de `applyAllSuggestions`), passa a aplicar **só as de confiança acima do limiar**, deixando as de baixa confiança pendentes e sem categoria para revisão manual linha a linha. Nada é commitado: o preenchimento é só na grid (sobrescrevível), e o aprendizado merchant→categoria continua só no confirm humano.

**Fora do escopo:** mudar o pipeline de classificação no upload, a persistência/procedência, o `confirmImport`, o cálculo de confiança da IA, ou introduzir controle de limiar na UI. Reusa os primitivos já shipados (`LOW_CONFIDENCE`, `applyAllSuggestions`, badge "baixa confiança", sort low-confidence-first).
</domain>

<decisions>
## Implementation Decisions

### Semântica do aplicar-em-lote (CLSAI-10)
- **Modificar o `applyAllSuggestions` existente** (`import-review-table.tsx`) para aplicar apenas sugestões com `confidence >= limiar` — o "aplicar todas independente de confiança" de hoje vira "aplicar as confiáveis". Uma única ação em lote, não um segundo botão.
- **Fonte = IA apenas.** memória e palavra-chave são pré-fill bindings já aplicados no parse (category_id setado + badge de origem) → não há nada "pendente" para elas; a redação de três fontes do SC1 é satisfeita trivialmente (nada pendente de memória/keyword). Documentar explicitamente para não confundir o verifier.
- **Linhas abaixo do limiar ficam intocadas e sem categoria → pendentes para revisão manual** (SC2). São exatamente as linhas já marcadas com a tag amber "baixa confiança" e ordenadas primeiro.
- **Sem commit** (SC3): o aplicar-em-lote preenche a categoria só no estado do cliente (origin → `manual`, `reserva_id` null), NUNCA escreve no banco. O aprendizado merchant→categoria continua só no `confirmImport`, que permanece **INALTERADO** — idêntico ao contrato do apply-all de hoje.

### Limiar
- **Reusar a constante existente `LOW_CONFIDENCE = 0.6`** como o limiar — as linhas deixadas pendentes são exatamente o conjunto amber "baixa confiança" de hoje. Single source of truth, sem nova constante.
- **Limiar é constante de código fixa** (já "tunável" por CLSAI-08), **sem controle na UI** (slider/input seria scope creep para esta fase).
- **Semântica de fronteira:** `confidence >= LOW_CONFIDENCE` aplica (confiável); `< LOW_CONFIDENCE` fica pendente — consistente com a tag baixa-confiança existente (`< 0.6`).

### UX — afordância, cópia, feedback
- **Contagem = só as pendentes confiáveis** (acima do limiar); relabelar o botão para tornar o limiar explícito (ex.: "Aplicar N sugestões confiáveis"). A cópia exata em pt-BR é fixada pela ui-phase.
- **Visibilidade:** mostrar só quando há ≥1 sugestão confiável pendente; esconder quando a contagem de confiáveis = 0 (mesmo que ainda restem linhas de baixa confiança — essas vão para revisão manual). Espelha o hide-when-none de hoje.
- **Feedback:** toast com a contagem aplicada ("N sugestões confiáveis aplicadas"); as linhas de baixa confiança já estão visualmente marcadas + ordenadas primeiro e são editáveis por linha. Calmo, sem undo (nada foi commitado).

### Claude's Discretion
- Nome/forma exatos do helper de contagem confiável (ex.: derivar `confidentSuggestionCount` ao lado do `unappliedSuggestionCount` existente) e se o predicado de "confiável" vira um util compartilhado com o de baixa-confiança (`confidence < LOW_CONFIDENCE`) para não duplicar o limiar.
- Cópia exata em pt-BR do botão e do toast (dentro do que a 23-UI-SPEC fixar).
- Cobertura de testes: o predicado/contagem de limiar, o `applyAllSuggestions` gated (aplica >=0.6, pula <0.6, deixa pendentes sem categoria, origin→manual, sem DB write), e a visibilidade/label do botão. Espelhar os testes CLSAI-08 existentes em `import-review-table.test.tsx`.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/import-review-table.tsx` — `applyAllSuggestions` (~393, aplica toda sugestão IA não-aplicada em estado-cliente, origin→manual, sem DB), `unappliedSuggestionCount`, o botão "Aplicar N sugestões" (~720-728, escondido quando none), `LOW_CONFIDENCE = 0.6` (109), o predicado de baixa-confiança (`confidence < LOW_CONFIDENCE`, ~180/196), o sort low-confidence-first (~202-205). Ponto único de mudança.
- `ReviewRow.suggestion` = `{ categoryId: string | null; confidence: number; source: 'ia' }` (~261) — só IA carrega isso; memória/keyword chegam como binding (`category_id` setado + `origin`).
- Tag visual "baixa confiança" + `OriginBadge`/`SuggestionSlot` — reuso de cópia/estilo; a procedência não muda.

### Established Patterns
- Sem auto-commit: aplicar (per-row ou em lote) só preenche o Select; `merchant_patterns`/`transactions` só no `confirmImport` (intacto desde v1.3).
- Limiar como constante única exportada (`LOW_CONFIDENCE`), tunável em código (CLSAI-08).
- Testes de componente em `import-review-table.test.tsx` (vitest + jsdom), incluindo casos CLSAI-08 de confiança/ordenação.

### Integration Points
- Único arquivo de produção: `src/components/import-review-table.tsx` (lógica do `applyAllSuggestions` + contagem/label/visibilidade do botão). Teste: `import-review-table.test.tsx`. Sem mudança de server/schema/types.
</code_context>

<specifics>
## Specific Ideas

- Trocar o corpo do `applyAllSuggestions` para `r.category_id === null && r.suggestion?.categoryId != null && r.suggestion.confidence >= LOW_CONFIDENCE`.
- Nova contagem `confidentSuggestionCount` (predicado acima) dirige label + visibilidade do botão; quando 0, esconder.
- Toast: "N sugestões confiáveis aplicadas" (singular/plural como hoje).
- `confirmImport` e qualquer caminho de servidor: NÃO tocar.
</specifics>

<deferred>
## Deferred Ideas

- Controle de limiar na UI (slider/input) — fora do escopo; limiar fica constante de código.
- Confiança sintética para memória/palavra-chave para entrarem no "pendente" — rejeitado; são bindings já aplicados.
- Undo do aplicar-em-lote — desnecessário (nada commitado; linhas editáveis e sobrescrevíveis).
</deferred>
