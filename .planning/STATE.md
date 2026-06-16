---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-06-16T22:37:00.000Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 15
  completed_plans: 12
  percent: 20
---

# Project State: Gestão Financeira Pessoal

*Project memory. Updated at phase/plan transitions. Read first when resuming work.*

## Project Reference

- **Core value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas. Se tudo mais falhar, classificação inteligente com memória + visão de metas tem que funcionar.
- **Mode:** mvp (vertical slices — cada fase entrega capacidade ponta-a-ponta visível ao usuário)
- **Stack (locked):** Next.js App Router + TypeScript estrito (sem JS) + Supabase (Auth/Postgres/Storage) + Vercel
- **Current focus:** Phase 3 — Metas, aderência e reservas

## Current Position

Phase: 3 (Metas, aderência e reservas) — EXECUTING
Plan: 5 of 6 (03-01 substrate + 03-02 Wave-0 tests + 03-03 Metas+Dashboard slice + 03-04 Reservas slice Complete; next is 03-05 Aporte sub-flow)

- **Phase:** 1 — Fundação (auth, RLS, dinheiro, schema)
- **Plan:** 01-03 complete (auth SSR vertical slice: @supabase/ssr 3-client split + getClaims() middleware, Zod-validated signIn/signUp/signOut actions, custom shadcn login/signup forms, protected (app) shell + logout-anywhere, dashboard real RLS categories read; live local round-trip OK; build + bundle gate GREEN); next is 01-04
- **Status:** Executing Phase 3
- **Progress:** Phase 0/6 complete (Phase 2: 3/5 plans — TXN-01/02/03/04 Complete)

