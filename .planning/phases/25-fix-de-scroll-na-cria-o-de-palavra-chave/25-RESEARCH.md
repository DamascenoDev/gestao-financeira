# Phase 25: Fix de scroll na criação de palavra-chave (+ re-classificação ao vivo da grid) - Research

**Researched:** 2026-06-21
**Domain:** Next.js 16 App Router — Server Actions / Router Cache + estado de client component React (grid de revisão)
**Confidence:** HIGH

## Summary

O scroll jump tem causa-raiz **confirmada por leitura de código + comportamento oficial do Next.js**: o controle inline `KeywordInlineSuggest` (`src/components/import-review-table.tsx:1126`) NÃO chama `router.refresh()` — o único side-effect que reseta o scroll é `revalidatePath('/categorias')` dentro de `addKeyword` (`src/actions/category-keywords.ts:94`). Num Server Action, `revalidatePath` devolve no header da resposta um sinal de refresh; o client router **invalida o Router Cache, refaz o fetch da árvore RSC da rota ativa (`/importar/[statementId]`) e a re-renderiza** — o que reseta a posição de scroll. Remover o `revalidatePath` da chamada inline corta o sintoma na raiz, sem nenhum outro ajuste de scroll. Isso valida D-01/D-02/D-03.

O matcher de keyword (`src/lib/classifier/keywords.ts` — `compileRule`/`matchKeyword`/`KeywordRule`) é **puro e síncrono**: zero `import 'server-only'`, zero Supabase, zero APIs de Node, zero env — só `String`, `RegExp`, `Array`. É seguro importá-lo direto no client component e rodar o re-classify ao vivo (D-04) sem round-trip de servidor. Hoje ele já é importado no caminho de servidor (`import.ts`) e em testes puros sem mocks.

A semântica de classificação do pipeline de upload define como pontuar/etiquetar as linhas re-classificadas (D-05 + "Claude's Discretion" sobre confidence): **memória e palavra-chave são pré-preenchimentos BINDING** que setam `category_id` + `source` e **não carregam valor de confidence** — confidence só existe no `suggestion` (palpite NÃO-binding da IA). A IA nunca é auto-aplicada ao `category_id`. Logo, uma linha re-classificada por keyword na grid deve receber `category_id` + `origin: 'palavra-chave'` e **nenhum `confidence`** (espelha o upload). Detalhe crítico de D-05: **não existe `origin: 'ia'` em runtime** — a IA vive em `row.suggestion`, e quando o usuário aplica a sugestão o `origin` vira `'manual'` (protegido). Portanto "sobrescrever IA" só alcança linhas de IA **não aplicadas**, que continuam `category_id === null`.

**Primary recommendation:** Extrair o core de `addKeyword` num helper privado não-exportado; expor `addKeywordInline` = helper SEM `revalidatePath` (mantendo `addKeyword` = helper + revalidate para `/categorias`). No caller inline, após `{ ok }` ou `{ duplicate }`, rodar uma função PURA exportada (ex. `reclassifyRowsWithKeyword`) que aplica a nova keyword via `matchKeyword` sobre as rows em estado e atualiza `category_id`+`origin`('palavra-chave') in-place via `setRows`, **apenas** em linhas `category_id === null` ou `origin ∈ {'memória','palavra-chave'}`, **nunca** `origin === 'manual'`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Persistir keyword (insert + guards + dedupe) | API / Server Action | Database (RLS + unique constraint) | Escrita autenticada; `user_id` vem de `getClaims()`, nunca do client |
| Escopar o `revalidatePath` | API / Server Action | — | O sinal de refresh é decisão do Server Action; cortá-lo é puramente server-side |
| Re-classify ao vivo da grid | Browser / Client | — | Matcher puro roda em memória sobre estado do componente; D-04 exige zero round-trip / zero revalidate para não reintroduzir o scroll jump |
| Decisão de alvo/sobrescrita (origin) | Browser / Client | — | Opera sobre `ReviewRow[]` em estado; nenhum dado novo do servidor |
| Preservar scroll/seleção | Browser / Client | — | `setRows` imutável atualiza só os campos das linhas-alvo; sem refetch/refresh/remount |

