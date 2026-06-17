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
  - [x] 03-04-PLAN.md — Reservas slice: reservas action (CRUD + registerSaida via atomic RPC + assertOwnedReserva IDOR) + ReservaCard/Progress/Form/SaidaForm/LedgerTable + /reservas list + /reservas/[id] ledger detail; saldo always v_reserva_balance-derived, progress only with alvo, saída ≤ saldo client+server; suite 260 passed / 0 skipped, build GREEN (RSV-01/04/05) ✓ 2026-06-16
  - [x] 03-05-PLAN.md — Aporte sub-flow: createTransactionWithReserva + syncReservaLedgerForTransaction + isReservaCategory/assertOwnedReserva + aporte-undo in update/delete; ReservaPicker ("Qual reserva?" + "+ Nova reserva") conditional in transacao-form (progressive disclosure) + Extrato inline re-tag focused dialog; aporte = linked 'in' entry, alocação only (never consumo, keyed off is_reserva flag); suite 269 passed / 0 skipped, build GREEN (RSV-02/03) ✓ 2026-06-16
  - [ ] 03-06-PLAN.md — [autonomous:false] Human-verify walkthrough: direction-aware dashboard color, qual-reserva sub-flow, alvo-only progress bar

**UI hint**: yes

### Phase 4: Upload + classificação inteligente

**Goal**: Usuário sobe uma fatura OFX/CSV e vê os gastos extraídos, deduplicados e pré-classificados — memória primeiro, IA só no que é novo — revisa e confirma, e o sistema aprende o padrão merchant→categoria para as próximas. Esta é a fase de maior risco, construída por último entre o loop central, sobre uma fundação já provada.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, CLS-01, CLS-02, CLS-03, CLS-04, CLS-05, CLS-06, RSV-06, SEC-03
**Scope note (AI deferred — user decision 2026-06-16):** Phase 4 ships the full ingestion + memory-first pipeline; the LLM-suggestion step is DEFERRED. On a memory miss the row stays unclassified for manual pick; a clean, pluggable suggestion seam (returns null in v1, enum-validated) ships so AI slots in later. **CLS-02** stays Pending/deferred (only the seam ships); **SEC-03** holds by construction (no external call ⇒ no PII egress) + the enum-validation wrapper. **Supply chain:** OFX is parsed by a small in-house parser (`src/lib/parsers/ofx.ts`) — `ofx-data-extractor` (flagged low-trust) is NOT installed; CSV uses `papaparse` (the only new npm dep). No AI/@ai-sdk packages.
**Success Criteria** (what must be TRUE):

  1. Usuário faz upload de OFX e de CSV direto para o Storage privado (signed URL, sem passar pela função); o sistema faz parse em transações normalizadas (centavos inteiros, data, descritor) e deduplica idempotentemente (hash do arquivo + unique de transação) — re-upload mostra "0 novas" e não duplica
  2. Na importação, o sistema classifica por memória primeiro (padrão merchant→categoria já aprendido) e só chama a IA para estabelecimento nunca visto, com a saída restrita ao enum de categorias do usuário; para um extrato de merchants conhecidos a contagem de chamadas à IA é ~0 (no v1: zero — IA deferida; merchant novo fica não-classificado para escolha manual)
  3. Usuário revisa as transações importadas antes de persistir; ao confirmar ou corrigir uma sugestão, só então o padrão merchant→categoria (e merchant→reserva) é salvo na memória e auto-classifica as próximas faturas
  4. A categoria gravada na transação é point-in-time — renomear uma categoria não reescreve o histórico (regras chaveadas por `category_id`, não por nome) — e o sistema detecta gastos recorrentes (assinaturas) automaticamente
  5. Na classificação via IA só o descritor normalizado é enviado (sem PII, sem valores) e a saída é validada contra o enum antes de virar sugestão; um descritor com tentativa de injeção ainda retorna uma categoria válida (no v1: o seam retorna null com segurança; a normalização + enum-validation já existem)

