# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Granularity:** standard
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

This roadmap follows the research-converged build order: **foundation → manual ledger loop → upload + AI pipeline → MEI → hardening**. The two impossible-to-retrofit pitfalls (float money, RLS leak) are front-loaded into Phase 1. The manual ledger loop (Phases 2–3) proves the core value on hand-entered data, so the highest-risk upload + AI machinery (Phase 4) lands on a proven foundation. MEI (Phase 5) is independent and parked late. Hardening (Phase 6) turns "looks done" into "is done."

## Phases

- [ ] **Phase 1: Fundação (auth, RLS, dinheiro, schema)** - Login funciona, dados isolados por usuário, dinheiro em centavos inteiros, categorias-base BR semeadas
- [ ] **Phase 2: Receitas, categorias e lançamentos manuais** - Usuário cadastra receita, edita categorias e lança/edita transações com extrato filtrável
- [ ] **Phase 3: Metas, aderência e reservas** - Dashboard de aderência (mensal + anual) por categoria e reservas com saldo derivado e progresso
- [ ] **Phase 4: Upload + classificação inteligente** - Upload de OFX/CSV → parse → dedup → memória → IA → revisão que aprende padrões merchant→categoria
- [ ] **Phase 5: Módulo MEI / DASN-SIMEI** - Registro de NFs, acompanhamento do limite R$81k e relatório anual para a declaração
- [ ] **Phase 6: Endurecimento (LGPD, isolamento, auditoria)** - Export/delete LGPD, export CSV, teste de isolamento de 2 usuários, auditoria de segredos e PII

## Phase Details

### Phase 1: Fundação (auth, RLS, dinheiro, schema)
**Goal**: Usuário entra na própria conta e o sistema garante, desde o primeiro byte gravado, que cada dado é isolado por `user_id` e que dinheiro é exato — front-loading dos dois erros irreversíveis (float e vazamento RLS).
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, CAT-01, SEC-02
**Success Criteria** (what must be TRUE):
  1. Usuário faz login com email/senha e a sessão persiste entre refreshes do browser (SSR + middleware), com logout disponível em qualquer página
  2. Toda tabela tem `user_id` com RLS habilitada (`(select auth.uid()) = user_id` + `WITH CHECK`) e o bucket privado `statements` aplica RLS por pasta `{user_id}/`; uma query negada retorna vazio, nunca dado de outro usuário
  3. Todo valor monetário é gravado em centavos inteiros (`bigint`), nunca float — `R$ 0,10 + R$ 0,20` soma exatamente `R$ 0,30`
  4. O conjunto padrão BR de categorias é semeado para o usuário ao criar a conta
  5. A chave service-role existe só no servidor (`import 'server-only'`, nunca `NEXT_PUBLIC_`) e não aparece no bundle do cliente
**Plans**: 4 plans
  - [x] 01-01-PLAN.md — Scaffold (Next 16 / TS strict) + tooling + Wave-0 Nyquist tests (money/RLS/seed/bundle) + money.ts centavos helper
  - [x] 01-02-PLAN.md — SQL migrations (profiles, categories+seed trigger, private storage bucket) + RLS + role grants + apply to local stack + typed schema (RLS/seed tests GREEN)
  - [x] 01-03-PLAN.md — @supabase/ssr auth wiring + middleware + Zod-validated actions + login/signup/logout UI + dashboard reading isolated categories
  - [ ] 01-04-PLAN.md — [autonomous:false] wire personal Supabase creds + email-confirm off + remote db push + Vercel deploy + live auth-flow verify

