# Phase 20: Auto-classificação por palavra-chave no upload - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Ao subir uma fatura, um descritor cujo `descriptor_norm` CONTÉM uma palavra-chave
cadastrada (Phase 19) chega pré-classificado para aquela categoria — sem clique, sem
chamar a IA, e corrigível antes do confirm. Fecha o pipeline determinístico
**memória → palavra-chave → IA**. Entrega KW-02/03/04/05.

**Fora de escopo:** cadastro de keywords (Phase 19, feito); kind gate / Marketplace
(Phase 18); regras de regex/wildcard (KW-F2); auto-sugestão de keywords (KW-F1); regras
de keyword para carro/reserva (escopo v1.5 = só CATEGORIAS).
</domain>

<decisions>
## Implementation Decisions

### Algoritmo de match
- **Substring:** match = `descriptor_norm.includes(keyword)`. Ambos já vêm normalizados
  pela MESMA função (`normalizeDescriptor`, src/lib/normalize.ts) — Phase 19 guarda o
  keyword normalizado, o parser gera `descriptor_norm` igual → comparação apples-to-apples.
- **Mais longa vence (KW-04):** quando >1 keyword casa, vence o keyword de maior
  comprimento (match mais específico). Empate de comprimento (categorias diferentes) →
  desempate determinístico pela ordem de `sort` da categoria.
- **Matcher puro + 1 fetch:** novo `src/lib/classifier/keywords.ts` —
  `matchKeyword(descriptorNorm, keywords[]): { categoryId } | null` (puro, in-memory).
  `import.ts` faz UM fetch de `category_keywords` (todas as linhas do usuário, RLS-scoped)
  ANTES do PASS 1 — sem query por linha (espelha o `categoryList` pré-fetch).
- **Guard:** `descriptor_norm === ''` casa nada.

### Ordem do pipeline + binding
- **Ordem (KW-03):** memória → palavra-chave → IA. Um hit de memória PREVALECE (pula
  keyword). A palavra-chave roda ANTES do pass de IA. A IA só é chamada para os
  descritores que sobraram (linhas com keyword NÃO entram no `missNorms` → menos chamadas).
- **Binding (KW-02):** um match de keyword é **pré-fill binding** — seta `category_id` +
  `classification_source = 'palavra-chave'` na linha, espelhando o pré-preenchimento da
  memória. NÃO é um `row.suggestion` não-vinculante (isso é só da IA, `source: 'ia'`).
- **Category-only:** a regra de keyword seta SÓ `category_id`; `reserva_id` fica `null`
  (etiquetagem de reserva/carro continua manual — escopo v1.5).

### Grid + persistência (KW-05)
- **Badge:** novo badge de proveniência **"palavra-chave"** na grid de revisão
  (`ProvenanceBadge`/`OriginBadge` em import-review-table.tsx), pill neutro espelhando o
  de "memória".
- **Sobrescrevível:** a linha pré-classificada por keyword é editável na grid como uma
  linha de memória (mesmo Select de categoria); trocar a categoria só muda o pick.
- **Sem auto-commit:** nada persiste até o confirm. O `confirmImport` aprende o padrão
  merchant→categoria na memória **como hoje** (a linha de keyword vira um
  `merchant_pattern` no confirm → da próxima vez é hit de memória). Loop de confirm/learn
  permanece intacto; sem escrita em `transactions`/`merchant_patterns` antes do confirm.
- **Tipo:** adicionar `'palavra-chave'` ao union `ClassificationSource`
  (`src/lib/parsers/types.ts`).

### Claude's Discretion
- Forma exata de `MemoryHit`-análogo para o keyword matcher (provavelmente só `categoryId`).
- Como o `origin` da `ReviewRow` (em import-review-table.tsx) deriva `'palavra-chave'` do
  `classification_source` + o markup do badge (espelhar o branch 'memória' do `ProvenanceBadge`).
- VERIFICAR no plano: o caminho de confirm (`import.ts:~791` mostrava
  `classification_source: r.categoryId ? 'memória' : null`) — garantir que ele não
  hardcoda 'memória' de um jeito que apague a origem 'palavra-chave', OU que isso seja
  irrelevante para a transação persistida (a origem é review-time). Tratar como detalhe a
  confirmar na pesquisa.
- Cobertura de testes: matcher puro (substring, longest-wins, empate, vazio), o pass no
  import (ordem memória>keyword>IA, keyword fora do missNorms), e o badge na grid.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/normalize.ts` `normalizeDescriptor` — REUSAR (keyword e descriptor_norm já normalizados pela mesma fn).
- `src/lib/classifier/memory.ts` `lookupMemory` — análogo de leitura; o matcher de keyword é in-memory (não point-read), mas espelha o contrato "hit → {categoryId} | null".
- `src/actions/import.ts` — PASS 1 (linhas ~455-488: `lookupMemory` por linha → `missNorms` em miss) + PASS 2 (~514-525: AI suggestions não-vinculantes). Inserir o keyword pass dentro do PASS 1: memory miss → tentar `matchKeyword` → hit seta category_id + source='palavra-chave' (NÃO adiciona a `missNorms`); só miss-de-tudo vai p/ IA. `categoryList`/keywords pré-fetch perto da linha 421.
- `src/lib/parsers/types.ts` — `ClassificationSource = 'memória' | 'manual' | 'sugerida' | null` (add `'palavra-chave'`); `ParsedReviewRow` + `suggestion?: {…source:'ia'}`.
- `src/components/import-review-table.tsx` — `ProvenanceBadge` (branch 'memória' ~linha 131) + `OriginBadge` (src/components/origin-badge.tsx) + `ReviewRow.origin` (~linha 218). Add a proveniência 'palavra-chave'.
- `src/actions/category-keywords.ts` (Phase 19) — fonte das keywords; o fetch no import lê `category_keywords` (id, category_id, keyword) sob RLS.

### Established Patterns
- Memory-first, UMA chamada de IA por upload sobre miss deduplicados (CLSAI-03). Keyword entra como camada determinística grátis ANTES da IA.
- "Pré-fill binding" (memória) seta `category_id`; "suggestion" (IA) é não-vinculante. Keyword segue o modelo de memória.
- Sem auto-commit antes do confirm; confirm aprende na memória. RLS em `category_keywords` (Phase 19) escopa o fetch ao usuário.
- TS estrito, sem JS.

### Integration Points
- `import.ts`: novo fetch de `category_keywords` + keyword pass no PASS 1.
- `keywords.ts` (novo): `matchKeyword`.
- `types.ts`: union `ClassificationSource` += 'palavra-chave'.
- `import-review-table.tsx` + `origin-badge.tsx`: nova proveniência/badge.
- `confirmImport` (a verificar): origem na persistência.
</code_context>

<specifics>
## Specific Ideas

- Exemplo: keyword "uber" em Transporte → uma linha "UBER *TRIP" (norm "uber trip") chega
  pré-classificada em Transporte com badge "palavra-chave", sem clique nem IA.
- Longest-wins: "mercado livre" (Marketplace) vence "mercado" (Alimentação) num descritor
  que contém ambos.
- Memória prevalece: se o merchant já foi confirmado antes, o hit de memória ganha mesmo
  que um keyword também case.
- Sem dependência de PROD: a lógica é local/testável; só precisa das migrations `0035`/
  `0036` aplicadas localmente (já estão) — nenhum push de PROD é gate desta fase.
</specifics>

<deferred>
## Deferred Ideas

- Regex/wildcard (KW-F2), auto-sugestão de keywords (KW-F1), regras de keyword p/
  reserva/carro — futuro / fora do escopo v1.5.
</deferred>
