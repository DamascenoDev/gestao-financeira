# Requirements: Gestão Financeira Pessoal

**Defined:** 2026-06-16
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

## v1 Requirements

Requisitos do release inicial. Cada um mapeia para fases do roadmap.

### Autenticação & Conta

- [x] **AUTH-01**: Usuário faz login com email/senha no Supabase pessoal (single-user no v1)
- [x] **AUTH-02**: Sessão persiste entre refreshes do browser (SSR + middleware)
- [x] **AUTH-03**: Todos os dados escopados por `user_id` com RLS em todas as tabelas e no Storage (multi-user-ready, sem migração futura)
- [x] **AUTH-04**: Usuário faz logout de qualquer página

### Receitas

- [x] **INC-01**: Usuário cadastra receita recorrente fixa (salário, pensão) que repete todo mês
- [x] **INC-02**: Usuário ajusta o valor de uma recorrente em um mês específico (quando varia)
- [x] **INC-03**: Usuário lança receita avulsa (não recorrente)
- [x] **INC-04**: Usuário vê a receita líquida recebida do mês (base de cálculo das metas %)

### Categorias

- [x] **CAT-01**: Sistema já vem com conjunto padrão BR de categorias de gasto
- [x] **CAT-02**: Usuário cria, renomeia e remove categorias
- [x] **CAT-03**: Categoria é marcada como consumo (gasto) ou alocação (investimento/poupança) — afeta como entra nas metas

### Transações / Lançamentos

- [x] **TXN-01**: Usuário lança transação manual (data, valor, descrição, categoria)
- [x] **TXN-02**: Usuário edita e exclui transações próprias
- [x] **TXN-03**: Usuário vê extrato/lista de transações com filtro por mês e categoria
- [x] **TXN-04**: Usuário reclassifica a categoria de várias transações de uma vez (bulk re-classify)

### Importação de Faturas

- [x] **IMP-01**: Usuário faz upload de arquivo OFX direto para o Supabase Storage (bucket privado)
- [x] **IMP-02**: Usuário faz upload de arquivo CSV
- [x] **IMP-03**: Sistema faz parse de OFX/CSV em transações normalizadas (centavos inteiros, data, descritor)
- [x] **IMP-04**: Sistema deduplica de forma idempotente (hash do arquivo + unique de transação) — re-upload não duplica
- [x] **IMP-05**: Usuário revisa as transações importadas antes de persistir (tela de revisão)

### Classificação Inteligente

- [x] **CLS-01**: Na importação, sistema classifica por memória primeiro (padrão merchant→categoria já aprendido)
- [ ] **CLS-02**: Para estabelecimento nunca visto, IA sugere a categoria (saída restrita ao enum de categorias do usuário)
- [x] **CLS-03**: Usuário confirma ou corrige a sugestão; só então o padrão merchant→categoria é salvo na memória
- [x] **CLS-04**: Próximas faturas com aquele descritor são auto-classificadas pela memória
- [x] **CLS-05**: A categoria gravada na transação é point-in-time (renomear categoria não reescreve o histórico)
- [x] **CLS-06**: Sistema detecta gastos recorrentes (assinaturas etc.) automaticamente

### Metas & Aderência

- [x] **BUD-01**: Usuário define meta por categoria em % da receita líquida, com direção configurável: teto (consumo, não exceder) ou alvo (investimento/poupança, atingir)
- [x] **BUD-02**: Dashboard de aderência mensal: gasto/alocado X% vs meta Y% por categoria
- [x] **BUD-03**: Visão acumulada do ano vs metas anuais
- [x] **BUD-04**: Usuário recebe alerta ao se aproximar ou estourar a meta de uma categoria

### Reservas de Oportunidade

- [x] **RSV-01**: Usuário cria reserva nomeada (ex: Apê, Carro) com valor-alvo opcional
- [x] **RSV-02**: Transação classificada como "Reserva" dispara a sub-pergunta "qual reserva?" e cria uma entrada no ledger daquela reserva
- [x] **RSV-03**: Aporte em reserva conta como alocação de investimento (entra na meta de Investimentos), não como gasto de consumo
- [x] **RSV-04**: Usuário registra saída (retirada) de uma reserva, com histórico de entradas/saídas por reserva
- [x] **RSV-05**: Saldo da reserva é sempre derivado (entradas − saídas) e mostra barra de progresso vs alvo quando houver
- [x] **RSV-06**: Sistema aprende o padrão merchant→reserva e auto-sugere a reserva nas próximas