### Phase 2: Receitas, categorias e lançamentos manuais
**Goal**: Usuário registra de onde vem o dinheiro e para onde vai, à mão — receitas (recorrentes + avulsas), categorias editáveis e transações com extrato — provando o loop de dados antes de qualquer upload.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: INC-01, INC-02, INC-03, INC-04, CAT-02, CAT-03, TXN-01, TXN-02, TXN-03, TXN-04
**Success Criteria** (what must be TRUE):
  1. Usuário cadastra receita recorrente fixa (salário, pensão), ajusta o valor dela em um mês específico, lança receita avulsa, e vê a receita líquida recebida do mês (a base de cálculo das metas %)
  2. Usuário cria, renomeia e remove categorias, e marca cada uma como consumo (gasto) ou alocação (investimento/poupança)
  3. Usuário lança transação manual (data, valor, descrição, categoria) e edita/exclui transações próprias
  4. Usuário vê o extrato/lista de transações filtrável por mês e categoria
  5. Usuário reclassifica a categoria de várias transações de uma vez (bulk re-classify)
**Plans**: 5 plans
  - [x] 02-01-PLAN.md — Foundation slice: migrations (incomes/transactions/color/views/RPC) applied to local stack + typed client, civil-month + Zod schemas, app shell (sidebar + global MonthSelector), Wave-0 tests (suite 72/72 GREEN, view-leak leak-free, build+tsc clean)
  - [x] 02-02-PLAN.md — Receitas slice: income actions (template/occurrence/avulsa, materialize-on-read) + Receitas page with receita-líquida hero (INC-01/02/03/04); 12 action tests + Wave-0 income tests GREEN, suite 84/84, build+tsc clean
  - [x] 02-03-PLAN.md — Categorias slice: category actions (CRUD + consumo/alocação + color + delete-block/archive/atomic reassign) + Categorias page (CAT-02/03); 19 action tests + Wave-0 category tests GREEN, suite 103/103, build+tsc clean
  - [x] 02-04-PLAN.md — Extrato slice: transaction actions (CRUD + bulkReclassify) + dense TanStack table (getRowId=tx.id, selection, sort, inline category edit), ?mes+?cat URL filters, per-category/grand totals from v_category_totals, self-contained SelectionActionBar (TXN-01/02/03/04); 14 action tests + Wave-0 transactions-rls/bulk-reclassify GREEN, suite 117/117, build+tsc clean
  - [ ] 02-05-PLAN.md — [autonomous:false] Human-verify walkthrough: INC-02 edit-choice, TXN-03 filter URL round-trip, TXN-04 bulk re-classify + design-contract sanity
**UI hint**: yes

### Phase 3: Metas, aderência e reservas
**Goal**: Usuário vê, em dados inseridos à mão, o quanto está aderente às metas (mensal e anual) e gerencia reservas de oportunidade com saldo sempre derivado — entregando a "visão de metas" do core value e resolvendo as decisões de modelagem (denominador %, contabilidade de reserva) antes de o dashboard depender delas.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: BUD-01, BUD-02, BUD-03, BUD-04, RSV-01, RSV-02, RSV-03, RSV-04, RSV-05
**Success Criteria** (what must be TRUE):
  1. Usuário define meta por categoria em % da receita líquida recebida, com direção teto (consumo, não exceder) ou alvo (investimento/poupança, atingir)
  2. Dashboard mostra aderência mensal (gasto/alocado X% vs meta Y% por categoria) e a visão acumulada do ano vs metas anuais, ambas computadas do mesmo ledger e consistentes entre si
  3. Usuário recebe alerta ao se aproximar ou estourar a meta de uma categoria
  4. Usuário cria reserva nomeada (ex: Apê, Carro) com alvo opcional; uma transação classificada como "Reserva" dispara "qual reserva?" e cria uma entrada no ledger daquela reserva
  5. Aporte em reserva conta como alocação de investimento (entra na meta de Investimentos), nunca como gasto de consumo; o saldo é sempre derivado (entradas − saídas), a saída nunca deixa o saldo negativo, e a barra de progresso aparece quando há alvo