## Standard Stack

Sem dependências novas. Fase 100% de código sobre o stack já instalado e travado.

### Core (já no projeto, reusado)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | 16.x | Server Actions + Router Cache | `[CITED: nextjs.org/docs/app/api-reference/functions/revalidatePath]` revalidatePath num Server Action invalida o Router Cache do client |
| React | 19.x | `useState`/`useTransition` na grid | `[VERIFIED: codebase]` `setRows` imutável já é o padrão de update da grid |
| TypeScript (strict) | 5.x | Tipagem estrita, sem JS | `[CITED: CLAUDE.md]` constraint do projeto |
| Vitest | (instalado) | Unit tests | `[VERIFIED: codebase]` `package.json` script `"test": "vitest run"`; `vitest.config.ts`/`vitest.setup.ts` presentes |

### Supporting (já no projeto, reusado)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | 4.4.x | `keywordSchema` (trim/min1/max60) | Guard 2 do helper — inalterado |
| `sonner` | 2.0.x | toasts ("adicionada"/"já cadastrada"/erro) | Já usado no popover inline; manter |
| `@testing-library/react` | (instalado) | Render/fireEvent nos testes de grid | Modelo: `import-review-table.test.tsx` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Helper privado + `addKeywordInline` (D-01/D-02) | Adicionar param `{ revalidate?: boolean }` a `addKeyword` | REJEITADO por D-01: muda o contrato compartilhado. O helper é a opção que deixa o path `/categorias` bit-idêntico (SC3) |
| `setRows` imutável in-place (D-04) | `router.refresh()` / refetch | REJEITADO: refresh É a causa do sintoma; reintroduziria o scroll jump |
| Re-classify client-side puro | Re-classify via Server Action | REJEITADO por D-04: round-trip + revalidate → scroll jump; o matcher é puro, não precisa do servidor |

**Installation:** N/A — nenhuma dependência nova.

## Package Legitimacy Audit

N/A — esta fase **não instala nenhum pacote externo**. Todo o trabalho é sobre módulos internos já no repositório (`src/actions/category-keywords.ts`, `src/components/import-review-table.tsx`, `src/lib/classifier/keywords.ts`, `src/lib/normalize.ts`). Sem superfície de slopsquat.

## Architecture Patterns

### System Architecture Diagram

```
USUÁRIO clica "+ palavra-chave" numa linha `manual` da grid /importar/[id]
        │  (popover prefilled com row.descriptor_norm, editável)
        ▼
  KeywordInlineSuggest.onSubmit()                       [CLIENT]
        │  startTransition(async () => …)
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  addKeywordInline(categoryId, term)   ◀── TROCA de addKeyword │  [SERVER ACTION]
  │  → helper privado: 4 guards + dup pre-check + insert + 23505  │
  │  → SEM revalidatePath  ◀── corta o sinal de refresh no header │
  │  retorna AddKeywordResult ({ok}|{duplicate}|{error})          │
  └─────────────────────────────────────────────────────────────┘
        │  Router Cache NÃO é invalidado → rota ativa NÃO re-renderiza → scroll preservado (SC1)
        ▼
  ramo do popover (inalterado, D-03):
   'error' in r  → setError, popover aberto          (sem re-classify)
   'duplicate'/'ok' → toast + onCreated(row.id)       → segue p/ re-classify
        ▼
  reclassifyRowsWithKeyword(rows, categoryId, normalizedKeyword)   [CLIENT, PURO]
        │  compileRule(categoryId, kw, sort) → matchKeyword por linha
        │  alvo: category_id === null  OU  origin ∈ {memória, palavra-chave}
        │  NUNCA origin === 'manual'  ◀── trava firme
        ▼
  setRows(prev => …)   →  linhas casadas: category_id=categoryId, origin='palavra-chave', suggestion intacta
        │  update imutável só dos campos das linhas-alvo
        ▼
  React re-renderiza linhas afetadas; scroll + rowSelection preservados (SC4/SC5)
```