**Plans**: 4 plans

  - [x] 04-01-PLAN.md — Substrate [BLOCKING]: migrations 0019-0023 (statements, transactions ALTER, merchant_patterns, csv_import_profiles, v_recurring_descriptors security_invoker) applied LOCAL + types regen + papaparse-only install (NO ofx-data-extractor/ai); pure libs (normalizeDescriptor, contentHash/dedupeKey, in-house OFX SGML parser, papaparse CSV, lookupMemory + deferred-AI null seam + validateSuggestion enum wrapper) + 10 Wave-0 tests + 5 synthetic fixtures; unit suites GREEN, integration substrate GREEN + it.todo for Plan 02-03 actions; suite 347 passed/9 todo, tsc+eslint clean (IMP-03/04, CLS-01/04/05/06, RSV-06, SEC-03) ✓ 2026-06-16
  - [x] 04-02-PLAN.md — Upload slice: import.ts (createSignedStatementUpload + ingestStatement: download→decode latin1→parse→two-layer dedup→memory-classify→review rows persisted as jsonb on the statement, nothing in transactions) + saveCsvProfile; /importar screen (UploadDropzone + UploadProgress + signed-URL uploader + CsvColumnMapper + reusable profile) + Importar nav; +0024 parsed_rows/summary jsonb; 15 unit + 2 flipped integration GREEN; suite 364 passed/7 todo; build compiles /importar; "0 novas" on re-upload (IMP-01/02/03/04, CLS-01) ✓ 2026-06-16
  - [x] 04-03-PLAN.md — Review + confirm + learn slice: confirmImport (persist point-in-time + dedupe per-row 23505-skip [partial index → no .upsert onConflict] + learn merchant_patterns only-on-confirm-only-classified + reserva aporte via reused Phase-3 path + IDOR re-derive of statement/category/reserva + recurring from v_recurring_descriptors); src/lib/ownership.ts extracted + shared by transactions.ts AND import.ts (no drift); ImportReviewTable (ExtratoTable sibling, client-state, SelectionActionBar + ReservaPicker reused, amber memory-miss accent) + ImportSummaryHeader + OriginBadge + RecorrenteTag + inert SuggestionSlot; /importar/[statementId] review RSC; 6 it.todo flipped GREEN + 8 confirmImport unit tests; suite 380 passed/0 todo; build compiles /importar/[statementId] (IMP-05, CLS-03/04/05/06, RSV-06, SEC-03) ✓ 2026-06-16
  - [ ] 04-04-PLAN.md — [autonomous:false] Human-verify walkthrough: OFX/CSV upload + drag, CSV mapping dialog + profile reuse, inline+bulk classify + Reserva picker, Confirmar + unclassified guard, learn→auto-classify loop, "0 novas" re-upload

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

**Plans**: 4 plans

  - [x] 05-01-PLAN.md — Substrate [BLOCKING]: migrations 0025/0026 (mei_settings, mei_year_flags, mei_invoices + v_mei_year_summary security_invoker) applied LOCAL + types regen; pure libs rules.ts (the single source of the 4 verified 2026 numbers) + limit.ts + status.ts + csv.ts with SQL↔TS parity guard + never-hardcode grep gate clean; assertOwnedMeiInvoice; 4 local-DB Wave-0 tests (RLS isolation, report split+employee+limit parity, view-leak, IDOR); full suite 430 GREEN, tsc + build clean (MEI-01/02/03/04/05/06 substrate) ✓ 2026-06-17
  - [x] 05-02-PLAN.md — Actions + dashboard slice: actions/mei.ts (NF CRUD + settings + year-flag, IDOR-checked) + schemas/mei.ts + 16 action tests + MEI nav/segment layout + YearSelector + MeiDisclaimer + presentation.ts (meiStatusTokens) + /mei dashboard (LimiteGauge reusing AdherenceBar + status badge + 80%/100% alert, computed limit never hardcoded teto) — full suite 446 GREEN, tsc + build (/mei compiles) clean, grep gate clean (MEI-02/05/06 complete; MEI-01/03 action contract, UI in 05-03) ✓ 2026-06-17
  - [x] 05-03-PLAN.md — NF list + settings + report slice: NfForm/NfTable (register/edit/delete + comércio/serviços split + year total via deleteMeiInvoice) + AtividadeBadge + MeiSettingsForm (start date + per-year employee flag) + DasnReportView (total + split summing to total + employee + deadline from rules.ts + disclaimer in print header) + ExportCsvButton (meiReportToCsv Blob download — the Phase-6 DATA-01 pattern) + PrintButton + @media print + 3 MEI sub-pages reading mei_invoices/v_mei_year_summary RLS-scoped; full suite 455 GREEN (+9), tsc + build (all 4 MEI routes compile) clean, grep gate clean (MEI-01/03/04 complete, MEI-06 reinforced) ✓ 2026-06-17
  - [ ] 05-04-PLAN.md — [autonomous:false] Human-verify walkthrough: register NF → list + year total + dashboard gauge/status; proportional limit copy; ≥80% alert; report split + employee + CSV + print; disclaimer on every screen; year isolation

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

