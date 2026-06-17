# Phase 7: Identidade visual e polimento - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — direção definida pelo usuário

<domain>
## Phase Boundary

Re-skin completo do app numa identidade **private-banking**: azul marinho profundo + dourado (vibe BTG Pactual / Mercury / Linear — sofisticado, confiável, denso de informação). Cobre os 4 eixos pedidos pelo usuário: (1) identidade visual/marca, (2) dark mode + refinamento mobile, (3) gráficos/data-viz, (4) polimento das telas existentes. **Re-skin only** — NÃO muda lógica de negócio, dados, RLS ou segurança das fases 1-6; só a camada de apresentação.

Cobre: UI-01..UI-08. Construído contra o stack LOCAL; deploy remoto segue adiado.

</domain>

<decisions>
## Implementation Decisions

### Direção estética (travada pelo usuário)
- **Vibe:** sofisticado/bancário (BTG, Mercury, Linear) — limpo, confiável, premium, denso
- **Paleta:** azul marinho profundo (navy) como base/brand + **dourado** como accent (substitui/eleva o teal atual) — números mono tabulares continuam protagonistas
- **Referência:** BTG Pactual (navy + gold private banking)

### Eixos de escopo
- **Identidade (UI-01/02/03):** tokens OKLCH navy+gold para light E dark; tipografia com mais personalidade; marca/logo simples; tela de login/landing com cara de produto. Dark mode alternável + persistente (next-themes ou equivalente), sem quebrar a semântica de dinheiro (income/expense/alocação/consumo) nem teto/alvo de metas
- **Data-viz (UI-04/05/06):** gráficos no dashboard — evolução mensal receita vs gasto, distribuição por categoria; aderência às metas e gauge MEI mais ricos. Escolher lib de charts (shadcn chart/Recharts é o caminho oficial; avaliar peso/react-is override) ou manter custom para barras simples
- **Polimento + mobile (UI-07/08):** empty/loading/error states consistentes, micro-interações/transições, hierarquia/espaçamento elevados; tabelas densas (extrato, NF, ledger) viram cards no mobile; nav adapta (sidebar → bottom-nav/drawer)

### Preservar (não tocar)
- Toda lógica de Server Actions, RLS, ownership/IDOR, money bigint centavos, views security_invoker, testes (584 verdes) — o re-skin não pode quebrar nenhum teste de comportamento
- Semântica de cor: dinheiro e status (teto vermelho-acima, alvo verde-atingido, alocação) devem sobreviver à nova paleta com contraste correto em light E dark

### Claude's Discretion
- Tons exatos OKLCH do navy+gold (light+dark) — derivar uma escala coesa e acessível (WCAG AA)
- Lib de charts e quais gráficos exatos
- Forma do logo/marca
- Estratégia de dark mode (next-themes vs CSS) e de mobile (cards vs scroll)
- Ordem do re-skin (tokens globais primeiro → componentes → telas)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets / o que existe
- Design system base-nova (shadcn) + `src/app/globals.css` com tokens OKLCH (hoje grayscale + teal accent + tokens semânticos income/expense/allocation/consumption) — a Phase 7 REESCREVE esses tokens para navy+gold light+dark
- Componentes shadcn vendored + `AdherenceBar`/`LimiteGauge`/`amount-cell`/`category-badge`/`progress` — re-skin, não reescrita
- ~20 rotas sob `(app)` + auth; `app-sidebar`, `MonthSelector`/`YearSelector`, `MeiDisclaimer`
- UI-SPECs das fases 2-6 definem a "gramática" atual (cores semânticas, densidade, tabelas) — a Phase 7 evolui a gramática, mantendo a semântica

### Established Patterns
- TS estrito, Tailwind v4, pt-BR. Tokens em `globals.css`. Sem libs novas sem necessidade (avaliar charts).
- 584 testes (unit + integração RLS) — o re-skin deve mantê-los todos verdes; testes de comportamento não dependem de cor.

### Integration Points
- `globals.css` (tokens) é o ponto central — mudar lá propaga. Dark mode precisa de um provider de tema no layout raiz.
- Charts entram no dashboard (Fase 3) e MEI (Fase 5) sem tocar a lógica das views.

</code_context>

<specifics>
## Specific Ideas

- Usuário quer **azul marinho tipo BTG com dourado** — premium, sério, confiável. Não é fintech jovem/vibrante; é private banking.
- O re-skin é grande (~20 rotas + dark mode + charts + mobile). É a fase mais "subjetiva" — o UI-SPEC (contrato de design) deve ser aprovado pelo usuário ANTES de executar.

</specifics>

<deferred>
## Deferred Ideas

- Ilustrações custom / motion design avançado → além do polimento básico
- Conta compartilhada (MUL-01) → v2
- Deploy remoto (01-04) → quando o usuário tiver credenciais
