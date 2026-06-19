# Phase 16: Review-Grid Suggestion Affordances - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

A review grid passa a renderizar a sugestão de IA produzida pela Phase 15 (`row.suggestion`) no `SuggestionSlot` já existente, mostrando a **procedência** (memória vs IA) e uma **dica de confiança** por linha, com as linhas de baixa confiança **ordenando primeiro**. Pura UI sobre o pipeline já provado — **sem auto-commit** (o aprendizado continua no `confirmImport`). Cobre CLSAI-07 (procedência) + CLSAI-08 (confiança + ordenação).

NÃO faz parte desta fase: qualquer mudança no pipeline de classificação / `import.ts` ingest / `classify.ts` (Phase 15 já entrega `row.suggestion`), no armazenamento de chave (Phase 14), nem no learn loop do `confirmImport`. Sem DeepSeek. Esta fase só LÊ `row.suggestion` e melhora a review grid.
</domain>

<decisions>
## Implementation Decisions

### Wiring do slot + procedência (CLSAI-07)
- Bridge: resolver `row.suggestion.categoryId` → `name` pela lista de categorias já disponível na review table, e passar `{ categoryId, name }` ao `SuggestionSlot` (que renderiza o chip "Aplicar sugestão: {name}"). Quando `categoryId` é `null` ("nenhuma encaixa") → NÃO renderiza chip (slot inerte "—", como hoje).
- Badge de procedência: badge pequeno por linha — **"memória"** (neutro/secondary) nas linhas auto-classificadas por um padrão confirmado (`category_id` já setado + `classification_source: 'memória'`) vs **"IA"** (primary/sparkles) nas linhas com `suggestion` presente ainda não aplicada.
- Distinção confirmado vs sugerido: memória = `category_id` já setado (badge neutro, sem chip); IA = `suggestion` presente E `category_id` null (chip "Aplicar" + badge IA). As duas afordâncias são mutuamente exclusivas por linha.
- "Nenhuma encaixa" (`categoryId: null`): sem chip, sem badge — só o Select vazio (idêntico ao v1.3).

### Dica de confiança + ordenação (CLSAI-08)
- Display de confiança: hint **sutil** por linha (ex. um dot tintado, ou uma tag "baixa confiança" só nas linhas de baixa confiança) — calmo, NÃO um número/porcentagem grande. A ui-phase define o token visual exato.
- Limiar "baixa confiança": `confidence < 0.6`, exposto como uma constante única (tunável). Acima disso = confiança normal (sem tag).
- Ordenação: as linhas com sugestão de IA de **baixa confiança ordenam PRIMEIRO** (revisar o duvidoso antes), depois o resto na ordem existente. É um sort INICIAL — o usuário pode re-ordenar pelas colunas normalmente.
- Quando ordenar: SÓ quando há sugestões de IA no upload. Sem IA (sem chave / sem sugestões) → ordem do v1.3 intacta.

### Aplicar + no-auto-commit + estados
- Aplicar: clicar o chip preenche o Select da linha com a categoria sugerida e marca a origem como IA-aplicada — **sem commit** até o usuário confirmar o import. (É exatamente o contrato existente do `SuggestionSlot.onApply`.)
- Pós-aplicar: o chip some / dá lugar à categoria selecionada no Select; a procedência pode virar "IA (aplicada)" se for barato, senão só o Select preenchido.
- `confirmImport`: INALTERADO — aplicar uma sugestão e confirmar escreve `merchant_patterns` pelo MESMO caminho do pick manual; NENHUM `merchant_patterns` é escrito sem confirmação humana explícita. O loop confirm/learn do v1.3 permanece intacto.
- Estados vazios: sem chave / sem sugestões → a grid se comporta exatamente como o v1.3 (sem chips, sem badges, ordem existente).

### Claude's Discretion
- O token visual exato do hint de confiança (dot vs tag vs cor), a posição precisa do badge/chip na célula de categoria, e a mecânica do sort (comparator) ficam a critério, dentro do que a 16-UI-SPEC fixar e das convenções existentes (`@tanstack/react-table` na review grid).
- Se estender o tipo do `SuggestionSlot` (p/ aceitar confidence/source) ou manter a ponte fora dele fica a critério — preferir o mínimo de mudança no componente existente.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/suggestion-slot.tsx` — o `SuggestionSlot` JÁ existe: recebe `suggestion?: { categoryId: string; name: string } | null` + `onApply(categoryId)`; renderiza um chip "Aplicar sugestão: {name}" (sparkles, `--primary`) ou um "—" inerte quando null. Reserva o espaço (sem reflow). É o slot a alimentar.
- `src/components/import-review-table.tsx` — a review grid (`@tanstack/react-table`). A célula de categoria tem o Select (~:746-771, `SelectValue` com children = `CategoryBadge`). O `SuggestionSlot` vai junto dessa célula (~:771). É onde o badge de procedência + a dica de confiança entram.
- `src/lib/parsers/types.ts:82` — `ParsedReviewRow.suggestion?: { categoryId: string | null; confidence: number; source: 'ia' }` (Phase 15). É o input desta fase.
- A célula de categoria já resolve `category_id` → `CategoryBadge` (name+color), então a lista de categorias está disponível p/ resolver o `name` da sugestão.
- `classification_source` na linha ('memória' | null hoje) distingue auto-classificado de não.

### Established Patterns
- Tokens navy+gold do v1.1; `Badge` (shadcn) já em uso; `CategoryBadge`. Base UI Select com children explícitos (lição G-01 — `SelectValue` precisa de children). pt-BR copy calma.
- Review grid é client (`@tanstack/react-table`); o payload `parsed_rows` (jsonb) já carrega `suggestion`.
- `confirmImport` é o ÚNICO write de `merchant_patterns` — não tocar.

### Integration Points
- Modificar `src/components/import-review-table.tsx` (alimentar o `SuggestionSlot` com `{categoryId,name}` resolvido; badge de procedência memória/IA; hint de confiança; sort inicial baixa-confiança-primeiro).
- Possivelmente estender `src/components/suggestion-slot.tsx` minimamente (se precisar de confidence/source) — preferir não.
- Const única de limiar (`LOW_CONFIDENCE = 0.6`).
</code_context>

<specifics>
## Specific Ideas

- Invariantes: (1) afordâncias só LEEM `row.suggestion` — zero mudança no pipeline/learn loop; (2) aplicar NÃO commita (só preenche o Select); (3) memória vs IA visualmente distintos; (4) baixa-confiança-primeiro só quando há IA; (5) sem chave/sugestões → grid idêntica ao v1.3.
- Verificações esperadas: linha com `suggestion` (categoryId não-null) mostra o chip + badge IA; aplicar preenche o Select sem escrever `merchant_patterns`; linha memória mostra badge neutro sem chip; `categoryId: null` não mostra chip; sort põe baixa-confiança no topo; grid sem sugestões = ordem v1.3.
- Reaproveitar o `SuggestionSlot` existente (não recriar); respeitar a lição G-01 (Base UI Select precisa de children no `SelectValue`).
</specifics>

<deferred>
## Deferred Ideas

- Tuning fino do limiar/curva de confiança por feedback real — Future.
- Qualquer mudança no pipeline de classificação (Phase 15) / chave (Phase 14) — fora de escopo.
- Smoke com chave real (ver sugestões ao vivo) — item humano herdado da Phase 15.
</deferred>