**Plans**: 5 plans

  - [x] 06-01-PLAN.md — Substrate [BLOCKING] + Wave-0: src/lib/data/owned-tables.ts (OWNED_TABLES 14 + ISOLATION_INSERT_SHAPES — single source for export bundle + isolation matrix; csv_import_profiles included) + src/lib/supabase/admin.ts (server-only service-role createAdminClient, DELETE ONLY, UNWIRED — 06-03 sole importer) + src/lib/transactions/csv.ts (transactionsToCsv mirroring mei/csv.ts: BOM/;/CRLF/formatCents/RFC-4180, GREEN) + 8 Wave-0 tests (rls-isolation promoted 8→14 data-driven + isolation-matrix + storage-isolation + pii-guard GREEN; lgpd-export/lgpd-delete/lgpd-delete-isolation it.todo RED for 06-03; bundle-secret-grep extended); full suite 558 passed/13 todo, tsc clean, 06-VALIDATION wave_0_complete+nyquist_compliant (DATA-01/02 + SEC-01 substrate) ✓ 2026-06-17
  - [x] 06-02-PLAN.md — CSV export slice (DATA-01): ExportTransactionsButton (reuses the ExportCsvButton shape, transactionsToCsv → transacoes-{yyyy-MM}.csv) + Extrato header wiring (resolve category name + Consumo/Alocação) + /conta screen shell + Conta nav item + UserMenu "Privacidade e conta" link; tsc clean, build compiles /extrato + /conta, suite GREEN (551/7 skip/13 todo), DATA-01 Complete ✓ 2026-06-17
  - [x] 06-03-PLAN.md — LGPD export+delete slice (DATA-02): bundle.ts (iterates OWNED_TABLES, RLS select('*') + embedded transactions/MEI CSVs, single JSON, zero new packages) + exportMyData (RLS client, getClaims userId — only my rows; never imports admin.ts) + deleteMyAccount (sole importer of server-only service-role admin.ts; APAGAR gate, userId from session, Storage-remove FIRST → auth.admin.deleteUser LAST → ON DELETE CASCADE empties all 14 tables; no manual DELETE loop) + ExportDataButton ("Baixar meus dados" → meus-dados-{date}.json) + type-to-confirm AccountDeleteZone (border-destructive zone, irreversibility <ul>, APAGAR exact, initialFocus Cancelar, signOut after) + completed Conta screen; flipped lgpd-export (5/5) + lgpd-delete + lgpd-delete-isolation + delete unit GREEN (18 assertions); tsc clean, build compiles /conta (17 routes), bundle-secret audit green; DATA-02 Complete ✓ 2026-06-17
  - [x] 06-04-PLAN.md — SEC-01 audits closure: 4-verb × 14-table isolation matrix GREEN (data-driven over OWNED_TABLES, 118 tests vs the LOCAL stack — no gap, no test loosened) + Storage 2-user + private-bucket + no-getPublicUrl GREEN + secret-bundle audit made REAL against a fresh `next build` (service-role key absent from .next/static despite admin.ts using SUPABASE_SECRET_KEY server-side — the it.todo retired into a gated passing assertion) + PII-egress guard GREEN (no ai/@ai-sdk dep, suggestCategory null incl. injection descriptor, no fetch); full suite 559 passed/12 todo, tsc clean, build clean (17 routes), SEC-01 Complete ✓ 2026-06-17
  - [ ] 06-05-PLAN.md — [autonomous:false] Human-verify walkthrough: phase gate (full suite + tsc + build + secret audit) then browser checks — transactions CSV download (pt-BR), LGPD bundle download, type-to-confirm APAGAR delete + sign-out (throwaway LOCAL user only)

**UI hint**: yes

### Phase 7: Identidade visual e polimento (navy+gold, dark mode, gráficos, mobile)

**Goal**: Re-skin completo do app numa identidade private-banking — azul marinho profundo + dourado (vibe BTG/Mercury) — com dark mode, gráficos de data-viz no dashboard e MEI, refinamento mobile-first, e polimento de todas as telas (empty/loading/error states, micro-interações), elevando de "esqueleto funcional" para produto premium e coeso. Re-skin only: não muda lógica de negócio, dados ou segurança das fases 1-6.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5, Phase 6
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08
**Success Criteria** (what must be TRUE):

  1. Sistema de design navy+gold aplicado globalmente (tokens OKLCH, tipografia, marca) — coerente e premium em todas as ~20 rotas; semântica de dinheiro/status preservada
  2. Dark mode completo, alternável e persistente, sem quebra de contraste nem da semântica de dinheiro/teto-alvo
  3. Data-viz: evolução mensal receita vs gasto + distribuição por categoria no dashboard; visual rico de aderência às metas e gauge MEI
  4. Refinamento mobile-first: toda tela usável e bonita no celular (tabelas densas viram cards, nav adapta)
  5. Polimento: empty/loading/error states e micro-interações/transições consistentes em todas as telas
  6. Login/landing com identidade de produto (não form cru)