### MEI

- [x] **MEI-01**: Usuário registra NF de serviço emitida (data, valor, tomador, descrição)
- [x] **MEI-02**: Sistema acompanha o faturamento anual vs limite R$81k, com cap proporcional no 1º ano e banda de tolerância de 20%
- [x] **MEI-03**: Sistema modela a receita por tipo (comércio/indústria vs serviços) e flag de funcionário (campos exigidos pela DASN)
- [x] **MEI-04**: Sistema gera relatório anual consolidado para facilitar a declaração DASN-SIMEI
- [x] **MEI-05**: Usuário recebe alerta ao se aproximar do limite R$81k
- [x] **MEI-06**: Interface deixa claro que o módulo é informativo, não consultoria fiscal

### Dados & Privacidade

- [x] **DATA-01**: Usuário exporta transações e relatório MEI em CSV
- [x] **DATA-02**: Usuário exporta e apaga todos os seus dados (LGPD)

### Segurança

- [x] **SEC-01**: RLS isola dados por usuário em tabelas e Storage, validado com teste de 2 usuários
- [x] **SEC-02**: Chaves de serviço ficam só no servidor, nunca no bundle do cliente
- [x] **SEC-03**: Na classificação via IA, só o descritor normalizado é enviado (sem PII) e a saída é validada contra o enum de categorias

## v1.1 Requirements (Visual — Phase 7)

Re-skin de identidade private-banking (azul marinho + dourado). Não muda lógica/dados/segurança das fases 1-6.

### Identidade & Tema

- [x] **UI-01**: Sistema de design navy+gold aplicado globalmente (tokens OKLCH light+dark, tipografia, marca) — coerente em todas as rotas, semântica de dinheiro/status preservada (07-01: substrato OKLCH navy+gold light+dark + Inter Tight heading + font-bug fix; marca/BrandMark e re-skin per-rota em planos seguintes)
- [x] **UI-02**: Dark mode completo, alternável e persistente, sem quebra de contraste nem da semântica teto/alvo/income (07-01: next-themes cabeado no root, ThemeToggle 3-vias mount-guarded, suppressHydrationWarning + disableTransitionOnChange anti-FOUC)
- [x] **UI-03**: Logo/marca e tela de login/landing com identidade de produto (não form cru) (07-02: BrandMark + wordmark no chrome do app; 07-05: AuthShell duas colunas [painel navy + BrandMark 32px + "Financeira" gold + value prop] envolvendo o auth-form com guard inverso preservado + favicon icon.svg navy+gold)

### Data-viz

- [x] **UI-04**: Gráfico de evolução mensal (receita vs gasto) no dashboard — ReceitaGastoChart (07-03)
- [x] **UI-05**: Gráfico de distribuição de gastos por categoria (mês) no dashboard — CategoryDistributionChart (07-03)
- [x] **UI-06**: Visual rico de aderência às metas + gauge MEI elevado — LimiteGauge/AdherenceBar direction-aware via token-swap 07-01 (07-03)

### Polimento & Mobile

- [x] **UI-07**: Refinamento mobile-first de todas as telas (tabelas densas → cards, nav adapta) — 07-02 (BottomNav nav adapta) + 07-04 (4 tabelas → cards <md)
- [x] **UI-08**: Empty/loading/error states + micro-interações/transições consistentes em todas as telas — 07-06 (TableSkeleton/CardSkeleton/ChartSkeleton sobre shadcn skeleton + loading.tsx por segmento dashboard/extrato/mei + gramática Empty/text-destructive confirmada nas ~20 rotas, 0 spinners, foco gold --ring, reduced-motion)

## v1.2 Requirements (Carro)

Módulo de veículo. Design aprovado em `docs/superpowers/specs/2026-06-17-modulo-carro-design.md`.

### Carro

- [ ] **CAR-01**: Usuário cadastra, edita e arquiva carro(s); a lista mostra todos os carros não-arquivados (multi-car, escopado por `user_id`).
- [ ] **CAR-02**: Usuário etiqueta um lançamento da fatura a um carro (`carro_id`) via formulário de transação e via ação na linha do extrato; etiquetar NÃO altera categoria nem metas do lançamento (lente não-destrutiva).
- [ ] **CAR-03**: Usuário registra abastecimento (data, odômetro, litros, tanque-cheio?, combustível) com custo vindo de um lançamento vinculado da fatura OU manual — exatamente uma fonte (CHECK XOR), nunca ambas, nunca nenhuma.
- [ ] **CAR-04**: Sistema calcula consumo km/l pelo método tanque-cheio e R$/km por intervalo, e expõe médias por carro (views `security_invoker`).
- [ ] **CAR-05**: Detalhe do carro mostra gasto total (manutenção + combustível via `carro_id`), histórico de abastecimentos e gráfico de consumo (km/l ao longo do tempo, recharts).
- [ ] **CAR-06**: Aba "Carros" na sidebar e na bottom-nav mobile; rotas sob `/carros` (lista + detalhe `[id]`).