A grid de `/categorias` continua usando `addKeyword` (com `revalidatePath('/categorias')`) — caminho intocado (SC3).

### Recommended Project Structure
Nenhum arquivo novo é estritamente necessário. A única decisão de estrutura é **onde** vive a função pura de re-classify:

```
src/
├── actions/
│   └── category-keywords.ts     # + helper privado + export addKeywordInline (mantém addKeyword)
├── components/
│   └── import-review-table.tsx  # swap do caller (L1162) + export reclassifyRowsWithKeyword + hook no onSubmit
└── lib/classifier/
    └── keywords.ts              # INALTERADO (matcher puro reusado client-side)
```

**Recomendação:** exportar `reclassifyRowsWithKeyword` de `import-review-table.tsx` (como já fazem `lowConfidenceFirst` e `confirmToastMessage`, exports puros testáveis sem render) — `[VERIFIED: codebase]` `import-review-table.tsx:224` e `:296`.

### Pattern 1: Helper privado + duas actions (D-01/D-02)
**What:** Extrair as 4 guards + dup pre-check + insert + backstop 23505 num helper não-exportado; `addKeyword` = helper + revalidate, `addKeywordInline` = helper sem revalidate.
**When to use:** Sempre que duas actions precisam do mesmo core mas side-effects diferentes.
**Example:**
```typescript
// Source: derivado de src/actions/category-keywords.ts:44-96 (addKeyword atual)
// Helper privado — core bit-idêntico ao addKeyword de hoje, SEM revalidatePath.
async function insertKeyword(
  categoryId: string,
  keyword: string,
): Promise<AddKeywordResult> {
  if (!idSchema.safeParse(categoryId).success) return { error: 'Identificador inválido.' }
  const parsed = keywordSchema.safeParse(keyword)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  const normalized = normalizeKeyword(parsed.data)
  if (normalized === '') return { error: 'Informe uma palavra-chave.' }
  if (normalized.replace(/\*/g, '') === '') return { error: 'Use ao menos uma letra ou número além de *.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { data: existing } = await supabase
    .from('category_keywords').select('id')
    .eq('category_id', categoryId).eq('keyword', normalized).maybeSingle()
  if (existing) return { duplicate: true }

  const { error } = await supabase.from('category_keywords')
    .insert({ user_id: userId, category_id: categoryId, keyword: normalized })
  if (error) {
    if (error.code === '23505') return { duplicate: true }
    return { error: 'Não foi possível salvar a palavra-chave.' }
  }
  return { ok: true }
}

export async function addKeyword(categoryId: string, keyword: string): Promise<AddKeywordResult> {
  const r = await insertKeyword(categoryId, keyword)
  if ('ok' in r) revalidatePath(CATEGORIAS_PATH) // path /categorias INALTERADO (SC3)
  return r
}

export async function addKeywordInline(categoryId: string, keyword: string): Promise<AddKeywordResult> {
  return insertKeyword(categoryId, keyword) // SEM revalidate → sem scroll jump (SC1)
}
```
*Nota de discrição (D-02): nome do helper/action e onde exatamente chamar o revalidate é livre, desde que as 4 guards fiquem bit-idênticas. A variante acima só revalida em `{ ok }`; o `addKeyword` de hoje revalida sempre depois do insert ok — observe que duplicate hoje retorna ANTES do revalidate, então "revalidate só em ok" preserva o comportamento atual.*