**Plans**: 7 plans

  - [x] 07-01-PLAN.md — [BLOCKING substrate] Tokens-first navy+gold (OKLCH light+dark, NOMES preservados) + conserto do --font-sans self-ref + Inter Tight heading + ThemeProvider cabeado no root (suppressHydrationWarning) + ThemeToggle 3-vias mount-guarded + Wave-0 theme-toggle test; suite 587 passed GREEN, tsc + build limpos, grep gates (teal 195=0, font self-ref=0) OK (UI-01, UI-02) ✓ 2026-06-17
  - [x] 07-02-PLAN.md — Brand + shell: BrandMark inline-SVG navy+gold na sidebar (active-gold + indicador) + ThemeToggle no UserMenu + BottomNav mobile (<md, destinos primários gold ≥48px) montada no shell (UI-03 chrome, UI-07 nav) — suite 587 passed GREEN, tsc + build limpos, grep gates OK ✓ 2026-06-17
  - [x] 07-03-PLAN.md — Charts: recharts@3.8.0 install + react-is 19.2.4 override (gated next build + secret-bundle re-audit exit 0) + chart.tsx vendored + ReceitaGastoChart (receita=--income/gasto=--consumption) + CategoryDistributionChart (donut --chart-1..5 ramp) token-aware, formatCents, empty-state pt-BR, Wave-0 tests 6/6 GREEN — lendo SÓ views existentes (v_income_month + v_category_totals, janela 12m SP-pinned) no dashboard, sem query/view/migration/.rpc nova; gauge/adherence direction-aware via token-swap 07-01 (fill/clamp/aria intactos) — suite 593 passed GREEN, tsc + build limpos (UI-04/05/06) ✓ 2026-06-17
  - [x] 07-04-PLAN.md — Mobile table→card collapse (NET-NEW) nas 4 tabelas densas (extrato, import-review, nf, reserva-ledger) reusando AmountCell/CategoryBadge/ddMM via classes responsivas (hidden md:table / md:hidden); desktop ≥md intacto, seleção/actions congeladas (UI-07 tabelas→cards) — suite 593 passed GREEN, tsc + build limpos, grep gates OK ✓ 2026-06-17
  - [x] 07-05-PLAN.md — AuthShell duas colunas (painel navy + BrandMark + "Financeira" gold + value prop) envolvendo o auth-form (guard inverso preservado) + favicon icon.svg navy+gold (UI-03 login/landing) — suite 593 passed GREEN, tsc + build limpos, auth-form/actions/guard intactos, grep gates OK ✓ 2026-06-17
  - [x] 07-06-PLAN.md — Polish sweep (UI-08): TableSkeleton/CardSkeleton/ChartSkeleton (sobre shadcn skeleton, nunca spinner, Wave-0 test 6/6 GREEN) + loading.tsx por segmento (dashboard/extrato/mei — RSC streama com a chrome do layout visível) + varredura empty/error/transição confirmada (8 rotas Empty, erro text-destructive, 0 spinners; Button foco gold --ring; Desvio Rule 2: copy de recuperação no erro do Extrato) — suite 599 passed GREEN, tsc + build limpos, grep gates OK ✓ 2026-06-17
  - [x] 07-07-PLAN.md — [autonomous:false] Phase gate (suíte 599 passed + tsc + build + secret-bundle audit exit 0 + grep de cor hardcoded limpo) + human-verify "aprovado": identidade, flip light↔dark, charts, mobile (BottomNav + cards), auth confirmados em light E dark; nenhum arquivo de produção alterado (UI-01..UI-08 todos Complete) ✓ 2026-06-17

**UI hint**: yes

## Milestone v1.2: Carro

**Created:** 2026-06-17
**Mode:** mvp (vertical slices — cada fase entrega uma capacidade ponta-a-ponta visível)
**Granularity:** standard
**Design seed:** `docs/superpowers/specs/2026-06-17-modulo-carro-design.md` (aprovado — D1-D5, modelo de dados, lógica de consumo tanque-cheio, seam de etiquetagem, UI/rotas espelhando MEI)

Módulo de veículo autocontido, espelhando a estrutura do MEI. A ordem de fatias segue o spec aprovado: **substrato/schema + CRUD de carro + nav → seam de etiquetagem → log de abastecimento + consumo → detalhe do carro com gráfico**. Os dois invariantes irreversíveis do projeto (dinheiro em centavos inteiros, RLS `auth.uid()=user_id`) e a regra não-destrutiva da etiqueta `carro_id` (D4) são honrados em toda fase; a regra XOR de custo do abastecimento (D2) é um CHECK no banco + validação no server. Re-skin/identidade da Phase 7 (navy+gold, dark mode, recharts) já se aplica — nenhuma decisão visual nova.

### Phases (v1.2)

- [x] **Phase 8: Substrato Carro + CRUD + navegação** - Tabelas/views/RLS do carro + coluna `carro_id`; usuário cadastra/edita/arquiva carros e navega para `/carros` (3/3 plans ✓ 2026-06-17)
- [x] **Phase 9: Etiquetar gastos da fatura ao carro** - Usuário etiqueta lançamentos a um carro via form e via ação no extrato, sem alterar categoria/metas (lente não-destrutiva) (1/3 plans — 09-01 contrato server ✓ 2026-06-17) (completed 2026-06-17)
- [x] **Phase 10: Abastecimento híbrido + consumo** - Usuário registra abastecimento (custo da fatura OU manual, XOR) com odômetro/litros/tanque-cheio; sistema calcula km/l e R$/km (completed 2026-06-17)
- [x] **Phase 11: Detalhe do carro + gráfico de consumo** - Detalhe do carro com gasto total, histórico de abastecimentos e gráfico de consumo km/l no tempo (completed 2026-06-17)

### Phase 8: Substrato Carro + CRUD + navegação

**Goal**: Usuário cria, edita e arquiva o(s) seu(s) carro(s) numa aba dedicada, e o sistema fica com todo o substrato de dados do módulo (tabelas `carros`/`abastecimentos`, coluna `transactions.carro_id`, views de consumo, RLS e ownership re-derivado) em pé desde o primeiro byte — front-loading do schema irreversível antes de qualquer fatia depender dele.
**Mode:** mvp
**Depends on**: Phase 1 (auth/RLS/dinheiro), Phase 2 (transactions existem para `carro_id` referenciar)
**Requirements**: CAR-01, CAR-06
**Success Criteria** (what must be TRUE):

  1. Usuário cadastra um carro (apelido obrigatório; modelo/placa/ano/combustível-padrão opcionais), edita seus campos e arquiva/desarquiva — a lista `/carros` mostra todos os carros não-arquivados, com badge nos arquivados
  2. Existe uma aba "Carros" (ícone Car) na sidebar e na bottom-nav mobile; as rotas `/carros` (lista) e `/carros/[id]` (detalhe, ainda que mínimo) resolvem e respeitam o guard de auth
  3. As tabelas `carros` e `abastecimentos` e a coluna nullable `transactions.carro_id` (`ON DELETE SET NULL`) existem com RLS `(select auth.uid()) = user_id` + `WITH CHECK`; uma query de outro usuário retorna vazio, nunca dado alheio
  4. As views `v_abastecimento_consumo` e `v_carro_resumo` existem como `security_invoker = true` (não vazam linha de outro usuário) e o cliente tipado regenera sem drift
  5. Toda escrita de carro re-deriva a posse no servidor (`assertOwnedCarro`) antes do write e nunca expõe a chave service-role no bundle do cliente

