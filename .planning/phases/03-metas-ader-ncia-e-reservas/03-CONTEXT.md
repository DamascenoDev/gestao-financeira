# Phase 3: Metas, aderência e reservas - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all 3 grey areas accepted as recommended

<domain>
## Phase Boundary

Entrega a "visão de metas" do core value: o usuário define metas por categoria (% da receita líquida), vê aderência mensal e anual num dashboard, recebe alertas, e gerencia reservas de oportunidade com saldo sempre derivado. Resolve as decisões de modelagem (denominador %, contabilidade de reserva) ANTES de o dashboard depender delas.

Inclui: tabela `budget_targets`, views de aderência (`security_invoker`), dashboard, alertas, tabelas `reservas` + `reserva_ledger` (saldo derivado), gatilho de aporte via categoria "Reserva", saídas validadas. Construído sobre o loop manual da Fase 2 (receitas/transações/categorias), contra o Supabase LOCAL.

NÃO inclui: upload/importação/IA, aprendizado merchant→reserva (RSV-06 → Fase 4); MEI (Fase 5). Deploy remoto adiado.

Cobre: BUD-01, BUD-02, BUD-03, BUD-04, RSV-01, RSV-02, RSV-03, RSV-04, RSV-05.

</domain>

<decisions>
## Implementation Decisions

### Metas (budget targets)
- Armazenadas em tabela `budget_targets` (user_id, category_id, percent, direction) — uma meta por categoria
- Direção default derivada do `kind` da categoria: consumo → teto (não exceder), alocação → alvo (atingir); editável pelo usuário (BUD-01)
- Alerta: limiar fixo — aviso ao atingir 80% da meta (aproximando) e 100% (estourou/atingiu), exibido no dashboard (BUD-04)
- Meta anual derivada: o mesmo % aplicado sobre a receita líquida ACUMULADA do ano (mesmo ledger da mensal, sem meta anual separada) — garante consistência mensal↔anual (BUD-03)

### Aderência / Dashboard
- Aderência calculada em view SQL `security_invoker = true` (gasto/alocado ÷ receita líquida do período vs meta %) — nunca no app, nunca vaza entre usuários
- Semântica por direção: TETO (consumo) → verde abaixo da meta, vermelho acima; ALVO (alocação) → verde quando ≥ meta (BUD-02)
- As categorias de ALOCAÇÃO (Investimentos + Reserva) somam JUNTAS na meta de investimento; aportes de reserva entram como alocação de investimento e NUNCA como gasto de consumo (RSV-03, decisão travada)
- Dashboard mostra aderência mensal E acumulado YTD vs metas anuais, ambas do mesmo ledger e consistentes (BUD-02/BUD-03)

### Reservas (sinking funds)
- Modelo: `reservas` (user_id, nome, alvo_cents opcional) + `reserva_ledger` (user_id, reserva_id, kind in/out, amount_cents positivo, transaction_id link opcional, data); saldo SEMPRE derivado (Σ in − Σ out) via view, nunca coluna mutável (RSV-05)
- Gatilho de aporte: transação de categoria "Reserva" dispara a sub-pergunta "qual reserva?" e cria uma entrada (in) no `reserva_ledger` vinculada à transação (RSV-02)
- Saída (retirada): reduz o saldo, validada para nunca deixar saldo negativo (out ≤ saldo atual); saída é movimento da reserva, NÃO afeta metas de gasto (RSV-04)
- Barra de progresso aparece só quando há alvo (RSV-01/RSV-05)
- **Ownership (lição do IDOR da Fase 2):** todo `reserva_id` e `category_id` vindo do cliente é validado server-side por dono (select RLS-scoped) ANTES de gravar — RLS não fecha FK para linha de outro usuário

### Claude's Discretion
- Forma exata das views/migrations (seguir padrão RLS+grants+índice+security_invoker da Fase 2)
- Componentes shadcn do dashboard (cards de aderência, progress bars, gauges)
- Layout exato do dashboard e da tela de reservas
- Como a sub-pergunta "qual reserva?" se encaixa no fluxo de lançamento de transação (dialog)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `v_income_month` (receita líquida do mês), `v_category_totals` (gasto por categoria) — base dos cálculos de aderência; criar views de aderência sobre elas
- `src/lib/money.ts` (centavos, parse lança em inválido, formatCents bigint-safe), `src/lib/month.ts` (mês civil SP, helpers `isMonthKey`/`toMonthKeyOrCurrent`)
- `src/actions/{incomes,categories,transactions}.ts` — padrão de Server Action Zod + getClaims + **checagem de ownership de category_id** (replicar para reserva_id)
- `src/components/{money-input,amount-cell,category-badge}.tsx`, `SelectionActionBar`, formulários shadcn
- Categorias seed: "Investimentos" e "Reserva" já marcadas como `alocacao`
- Padrão RLS: `(select auth.uid()) = user_id` USING+WITH CHECK + GRANTs + índice user_id; views `security_invoker=true`

### Established Patterns
- TS estrito, dinheiro bigint centavos, mês civil SP, pt-BR. Migrations versionadas (próxima: 0011+), aplicadas no LOCAL, types regenerados.
- TDD: testes vitest unit + integração RLS contra stack local. Lição da Fase 2: validar ownership de FKs client-supplied (IDOR).

### Integration Points
- Dashboard substitui/expande o `/dashboard` placeholder da Fase 1; nav no shell `(app)`
- A sub-pergunta "qual reserva?" integra no fluxo de transação (Fase 2 `transacao-form` / extrato)
- `reserva_ledger` será consumido pelo aprendizado merchant→reserva da Fase 4 (RSV-06)

</code_context>

<specifics>
## Specific Ideas

- O dashboard é a entrega do core value ("visão de metas") — deve ser claro e rápido de ler: por categoria, % gasto/alocado vs % meta, com cor semântica (teto vs alvo) e alertas visíveis
- Consistência mensal↔anual é requisito explícito: as duas visões derivam do MESMO ledger e não podem divergir

</specifics>

<deferred>
## Deferred Ideas

- Aprendizado merchant→reserva (auto-sugerir reserva) → Fase 4 (RSV-06)
- Upload/IA → Fase 4; MEI → Fase 5
- "Disponível para orçar" (se aporte reduz o que sobra para orçar) → não no v1, manter simples

</deferred>