### Pattern 2: Re-classify puro sobre rows em estado (D-04/D-05)
**What:** Função pura `rows → rows` que aplica uma keyword nova via o matcher e atualiza só as linhas-alvo.
**When to use:** Hook após sucesso do `addKeywordInline`.
**Example:**
```typescript
// Source: matcher de src/lib/classifier/keywords.ts + padrão setRows de import-review-table.tsx:386
import { compileRule, matchKeyword } from '@/lib/classifier/keywords'

/** Aplica a keyword recém-criada às rows em estado (client-side, puro). */
export function reclassifyRowsWithKeyword(
  rows: ReviewRow[],
  categoryId: string,
  normalizedKeyword: string, // já passou por normalizeKeyword (preserva `*`)
): ReviewRow[] {
  const rule = compileRule(categoryId, normalizedKeyword, 0) // sort irrelevante: regra única
  if (rule === null) return rows // keyword degenerada ('' / só `*`) — no-op defensivo
  return rows.map((r) => {
    // D-05: NUNCA tocar manual (intenção explícita do usuário).
    if (r.origin === 'manual') return r
    // Alvo: não-classificada OU auto-classificada (memória/palavra-chave).
    const overridable = r.category_id === null || r.origin === 'memória' || r.origin === 'palavra-chave'
    if (!overridable) return r
    if (matchKeyword(r.descriptor_norm, [rule]) === null) return r
    return { ...r, category_id: categoryId, origin: 'palavra-chave' as const }
    // suggestion fica intacta (não-binding); confidence NÃO se aplica a keyword (espelha upload).
  })
}
```
Hook no `onSubmit` (após `onCreated(row.id)`):
```typescript
// dentro de KeywordInlineSuggest, precisa receber um callback do pai (lift state):
// onKeywordCreated(categoryId, normalizeKeyword(value.trim()))
// → no pai: setRows((prev) => reclassifyRowsWithKeyword(prev, categoryId, normalized))
```
*Nota de arquitetura: `KeywordInlineSuggest` não tem acesso a `setRows` hoje. O planner precisa passar um callback do componente pai (`ImportReviewTable`) para o filho — espelha o padrão de `onCreated`/`markKeywordCreated` (`import-review-table.tsx:365`,`:1135`,`:1174`).*

### Anti-Patterns to Avoid
- **`router.refresh()` ou refetch após o create inline:** reintroduz exatamente o sintoma do bug (refresh re-renderiza a rota ativa → scroll reset). `[CITED: nextjs.org/docs/app/api-reference/functions/use-router]`
- **Mexer no `revalidatePath('/categorias')` do `addKeyword`/`removeKeyword`/`approveKeywordSuggestions`:** fora de escopo; `/categorias` PRECISA do refresh (SC3).
- **Re-normalizar `descriptor_norm` ou a keyword no matcher:** `[VERIFIED: codebase]` `keywords.ts:8-11` — re-derivar re-stripa o `*` (landmine). O matcher nunca re-normaliza; passe os valores já normalizados.
- **Sobrescrever `origin === 'manual'`:** trava firme repetida (D-05 + CONTEXT §specifics). Inclui rows de IA já aplicadas (viram `'manual'`).
- **Atribuir `confidence` à linha re-classificada:** keyword é binding e SEM confidence no pipeline (`import.ts:501-505`). Inventar um número diverge do upload e dispararia a `ConfidenceTag` indevidamente.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Casar keyword↔descriptor | Novo matcher de substring/glob | `matchKeyword`/`compileRule` (`keywords.ts`) | Já é puro, ReDoS-safe, longest/most-specific-wins, test-pinado; é o MESMO matcher do upload (`import.ts:501`) → "casou" significa exatamente o que classificação significa |
| Normalizar a keyword | Lower/strip ad-hoc | `normalizeKeyword` (`normalize.ts:63`) | Preserva o glob `*` (KW-09); já chamado no popover (`import-review-table.tsx:1159`) |
| Validar a keyword | Regex de length inline | `keywordSchema` (`schemas/category-keyword.ts`) | trim/min1/max60 + mensagens pt-BR travadas |
| Update imutável da grid | Mutar `rows`/forçar re-render | `setRows((prev) => prev.map(...))` | Padrão já estabelecido (`classifyRow:386`, `applyAllSuggestions:420`, `tagCarroRow:446`) — preserva scroll e `rowSelection` |

**Key insight:** Tudo que esta fase precisa já existe e é puro/reusável. O risco não é construir errado — é construir de novo o que já está testado.

## Runtime State Inventory