**Plans**: 3 plans

  - [x] 08-01-PLAN.md — [BLOCKING substrate] migration 0027_carros.sql (tabelas carros/abastecimentos + coluna transactions.carro_id ON DELETE SET NULL + views v_abastecimento_consumo/v_carro_resumo security_invoker + RLS + grants + índices + CHECK XOR + índice único parcial) aplicada LOCAL + gen:types sem drift (162 inserções/0 deleções) + Wave-0 (carro-rls isolation 3 objetos + XOR/partial-unique negatives + carro-view-leak); 11 testes green, suíte 610 passed, tsc limpo. **[Rule 1]** lag() FILTER inválido em Postgres → reescrito via CTE full_fills (3 commits: 482272b, 07ea0c0, 2cf1e69) ✓ 2026-06-17
  - [x] 08-02-PLAN.md — Camada server: schemas/carro.ts (carroSchema — apelido obrigatório + modelo/placa/ano opcionais + enum combustível Flex/Gasolina/Etanol/Diesel/GNV + ano 1900..anoAtual+1) + actions/carros.ts (create/update/archive/unarchive, Zod → getClaims sub-gate → assertOwnedCarro re-derive → write → revalidatePath('/carros'), { ok } | { error } nunca throw) + assertOwnedCarro em ownership.ts (exactly-1-row IDOR re-derive) + carro.test.ts/carros.test.ts (6+16 casos: Zod/sessão/IDOR no-write/shape). Sem desvios; suíte 632 passed, tsc limpo (4 commits: 250139a, 57e4fa0, 940f3e7, 486d5a7) ✓ 2026-06-17
  - [x] 08-03-PLAN.md — Fatia UI: NAV_ITEMS += Carros (sidebar após Reservas + bottom-nav 6º item, lucide Car) + CarroForm dialog (create/edit, clone reserva-form, client carroSchema + sonner) + CarroCard identidade (apelido link + modelo·placa·ano + badges combustível/Arquivado + dropdown Editar/Arquivar, sem dinheiro/KPIs) + /carros lista RSC (RLS read + grid + Novo carro + filtro ?arquivados=1 Switch + empty Car-icon/loading CardSkeleton/error inline) + /carros/[id] detalhe mínimo (definition list + ações Editar/Arquivar, notFound em id alheio). Sem desvios; tsc + build limpos (compila /carros + /carros/[id]), suíte 632 passed, grep gates OK (3 commits: af3fd65, 3918e34, 15b1434) ✓ 2026-06-17

**UI hint**: yes

### Phase 9: Etiquetar gastos da fatura ao carro

**Goal**: Usuário liga um gasto já lançado (manutenção, óleo) a um carro como uma lente puramente aditiva — o lançamento continua contando exatamente na mesma categoria e meta de antes (D4) — reusando o padrão "qual reserva?" já provado, tanto no formulário de transação quanto numa ação de linha no extrato.
**Mode:** mvp
**Depends on**: Phase 8 (carros existem para etiquetar), Phase 2 (transacao-form + extrato-table existem)
**Requirements**: CAR-02
**Success Criteria** (what must be TRUE):

  1. No formulário de transação há um seletor opcional "Carro" que grava/limpa `carro_id`, livre de categoria (qualquer gasto pode ser etiquetado)
  2. Na linha do extrato (e na revisão de importação) há uma ação "vincular a carro" que etiqueta um lançamento já importado da fatura
  3. Etiquetar ou desetiquetar um lançamento NÃO altera sua categoria, valor, nem qualquer número de aderência às metas (mensal ou anual) — verificável comparando o dashboard antes/depois
  4. O servidor re-deriva a posse do `carro_id` antes de gravar (`assertOwnedCarro`); etiquetar com um carro de outro usuário é rejeitado e o result shape é `{ ok: true } | { error }`, nunca throw