**Plans**: 6 plans
  - [x] 03-01-PLAN.md — Substrate: migrations 0011-0016 (budget_targets, reservas+ledger, adherence views, balance view, saída RPC, is_reserva flag) applied LOCAL + types regen + month/adherence helpers + Zod schemas + progress component + Reservas nav [BLOCKING] ✓ 2026-06-16
  - [x] 03-02-PLAN.md — Wave-0 tests (9 integration + adherence unit) + extended view-leak/rls-isolation; pins aporte-grouping, derived balance, never-negative saída (concurrent TOCTOU caught + fixed via migration 0017), IDOR, monthly↔YTD consistency; suite 221 passed / 1 skipped, tsc clean ✓ 2026-06-16
  - [x] 03-03-PLAN.md — Metas + Dashboard slice: upsertBudgetTarget (IDOR-checked) + deleteBudgetTarget + MetaDialog (% + Teto/Alvo switch + live R$ preview) + AdherenceBar/Row/SummaryStrip + real /dashboard reading v_adherence_month/_ytd (Mensal/Anual tabs, combined alocação line, 80/100 alerts); budget-target-direction now GREEN; suite 235 passed / 0 skipped (BUD-01/02/03/04) ✓ 2026-06-16
  - [ ] 03-04-PLAN.md — Reservas slice: reservas action (CRUD + registerSaida via atomic RPC + assertOwnedReserva) + ReservaCard/Progress/Form/SaidaForm/LedgerTable + /reservas + detail route (RSV-01/04/05)
  - [ ] 03-05-PLAN.md — Aporte sub-flow: createTransactionWithReserva + syncReservaLedgerForTransaction + ReservaPicker conditional in transacao-form + Extrato inline re-tag (RSV-02/03)
  - [ ] 03-06-PLAN.md — [autonomous:false] Human-verify walkthrough: direction-aware dashboard color, qual-reserva sub-flow, alvo-only progress bar
**UI hint**: yes

### Phase 4: Upload + classificação inteligente
**Goal**: Usuário sobe uma fatura OFX/CSV e vê os gastos extraídos, deduplicados e pré-classificados — memória primeiro, IA só no que é novo — revisa e confirma, e o sistema aprende o padrão merchant→categoria para as próximas. Esta é a fase de maior risco, construída por último entre o loop central, sobre uma fundação já provada.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, CLS-01, CLS-02, CLS-03, CLS-04, CLS-05, CLS-06, RSV-06, SEC-03
**Success Criteria** (what must be TRUE):
  1. Usuário faz upload de OFX e de CSV direto para o Storage privado (signed URL, sem passar pela função); o sistema faz parse em transações normalizadas (centavos inteiros, data, descritor) e deduplica idempotentemente (hash do arquivo + unique de transação) — re-upload mostra "0 novas" e não duplica
  2. Na importação, o sistema classifica por memória primeiro (padrão merchant→categoria já aprendido) e só chama a IA para estabelecimento nunca visto, com a saída restrita ao enum de categorias do usuário; para um extrato de merchants conhecidos a contagem de chamadas à IA é ~0
  3. Usuário revisa as transações importadas antes de persistir; ao confirmar ou corrigir uma sugestão, só então o padrão merchant→categoria (e merchant→reserva) é salvo na memória e auto-classifica as próximas faturas
  4. A categoria gravada na transação é point-in-time — renomear uma categoria não reescreve o histórico (regras chaveadas por `category_id`, não por nome) — e o sistema detecta gastos recorrentes (assinaturas) automaticamente
  5. Na classificação via IA só o descritor normalizado é enviado (sem PII, sem valores) e a saída é validada contra o enum antes de virar sugestão; um descritor com tentativa de injeção ainda retorna uma categoria válida
**Plans**: TBD
**UI hint**: yes