## v2 Requirements

Adiados para release futuro. Rastreados, fora do roadmap atual.

### Importação

- **IMP-06**: Parse de PDF de fatura por banco (frágil — requer spike sobre amostras reais dos bancos do usuário)

### Multi-usuário

- **MUL-01**: UI de conta compartilhada/família para a esposa usar junto (modelo de dados já preparado no v1)
- **MUL-02**: Modelagem explícita de múltiplas contas bancárias

## Out of Scope

Explicitamente excluído. Documentado para evitar scope creep.

| Feature | Reason |
|---------|--------|
| E-filing automático da DASN-SIMEI | Sem API oficial, frágil e legalmente sensível — record-and-report apenas |
| Integração bancária automática (Open Finance / scraping) | Ingestão é por upload manual de faturas no v1 |
| App mobile nativo | Web app responsivo cobre o uso; nativo adiciona complexidade sem ganho no v1 |
| SaaS público / multi-tenant | Uso pessoal, não será exposto publicamente |
| Consultoria/cálculo de impostos além do MEI/DASN | Escopo fiscal limitado ao MEI; módulo é informativo |
| (v1.2) Lembretes/alertas de manutenção (revisão por km/data) | Futuro — fora do escopo do módulo Carro v1.2 |
| (v1.2) Multi-usuário compartilhando o mesmo carro | Só o modelo fica pronto (user_id-scoped); UI compartilhada fora de escopo (igual ao resto do app) |
| (v1.2) OCR/parse de nota de abastecimento | Entrada manual no v1.2 |
| (v1.2) Categoria "Carro" dedicada / auto-classificação merchant→carro | Etiquetagem é manual/explícita no v1.2 |
| (v1.2) Depreciação, seguro, IPVA como módulo fiscal | Não no v1.2 |

## Traceability