**Plans**: 3/3 plans complete

  - [x] 09-01-PLAN.md — Camada server [Wave 1]: carroId opcional/nullable no transactionSchema + carro_id write/clear em createTransactionWithReserva/updateTransaction (re-derive assertOwnedCarro tri-state, livre de categoria) + nova action bulkTagCarro (set/clear carro_id em N linhas próprias num único .update().in(), valida o carro UMA vez, IDOR no-write) + testes de ação (transactions.test.ts) + Wave-0 integração D4/IDOR (tests/carro-tag-nondestructive.test.ts: tag+untag deixa categoria/valor/metas-agg byte-idênticos, sem perturbar reserva_ledger) — **entregue 2026-06-17 (3 tasks; 654 suite green; tsc+build limpos)**
  - [x] 09-02-PLAN.md — Fatia UI extrato [Wave 2]: CarroPicker (espelha ReservaPicker, opcional + "Nenhum", sem "+ Nova") + seletor Carro no transacao-form (incondicional, livre de categoria) + ação de linha "Vincular a carro" no extrato (dialog focado → updateTransaction só-carro, preserva categoria/valor) + "Vincular a carro" na SelectionActionBar (bulk → bulkTagCarro) + wiring do RSC /extrato (carros não-arquivados + carro_id nas linhas) + human-verify
  - [x] 09-03-PLAN.md — Fatia UI revisão de importação [Wave 2]: carroId opcional no confirmImportRowSchema + persist de carro_id no confirmImport (re-derive assertOwnedCarro, rejeita o payload inteiro em carro forjado, aditivo — não toca categoria/valor/reserva/dedupe) + import.test.ts + seletor "Carro" por linha no import-review-table (CarroOption local + Select inline "Nenhum", sem importar carro-picker) + wiring do RSC /importar/[statementId] + human-verify

**UI hint**: yes

### Phase 10: Abastecimento híbrido + consumo

**Goal**: Usuário registra cada abastecimento — com odômetro, litros, flag tanque-cheio e tipo de combustível — e o custo vem OU de um lançamento da fatura vinculado OU de um valor manual (dinheiro/pix), exatamente uma fonte (D2, CHECK XOR); a partir desses registros o sistema calcula consumo km/l pelo método tanque-cheio (D3) e R$/km por intervalo, expondo médias por carro.
**Mode:** mvp
**Depends on**: Phase 8 (tabela `abastecimentos` + views), Phase 9 (vínculo opcional a um lançamento já etiquetável)
**Requirements**: CAR-03, CAR-04
**Success Criteria** (what must be TRUE):

  1. Usuário registra um abastecimento com data (pinada America/Sao_Paulo), odômetro (>0), litros (>0), flag tanque-cheio e combustível, escolhendo a fonte de custo: um lançamento vinculado da fatura OU um valor manual em centavos
  2. O custo tem exatamente uma fonte — `transaction_id` XOR `amount_cents` — garantido por CHECK no banco e por validação no servidor; nunca ambos, nunca nenhum, e um lançamento vincula no máximo um abastecimento (índice único parcial)
  3. Ao vincular um abastecimento a um lançamento, o servidor seta `carro_id` nesse lançamento para que o combustível apareça no gasto do carro; `preco_litro` é sempre derivado (custo ÷ litros), nunca armazenado
  4. O sistema calcula, via `v_abastecimento_consumo` (`security_invoker`), o km/l de cada intervalo tanque-cheio (Δodômetro ÷ Σlitros desde o último tanque cheio) e o R$/km do intervalo, e `v_carro_resumo` expõe as médias por carro
  5. Todo dinheiro é centavos inteiros (helpers `money.ts`), litros é `numeric` (não dinheiro), e o servidor re-deriva a posse de `carro_id`/`transaction_id` antes de cada FK write

**Plans**: 3/3 plans complete

  - [x] 10-01-PLAN.md — [Wave 1, BLOCKING substrate] migração 0028_carros_fix.sql (WR-05/06: v_abastecimento_consumo guarda km_rodados ≤ 0 → null + exclui das médias + desempate determinístico; WR-01: CHECK ano 1900..2100 + combustivel_padrao enum; security_invoker mantido) aplicada LOCAL + gen:types sem drift + Wave-0 carro-consumo.test.ts (km/l tanque-cheio, guarda km negativo, R$/km, preco_litro derivado); suite 670 passed / build GREEN; CAR-04 Complete ✓ 2026-06-17
  - [x] 10-02-PLAN.md — [Wave 2] camada server: schemas/abastecimento.ts (Zod XOR fonte de custo) + actions/abastecimentos.ts (create/update/delete, dual IDOR carro_id + transaction_id, seta carro_id no lançamento vinculado, { ok } | { error }) + lib/carro/consumo.ts (preco_litro/km-l/R$-km derivados, '—' para inválido) + testes + Wave-0 abastecimento-action.test.ts (XOR ambos/nenhum, IDOR sem-write, 1:1 já-vinculado, sync carro_id); suite 720 passed / build GREEN; CAR-03 Complete ✓ 2026-06-17
  - [x] 10-03-PLAN.md — [Wave 3] fatia UI: abastecimento-form.tsx (dialog, toggle segmentado Da fatura | Manual, tanque-cheio default ON, combustível default do carro) + transacao-picker.tsx (picker buscável de lançamentos não-vinculados) + abastecimento-history.tsx (histórico tabela→card + médias km/l + R$/km em números) + /carros/[id] (seção Abastecimentos) — gráfico DIFERIDO p/ Phase 11

**UI hint**: yes

### Phase 11: Detalhe do carro + gráfico de consumo

