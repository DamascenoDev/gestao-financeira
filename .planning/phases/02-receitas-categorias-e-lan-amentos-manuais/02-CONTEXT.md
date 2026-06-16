# Phase 2: Receitas, categorias e lançamentos manuais - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all 3 grey areas accepted as recommended

<domain>
## Phase Boundary

Entrega o loop de dados manual: o usuário registra de onde vem o dinheiro (receitas recorrentes + avulsas) e para onde vai (transações manuais), gerencia categorias editáveis, e vê um extrato filtrável — tudo à mão, provando o modelo antes de qualquer upload/IA (fases 4+).

Inclui: tabelas `incomes` (recorrentes + avulsas) e `transactions` (lançamentos manuais), CRUD de categorias, extrato com filtros, reclassificação em massa, e o cálculo de "receita líquida do mês" (denominador das metas da Fase 3). Tudo escopado por `user_id` com RLS no mesmo padrão da Fase 1 e dinheiro em `bigint` centavos.

NÃO inclui: metas/aderência, reservas (Fase 3); upload/importação, classificação IA (Fase 4); MEI (Fase 5). Construído e testado contra o Supabase LOCAL (deploy remoto adiado).

Cobre: INC-01, INC-02, INC-03, INC-04, CAT-02, CAT-03, TXN-01, TXN-02, TXN-03, TXN-04.

</domain>

<decisions>
## Implementation Decisions

### Receitas
- Receita recorrente fixa = um template (ex: Salário, Pensão) que gera uma ocorrência mensal materializada e editável
- Ajuste de valor num mês edita apenas a ocorrência daquele mês — não altera o template (INC-02)
- Receita líquida do mês = soma de TODAS as receitas do mês (ocorrências recorrentes + avulsas); é o denominador das metas % (Fase 3)
- Campo "fonte" é texto livre (Salário, Pensão, Outros), não enum fixo
- Receita avulsa = lançamento único sem template (INC-03)

### Categorias
- Remover categoria com transações associadas é bloqueado (hard-delete proibido); oferecer arquivar ou reatribuir as transações antes
- Cada categoria tem toggle consumo (gasto) vs alocação (investimento/poupança) — CAT-03; Investimentos e Reserva já vêm como alocação do seed
- Categorias seed são editáveis/removíveis (pertencem ao usuário), mas a UI avisa ao mexer nas usadas por features (ex: "Reserva", consumida pelo fluxo de reservas da Fase 3)
- Cor opcional por categoria (usada no extrato e no dashboard da Fase 3)

### Transações & Extrato
- Modelo de valor: `amount_cents` bigint SEMPRE positivo + um campo `kind`; receitas ficam na tabela `incomes`, gastos em `transactions`. O sinal/efeito deriva do tipo, não de valor negativo
- Extrato filtrável por mês (default = mês atual) e por categoria (multi-select)
- Reclassificação em massa: selecionar várias linhas do extrato e aplicar uma categoria de uma vez (TXN-04)
- Mês = mês civil no fuso America/Sao_Paulo (usar date-fns-tz, consistente em todo o app)

### Claude's Discretion
- Forma exata das tabelas/colunas e migrations (seguir padrão RLS+grants+índice user_id da Fase 1)
- Componentes shadcn específicos (tabela do extrato, dialogs de form, date pickers)
- Como materializar ocorrências recorrentes (na leitura do mês vs job) — preferir simples e determinístico
- Layout exato das telas

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/money.ts` — `parseBRLToCents` (lança em input inválido, hardenizado na Fase 1) e `formatCents` (aceita number|bigint, seguro acima de MAX_SAFE_INTEGER) — usar em TODA entrada/exibição de dinheiro
- `src/lib/supabase/{client,server,middleware}.ts` — três clients `@supabase/ssr` com publishable key + `getClaims()`
- `src/types/database.types.ts` — schema tipado gerado do Supabase local; regenerar após novas migrations
- Padrão de Server Actions Zod-validadas (`src/actions/auth.ts`) e formulários shadcn (`field` primitive base-nova + react-hook-form)
- Shell protegido `(app)/layout.tsx` + `/dashboard` — novas telas entram sob `(app)`
- Padrão RLS: `(select auth.uid()) = user_id` USING+WITH CHECK + GRANTs DML para `authenticated` + índice `user_id`

### Established Patterns
- TS estrito, sem JS. Dinheiro em bigint centavos. Mês civil America/Sao_Paulo. pt-BR (`<html lang="pt-BR">`).
- Migrations versionadas em `supabase/migrations/`, aplicadas no stack LOCAL; types regenerados.
- Testes vitest (unit + integração RLS contra stack local). TDD onde houver lógica.

### Integration Points
- Novas rotas sob `src/app/(app)/` (protegidas pelo middleware)
- Nav/shell em `(app)/layout.tsx`
- A "receita líquida do mês" calculada aqui é consumida pelo dashboard de metas da Fase 3

</code_context>

<specifics>
## Specific Ideas

- O extrato é a tela central que o usuário mais vê — priorizar leitura rápida (mês corrente por default, totais por categoria) e edição inline/rápida
- Reclassificação em massa é requisito do modelo de memória (Fase 4): a UX precisa selecionar muitas linhas e aplicar categoria de uma vez

</specifics>

<deferred>
## Deferred Ideas

- Detecção automática de recorrentes / alertas de limite → Fase 4 (CLS-06) e Fase 3 (BUD-04)
- Reservas e metas → Fase 3
- Importação/IA → Fase 4

</deferred>