> Fase de fix de UX + lógica de client; **não** é rename/migração de dados. Inventário curto para descartar surpresas de estado.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Nenhum. A keyword JÁ é persistida hoje pelo path inline (via `addKeyword`); o fix só remove o `revalidate`, não muda a escrita. Re-classify ao vivo é PRÉ-persist (rows em estado; nada vai a `transactions` até "Confirmar importação"). `[VERIFIED: codebase]` `import-review-table.tsx:309` | Nenhuma — verificado por leitura |
| Live service config | Nenhum — sem serviço externo envolvido | Nenhuma |
| OS-registered state | Nenhum | Nenhuma |
| Secrets/env vars | Nenhum | Nenhuma |
| Build artifacts | Nenhum — sem migração SQL, sem `gen:types` (schema inalterado) | Nenhuma — confirmar que o diff de `database.types.ts` fica vazio |

**Nota de provenance ao persistir:** o re-classify ao vivo NÃO persiste `origin`. Quando o usuário confirma a importação, a provenance é **RE-DERIVADA server-side** em `confirmImport` via o mesmo `matchKeyword` (`import.ts:849-897`). Como a keyword nova já existe no banco, uma linha re-classificada por keyword será re-derivada como `'palavra-chave'` na persistência — consistente. Isso é confirmação importante: a grid e o persist concordam sem trabalho extra.

## Common Pitfalls

### Pitfall 1: "Origin 'ia' não existe" — semântica de D-05 mal-entendida
**What goes wrong:** O planner trata "sobrescrever IA" como sobrescrever `origin === 'ia'`. Esse valor NUNCA aparece.
**Why it happens:** O union de `ReviewRow.origin` é `'memória' | 'palavra-chave' | 'manual' | 'não classificada'` (`import-review-table.tsx:253`). A IA vive em `row.suggestion` (não-binding); ao aplicar, `origin` vira `'manual'`.
**How to avoid:** "Sobrescrever IA" = sobrescrever linhas de IA **não aplicadas**, que continuam `category_id === null` (alcançadas pela cláusula `category_id === null`). IA aplicada é `'manual'` → protegida (e é o comportamento correto: o usuário já decidiu).
**Warning signs:** Código testando `origin === 'ia'`; testes que esperam sobrescrever uma sugestão de IA já aplicada.

### Pitfall 2: Lift-state esquecido — `KeywordInlineSuggest` não enxerga `setRows`
**What goes wrong:** Tenta-se chamar `reclassifyRowsWithKeyword` dentro de `KeywordInlineSuggest`, que não tem `rows`/`setRows`.
**Why it happens:** O componente filho só recebe `row`, `categoryName`, `created`, `onCreated` (`import-review-table.tsx:1126-1136`).
**How to avoid:** Adicionar um callback do pai (ex. `onKeywordCreated(categoryId, normalizedKeyword)`) — exatamente o padrão de `onCreated`. O pai roda `setRows((prev) => reclassifyRowsWithKeyword(...))`.
**Warning signs:** `setRows is not defined` no filho.

### Pitfall 3: Re-classify disparando no ramo de erro
**What goes wrong:** Re-classify roda mesmo quando o create falhou.
**Why it happens:** Hook colocado fora do guard de resultado.
**How to avoid:** Disparar SÓ em `{ ok }` ou `{ duplicate }` (a keyword existe em ambos). NUNCA em `'error' in r` (`import-review-table.tsx:1163-1174` mostra exatamente onde ramificar). Em `{ duplicate }` a keyword também existe → re-classify ainda faz sentido (alinha a grid à keyword existente).
**Warning signs:** Linhas re-classificadas após um toast de erro.

### Pitfall 4: Keyword degenerada chegando ao matcher
**What goes wrong:** keyword só-`*` (`*`/`**`) "casaria tudo".
**Why it happens:** Se o re-classify usasse a keyword sem `compileRule`.
**How to avoid:** `compileRule` retorna `null` para literal-count-0 (`keywords.ts:85`) — a função pura faz no-op (defesa em profundidade; o cadastro já rejeita, `category-keywords.ts:64`). Usar `compileRule` + checar `null`.
**Warning signs:** Todas as linhas viram a categoria nova após criar `*`.

