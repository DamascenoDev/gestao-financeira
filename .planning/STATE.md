---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-06-16T18:35:00.000Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 9
  completed_plans: 5
  percent: 0
---

# Project State: Gestão Financeira Pessoal

*Project memory. Updated at phase/plan transitions. Read first when resuming work.*

## Project Reference

- **Core value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas. Se tudo mais falhar, classificação inteligente com memória + visão de metas tem que funcionar.
- **Mode:** mvp (vertical slices — cada fase entrega capacidade ponta-a-ponta visível ao usuário)
- **Stack (locked):** Next.js App Router + TypeScript estrito (sem JS) + Supabase (Auth/Postgres/Storage) + Vercel
- **Current focus:** Phase 2 — Receitas, categorias e lançamentos manuais

## Current Position

Phase: 2 (Receitas, categorias e lançamentos manuais) — EXECUTING
Plan: 3 of 5

- **Phase:** 1 — Fundação (auth, RLS, dinheiro, schema)
- **Plan:** 01-03 complete (auth SSR vertical slice: @supabase/ssr 3-client split + getClaims() middleware, Zod-validated signIn/signUp/signOut actions, custom shadcn login/signup forms, protected (app) shell + logout-anywhere, dashboard real RLS categories read; live local round-trip OK; build + bundle gate GREEN); next is 01-04
- **Status:** Executing Phase 2
- **Progress:** Phase 0/6 complete (Phase 1: 3/4 plans)

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
| Plans complete | 5 |

### Plan Execution Log

| Phase | Plan | Duration | Tasks | Files | Completed |
|-------|------|----------|-------|-------|-----------|
| 1 | 01 | ~11 min | 3 | 13 created | 2026-06-16 |
| 1 | 02 | ~12 min | 2 | 4 created / 1 modified | 2026-06-16 |
| 1 | 03 | ~8 min | 3 | 13 created / 3 modified | 2026-06-16 |
| 2 | 01 | ~9 min | 4 | ~37 created / 6 modified | 2026-06-16 |
| 2 | 02 | ~10 min | 2 | 6 created / 0 modified | 2026-06-16 |

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

- **Reserva accounting (resolver em Phase 3):** confirmar regra canônica — aporte é transfer excluído da aderência de gasto (recomendado) e se reduz "disponível para orçar"; aplicar idêntico a mensal + anual.
- **Amostras reais de extratos por banco (antes da Phase 4):** mapeamento de colunas CSV e viabilidade de parse só validam contra exports reais (Nubank/Itaú/Inter/etc.).
- **Campos exatos da DASN-SIMEI 2026 (antes da Phase 5):** verificar formulário + figuras de proporcionalidade/tolerância contra o manual atual da Receita.

### Todos / Carry-forward

- (nenhum ainda)

### Blockers

- **01-04 ADIADO (decisão do usuário, 2026-06-16):** plano `autonomous:false` de deploy — credenciais do Supabase remoto + Vercel + verificação no browser. Código da Fase 1 está provado no stack LOCAL. Fases 2-5 serão construídas/testadas contra o Supabase local; todo o wiring remoto + deploy fica para o fim, quando o usuário tiver as credenciais à mão. NÃO é gap de implementação — é etapa de credencial/deploy pendente.

## Session Continuity

**Last session (2026-06-16):** Completed 02-02-PLAN.md — fatia Receitas (não-worktree, sequencial em `main`). `src/actions/incomes.ts` (`'use server'`, espelha auth.ts): `ensureMonthOccurrences` (materialize-on-read idempotente, upsert onConflict user_id,template_id,month_key + ignoreDuplicates — re-abrir o mês é no-op, nunca sobrescreve edição INC-02), `createIncomeTemplate` (insere template + materializa ocorrência do mês, INC-01), `updateOccurrence` (só a ocorrência, INC-02), `updateTemplate` (só o template, meses futuros), `createAdhocIncome` (template_id NULL, month_key derivado de occurred_on, INC-03), `deleteOccurrence`; occurred_on clampa day_of_month ao último dia civil. `src/app/(app)/receitas/page.tsx` (RSC): materialize-on-read + hero "Receita líquida do mês" (28px mono/600 text-income lido de v_income_month, INC-04) + tabela de ocorrências + estados empty/error em pt-BR. Componentes reutilizáveis: `money-input.tsx` (input R$ + isValidMoney/parseBRLToCents), `amount-cell.tsx` (mono tabular, sinal/cor por kind), `receita-form.tsx` (dialog Nova receita recorrente/avulsa + EditOccurrenceDialog com a escolha explícita INC-02 "Alterar só em {mês}" vs "Alterar o template", nunca silenciosa). TDD: incomes.test.ts 12/12 GREEN (mock do supabase server, asserções de upsert/clamp/derivação/edição-isolada/boundary). Suite 84/84 GREEN, `tsc --noEmit` limpo, `npm run build` OK (rota /receitas compilada). Fix Rule 1: fallback de mês civil São Paulo (não UTC). Fix Rule 2: EditOccurrenceDialog preserva source/dia no template-edit. Stack local deixado RODANDO. INC-01/02/03/04 → Complete.

**Next action:** Receitas entregue. Avançar para 02-03 (fatia Categorias: category actions CRUD + consumo/alocação + color + delete-block/archive/reassign atômico + página Categorias, CAT-02/03), executável test-first contra o schema migrado. CAT/TXN permanecem Pending até suas fatias (02-03/04). Verificação manual da escolha INC-02 e do round-trip de filtros fica para o checkpoint humano 02-05.

---
*State initialized: 2026-06-16 after roadmap creation*