Quais fases cobrem quais requisitos. Preenchido na criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| CAT-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| INC-01 | Phase 2 | Complete |
| INC-02 | Phase 2 | Complete |
| INC-03 | Phase 2 | Complete |
| INC-04 | Phase 2 | Complete |
| CAT-02 | Phase 2 | Complete |
| CAT-03 | Phase 2 | Complete |
| TXN-01 | Phase 2 | Complete |
| TXN-02 | Phase 2 | Complete |
| TXN-03 | Phase 2 | Complete |
| TXN-04 | Phase 2 | Complete |
| BUD-01 | Phase 3 | Complete (03-03) |
| BUD-02 | Phase 3 | Complete (03-03) |
| BUD-03 | Phase 3 | Complete (03-03) |
| BUD-04 | Phase 3 | Complete (03-03) |
| RSV-01 | Phase 3 | Complete (03-04) |
| RSV-02 | Phase 3 | Complete (03-05) |
| RSV-03 | Phase 3 | Complete (03-05) |
| RSV-04 | Phase 3 | Complete (03-04) |
| RSV-05 | Phase 3 | Complete (03-04) |
| IMP-01 | Phase 4 | Complete (04-02) |
| IMP-02 | Phase 4 | Complete (04-02) |
| IMP-03 | Phase 4 | Complete (04-02) |
| IMP-04 | Phase 4 | Complete (04-02) |
| IMP-05 | Phase 4 | Complete (04-03) |
| CLS-01 | Phase 4 | Complete (04-02) |
| CLS-02 | Phase 4 | Deferred (AI seam only — 04-01; LLM post-v1) |
| CLS-03 | Phase 4 | Complete (04-03) |
| CLS-04 | Phase 4 | Complete (04-03) |
| CLS-05 | Phase 4 | Complete (04-03) |
| CLS-06 | Phase 4 | Complete (04-03) |
| RSV-06 | Phase 4 | Complete (04-03) |
| SEC-03 | Phase 4 | Complete (04-03 — seam + enum wrapper; LLM call deferred per CLS-02) |
| MEI-01 | Phase 5 | Complete (05-03) |
| MEI-02 | Phase 5 | Complete (05-02) |
| MEI-03 | Phase 5 | Complete (05-03) |
| MEI-04 | Phase 5 | Complete (05-03) |
| MEI-05 | Phase 5 | Complete (05-02) |
| MEI-06 | Phase 5 | Complete (05-02, 05-03) |
| DATA-01 | Phase 6 | Complete (06-02; MEI CSV half from Phase 5) |
| DATA-02 | Phase 6 | Complete (06-03) |
| SEC-01 | Phase 6 | Complete (06-04) |
| UI-01 | Phase 7 | Complete (07-01: navy+gold OKLCH substrate + typography; marca/per-route re-skin continua nos planos seguintes) |
| UI-02 | Phase 7 | Complete (07-01: next-themes alternável + persistente, anti-FOUC) |
| UI-04 | Phase 7 | Complete (07-03: ReceitaGastoChart recharts no dashboard, lendo views existentes) |
| UI-05 | Phase 7 | Complete (07-03: CategoryDistributionChart donut --chart-1..5 no dashboard) |
| UI-06 | Phase 7 | Complete (07-03: LimiteGauge/AdherenceBar direction-aware via token-swap 07-01) |
| UI-03 | Phase 7 | Complete (07-02 chrome/brand + 07-05 AuthShell login/landing + favicon) |
| UI-07 | Phase 7 | Complete (07-02 BottomNav nav adapta + 07-04 4 tabelas → cards <md) |
| UI-08 | Phase 7 | Complete (07-06: skeletons sobre shadcn skeleton + loading.tsx por segmento + gramática empty/error confirmada, 0 spinners) |
| CAR-01 | Phase 8 | In progress (08-01 substrato: tabelas+RLS+tipos) |
| CAR-06 | Phase 8 | Pending |
| CAR-02 | Phase 9 | Pending |
| CAR-03 | Phase 10 | Pending |
| CAR-04 | Phase 10 | Pending |
| CAR-05 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47 ✓
- Unmapped: 0 ✓
- v1.2 (Carro) requirements: 6 total — CAR-01..06 mapeados 6/6 ✓; órfãos 0 ✓

**Por fase:**
- Phase 1 (Fundação): 6 — AUTH-01/02/03/04, CAT-01, SEC-02
- Phase 2 (Receitas/categorias/lançamentos): 10 — INC-01/02/03/04, CAT-02/03, TXN-01/02/03/04
- Phase 3 (Metas/aderência/reservas): 9 — BUD-01/02/03/04, RSV-01/02/03/04/05
- Phase 4 (Upload + classificação): 13 — IMP-01/02/03/04/05, CLS-01/02/03/04/05/06, RSV-06, SEC-03
- Phase 5 (MEI/DASN): 6 — MEI-01/02/03/04/05/06
- Phase 6 (Endurecimento): 3 — DATA-01/02, SEC-01
- Phase 7 (Identidade visual): 8 — UI-01/02/03/04/05/06/07/08
- Phase 8 (Substrato Carro + CRUD + nav): 2 — CAR-01, CAR-06
- Phase 9 (Etiquetar gastos ao carro): 1 — CAR-02
- Phase 10 (Abastecimento + consumo): 2 — CAR-03, CAR-04
- Phase 11 (Detalhe do carro + gráfico): 1 — CAR-05

---
*Requirements defined: 2026-06-16*
*Last updated: 2026-06-17 — Milestone v1.2 "Carro" roteado: CAR-01..06 adicionados à traceability (CAR-01/06→Phase 8, CAR-02→Phase 9, CAR-03/04→Phase 10, CAR-05→Phase 11; 6/6 mapeados, 0 órfãos). Fora-de-escopo do módulo Carro documentado. Linhas de traceability das fases 1-7 inalteradas.*
*(anterior) 2026-06-17 — Phase 7 fechada (07-07 sign-off): UI-01..UI-08 todos Complete e verificados ponta-a-ponta em light E dark. Phase gate verde (suíte 599 passed/72 files + tsc limpo + build exit 0 + check-bundle-secrets exit 0, SEC-01 mantido), grep de cor hardcoded limpo fora do swatch sancionado, e sign-off humano "aprovado" (identidade navy+gold, flip light↔dark, charts, mobile BottomNav + tabelas→cards, auth). Nenhum arquivo de produção alterado por 07-07.*