## Code Examples

### Trocar o caller inline (D-03)
```typescript
// Source: src/components/import-review-table.tsx:1162 (atual)
// ANTES:
const r = await addKeyword(row.category_id!, value)
// DEPOIS (mesma union AddKeywordResult → branching inalterado):
const r = await addKeywordInline(row.category_id!, value)
// import atualizado no topo (L78):
// import { addKeyword, addKeywordInline } from '@/actions/category-keywords'  (addKeyword segue para /categorias)
```

### Disparar o re-classify após sucesso
```typescript
// Source: src/components/import-review-table.tsx:1158-1177 (onSubmit atual)
function onSubmit() {
  const normalized = normalizeKeyword(value.trim())
  setError(undefined)
  startTransition(async () => {
    const r = await addKeywordInline(row.category_id!, value)
    if ('error' in r) { setError(r.error); return }
    if ('duplicate' in r) toast.info(`"${normalized}" já está cadastrada.`)
    else toast.success(`"${normalized}" adicionada a ${categoryName}.`)
    onCreated(row.id)
    onKeywordCreated(row.category_id!, normalized) // ◀── novo callback do pai → setRows(reclassify…)
    setOpen(false)
  })
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `revalidatePath` no path inline | Server Action sem revalidate para mutação que não deve refrescar a rota ativa | Comportamento do Next.js App Router (atual) | `[CITED: github.com/vercel/next.js/discussions/54075]` `revalidatePath` num Server Action invalida TODO o Router Cache do client → refetch+re-render da rota ativa |

**Deprecated/outdated:** nada relevante a esta fase. (`@supabase/auth-helpers-nextjs` e pdf-parse v1 não tocam aqui.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Linha re-classificada por keyword deve NÃO carregar `confidence` (espelha o upload, onde keyword é binding e sem confidence) | Pattern 2, Pitfall sobre confidence | Baixo — se um confidence fosse desejado, a `ConfidenceTag` poderia disparar; mas o pipeline (`import.ts:501-505`) é a fonte de verdade e não atribui confidence a keyword. "Claude's Discretion" no CONTEXT pede alinhar com o pipeline → sem confidence é o alinhamento correto |
| A2 | Em `{ duplicate }` o re-classify deve rodar (a keyword existe) | Pitfall 3, Code Examples | Baixo — alinha a grid a uma keyword que já existe; UX consistente. Se o founder preferir só em `{ ok }`, é uma linha de guard. Confirmar no plan-review/UAT |

*Demais decisões de escopo (D-01..D-06) já estão travadas no CONTEXT — não são assumptions.*

## Open Questions

1. **Re-classify em `{ duplicate }`: rodar ou não?**
   - What we know: a keyword existe tanto em `ok` quanto em `duplicate`; re-classificar alinha a grid à keyword existente.
   - What's unclear: o founder pode preferir que duplicate seja um no-op total na grid.
   - Recommendation: rodar nos dois (mais consistente); marcar como ponto de confirmação no UAT (A2).

2. **`reclassifyRowsWithKeyword` exportada vs inline closure**
   - What we know: o repo já exporta puros (`lowConfidenceFirst`, `confirmToastMessage`) justamente para testá-los sem render.
   - What's unclear: nada — é escolha de testabilidade.
   - Recommendation: exportar a função pura (D-06 fica trivial de cobrir sem `@testing-library`).

## Environment Availability

> Sem dependências externas — fase de código/lógica. Apenas o toolchain já presente.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vitest | Unit tests (D-06) | ✓ | instalado (`package.json` `test: vitest run`) | — |
| @testing-library/react | testes de grid existentes | ✓ | instalado (usado em `import-review-table.test.tsx`) | função pura exportada dispensa render |
| Chrome MCP | UAT vivo (D-06) | ✓ (padrão do repo) | — | UAT manual no browser |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react |
| Config file | `vitest.config.ts` (+ `vitest.setup.ts`) |
| Quick run command | `npx vitest run src/actions/category-keywords.test.ts src/components/import-review-table.test.tsx` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UX-01 | `addKeywordInline` NÃO chama `revalidatePath` (e `addKeyword` continua chamando) | unit | `npx vitest run src/actions/category-keywords.test.ts` | ✅ (estender) |
| UX-01 | core do helper bit-idêntico: 4 guards + dup + 23505 valem para AMBAS as actions | unit | idem | ✅ (estender) |
| UX-02 | re-classify aplica em `category_id === null` e sobrescreve `origin ∈ {memória,palavra-chave}` | unit | `npx vitest run src/components/import-review-table.test.tsx` | ✅ (estender — testar a função pura) |
| UX-02 | re-classify PRESERVA `origin === 'manual'` | unit | idem | ✅ |
| UX-02 | linha re-classificada recebe `origin === 'palavra-chave'` (e nenhum confidence) | unit | idem | ✅ |
| UX-02 | keyword degenerada (`*`) → no-op (compileRule null) | unit | idem | ✅ |
| UX-01+UX-02 | scroll não pula + outras linhas atualizam ao criar inline | manual | UAT Chrome MCP | manual-only (scroll/refresh é runtime do browser) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/actions/category-keywords.test.ts src/components/import-review-table.test.tsx`
- **Per wave merge:** `npm test`
- **Phase gate:** suite verde + UAT vivo (scroll preservado + re-classify visível) antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Estender `src/actions/category-keywords.test.ts` — assert `addKeywordInline` NÃO revalida + paridade de guards/dup/23505 (modelo: asserts `revalidatePath` em L161/L361/L390/L419)
- [ ] Estender `src/components/import-review-table.test.tsx` — testes da função pura `reclassifyRowsWithKeyword` (null+memória+palavra-chave sobrescrevem; manual preserva; provenance vira 'palavra-chave'; degenerada no-op)
- [ ] Sem framework/config a instalar — infra existente cobre.

