# Phase 5: Módulo MEI / DASN-SIMEI - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all 3 grey areas accepted as recommended

<domain>
## Phase Boundary

Entrega o módulo MEI: o usuário registra as NFs de serviço emitidas, o sistema acompanha o faturamento bruto anual contra o limite APLICÁVEL (proporcional no 1º ano, R$81k cheio depois, banda de 20%), mostra status em níveis, alerta perto do limite, e gera o relatório que facilita a declaração DASN-SIMEI. Módulo INDEPENDENTE do core de classificação (depende só da Fase 1). Construído contra o Supabase LOCAL.

Inclui: `mei_settings`, `mei_invoices`, cálculo do limite aplicável + status, alerta, relatório anual + export, disclaimer informativo. NÃO inclui: e-filing automático da DASN (out of scope — sem API, frágil/legal), integração com o core de transações/classificação.

Cobre: MEI-01, MEI-02, MEI-03, MEI-04, MEI-05, MEI-06.

</domain>

<decisions>
## Implementation Decisions

### NF & modelo
- `mei_settings` (user_id, mei_start_date, has_employee por ano) + `mei_invoices` (user_id, issued_on, amount_cents, tomador, descricao, activity_type)
- Tipo de atividade POR NF: comércio/indústria vs serviços (um MEI pode ter receita mista) — MEI-03
- Flag de funcionário é setting do MEI por ano (default não) — campo exigido pela DASN
- Dinheiro em bigint centavos; o que conta para o limite é a **receita BRUTA** (não líquida) — MEI-02

### Limite aplicável & status
- Limite **APLICÁVEL**, nunca R$81k hardcoded: proporcional no 1º ano (R$6.750 × meses ativos a partir do mês de `mei_start_date`), R$81.000 em ano-calendário cheio; banda de tolerância de 20% (até R$97.200 = migra para Simples no ano seguinte; acima de 20% = desenquadramento retroativo) — MEI-02
- 1º ano = ano-calendário de `mei_start_date` → cap proporcional; anos seguintes → limite cheio
- Status em níveis: verde (<80% do aplicável), âmbar (80-100%), vermelho (>100%; distinguir dentro vs fora da banda de 20%) — MEI-02
- Alerta ao cruzar 80% do limite aplicável — MEI-05
- Os números (R$81k, R$6.750, banda 20%, prazo da DASN) DEVEM ser confirmados na pesquisa contra o manual atual da Receita (2026); centralizar numa constante/config, não espalhar literais

### Relatório DASN & disclaimer
- Relatório anual consolidado: total de receita bruta + split comércio-indústria vs serviços + flag de funcionário (sim/não) — exatamente os campos da DASN-SIMEI — MEI-04
- Relatório exibido em tela + export CSV
- Disclaimer fixo e VISÍVEL ("Este módulo é informativo e não constitui consultoria fiscal") em todas as telas MEI — MEI-06

### Claude's Discretion
- Forma exata das migrations (próxima: 0025+; reusar padrão RLS+grants+índice+security_invoker)
- Componentes shadcn (form de NF, card de limite/status, tabela de NFs, relatório)
- Layout das telas MEI; onde a nav "MEI" entra no shell
- Estrutura exata da constante de regras MEI (limites/banda/prazo) — derivar da pesquisa

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/money.ts` (bigint centavos), `src/lib/month.ts`/year helpers; padrão Server Action Zod + getClaims + ownership re-derive; RLS USING+WITH CHECK + grants + índice; views security_invoker
- `src/components/{money-input,amount-cell,category-badge}.tsx`, padrões de form shadcn (field + RHF + zodResolver), tabela densa (extrato), `progress`
- `src/lib/ownership.ts` (helpers de IDOR compartilhados) — replicar checagem para mei_invoice_id se necessário
- Padrão de export CSV pode ser estabelecido aqui e reusado na Fase 6 (DATA-01)

### Established Patterns
- TS estrito, dinheiro bigint centavos, pt-BR. Migrations versionadas aplicadas no LOCAL, types regenerados. TDD contra stack local. Lições: validar ownership de FKs client-supplied (IDOR); test-first pega bugs reais (TOCTOU, parse).

### Integration Points
- Nav "MEI" no shell `(app)`; módulo isolado, não toca transactions/classificação
- O export CSV do relatório MEI antecipa o padrão de export da Fase 6

</code_context>

<specifics>
## Specific Ideas

- O limite aplicável é a parte sutil: NUNCA hardcode 81k; calcule proporcional no 1º ano e mostre o limite efetivo na UI. A pesquisa confirma os números 2026 contra a Receita.
- O disclaimer informativo é requisito explícito (MEI-06) e questão de responsabilidade — visível, não escondido em rodapé.

</specifics>

<deferred>
## Deferred Ideas

- E-filing automático da DASN-SIMEI → out of scope (sem API oficial, frágil/legal)
- Integração MEI ↔ core de transações (ex: NF emitida vira receita no fluxo principal) → não no v1, manter MEI isolado
- LGPD export/delete geral + hardening → Fase 6
