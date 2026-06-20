# Phase 21: Match wildcard + procedência persistida - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

O matcher determinístico de palavra-chave (`matchKeyword` em `src/lib/classifier/keywords.ts`, usado no pipeline de `src/actions/import.ts`) ganha duas capacidades, sem regressão do comportamento shipado no v1.5:

1. **Wildcard glob** (`*`) numa keyword — `UBER*`, `*IFOOD*` — opt-in, além do match por substring atual. Regex puro fica fora (deferido como KW-F por risco de ReDoS).
2. **Procedência persistida** — uma linha classificada por keyword, ao ser confirmada, grava `classification_source = 'palavra-chave'` em `transactions` (hoje grava o coarse `memória` porque o CHECK da migration `0020` não permite o valor). Ampliado via nova migration.

Cobre KW-09 (wildcard) e KW-10 (procedência). NÃO inclui: sugestão de keywords (Phase 22), aplicar-em-lote (Phase 23), regex puro, OCR, auto-commit.
</domain>

<decisions>
## Implementation Decisions

### Wildcard semantics & matching
- `*` = glob "zero ou mais caracteres" (semântica padrão).
- Implementação ReDoS-safe: escapar todos os metacaracteres de regex do literal, trocar `*` por `.*`, ancorar `^…$`, casar linear contra `descriptor_norm`. Sem backtracking catastrófico (regex anchored com um único `.*` por segmento é linear). Manual two-pointer é alternativa aceitável se preferível, mas o regex anchored escapado é o caminho recomendado.
- Dicotomia opt-in: um padrão **com** `*` é avaliado como **glob ancorado** (`^` + literais escapados + `.*` + `$`) — então `UBER*` casa `UBER TRIP 123` (prefixo) e `*IFOOD*` ≡ "contém IFOOD". Um termo **sem** `*` continua sendo o `descriptorNorm.includes(keyword)` substring atual (comportamento v1.5 intacto).
- Case/acento: matching permanece no espaço do `normalizeDescriptor` (ambos os lados já vêm uppercase + sem acento da Phase 19/parser); nenhum tratamento extra de caixa/acento.

### Longest-wins specificity with wildcards
- Métrica de especificidade para o tie-break: **contagem de caracteres literais** (não-`*`) do padrão. `UBER*` = 4 literais (vence `UB*`=2, perde para o substring `UBER TRIP`=9). Proxy honesto de "quanto o padrão ancora".
- Empate de contagem-literal: **substring contíguo vence glob** (mais restrito) → depois `categories.sort` → depois `categoryId` (preserva a cadeia de tie-break determinística do v1.5; nenhum descritor troca de categoria silenciosamente entre uploads).
- Sem fallback cruzado: padrão **com** `*` é glob-only; **sem** `*` é substring-only. Limpo e opt-in.
- Padrões degenerados (`*`, `**`, só wildcard sem literal) são **pulados** — casariam tudo; espelha o guard de keyword vazia já existente em `matchKeyword`.

### Persisted provenance (`palavra-chave`)
- Migration: nova `0037` que faz drop+recreate do CHECK de `transactions.classification_source` adicionando `'palavra-chave'` ao conjunto permitido (`'memória'`,`'manual'`,`'sugerida'`,`null` → + `'palavra-chave'`). Mantém o tipo `text` + CHECK (não converte para enum Postgres).
- Sem backfill das linhas antigas marcadas com o coarse `memória` — não dá para reconstruir post-hoc quais eram realmente keyword; só confirmações novas gravam `'palavra-chave'`. Histórico fica como está.
- Fonte da procedência no persist: **re-derivada server-side** no confirm (re-roda memória→keyword sobre a base row autoritativa), coerente com WR-01 (servidor é a fonte da verdade; não confia no source vindo do cliente).
- Escopo restrito a keyword: memória→`'memória'`, keyword→`'palavra-chave'`. Linha com `category_id` presente que não casa nem memória nem keyword (pick manual / sugestão IA aceita pelo usuário na grid) mantém o coarse `'memória'` de hoje — **sem regressão**, sem tentar desambiguar manual/IA neste phase (isso seria scope creep além de KW-10).