*(Manual-only justificado: o scroll jump e o "sem refresh" são comportamento de runtime do Router Cache no browser — não reproduzíveis em jsdom; ficam para o UAT vivo, conforme D-06.)*

## Security Domain

> `security_enforcement` assumido habilitado. Superfície mínima — sem novo input não validado, sem mudança de auth.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | sem mudança; `getClaims()` no helper (inalterado) |
| V3 Session Management | no | inalterado |
| V4 Access Control | yes | `idSchema` uuid no `categoryId` + RLS (`auth.uid() = user_id`) + `user_id` de `getClaims()`, NUNCA do client — preservados bit-idênticos no helper |
| V5 Input Validation | yes | `keywordSchema` (trim/min1/max60) + `normalizeKeyword` + rejeição de literal-count-0 — inalterados; re-classify client-side usa SÓ valores já normalizados/validados |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for Next.js + Supabase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Keyword forjada em categoria de terceiro | Elevation of Privilege | RLS + `user_id` do servidor (inalterado no helper); `idSchema` uuid |
| ReDoS via glob `*` na keyword | Denial of Service | `compileRule`/`globToRegExp` são linear-time ReDoS-safe (`keywords.ts:32-44`); roda agora client-side sobre input do próprio usuário |
| Vazamento de erro cru do DB | Information Disclosure | Helper nunca vaza erro cru (`{ error: 'Não foi possível salvar…' }`) — preservado |

**Nota de segurança:** rodar o matcher client-side NÃO é uma fronteira de confiança nova — as keywords e `descriptor_norm` já estão no client (estado da grid). A escrita real continua 100% server-side com as mesmas guards e RLS.

## Project Constraints (from CLAUDE.md)