### Phase 5: Módulo MEI / DASN-SIMEI
**Goal**: Usuário registra as NFs de serviço emitidas e acompanha o faturamento anual contra o limite aplicável (proporcional no 1º ano, R$81k cheio, banda de 20%), gerando o relatório que facilita a declaração DASN-SIMEI — um módulo independente do core de classificação.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: MEI-01, MEI-02, MEI-03, MEI-04, MEI-05, MEI-06
**Success Criteria** (what must be TRUE):
  1. Usuário registra NF de serviço emitida (data, valor, tomador, descrição), com tipo de atividade (comércio/indústria vs serviços) e flag de funcionário capturados desde o registro
  2. O sistema acompanha o faturamento bruto anual contra o limite *aplicável* — cap proporcional (R$6.750 × meses ativos) no 1º ano, R$81k em ano cheio, com banda de tolerância de 20% — e mostra status em níveis (verde/âmbar/vermelho), nunca um "81k" hardcoded
  3. Usuário recebe alerta ao se aproximar do limite aplicável
  4. O sistema gera relatório anual consolidado com total de receita bruta, split comércio/serviços e flag de funcionário — exatamente os campos da DASN-SIMEI
  5. A interface deixa claro, em texto visível, que o módulo é informativo e não consultoria fiscal
**Plans**: TBD
**UI hint**: yes

### Phase 6: Endurecimento (LGPD, isolamento, auditoria)
**Goal**: Usuário pode exportar e apagar seus dados (LGPD), exportar transações/relatório em CSV, e o sistema comprova — com testes — o isolamento por usuário e o tratamento mínimo de dados sensíveis, transformando "parece pronto" em "está pronto" antes da esposa entrar como segundo titular.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5
**Requirements**: DATA-01, DATA-02, SEC-01
**Success Criteria** (what must be TRUE):
  1. Usuário exporta transações e o relatório MEI em CSV
  2. Usuário exporta todos os seus dados e apaga a conta + dados (caminho LGPD de direitos do titular)
  3. Um teste de isolamento com 2 usuários comprova que o usuário B não lê/insere/atualiza/exclui nenhuma linha do usuário A — nos quatro verbos, em tabelas e no Storage
  4. Auditoria confirma que segredos (service-role) não estão no bundle do cliente, que faturas só são acessíveis por signed URL, e que nenhum dado/valor com PII é enviado ao provedor de IA
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundação | 3/4 | In progress | - |
| 2. Receitas, categorias e lançamentos | 3/5 | In progress | - |
| 3. Metas, aderência e reservas | 2/6 | In progress | - |
| 4. Upload + classificação inteligente | 0/0 | Not started | - |
| 5. Módulo MEI / DASN-SIMEI | 0/0 | Not started | - |
| 6. Endurecimento | 0/0 | Not started | - |

## Dependencies & Parallelization

- **Linear core path:** Phase 1 → 2 → 3 → 4. Each consumes the previous: metas precisam do denominador de receita (Phase 2); reservas precisam de transações + categorias (Phase 2); o classificador por IA precisa da camada de memória, que dispara só no cache-miss (Phase 4 internamente: memória antes da IA).
- **Phase 5 (MEI) parallelizes:** depende apenas da Fundação (Phase 1) — não toca o core de classificação. Pode ser construída em paralelo a qualquer fase ≥ 2.
- **Phase 6 (Hardening) is last:** re-verifica os pitfalls das fases anteriores e fecha LGPD; depende de todas as superfícies existirem.

## Research Flags

Fases que provavelmente precisam de pesquisa mais profunda durante o planejamento:
- **Phase 4 (upload + IA):** parse de PDF foi adiado para v2, mas mesmo OFX/CSV variam por banco — coletar amostras reais antes; confirmar provedor de IA final + comportamento de structured-output (A/B Gemini 2.5 Flash-Lite vs GPT-5-nano em descritores BR reais).
- **Phase 5 (MEI/DASN):** verificar os campos exatos do formulário DASN-SIMEI + as figuras de proporcionalidade/tolerância de 2026 contra o manual atual da Receita no momento do build (regras fiscais mudam).

Fases com padrões estabelecidos (podem pular pesquisa de fase):
- **Phase 1 (fundação):** auth SSR Supabase + RLS + typed-client são bem documentados.
- **Phases 2–3 (loop manual):** CRUD + agregação por SQL views + dashboards shadcn/Recharts são padrões estabelecidos; o trabalho novo são as *decisões* (denominador, contabilidade de reserva), não a implementação.

---
*Roadmap created: 2026-06-16*
*Coverage: 47/47 v1 requirements mapped*
