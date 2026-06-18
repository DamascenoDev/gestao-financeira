# Phase 11: Detalhe do carro + gráfico de consumo - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Fatia-capstone de apresentação (CAR-05): o detalhe `/carros/[id]` mostra, num só lugar, KPIs do carro (km/l médio, R$/km, gasto total), gasto por categoria dos lançamentos etiquetados, o histórico de abastecimentos (já existe da Phase 10) e a **curva de consumo (km/l no tempo)** via recharts; e a lista `/carros` ganha gasto total + km/l médio por carro (completando o identity-only da Phase 8). Reusa a infra recharts + gramática empty/loading/error da Phase 7. Última fase do milestone v1.2.

</domain>

<decisions>
## Implementation Decisions

### Detalhe `/carros/[id]` + data-viz
- **KPIs no topo: 3 stat cards** — km/l médio · R$/km · gasto total (manutenção + combustível via `carro_id`) — números mono `tabular-nums`, pt-BR `R$`, "—" quando null.
- **Gasto por categoria**: **barras por categoria** (reusa `AdherenceBar`/estilo) dos lançamentos com este `carro_id`, ordenadas por valor.
- **Gráfico de consumo**: **linha km/l ao longo do tempo** (x = data do abastecimento, y = km/l do intervalo), recharts via shadcn chart, tooltip pt-BR, token-aware (segue dark mode, cores via CSS vars — padrão Phase 7). Pontos sem km/l válido (intervalo nulo) são omitidos da curva.
- **Histórico de abastecimentos**: já entregue na Phase 10 (tabela→card mobile); reusar/integrar no layout do detalhe, não reconstruir.
- **Lista `/carros`**: adiciona **gasto total + km/l médio** a cada CarroCard (de `v_carro_resumo`).

### Dados
- `v_carro_resumo` já expõe gasto_total_cents + médias (km/l, R$/km) — Phase 8/10. Reusar.
- **Gasto por categoria do carro**: agregação nova — soma de `transactions.amount_cents` com este `carro_id`, agrupada por categoria (point-in-time `category_id`). Planner decide entre uma view `v_carro_categoria` (`security_invoker`) OU query inline no RSC; preferir view se reusável, mas é aditiva e read-only (não muda metas — D4).
- Dinheiro centavos inteiros + `formatCents`; datas SP; nenhuma mudança de contabilidade/metas (lente).

### Re-skin only / segurança
- Pura apresentação: nenhuma lógica de negócio/metas alterada; charts/queries leem dados RLS-scoped existentes; nenhum segredo novo no bundle. `security_invoker=true` em qualquer view nova. Re-roda a auditoria de segredo do bundle após o chart client component (SEC-01 não regride).
- WR-02 (double-count em odômetros iguais — Phase 10 review, edge quase impossível): o planner inclui um refino de view `0029` SÓ se barato/seguro; senão documenta como limitação conhecida (a guarda km≤0 já cobre o caso comum).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `v_carro_resumo` (gasto_total + médias), `v_abastecimento_consumo` (km/l por intervalo) — Phase 8/10.
- `AbastecimentoHistory` (Phase 10, table→card) — integrar no detalhe.
- recharts via shadcn `chart` (`ui/chart.tsx`), `ReceitaGastoChart`/`CategoryDistributionChart` (Phase 7) como analogs do chart token-aware + tooltip pt-BR.
- `AdherenceBar` (Phase 3/7) para o gasto por categoria; `LimiteGauge` como referência de gauge.
- `CarroCard` (Phase 8) — adicionar KPIs; `card-skeleton`/`chart-skeleton` (Phase 7) para loading.
- `formatCents`/`money.ts`, helpers de consumo `src/lib/carro/consumo.ts` (Phase 10).

### Established Patterns
- Charts client components lendo dados de view via RSC (Phase 7 dashboard); tokens CSS-var para dark mode; tooltip `formatCents`.
- Detalhe `/carros/[id]` (Phase 8 mínimo + Phase 10 abastecimento) é a base a enriquecer.

### Integration Points
- `/carros/[id]/page.tsx` (enriquecer: KPIs + gasto por categoria + chart, mantendo a seção de abastecimento da Phase 10).
- `/carros/page.tsx` + `CarroCard` (KPIs por carro de `v_carro_resumo`).
- Possível `v_carro_categoria` (migração `0029`, security_invoker) OU query inline. Novos componentes: `carro-consumo-chart.tsx`, possivelmente `carro-categoria-bars.tsx`.

</code_context>

<specifics>
## Specific Ideas

- Curva de consumo espelha o padrão do `ReceitaGastoChart` (linha, token-aware, tooltip pt-BR).
- Gasto por categoria reusa `AdherenceBar` para consistência visual com o resto do app.

</specifics>

<deferred>
## Deferred Ideas

- Comparar consumo entre carros, exportar relatório do carro → fora do v1.2.
- Lembretes de manutenção, OCR → Out of Scope.

</deferred>