- **TypeScript estrito, sem JavaScript** — `reclassifyRowsWithKeyword` e o helper devem ser totalmente tipados; o `as const` em `origin: 'palavra-chave'` é necessário para estreitar ao union.
- **Next.js App Router** — não usar `router.refresh()` no path inline (causa do bug).
- **Supabase RLS + `user_id` do servidor** — o helper preserva `getClaims().claims.sub`; nunca aceitar `user_id` do client.
- **Integer cents** — não tocado (re-classify só muda `category_id`/`origin`).
- **Vitest + UAT Chrome MCP** — padrão de verificação travado em D-06.
- **GSD workflow** — edições só via comando GSD.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UX-01 | Criar keyword inline na grid preserva o scroll (não reseta ao topo) | Causa-raiz confirmada (`revalidatePath` no Server Action → invalida Router Cache → re-render da rota ativa). Fix: `addKeywordInline` SEM revalidate via helper privado (Pattern 1). `[VERIFIED: codebase + nextjs docs]` |
| UX-02 | Ao criar keyword inline, demais linhas re-classificadas ao vivo (client-side, sem refresh): aplica em `category_id === null`, sobrescreve memória/IA que casam, nunca `manual`, marca `'palavra-chave'` | Matcher puro client-safe confirmado; semântica de target/sobrescrita mapeada contra `import.ts` (memória/keyword binding sem confidence; "IA" não-aplicada = `category_id null`; aplicada = `manual`). Função pura `reclassifyRowsWithKeyword` (Pattern 2). `[VERIFIED: codebase]` |

## Sources

### Primary (HIGH confidence)
- `src/actions/category-keywords.ts` (L1-288) — `addKeyword` + 4 guards + dup pre-check + 23505 + `revalidatePath('/categorias')` (L94); padrões de `removeKeyword`/`approveKeywordSuggestions`
- `src/lib/classifier/keywords.ts` (L1-165) — `compileRule`/`matchKeyword`/`KeywordRule` PUROS (sem server-only/Supabase/Node/env); `globToRegExp` ReDoS-safe; literal-count-0 → null
- `src/lib/normalize.ts` (L1-103) — `normalizeKeyword` preserva `*`; nunca re-normalizar
- `src/actions/import.ts` (L478-558, L818-897) — pipeline: memória→palavra-chave→IA; keyword BINDING sem confidence; IA não-binding em `suggestion`; provenance RE-DERIVADA no confirm
- `src/components/import-review-table.tsx` (L240-473, L1112-1244) — `ReviewRow` union de `origin`; `setRows` imutável (`classifyRow`/`applyAllSuggestions`); `KeywordInlineSuggest` SEM `router.refresh()`; caller L1162; exports puros `lowConfidenceFirst`/`confirmToastMessage`
- `src/app/(app)/importar/[statementId]/page.tsx` (L193-224) — mapeamento `classification_source`→`origin`; só `memória`/`palavra-chave`/`não classificada` em parse-time (NUNCA `ia`)
- `src/actions/category-keywords.test.ts` + `src/components/import-review-table.test.tsx` — harness vitest (mock `next/cache` + assert `revalidatePath`; render/fireEvent)

### Secondary (MEDIUM confidence)
- https://nextjs.org/docs/app/api-reference/functions/revalidatePath — semântica de revalidatePath em Server Action
- https://nextjs.org/docs/app/api-reference/functions/use-router — `scroll: false` / comportamento de refresh

### Tertiary (LOW confidence)
- https://github.com/vercel/next.js/discussions/54075 — discussão comunitária confirmando invalidação do Router Cache do client por `revalidatePath` (concorda com a doc oficial)

## Metadata

**Confidence breakdown:**
- Causa-raiz do scroll: HIGH — leitura de código (sem `router.refresh()` no inline; único side-effect é o revalidate) + comportamento documentado do Next.js
- Pureza do matcher (client-safe): HIGH — leitura do módulo; zero deps de servidor; já testado puro
- Semântica de target/sobrescrita/confidence: HIGH — mapeada direto contra `import.ts` e o union de `origin`
- Padrão de fix (helper + 2 actions): HIGH — deriva 1:1 do `addKeyword` atual
- Testabilidade: HIGH — exports puros + harness vitest existente

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (estável; nada de fast-moving além do detalhe de Router Cache do Next.js, que é o comportamento atual da versão travada 16.x)

Sources:
- [Next.js — revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
- [Next.js — useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router)
- [Next.js Discussion #54075 — Caching and Revalidating](https://github.com/vercel/next.js/discussions/54075)