### Claude's Discretion
- Naming/arquivo exato da nova migration (`0037_*`), nome de helper de glob, e onde exatamente threadar a re-derivação no confirm — à discrição, seguindo as convenções do repo.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/classifier/keywords.ts` — `matchKeyword(descriptorNorm, rules)` puro + síncrono, longest-wins via `rule.keyword.length` → `rule.sort` → `rule.categoryId`. `KeywordRule { categoryId, keyword, sort }`. Ponto de extensão central para o wildcard.
- `src/lib/classifier/keywords.test.ts` + `src/actions/import.test.ts` + `src/actions/category-keywords.test.ts` — testes existentes do matcher; estender (não regredir) o longest-wins + adicionar casos glob.
- `src/actions/import.ts:438-452` — pre-fetch ÚNICO das `category_keywords` (`category_id, keyword, categories(sort)`) antes do PASS 1; in-memory scan (evita N-queries WR-02). O wildcard não muda esse contrato de fetch.
- `src/actions/import.ts:489-514` — review-time já seta `source = 'palavra-chave'` (linha 502) na `ParsedReviewRow` quando `matchKeyword` casa. O badge da grid já existe.

### Established Patterns
- Migrations SQL versionadas em `supabase/migrations/`; CHECK em `0020_transactions_import.sql:25-27` é o alvo do widening. Padrão de `0036_category_keywords.sql` (RLS + grants + índices) é o template de estilo.
- `normalizeDescriptor` (Phase 19) é a ÚNICA normalização — a keyword é gravada normalizada e o parser emite `descriptor_norm`; o matcher NUNCA re-normaliza nenhum lado.
- WR-01: o payload de insert das transactions é montado da base server-persistida (amount/occurred_on/descriptor_norm/dedupe_key/kind), NUNCA do cliente — a re-derivação da procedência segue o mesmo princípio.

### Integration Points
- **O bug exato (KW-10):** `src/actions/import.ts:821-829` — comentário WR-02 + `classification_source: r.categoryId ? 'memória' : null`. Os `authoritativeRows` (`r`) carregam `r.categoryId` e `r.base` mas NÃO o `source` do review. Persist precisa: (a) CHECK ampliado, (b) re-derivar memória/keyword sobre `r.base.descriptor_norm` para escolher `'memória'` vs `'palavra-chave'`.
- Regenerar `src/types/database.types.ts` após a migration (hook de pre-commit já reescreve — ver memória dev-env). O CHECK é texto, então o tipo TS não muda, mas a constraint live sim.
- `OriginBadge` / UI da grid já renderiza `'palavra-chave'` (review-time); persistir o valor real faz o badge ficar consistente pós-confirm.
</code_context>

<specifics>
## Specific Ideas

- Exemplos canônicos dos success criteria a cobrir em teste: `UBER*` casa `UBER TRIP 123`; `*IFOOD*` casa em qualquer posição; substring sem `*` continua funcionando; conflito multi-categoria → mais específico (mais literais) vence.
- GOTCHA do v1.5 a fechar (memória do projeto): o CHECK de `0020` só aceitava `'memória'/'manual'/'sugerida'` → keyword persistia como coarse `'memória'`. Esta phase é exatamente o fix.
</specifics>

<deferred>
## Deferred Ideas

- **KW-F (regex puro)** em palavra-chave — fora por risco de ReDoS + erro de usuário; reavaliar só se o wildcard glob se mostrar insuficiente. (Já em Future Requirements.)
- Desambiguar procedência de picks manuais / sugestões IA aceitas no persist (hoje coarse `'memória'`) — fora do escopo de KW-10, que é só a procedência keyword.
- Backfill histórico das linhas coarse `'memória'` — descartado (dados não reconstruíveis).
</deferred>
