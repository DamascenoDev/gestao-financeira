---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-06-16T22:00:00.000Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 15
  completed_plans: 9
  percent: 17
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
Plan: 2 of 6 (03-01 substrate Complete; next is 03-02 Wave-0 tests)

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

**Last session (2026-06-16):** Completed 03-01-PLAN.md — substrate da Fase 3 (não-worktree, sequencial em `main`). Seis migrations 0011-0016 aplicadas no stack LOCAL (`npm run db:reset` 0001-0016 limpo) + `database.types.ts` regenerado: `budget_targets` (percent_bp basis-points 0<bp<=10000 + direction teto/alvo + unique(user_id,category_id) + RLS/grants/índice; CASCADE no category_id); `categories.is_reserva` (Open Question 2 → flag estável, NÃO name-match; backfill na seed Reserva + seedado por linha em `handle_new_user`); `reservas` + `reserva_ledger` (amount_cents>0 sempre positivo, sinal do kind in/out, `transaction_id` FK ON DELETE SET NULL + índice único parcial p/ link idempotente de aporte, RLS por tabela); `v_adherence_month` + `v_adherence_ytd` ambas `security_invoker=true` — agrupamento de alocação NA VIEW (Open Question 1): CTE `alloc_total` soma todo `kind='alocacao'` junto (Investimentos+Reserva), consumo filtra `kind='consumo'` por categoria; `meta_cents=(income*bp+5000)/10000` half-up uma vez; `adherence_bp` guardado contra /0 (case→null + nullif, nunca NaN%); mensal e YTD compartilham percent_bp+arredondamento+agrupamento, só a janela difere (consistência BUD-03); `v_reserva_balance` `security_invoker` saldo derivado Σin−Σout; `register_reserva_saida` RPC `security invoker` + search_path fixo espelhando reassign — rejeita null/<=0, lê saldo do `v_reserva_balance` escopado ao caller (reserva forjada→null→aborta, IDOR-safe), `amount>saldo`→P0001, senão insere 'out' no mesmo corpo (TOCTOU-safe). App-side: `month.ts` +currentYear/+yearBounds (SP); `adherence.ts` puro (adherenceStatus + adherenceTokens UI-SPEC + formatBpAsPercent nunca NaN%); schemas `budget-target.ts`/`reserva.ts`; `progress.tsx` Radix-free vendorado (role=progressbar+aria+h-2, sem nova dep npm — T-03-SC); nav Reservas (PiggyBank→/reservas). Suite completa 155/155 GREEN (RLS/view-leak da Fase 1/2 passam contra o stack resetado), `tsc --noEmit` limpo, eslint limpo, `npm run build` OK. Sem push remoto. Stack local deixado RODANDO. Commits: bd768f0 (migrations+types), f7adf89 (helpers+schemas+progress+nav).

**(arquivo anterior) Completed 02-04-PLAN.md — fatia Extrato (não-worktree, sequencial em `main`). `src/actions/transactions.ts` (`'use server'`, espelha auth.ts/incomes.ts/categories.ts): `createTransaction` (insert Zod-validado, `kind:'expense'` + `amount_cents` positivo — sinal deriva do kind, nunca negativo; T-02-TXN-VAL; TXN-01), `updateTransaction`/`deleteTransaction` por id (RLS escopa ao dono; TXN-02), `bulkReclassify(ids, categoryId)` (guard seleção-vazia + alvo uuid, depois UPDATE único `.in('id', ids)` — RLS escopa mesmo com id forjado; T-02-TXN-BULK; TXN-04). TDD: `transactions.test.ts` 14/14 GREEN (mock supabase server com `.in()`; asserções insert positivo+kind, rejeições money/uuid/date, filtros update/delete por id, shape `.in()` único + guards, session gate). `src/app/(app)/extrato/page.tsx` (RSC): lê `?mes`+`?cat`, transações do mês (entre monthBounds, opcional `.in('category_id', cat)`, desc) + totais por categoria/grand de `v_category_totals` (security_invoker, somado em SQL, filtrado ao mês+cat), estados empty (sem-dados vs filtrado) + error em pt-BR. Componentes: `extrato-table.tsx` (TanStack `getRowId=tx.id`, rowSelection + sort, checkbox select-all+indeterminate, Data dd/MM, Descrição truncate+tooltip, Categoria CategoryBadge inline-editável via Select→updateTransaction, Valor AmountCell neutro nunca vermelho; footer totais 600 mono; wira selectedIds→SelectionActionBar→bulkReclassify+toast), `selection-action-bar.tsx` (self-contained `{ selectedIds, categories, onApply, onClear }` — reusada verbatim na Phase 4), `transacao-form.tsx` (dialog Novo lançamento/editar: data type=date + descrição + valor MoneyInput + categoria Select), `category-filter.tsx` (popover multi-categoria escrevendo `?cat` comma-joined via useSearchParams+router.replace, badges removíveis + Limpar filtros). Suite 117/117 GREEN, `tsc --noEmit` limpo, `npm run build` OK (rota /extrato compilada), greps getRowId/selectedIds OK. Fixes Rule 3: Checkbox base-ui `indeterminate` separado de `checked`; DialogTrigger `render` exige ReactElement (não ReactNode). Fix Rule 1: fixtures de UUID nos testes para v4 RFC-4122 (zod v4 `.uuid()` valida version/variant). Stack local deixado RODANDO. TXN-01/02/03/04 → Complete.

**Next action:** Substrate da Fase 3 entregue (migrations 0011-0016 aplicadas, types regenerados, helpers/schemas/progress/nav prontos). Avançar para 03-02 (Wave-0 failing tests: 9 integration + adherence unit + estender view-leak/rls-isolation para as novas views/tabelas — pina aporte-grouping, saldo derivado, saída never-negative, IDOR de reserva_id, consistência mensal↔YTD). Stack local rodando (API 127.0.0.1:55321, migrations 0001-0016) para os testes de integração executarem imediatamente.

---
*State initialized: 2026-06-16 after roadmap creation*
