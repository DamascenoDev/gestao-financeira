# Phase 22: Sugestão de palavra-chave (inline + batch) - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Entrega duas superfícies opt-in para **criar palavras-chave a partir de sinais já confirmados**, sem nunca cadastrar nada automaticamente:

1. **Inline (KW-07):** ao classificar manualmente um descritor na grid de revisão de importação, o usuário vê uma ação inline para virar aquele descritor numa palavra-chave da categoria escolhida.
2. **Batch (KW-08):** em `/categorias`, um painel varre os `merchant_patterns` já confirmados e lista palavras-chave candidatas para aprovar/descartar em lote.

Em ambos os casos a keyword resultante é igual à do modelo único do v1.5/v1.6 (`category_keywords`, normalizada por `normalizeKeyword`, escopada por `user_id` + RLS, consumível pelo `matchKeyword`). **Fora do escopo:** mudar o algoritmo de match, o pipeline de classificação no upload, persistência de procedência, ou qualquer auto-cadastro. Não há nova tabela.
</domain>

<decisions>
## Implementation Decisions

### Inline — placement & trigger (KW-07)
- A ação vive **por linha, inline na grid de revisão** (`import-review-table.tsx`): um controle discreto ("+ palavra-chave") junto da célula de categoria. Espelha os affordances per-row já existentes.
- Aparece **só quando o usuário escolhe/sobrescreve a categoria manualmente** (origin `manual`). Linhas já classificadas por memória/palavra-chave/IA NÃO mostram o controle — o descritor já está aprendido/coberto, oferecer keyword ali é ruído.
- O termo pré-preenchido é o **`descriptor_norm` normalizado, editável** num popover pequeno antes de salvar (o descritor cru é específico demais; o usuário costuma querer um substring tipo `UBER`). Edição passa pelo mesmo `normalizeKeyword` (preserva `*`).
- A keyword é criada **na categoria que o usuário acabou de escolher** para a linha — sem segunda pergunta.

### Inline — persistence & feedback (KW-07)
- Persiste **imediatamente no clique** (server action própria), desacoplado do "Confirmar importação" — opt-in, igual ao dialog de keywords da Phase 19. Criar a keyword NÃO commita a importação nem escreve em `transactions`/`merchant_patterns`.
- **Reusa `addKeyword(categoryId, keyword)`** (`src/actions/category-keywords.ts`) — já valida (Zod), normaliza, deduplica e faz owner-gate + RLS + `revalidatePath`.
- Duplicata → **toast amigável "já cadastrada"** (espelha Phase 19), sem erro de validação.
- Feedback: **toast (sonner) + o controle inline vira "criada ✓"** (desabilitado) para não ser clicado duas vezes na mesma sessão de revisão.

### Batch — análise & candidatas (KW-08)
- Fonte das candidatas: **apenas `merchant_patterns` confirmados** (`descriptor_norm` → `category_id`) — é o sinal confirmado, conforme o texto de KW-08. Não minerar `transactions` cruas.
- Filtro: **excluir descritores já cobertos por uma keyword existente** (rodar o `matchKeyword`/substring+glob contra as keywords atuais do usuário) — sem sugestão redundante. O resto vira candidata.
- Termo sugerido: **o `descriptor_norm` completo, editável antes de aprovar** — honesto, sem heurística de stemming arriscada; o usuário encurta se quiser.
- Ordenação: **por `hit_count` desc** (padrões mais usados primeiro) — candidatas de maior valor no topo.

### Batch — approve/discard UX (KW-08)
- Placement: **dialog global** aberto por um botão "Sugerir palavras-chave" na toolbar de `/categorias` (as candidatas cruzam categorias → global, não por-categoria). Reusa o padrão de Dialog do repo.
- Seleção: **checkboxes multi-select + ação em lote "Aprovar selecionadas"**; categoria e termo de cada candidata **editáveis** antes de aprovar. Aprovadas viram `category_keywords` (escopadas por `user_id` + RLS).
- Descartar é **session-only** — a candidata descartada sai da lista sem efeito colateral (texto do critério de sucesso 3), **sem nova tabela/coluna "dismissed"**. Pode reaparecer numa varredura futura (aceitável; mantém o escopo enxuto e o schema intacto).
- Categoria de cada candidata vem **pré-preenchida da categoria do pattern, editável** antes de aprovar.