```
[··········] 0/6 phases
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 6 |
| Phases complete | 0 |
| v1 requirements | 47 |
| Requirements mapped | 47 |
| Plans complete | 6 |

### Plan Execution Log

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 1 | 01 | ~11 min | 3 | 13 created | 2026-06-16 |
| 1 | 02 | ~12 min | 2 | 4 created / 1 modified | 2026-06-16 |
| 1 | 03 | ~8 min | 3 | 13 created / 3 modified | 2026-06-16 |
| 2 | 01 | ~9 min | 4 | ~37 created / 6 modified | 2026-06-16 |
| 2 | 02 | ~10 min | 2 | 6 created / 0 modified | 2026-06-16 |
| 2 | 03 | ~7 min | 2 | 8 created / 0 modified | 2026-06-16 |
| 3 | 01 | ~14 min | 2 | 10 created / 3 modified | 2026-06-16 |
| 3 | 02 | ~13 min | 2 | 12 created / 2 modified | 2026-06-16 |
| 3 | 03 | ~8 min | 3 | 7 created / 3 modified | 2026-06-16 |
| 3 | 04 | ~8 min | 3 | 9 created / 0 modified | 2026-06-16 |

## Accumulated Context

### Locked Decisions (constrain all future work)

- **Dinheiro em centavos inteiros (`bigint`), nunca float** — erro de float em dinheiro é irreversível. Parse pt-BR `"1.234,56"` → `Math.round(value*100)` uma vez no ingest; formatar só na borda da UI com `Intl.NumberFormat('pt-BR')`.
- **RLS é a fronteira de segurança, não o código do app** — `(select auth.uid()) = user_id` + `WITH CHECK` + `TO authenticated` em toda tabela; bucket privado com RLS por pasta `{user_id}/`. Query negada retorna vazio, não erro (risco de vazamento silencioso).
- **Modelo de dados escopado por `user_id` desde o v1** — multi-user-ready; esposa entra como segundo login, zero migração.
- **Classificação = memória primeiro, IA só no cache-miss** — merchant→categoria aprendido é point-read indexado (free); IA (Vercel AI SDK + AI Gateway, saída restrita ao enum via Zod) só para merchant nunca visto; padrão salvo APENAS no confirm humano.
- **Categoria point-in-time na linha da transação** — renomear/reclassificar não reescreve histórico; regras chaveadas por `category_id`, não por nome.
- **Denominador das metas % = receita líquida recebida no mês** — mesmo ledger para mensal e anual; clamp perto de zero.
- **Metas têm direção:** teto (consumo, não exceder) vs alvo (investimento/poupança, atingir).
- **Aporte em reserva = alocação de investimento (transfer), excluído do gasto de consumo** — saldo da reserva sempre derivado (Σ in − Σ out), nunca coluna mutável; saída não deixa saldo negativo.
- **Upload direto browser→Storage por signed URL** — contorna o limite de 4.5MB da função Vercel; parse roda em background via `after()`.
- **PDF de fatura adiado para v2 (IMP-06)** — OFX/CSV (determinísticos) no v1; PDF requer spike sobre amostras reais.
- **MEI usa o limite *aplicável*** — proporcional (R$6.750 × meses) no 1º ano, R$81k cheio, banda de 20%; receita *bruta*; split comércio/serviços + flag de funcionário desde o registro; módulo informativo, não consultoria fiscal.
- **Provedor de IA a confirmar no build** — A/B Gemini 2.5 Flash-Lite vs GPT-5-nano via troca de string no AI Gateway; custo dominado por volume de chamadas (memória primeiro), não por modelo.

### Open Decisions (resolve during planning)

- **Reserva accounting — RESOLVIDO em 03-01:** aporte (categoria `kind='alocacao'`) entra SÓ no total de alocação (Investimentos+Reserva somados juntos via CTE `alloc_total`), nunca em teto de consumo — feito DENTRO da view `security_invoker` (Open Question 1 → grouping no SQL). "Disponível para orçar" fica fora do v1 (deferred). Mensal + anual aplicam idêntico `percent_bp` + arredondamento half-up + agrupamento; só a janela difere (consistência garantida). Handle estável da "Reserva" = flag `categories.is_reserva` (Open Question 2 → flag, não name-match), backfilled + seedado em `handle_new_user`.
- **Amostras reais de extratos por banco (antes da Phase 4):** mapeamento de colunas CSV e viabilidade de parse só validam contra exports reais (Nubank/Itaú/Inter/etc.).
- **Campos exatos da DASN-SIMEI 2026 (antes da Phase 5):** verificar formulário + figuras de proporcionalidade/tolerância contra o manual atual da Receita.

### Todos / Carry-forward

- (nenhum ainda)

### Blockers

- **01-04 ADIADO (decisão do usuário, 2026-06-16):** plano `autonomous:false` de deploy — credenciais do Supabase remoto + Vercel + verificação no browser. Código da Fase 1 está provado no stack LOCAL. Fases 2-5 serão construídas/testadas contra o Supabase local; todo o wiring remoto + deploy fica para o fim, quando o usuário tiver as credenciais à mão. NÃO é gap de implementação — é etapa de credencial/deploy pendente.

## Session Continuity

**Last session (2026-06-16):** Completed 03-03-PLAN.md — fatia Metas + Dashboard (não-worktree, sequencial em `main`). A tela de valor-central ponta-a-ponta: o usuário define uma meta % por categoria com direção e vê a aderência no dashboard. Task 1 (commit d76de49): `src/actions/budget-targets.ts` espelha `transactions.ts` verbatim — `upsertBudgetTarget` (Zod `budgetTargetSchema` → {error} + `getClaims` gate + `assertOwnedCategory` re-derive RLS-scoped antes do FK, fix IDOR carregado da Fase 2 + `upsert` onConflict `'user_id,category_id'` = uma meta por categoria) e `deleteBudgetTarget` (guard uuid + delete RLS-scoped); `directionForKind` puro extraído p/ `lib/adherence.ts` (consumo→teto, alocacao→alvo — fonte única p/ form, dashboard e teste); `budget-targets.test.ts` 13/13 (mock chainable estilo categories.test); o `it.skip` de `budget-target-direction` da 03-02 virou `it()` GREEN. Task 2 (commit ec5fea4): `adherence-bar.tsx` (track h-2 + fill direção-aware + meta-tick + role=progressbar/aria-valuetext, clamp visual 100% mas label pode passar de 100%), `adherence-row.tsx` (AdherenceRow + tipo AdherenceRowData; badge·bar·R$·%·meta%·label+glyph 80/100 BUD-04: triangle≥80, octagon teto≥100, check alvo≥100; null→'sem receita', nunca NaN%; tooltip "Inclui aportes de reserva" na linha combinada), `adherence-summary-strip.tsx` (receita hero 28px mono + contagem estouradas/atingidas), `meta-dialog.tsx` (% input + switch Teto/Alvo default-from-kind + preview R$ ao vivo + soft-warn soma de tetos>100%; salva via upsert, limpa via delete; toasts pt-BR). Task 3 (commit 25dee70): `src/app/(app)/dashboard/page.tsx` substitui o placeholder — `Promise.all` lê `v_adherence_month` (`?mes`) + `v_adherence_ytd` (ano civil) RLS-scoped + categorias/metas p/ o dialog + `v_income_month` p/ o preview; `buildRows` mapeia ambas as views p/ um só `AdherenceRowData` (consumo ordenado, alocação COLAPSADA em UMA linha combinada somando os `percent_bp` e recomputando o `adherence_bp` sobre o total combinado da view — RSV-03, aporte nunca em teto de consumo); abas Mensal/Anual (`period-tabs.tsx` client, ambos painéis server-rendered, Mensal default, janela YTD "Acumulado de {ano} (jan–{mês})"); 4 estados (empty-sem-metas+CTA, empty-sem-receita como cópia /0-guard nunca NaN%, erro inline, RSC server-render). **Desvios (sem permissão):** `directionForKind` p/ `lib/adherence.ts` (3 consumidores, evita drift — Rule 2); re-seed do MetaDialog no open-change handler em vez de `useEffect` (lint set-state-in-effect — Rule 1). Suite completa **235 passed | 0 skipped** (31 arquivos; +13 action tests, +1 direction agora GREEN), `tsc --noEmit` limpo, eslint limpo nos 9 arquivos, `npm run build` OK (/dashboard dinâmica). BUD-01/02/03/04 entregues ponta-a-ponta. Stack local deixado RODANDO (API 127.0.0.1:55321, migrations 0001-0017). Sem push remoto.

**(arquivo anterior) Completed 03-02-PLAN.md — Wave-0 tests da Fase 3 (não-worktree, sequencial em `main`). Nove testes de integração + o unit de `adherence.ts`, autorados contra o substrate LIVE de 03-01, estendendo as harnesses view-leak/rls-isolation da Fase 1/2. Task 1 (commit c1484df): `reserva-balance` (saldo derivado Σin−Σout, sem coluna armazenada), `reserva-saida` (RPC atômica, overdraw rejeitado, **concorrente never-negative**), `reserva-aporte` (aporte sobe SÓ o total de alocação, todo consumo byte-idêntico — guard #1 de double-count), `reserva-idor` (reserva_id forjado aceito por insert raw, rejeitado por ownership re-derive + RPC), `reserva-crud` (alvo opcional + cascade), `view-leak` estendido (3 views security_invoker), `rls-isolation` estendido (budget_targets/reservas/reserva_ledger). Task 2 (commit 94acb80): `adherence.test.ts` (unit puro, thresholds 80/100 por direção, percent nunca NaN% — GREEN), `budget-target-crud` (one-meta-per-category upsert + domínio percent_bp), `budget-target-direction` (ambas direções/override; action-default `it.skip` RED-pending p/ 03-03), `adherence-month` (meta half-up + adherence_bp + guard income-0→null), `adherence-consistency` (ano de um mês → month==ytd, Pitfall 7), `adherence-ytd` (acumulação no ano civil). **[Rule 1 - Bug]** Autorar o teste concorrente de saída pegou um TOCTOU REAL no `register_reserva_saida` de 03-01: 0016 lia o saldo do `v_reserva_balance` e inseria no mesmo corpo, mas o par read-then-insert não serializava — duas saídas concorrentes liam o mesmo saldo pré-insert e ambas inseriam (saldo foi a −20000). Corrigido em `0017_register_reserva_saida_lock.sql` com `select id from reservas where id=$1 and user_id=auth.uid() for update` ANTES da leitura do saldo (serializa por reserva, escopo RLS do caller → IDOR-safe; assinatura inalterada, sem regen de types). Suite completa **221 passed | 1 skipped** (30 arquivos; o skip é o default de direção RED-pending de 03-03), `tsc --noEmit` limpo, `db:reset` 0001-0017 limpo. 03-VALIDATION.md marcado `wave_0_complete: true` / `nyquist_compliant: true`. Stack local deixado RODANDO (API 127.0.0.1:55321, migrations 0001-0017). Sem push remoto.

**(arquivo anterior) Completed 03-01-PLAN.md — substrate da Fase 3 (não-worktree, sequencial em `main`). Seis migrations 0011-0016 aplicadas no stack LOCAL (`npm run db:reset` 0001-0016 limpo) + `database.types.ts` regenerado: `budget_targets` (percent_bp basis-points 0<bp<=10000 + direction teto/alvo + unique(user_id,category_id) + RLS/grants/índice; CASCADE no category_id); `categories.is_reserva` (Open Question 2 → flag estável, NÃO name-match; backfill na seed Reserva + seedado por linha em `handle_new_user`); `reservas` + `reserva_ledger` (amount_cents>0 sempre positivo, sinal do kind in/out, `transaction_id` FK ON DELETE SET NULL + índice único parcial p/ link idempotente de aporte, RLS por tabela); `v_adherence_month` + `v_adherence_ytd` ambas `security_invoker=true` — agrupamento de alocação NA VIEW (Open Question 1): CTE `alloc_total` soma todo `kind='alocacao'` junto (Investimentos+Reserva), consumo filtra `kind='consumo'` por categoria; `meta_cents=(income*bp+5000)/10000` half-up uma vez; `adherence_bp` guardado contra /0 (case→null + nullif, nunca NaN%); mensal e YTD compartilham percent_bp+arredondamento+agrupamento, só a janela difere (consistência BUD-03); `v_reserva_balance` `security_invoker` saldo derivado Σin−Σout; `register_reserva_saida` RPC `security invoker` + search_path fixo espelhando reassign — rejeita null/<=0, lê saldo do `v_reserva_balance` escopado ao caller (reserva forjada→null→aborta, IDOR-safe), `amount>saldo`→P0001, senão insere 'out' no mesmo corpo (TOCTOU-safe). App-side: `month.ts` +currentYear/+yearBounds (SP); `adherence.ts` puro (adherenceStatus + adherenceTokens UI-SPEC + formatBpAsPercent nunca NaN%); schemas `budget-target.ts`/`reserva.ts`; `progress.tsx` Radix-free vendorado (role=progressbar+aria+h-2, sem nova dep npm — T-03-SC); nav Reservas (PiggyBank→/reservas). Suite completa 155/155 GREEN (RLS/view-leak da Fase 1/2 passam contra o stack resetado), `tsc --noEmit` limpo, eslint limpo, `npm run build` OK. Sem push remoto. Stack local deixado RODANDO. Commits: bd768f0 (migrations+types), f7adf89 (helpers+schemas+progress+nav).

**(arquivo anterior) Completed 02-04-PLAN.md — fatia Extrato (não-worktree, sequencial em `main`). `src/actions/transactions.ts` (`'use server'`, espelha auth.ts/incomes.ts/categories.ts): `createTransaction` (insert Zod-validado, `kind:'expense'` + `amount_cents` positivo — sinal deriva do kind, nunca negativo; T-02-TXN-VAL; TXN-01), `updateTransaction`/`deleteTransaction` por id (RLS escopa ao dono; TXN-02), `bulkReclassify(ids, categoryId)` (guard seleção-vazia + alvo uuid, depois UPDATE único `.in('id', ids)` — RLS escopa mesmo com id forjado; T-02-TXN-BULK; TXN-04). TDD: `transactions.test.ts` 14/14 GREEN (mock supabase server com `.in()`; asserções insert positivo+kind, rejeições money/uuid/date, filtros update/delete por id, shape `.in()` único + guards, session gate). `src/app/(app)/extrato/page.tsx` (RSC): lê `?mes`+`?cat`, transações do mês (entre monthBounds, opcional `.in('category_id', cat)`, desc) + totais por categoria/grand de `v_category_totals` (security_invoker, somado em SQL, filtrado ao mês+cat), estados empty (sem-dados vs filtrado) + error em pt-BR. Componentes: `extrato-table.tsx` (TanStack `getRowId=tx.id`, rowSelection + sort, checkbox select-all+indeterminate, Data dd/MM, Descrição truncate+tooltip, Categoria CategoryBadge inline-editável via Select→updateTransaction, Valor AmountCell neutro nunca vermelho; footer totais 600 mono; wira selectedIds→SelectionActionBar→bulkReclassify+toast), `selection-action-bar.tsx` (self-contained `{ selectedIds, categories, onApply, onClear }` — reusada verbatim na Phase 4), `transacao-form.tsx` (dialog Novo lançamento/editar: data type=date + descrição + valor MoneyInput + categoria Select), `category-filter.tsx` (popover multi-categoria escrevendo `?cat` comma-joined via useSearchParams+router.replace, badges removíveis + Limpar filtros). Suite 117/117 GREEN, `tsc --noEmit` limpo, `npm run build` OK (rota /extrato compilada), greps getRowId/selectedIds OK. Fixes Rule 3: Checkbox base-ui `indeterminate` separado de `checked`; DialogTrigger `render` exige ReactElement (não ReactNode). Fix Rule 1: fixtures de UUID nos testes para v4 RFC-4122 (zod v4 `.uuid()` valida version/variant). Stack local deixado RODANDO. TXN-01/02/03/04 → Complete.

**Next action:** Wave-0 da Fase 3 completo (9 testes de integração + adherence unit + view-leak/rls-isolation estendidos; 03-VALIDATION `wave_0_complete: true`; TOCTOU de saída corrigido em 0017). Avançar para 03-03 (Metas + Dashboard slice: `upsertBudgetTarget` IDOR-checked com default de direção por kind — vira GREEN o `it.skip` de `budget-target-direction` — + MetaDialog + AdherenceBar/Row/SummaryStrip + /dashboard real lendo `v_adherence_month`/`_ytd`; BUD-01/02/03/04). Stack local rodando (API 127.0.0.1:55321, migrations 0001-0017).

---
*State initialized: 2026-06-16 after roadmap creation*
