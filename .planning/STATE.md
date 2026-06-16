---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-06-16T18:45:00.000Z"
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 9
  completed_plans: 6
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
Plan: 4 of 5

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

**Last session (2026-06-16):** Completed 02-03-PLAN.md — fatia Categorias (não-worktree, sequencial em `main`). `src/actions/categories.ts` (`'use server'`, espelha auth.ts/incomes.ts): `createCategory` (insert Zod-validado, cor swatch opcional, rejeita free-hex), `renameCategory`/`setKind`/`setColor` (edições de campo único — toggle consumo↔alocação persiste, CAT-03), `archiveCategory` (is_archived=true, histórico mantido, some dos pickers), `deleteCategory` (resultado discriminado `{ ok } | { error } | { blocked, txCount }` — pré-checa tx_count somado de v_category_totals; >0 → blocked; senão deleta com ON DELETE RESTRICT/23503 como backstop amigável, nunca toast cru — Pitfall 5), `reassignAndDelete` (RPC atômico `reassign_and_delete_category({ src, dst })`, move+delete numa transação, self-reassign barrado — Open Q2). `src/app/(app)/categorias/page.tsx` (RSC): lista categorias ativas + usos (tx_count de v_category_totals somado num Map) + toggle de tipo inline + menu editar/excluir + estados empty/error em pt-BR. Componentes: `category-badge.tsx` (SWATCH_OKLCH 8 cores + CategoryDot/KindBadge/CategoryBadge, self-contained p/ Extrato 02-04), `categoria-form.tsx` (dialog criar/editar: nome + switch tipo + picker 8-swatch + aviso de categoria-feature "Reserva"; open controlado opcional), `category-delete-dialog.tsx` (txCount>0 → "Esta categoria tem {n} transações…" com [Arquivar] / [Reatribuir e remover] via Select+RPC; senão confirmação destrutiva padrão), `category-kind-toggle.tsx` + `category-row-actions.tsx` (client islands sobre a RSC). TDD: categories.test.ts 19/19 GREEN (mock do supabase server + .rpc + canal v_category_totals; asserções de insert/Zod/pre-check blocked+soma/23503/RPC-args/self-reassign/session). Suite 103/103 GREEN, `tsc --noEmit` limpo, `npm run build` OK (rota /categorias compilada), grep "Reatribuir e remover" OK. Fix Rule 3: handler do Select base-ui (string|null → setTarget(v ?? '')). `category-badge.tsx` criado aqui (o "REUSE de 02-01" era impreciso — nunca existiu). Stack local deixado RODANDO. CAT-02/03 → Complete.

**Next action:** Categorias entregue. Avançar para 02-04 (fatia Extrato: transaction actions CRUD + bulkReclassify + tabela densa TanStack com filtros via URL, totais por categoria, SelectionActionBar; importa CategoryBadge desta fatia — TXN-01/02/03/04), executável test-first contra o schema migrado. TXN permanece Pending até a fatia 02-04. Verificação manual (INC-02 edit-choice, round-trip de filtros, bulk re-classify) fica para o checkpoint humano 02-05.

---
*State initialized: 2026-06-16 after roadmap creation*