### Claude's Discretion
- Como aprovar em lote no server: loop reusando `addKeyword` por candidata vs. uma action batch nova (`addKeywords`/`approveKeywordSuggestions`) que insere N de uma vez com um único owner-gate + `revalidatePath`. Preferir a batch action se a UX em lote ficar melhor; seguir convenções de `category-keywords.ts`.
- Onde computar as candidatas (server fetch na RSC de `/categorias` vs. server action sob demanda ao abrir o dialog) e a forma exata do tipo de candidata (`{ descriptorNorm, categoryId, hitCount }`).
- Markup/naming exatos dos componentes (ex.: `keyword-suggestions-dialog.tsx`, controle inline em `import-review-table.tsx`), variantes de badge/chip e cópia em pt-BR.
- Cobertura de testes: a lógica de candidatas (filtro de já-cobertos, ordenação, dedupe), a(s) action(s) (validação, owner-gate, RLS, dedupe, lote), e os componentes (controle inline aparece só em manual; dialog aprova/descarta).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/actions/category-keywords.ts` — `addKeyword(categoryId, keyword)` / `removeKeyword(keywordId)`: Zod `safeParse`, `normalizeKeyword`, owner-gate (`getClaims`), dedupe via `unique(user_id, category_id, keyword)` + friendly toast, `revalidatePath('/categorias')`. Base da persistência inline e do approve em lote.
- `src/components/category-keywords-dialog.tsx` — padrão de Dialog (chips Badge removíveis + input + `useTransition` + sonner) a espelhar no painel batch.
- `src/components/category-row-actions.tsx` / `src/app/(app)/categorias/page.tsx` — `/categorias` RSC + toolbar; ponto de entrada do botão "Sugerir palavras-chave".
- `src/components/import-review-table.tsx` — `InlineReviewCategoryCell` (~891-1027) + `classifyRow` (~344-359, seta `origin: 'manual'`): ponto de inserção do controle inline KW-07.
- `src/lib/classifier/keywords.ts` — `matchKeyword` / `compileRule` / `globToRegExp`: reusar para filtrar candidatas já cobertas por keyword.
- `src/lib/normalize.ts` — `normalizeKeyword` (preserva `*`) para o termo editado.
- `supabase/migrations/0021_merchant_patterns.sql` — `merchant_patterns(user_id, descriptor_norm, category_id, reserva_id, hit_count, last_used_at)`, unique `(user_id, descriptor_norm)`, RLS own. Fonte das candidatas.
- `supabase/migrations/0036_category_keywords.sql` — `category_keywords`, unique `(user_id, category_id, keyword)`, RLS own.

### Established Patterns
- Server actions: `'use server'`, Zod no boundary → `{error}|{ok:true}`, `getClaims()` owner-gate, `idSchema` uuid (WR-06), `revalidatePath`.
- UI: shadcn `Dialog`/`Field`/`Badge`/`Checkbox`, `react-hook-form`+Zod onde há form, `useTransition`, toasts `sonner`.
- Sem auto-commit em lugar nenhum; tudo opt-in; nada escrito em `transactions`/`merchant_patterns` fora do `confirmImport`.

### Integration Points
- Toolbar de `/categorias` (novo botão + dialog global).
- Célula/linha da grid em `import-review-table.tsx` (novo controle inline, gated por origin `manual`).
- Server: nova lógica de cômputo de candidatas (lê `merchant_patterns` + `category_keywords`, filtra via `matchKeyword`); action(s) de approve (reusa/estende `category-keywords.ts`).
</code_context>

<specifics>
## Specific Ideas

- KW-07 inline: prefill = `descriptor_norm`, editável, normaliza via `normalizeKeyword`, persiste já via `addKeyword`, marca "criada ✓".
- KW-08 batch: candidatas = `merchant_patterns` não cobertos por keyword existente, ordenados por `hit_count` desc, dialog global na toolbar de `/categorias`, multi-select + aprovar em lote, descarte session-only (sem nova tabela).
- Nenhuma keyword criada sem ação explícita (sem auto-cadastro) — inline e batch ambos opt-in (critério de sucesso 4).
</specifics>

<deferred>
## Deferred Ideas

- Persistir candidatas descartadas ("não me sugira de novo") — exigiria nova tabela/coluna `dismissed`; fora do escopo enxuto do v1.6. Descarte fica session-only.
- Minerar `transactions` cruas (descritores nunca confirmados) como fonte de candidatas — KW-08 restringe a `merchant_patterns` confirmados.
- Derivação automática de um token/stem mais curto para o termo sugerido — heurística arriscada; mantém-se o `descriptor_norm` completo editável.
</deferred>
