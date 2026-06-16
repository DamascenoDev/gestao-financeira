# Project State: Gestão Financeira Pessoal

*Project memory. Updated at phase/plan transitions. Read first when resuming work.*

## Project Reference

- **Core value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas. Se tudo mais falhar, classificação inteligente com memória + visão de metas tem que funcionar.
- **Mode:** mvp (vertical slices — cada fase entrega capacidade ponta-a-ponta visível ao usuário)
- **Stack (locked):** Next.js App Router + TypeScript estrito (sem JS) + Supabase (Auth/Postgres/Storage) + Vercel
- **Current focus:** Phase 1 — Fundação (auth, RLS, dinheiro em centavos, schema)

## Current Position

- **Phase:** 1 — Fundação (auth, RLS, dinheiro, schema)
- **Plan:** None yet (roadmap just created; next step is `/gsd:plan-phase 1`)
- **Status:** Roadmap approved, ready to plan Phase 1
- **Progress:** Phase 0/6 complete

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
| Plans complete | 0 |

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

- (nenhum)

## Session Continuity

**Last session (2026-06-16):** Inicialização do projeto. PROJECT.md, REQUIREMENTS.md (47 reqs v1) e pesquisa (SUMMARY/ARCHITECTURE/PITFALLS) prontos. Roadmap de 6 fases criado com cobertura 47/47.

**Next action:** `/gsd:plan-phase 1` — decompor a Fundação (auth SSR + RLS em todas as tabelas + dinheiro em centavos + seed de categorias BR + service-role server-only) em planos executáveis.

---
*State initialized: 2026-06-16 after roadmap creation*
