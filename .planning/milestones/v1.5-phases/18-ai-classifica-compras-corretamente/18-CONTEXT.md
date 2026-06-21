# Phase 18: AI classifica compras corretamente - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

A camada de IA já wired no v1.4 (`src/lib/ai/classify.ts`) para de errar a classe de
compras de marketplace. Duas entregas:

- **CLSAI-09**: o prompt de classificação por IA passa a ser *kind-aware* — cada
  categoria é enviada com seu `kind` (`consumo`/`alocacao`) e o modelo é instruído a
  NUNCA atribuir categoria de alocação (Investimentos/Reserva) a um gasto. Corrige a
  classe de erro "AliExpress/Mercado Livre → Investimentos".
- **MKT-01**: a categoria default "Marketplace" (migration `0035`, já no repo) está
  aplicada em PROD e presente na conta — dando à IA um bucket de compras sensato.

**Fora de escopo:** trocar/abandonar a IA; regras de palavra-chave (Phases 19/20);
match por regex; OCR de PDF. Nenhuma mudança de schema (0035 é só dados + trigger).
</domain>

<decisions>
## Implementation Decisions

### Design do prompt kind-aware (CLSAI-09)
- **Formato do kind:** tag inline por linha de categoria — `id: nome (consumo)` /
  `(alocação)`. Mudança mínima em `buildUserText`; o modelo vê o `kind` ao lado de
  cada opção, mantendo a lista única.
- **Força da regra anti-alocação:** regra **dura** no `SYSTEM_PROMPT` — "NUNCA atribua
  uma categoria de alocação a um gasto; se a melhor opção for de alocação, retorne
  `categoryId: null`". Casa o "NÃO atribuir" do CLSAI-09 e o contrato null-quando-não-
  encaixa já existente.
- **Glossário do kind:** uma linha no system prompt ancorando a semântica —
  "consumo = compra/gasto; alocação = mover dinheiro para investimento ou reserva".
  Não confia apenas no rótulo.

### Defesa em profundidade — gate de código
- **Nulificar em código:** SIM. Um descritor de fatura é sempre um gasto; qualquer
  `categoryId` cuja categoria tenha `kind = 'alocacao'` é erro por definição → vira
  `null`. Belt-and-suspenders consistente com o princípio "nunca confie no modelo"
  (mesmo espírito do enum gate `validateSuggestion`).
- **Onde:** dentro de `classifyDescriptors`, logo após `validateSuggestion` — o mesmo
  ponto onde o id é validado contra os ids possuídos. Categoria escolhida com
  `kind !== 'consumo'` → `null`.
- **Threading do kind:** `classifyDescriptors` e `suggestDescriptor` passam a receber
  categorias na forma `{ id, name, kind }`; `import.ts` troca `select('id, name')` por
  `select('id, name, kind')`. Sem segundo lookup.

### MKT-01 — Marketplace em PROD + verificação
- **Quem aplica `0035`:** o **usuário** roda `supabase db push` (mutação em PROD = ação
  do dono). Claude verifica antes com `supabase migration list` e, se faltar, instrui o
  push (sugerir `! supabase db push`). Claude NÃO roda push em PROD autonomamente.
- **"Presente na conta" com PROD wiped:** aplicar a migration ANTES do próximo signup —
  o `handle_new_user` re-seeded (part 1 da `0035`) já cria Marketplace na conta nova;
  contas pré-existentes pegam pelo backfill idempotente (part 2).
- **Escopo de verificação:** split — CLSAI-09 é verificável por teste (prompt contém
  kind + regra; gate de código nula alocação). MKT-01 é **human-verify** (signup em
  PROD + ver a categoria "Marketplace" na conta), pois PROD foi wiped e exige re-signup.

### Claude's Discretion
- Cobertura de testes: estender `classify.test.ts` (fixture `CATEGORIES` ganha `kind`;
  asserts: prompt inclui kind+regra, sugestão `alocacao` para gasto → `null`). Seguir
  os padrões dos describes existentes (CLSAI-03/04/06, SEC-03).
- Texto exato do system prompt e do gloss (PT-BR, conciso).
- Atualização de quaisquer outros call sites de `suggestDescriptor`/`validateSuggestion`
  que o threading do `kind` exigir para compilar (TS estrito).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/ai/classify.ts` — `classifyDescriptors(descriptors, categories, aiSettings)`:
  `SYSTEM_PROMPT`, `buildUserText`, `JSON_SCHEMA` flat (portável Gemini/Claude), enum
  gate via `validateSuggestion`, never-throw → Map vazio. Ponto central da mudança.
- `src/lib/classifier/suggest.ts` — `suggestDescriptor` (single-descriptor → delega ao
  batch) e `validateSuggestion` (enum gate sobre ids possuídos). Recebe `categories`.
- `src/lib/schemas/category.ts` — `CATEGORY_KINDS = ['consumo','alocacao']`,
  `type CategoryKind`. Fonte do enum.
- `supabase/migrations/0035_categories_marketplace.sql` — JÁ existe: re-seed de
  `handle_new_user` (Marketplace sort 9, `consumo`) + backfill idempotente. Sem mudança
  de schema → `database.types.ts` inalterado.

### Established Patterns
- Memory-first em `import.ts`: memória → (futuro: palavra-chave) → IA. UMA chamada de IA
  por upload sobre o set deduplicado de miss `descriptor_norm` (CLSAI-03).
- "Nunca confie no modelo": toda saída do LLM passa por gate (`validateSuggestion`); o
  novo gate de `kind` segue o mesmo ponto.
- PII-safety (SEC-03): só `descriptor_norm` + linhas `id: nome` egressam. Adicionar
  `(kind)` é metadado de categoria, não PII — mantém a invariante.
- `kind` já é enum no schema (`'consumo' | 'alocacao'`) e usado em adherence/export/csv.

### Integration Points
- `src/actions/import.ts:422-423` — `from('categories').select('id, name')` →
  `select('id, name, kind')`; `categoryList` passado a `classifyDescriptors` (linha 491).
- `src/lib/ai/classify.test.ts` — fixture `CATEGORIES` e describes (CLSAI-03/04/06,
  SEC-03) a estender.
- PROD: `supabase db push` (usuário) + `supabase migration list` (verificação).
</code_context>

<specifics>
## Specific Ideas

- Classe de erro alvo, citada na própria migration `0035`: "AliExpress / Mercado Livre →
  'Investimentos'". O fix é tanto o bucket Marketplace (MKT-01) quanto a regra de kind
  (CLSAI-09).
- Memória do projeto: PROD foi WIPED (conta de teste deletada em 2026-06-19) → MKT-01 e a
  verificação live de CLSAI-09 dependem de um re-signup + re-entrada da chave BYOK.
- Gemini default = `gemini-2.5-flash-lite` (único com free-tier; 503-prone → CLSAI-06
  degrada e o re-upload tenta de novo).
</specifics>

<deferred>
## Deferred Ideas

- Regras de palavra-chave por categoria (cadastro + auto-classificação no upload) —
  Phases 19 e 20 deste milestone.
- Gate de `kind` para descritores que NÃO sejam gasto (ex.: créditos/estornos) — fora de
  escopo; o caminho atual classifica line-items de fatura (gastos).
</deferred>