**Goal**: Usuário abre o detalhe de um carro e vê, num só lugar, quanto gastou com ele (manutenção + combustível via `carro_id`), o histórico de abastecimentos e a curva de consumo (km/l ao longo do tempo) — a fatia-capstone de apresentação que torna o módulo visível e útil, reusando a infra recharts e a gramática empty/loading/error da Phase 7.
**Mode:** mvp
**Depends on**: Phase 8 (rota `/carros/[id]` + `v_carro_resumo`), Phase 9 (gasto por `carro_id`), Phase 10 (abastecimentos + consumo)
**Requirements**: CAR-05
**Success Criteria** (what must be TRUE):

  1. `/carros/[id]` mostra o cabeçalho do carro (apelido/modelo/placa/ano) e os KPIs km/l médio, R$/km e gasto total (manutenção + combustível)
  2. O detalhe mostra o gasto por categoria dos lançamentos etiquetados com este `carro_id` e a lista `/carros` mostra gasto total + km/l médio por carro
  3. O histórico de abastecimentos aparece numa tabela (data, odômetro, litros, R$, km/l do intervalo, vínculo à fatura), com colapso table→card no mobile (padrão Phase 7)
  4. Um gráfico de consumo (recharts via shadcn chart) plota km/l ao longo do tempo, token-aware e com tooltip pt-BR
  5. Empty/loading/error states seguem o padrão da Phase 7 (skeletons, nunca spinner; valores em pt-BR `R$`)

**Plans**: 4/4 plans complete

  - [x] 11-01-PLAN.md — [Wave 1] componentes net-new: CarroConsumoChart (linha km/l no tempo, recharts via shadcn chart, token-aware --chart-1, tooltip pt-BR via kmPerLitroLabel + consumoTooltipFormatter, pontos null/0-omitidos, empty pt-BR) + CarroCategoriaBars (barras de magnitude neutras bg-muted-foreground, ordem valor desc, label formatCents mono, empty line) + Wave-0 component tests (data/empty/pt-BR/null/ordem/magnitude); suíte 729 passed, tsc limpo (CAR-05.2/CAR-05.4) ✓ 2026-06-17
  - [x] 11-02-PLAN.md — [Wave 1] lista /carros: CarroCardData += gastoTotalCents/kmPorLitroMedio + strip KPI aditivo (mono tabular-nums, '—' null) + RSC lê v_carro_resumo RLS-scoped (gasto 0 → '—', nunca R$ 0,00); identidade/ações intactas; 3 Wave-0 tests green, suíte 732 passed, tsc limpo, build exit 0 (CAR-05.2) ✓ 2026-06-17
  - [x] 11-03-PLAN.md — [Wave 2] detalhe /carros/[id] enriquecido: 3 KPI cards (km/l médio · R$/km · gasto total de v_carro_resumo) + agregação INLINE gasto-por-categoria (sem view nova — 1 consumidor, RLS-scoped; integration test sums/isolamento-userB-zero/D4 não-destrutivo) → CarroCategoriaBars + CarroConsumoChart de v_abastecimento_consumo (série cronológica, intervalos null dropados) + AbastecimentoHistory Phase-10 integrado verbatim; re-auditoria SEC-01 bundle-secret exit 0 em build fresco; WR-02 documentado como limitação conhecida (não corrigido); suíte 735 passed, tsc limpo, build exit 0 (CAR-05.1/.2/.4) ✓ 2026-06-17
  - [x] 11-04-PLAN.md — [Wave 3, autonomous:false] phase gate (suíte + tsc + build + secret-audit) + human-verify visual: chart/bars/KPI cards/list KPIs em light+dark+mobile (recharts SVG/cores/flip/tooltip não medíveis em jsdom)

**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Fundação | 3/4 | In progress | - |
| 2. Receitas, categorias e lançamentos | 3/5 | In progress | - |
| 3. Metas, aderência e reservas | 5/6 | In progress | - |
| 4. Upload + classificação inteligente | 3/4 | In progress | - |
| 5. Módulo MEI / DASN-SIMEI | 3/4 | In progress | - |
| 6. Endurecimento | 1/5 | In progress | - |
| 7. Identidade visual e polimento | 7/7 | Complete    | 2026-06-17 |
| 8. Substrato Carro + CRUD + navegação | 3/3 | Complete    | 2026-06-17 |
| 9. Etiquetar gastos da fatura ao carro | 3/3 | Complete    | 2026-06-17 |
| 10. Abastecimento híbrido + consumo | 3/3 | Complete    | 2026-06-17 |
| 11. Detalhe do carro + gráfico de consumo | 4/4 | Complete    | 2026-06-17 |

## Dependencies & Parallelization

- **Linear core path:** Phase 1 → 2 → 3 → 4. Each consumes the previous: metas precisam do denominador de receita (Phase 2); reservas precisam de transações + categorias (Phase 2); o classificador por IA precisa da camada de memória, que dispara só no cache-miss (Phase 4 internamente: memória antes da IA).
- **Phase 5 (MEI) parallelizes:** depende apenas da Fundação (Phase 1) — não toca o core de classificação. Pode ser construída em paralelo a qualquer fase ≥ 2.
- **Phase 6 (Hardening) is last:** re-verifica os pitfalls das fases anteriores e fecha LGPD; depende de todas as superfícies existirem. Internamente: Wave 1 substrate (06-01) → Wave 2 CSV slice (06-02) ‖ SEC-01 audits (06-04) → Wave 3 LGPD export+delete (06-03) → Wave 4 human-verify (06-05).
- **Phase 7 (Re-skin) is the visual finish:** depende de todas as superfícies das fases 1-6 existirem. Re-skin only — não toca lógica/dados/segurança. Internamente: **Wave 1** substrate tokens-first + dark mode (07-01, BLOCKING) → **Wave 2** três fatias paralelas sem overlap de arquivo (07-02 brand/shell/nav ‖ 07-03 charts ‖ 07-04 mobile tables→cards) → **Wave 3** auth shell (07-05) → **Wave 4** polish sweep (07-06) → **Wave 5** human-verify + phase gate (07-07).
- **v1.2 Carro — linear, sobre as fases 1-7 já entregues:** Phase 8 (substrato + CRUD + nav, BLOCKING) → Phase 9 (etiquetagem) → Phase 10 (abastecimento + consumo) → Phase 11 (detalhe + gráfico). Phase 8 é o substrato que todas as demais consomem (tabelas/views/`carro_id`/nav). Phases 9 e 10 poderiam paralelizar parcialmente (etiquetagem vs log de abastecimento são fatias distintas), mas Phase 10 reusa o vínculo opcional a um lançamento que a Phase 9 torna natural; manter sequencial é mais simples para dev solo. Phase 11 é capstone — depende das três anteriores existirem.
- **Phase 9 internamente:** **Wave 1** camada server (09-01, BLOCKING — o contrato carro_id + bulkTagCarro + Wave-0 D4/IDOR que as duas fatias UI consomem) → **Wave 2** duas fatias UI paralelas sem overlap de arquivo (09-02 extrato: transacao-form + extrato-table + selection-action-bar + carro-picker ‖ 09-03 revisão de importação: import.ts + schemas/import.ts + import-review-table). 09-02 e 09-03 são file-disjuntas (09-03 define CarroOption local + Select inline, não importa o carro-picker da 09-02) — paralelizáveis com segurança.

## Research Flags

Fases que provavelmente precisam de pesquisa mais profunda durante o planejamento:

- **Phase 4 (upload + IA):** parse de PDF foi adiado para v2, mas mesmo OFX/CSV variam por banco — coletar amostras reais antes; confirmar provedor de IA final + comportamento de structured-output (A/B Gemini 2.5 Flash-Lite vs GPT-5-nano em descritores BR reais).
- **Phase 5 (MEI/DASN):** verificar os campos exatos do formulário DASN-SIMEI + as figuras de proporcionalidade/tolerância de 2026 contra o manual atual da Receita no momento do build (regras fiscais mudam).

Fases com padrões estabelecidos (podem pular pesquisa de fase):

- **Phase 1 (fundação):** auth SSR Supabase + RLS + typed-client são bem documentados.
- **Phases 2–3 (loop manual):** CRUD + agregação por SQL views + dashboards shadcn/Recharts são padrões estabelecidos; o trabalho novo são as *decisões* (denominador, contabilidade de reserva), não a implementação.
- **Phase 7 (re-skin):** Tailwind v4 OKLCH theming, next-themes dark mode, shadcn chart/Recharts são bem documentados; o UI-SPEC já resolveu quase toda decisão. O risco real é o override react-is + a flip-integrity de contraste light↔dark (verificação humana), não tooling.
- **Phases 8-11 (v1.2 Carro):** padrões estabelecidos — o design spec aprovado já resolveu modelo de dados (tabelas/`carro_id`/views), regra XOR de custo, método de consumo tanque-cheio e UI/rotas espelhando o MEI já construído; recharts/empty-states já vieram na Phase 7. O risco real está na lógica da view `v_abastecimento_consumo` (window `lag()` por intervalo tanque-cheio) e no CHECK XOR + índice único parcial — verificáveis com testes, não pesquisa.

---
*Roadmap created: 2026-06-16*
*Coverage: 47/47 v1 requirements mapped*
*Phase 4 planned: 2026-06-16 (4 plans, AI deferred — memory-first pipeline + suggestion seam)*
*Phase 5 planned: 2026-06-16 (4 plans, zero new npm deps — substrate + dashboard + NF/report slices + human-verify)*
*Phase 6 planned: 2026-06-17 (5 plans, zero new npm deps — substrate + Wave-0 / CSV slice / LGPD export+delete / SEC-01 audits / human-verify; no new migration — all 14 tables already ON DELETE CASCADE)*
*Phase 7 planned: 2026-06-17 (7 plans, ONE new npm dep recharts + react-is override; re-skin only — tokens-first substrate + dark mode / brand+shell+nav / charts / mobile tables→cards / auth shell / polish sweep / human-verify; no migration, no query, no view, no Server Action change)*
*Milestone v1.2 "Carro" roadmapped: 2026-06-17 (4 phases 8-11, mvp vertical slices; CAR-01..06 mapped 6/6; new migration carros/abastecimentos/carro_id + 2 security_invoker views; mirrors MEI module structure)*
*Phase 9 planned: 2026-06-17 (3 plans, zero new npm deps — Wave 1 camada server carro_id + bulkTagCarro + Wave-0 D4/IDOR; Wave 2 duas fatias UI paralelas file-disjuntas: extrato ‖ revisão de importação; CAR-02; lente não-destrutiva D4 + IDOR re-derive em todo write)*
