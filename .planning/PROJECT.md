# Gestão Financeira Pessoal

## What This Is

Sistema web **pessoal e privado** de gestão financeira. Eu cadastro meus recebimentos, faço upload das minhas faturas e o sistema classifica os gastos automaticamente — aprendendo com cada confirmação — para mostrar o quanto estou aderente às minhas metas por categoria. Inclui reservas de oportunidade (poupança por objetivo) e uma aba para gestão do meu MEI. Single-user no v1, com modelo de dados já preparado para minha esposa entrar depois.

## Core Value

Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das minhas confirmações — junto com a aderência às minhas metas. Se tudo mais falhar, **classificação inteligente com memória + visão de metas** tem que funcionar.

## Current State

**v1.3 "Produção & PDF" — SHIPPED 2026-06-18. O app está NO AR.** Treze fases code-complete subiram para produção de verdade: Supabase pessoal remoto (`sa-east-1`, migrations 0001-0032, RLS ativo) + Vercel (`gru1`, `maxDuration` nas rotas de parsing). Login pessoal, sessão persistente e isolamento RLS verificados ao vivo no browser. **Core value provado em produção:** fatura real (OFX) → parse server-side → review grid → classificação por **memória** → aderência às metas (mensal + anual). Upload de **PDF de fatura** (Santander) adicionado pela mesma UI, fluindo pelo mesmo pipeline ingest→review→confirm→classify→metas (parser `getText`, bloco image-only, estorno→credit, migrations 0031/0032) — verificado end-to-end ao vivo (98 linhas). WR-02 fechado (migration 0029). Primeira tag git: `v1.3`.

Suíte ~761 testes, `tsc --noEmit` + `npm run build` limpos. Auditoria do milestone: `tech_debt` (12/12 requisitos satisfeitos, 0 blockers — ver `milestones/v1.3-MILESTONE-AUDIT.md`).

**Dívida carregada (não bloqueia o core value):** redeploy dos fixes G-07/G-08 (cosméticos do grid de importação, GREEN local), walkthroughs hands-on 12-06 (MEI) + 12-07 (LGPD), e VALIDATION.md de Nyquist (Phase 12 ausente, Phase 13 draft). Detalhe em STATE.md `## Deferred Items`.

**Classificação por IA NÃO foi construída** — o core value do v1.3 é **memory-only** (estabelecimento conhecido auto-classifica; novo = pick manual que vira padrão). O seam `suggestCategory()` + `validateSuggestion` enum wrapper + `SuggestionSlot` estão prontos (additivo); a IA fica para v1.4 (CLS-AI).

<details>
<summary>Milestones anteriores (v1.0–v1.2)</summary>

- **v1.0 MVP** (Phases 1-6) — core ledger + upload OFX/CSV/IA-seam + metas/reservas + MEI/DASN + endurecimento. Code-complete no stack local; deploy/live-verify executado na Phase 12 (v1.3).
- **v1.1 Identidade visual** (Phase 7) — re-skin navy+gold, dark mode, charts, mobile nav. SHIPPED 2026-06-17.
- **v1.2 Carro** (Phases 8-11) — cadastro multi-car, etiquetagem não-destrutiva de gastos ao carro, abastecimento híbrido (XOR fatura/manual) + odômetro, consumo km/l tanque-cheio + R$/km com gráfico. 6/6 CAR. SHIPPED 2026-06-18 (`milestones/v1.2-*`). Design seed: `docs/superpowers/specs/2026-06-17-modulo-carro-design.md`.

</details>

## Current Milestone: v1.4 IA de Classificação (BYOK)

**Goal:** Ligar classificação assistida por IA no seam `suggestCategory()` já pronto — memory-first, IA só no cache-miss, usuário confirma antes de virar padrão — com BYOK multi-provedor (Gemini/Claude/DeepSeek) configurável numa Settings UI com chave criptografada; e quitar a dívida carregada do v1.3.

**Target features:**
- **Settings UI BYOK** — escolher provedor (Gemini/Claude/DeepSeek) + colar chave própria; chave criptografada at-rest (Supabase Vault), escopo `user_id` + RLS; botão testar conexão.
- **IA no seam `suggestCategory()`** — memory-first (zero IA p/ merchant conhecido), IA só p/ descritor novo, batch dos não-vistos por upload numa chamada, `validateSuggestion` enum-constrained (Zod), `SuggestionSlot` na review grid.
- **Confirmação humana no loop** — sugestão IA aparece na review grid → confirmo → vira padrão na memória → auto-classifica próximas faturas. Nunca auto-commit.
- **Guardrails custo/erro** — memory-first; fallback gracioso sem chave / erro de provedor (cai no pick manual).
- **Dívida v1.3** — redeploy fixes G-07/G-08; walkthroughs hands-on MEI (12-06) + LGPD (12-07); VALIDATION.md de Nyquist (Phases 12 + 13).

**Decisões deste milestone:**
- Multi-provedor via pacotes `@ai-sdk` diretos (não AI Gateway) — habilita BYOK-por-provedor-pessoal (chave colada no app, não no dashboard Vercel).
- Modelos default sugeridos: Gemini 2.5 Flash-Lite / Claude Haiku / DeepSeek-chat (texto curto, barato) — research confirma IDs/preços atuais.
- Cripto da chave: default Supabase Vault (research valida vs pgcrypto/app-layer).

Candidato deferido: **PDF avançado** (parser por banco / OCR) — só se um banco real falhar no `getText`.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Autenticação via Supabase pessoal (login único no v1) — **v1.3** (login + sessão persistente + isolamento RLS provados ao vivo em produção)
- ✓ Cadastro de receitas misto: recorrentes fixos (salário, pensão) + lançamentos avulsos — **v1.3** (live)
- ✓ Upload de faturas multi-formato (OFX/CSV **e PDF**) com extração das transações — **v1.3** (PDF Santander pela mesma UI → review grid → sem auto-commit)
- ✓ Categorias de gasto padrão-BR editáveis (adicionar / remover / renomear) — **v1.3** (live)
- ✓ Metas por categoria em % da receita, mensal **e** acumulado anual, com dashboard de aderência — **v1.3** (live)
- ✓ Reservas de oportunidade (sinking funds) com alvo opcional + entradas/saídas + histórico por reserva — **v1.3** (live)
- ✓ Aba MEI: NFs de serviço emitidas + limite anual R$ 81k + relatório DASN-SIMEI — **v1.0** (provado local; prod walkthrough 12-06 pendente de verificação hands-on)
- ✓ Modelo de dados escopado por `user_id` (multi-user-ready, sem migração para a esposa) — **v1.3** (RLS isola dados em produção)
- ✓ Classificação por **memória de padrões** (merchant→categoria aprendido na confirmação; auto-classifica nas próximas faturas) — **v1.3** (core value provado ao vivo)
- ✓ **(v1.2)** Aba Carro: multi-car, etiquetagem não-destrutiva de gastos ao carro, abastecimento híbrido (XOR fatura/manual) + odômetro, consumo km/l tanque-cheio + R$/km com gráfico — **v1.2** (CAR-01..06 6/6; em produção desde v1.3)

### Active

<!-- Hipóteses até serem entregues e validadas. Detalhamento na REQUIREMENTS.md do próximo milestone. -->

- [ ] **Classificação assistida por IA** (v1.4 — CLS-AI): para estabelecimento novo a IA sugere categoria, eu confirmo, vira padrão salvo na memória e auto-classifica nas próximas faturas. Wire no seam `suggestCategory()` + `validateSuggestion` enum wrapper + `SuggestionSlot` já prontos (additivo). Memory-first, IA só no cache-miss, confirmação antes de virar padrão.
- [ ] **BYOK multi-provedor** (v1.4): Settings UI escolhe provedor (Gemini/Claude/DeepSeek) + cola a própria chave; chave criptografada at-rest (Supabase Vault) escopada `user_id` + RLS; testar conexão. Pacotes `@ai-sdk` diretos.
- [ ] **Dívida v1.3** (v1.4): redeploy G-07/G-08, walkthroughs MEI (12-06) + LGPD (12-07) ao vivo, VALIDATION.md de Nyquist (Phases 12 + 13).

### Out of Scope

<!-- Limites explícitos com motivo, para evitar re-adicionar. -->

- SaaS público / multi-tenant — é uso pessoal, não será exposto publicamente
- App mobile nativo — web app responsivo cobre o uso; nativo adiciona complexidade sem ganho no v1
- Integração bancária automática (Open Finance / scraping de banco) — ingestão é por upload manual de faturas no v1
- Conta compartilhada / família no v1 — só o modelo de dados fica pronto; a UI compartilhada vem depois
- Funções fiscais além do MEI/DASN-SIMEI — escopo fiscal limitado ao MEI

## Context

- **Projeto pessoal**, dev solo. Reaproveita infraestrutura já usada em outro projeto (GIO): mesma stack e conjunto de subagentes (`./agents/`).
- Backend é o **Supabase pessoal** do usuário: auth + Postgres + Storage (para os PDFs/arquivos de fatura).
- Dados são financeiros e sensíveis → privacidade e isolamento por usuário são requisitos de base (RLS no Supabase).
- A classificação tem duas camadas: (1) **memória de padrões** — match do descritor do estabelecimento → categoria já aprendida; (2) **IA** apenas para estabelecimento nunca visto, sempre com confirmação humana antes de virar padrão.
- MEI no Brasil: limite de faturamento R$ 81.000/ano e declaração anual DASN-SIMEI — a aba deve facilitar essa prestação de contas.
- **Versionamento**: repositório vai para o GitHub da conta `DamascenoDev` (gh CLI já autenticado). Repo remoto ainda não criado; push quando houver código.
- **Estado de build (2026-06-18):** 11 fases construídas/verificadas no stack local (Next.js 16 + TS estrito + Supabase local, migrations 0001-0028). Suíte ~735 testes, `tsc --noEmit` + `npm run build` limpos, auditoria de segredos exit 0. Ainda **sem deploy remoto** — sem push git, sem tag.

## Constraints

- **Tech stack**: Next.js (App Router) + **TypeScript estrito, sem JavaScript** — Supabase (auth + Postgres + Storage) — deploy na Vercel
- **Privacidade**: dados financeiros pessoais — escopo por `user_id` + RLS no Supabase, sem exposição pública
- **IA**: provedor de IA para classificação a definir na pesquisa (custo/qualidade para texto curto), com confirmação humana no loop
- **Time**: dev solo, projeto pessoal — preferir caminho simples e de baixo custo operacional

## Key Decisions

<!-- Decisões que restringem trabalho futuro. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js + TypeScript estrito (sem JS) + Supabase + Vercel | Web app casa com Supabase pessoal; TS estrito por preferência; reaproveita stack do GIO | ✓ Good — deployado e rodando em produção (Vercel gru1 + Supabase sa-east-1) no v1.3 |
| Classificação = memória de padrões + IA só para novos, com confirmação | Barateia (IA só no caso novo) e garante precisão via confirmação humana antes de memorizar | ✓ Good — camada **memória** provada ao vivo (core value v1.3); IA deferida p/ v1.4 (seam pronto) |
| Provedor de IA a definir na pesquisa | Comparar custo/qualidade para classificação de texto curto antes de fixar | — Pending — IA não construída no v1; decisão fica para v1.4 (CLS-AI) |
| Modelo de dados escopado por `user_id` desde o v1 | Esposa entra no futuro sem migração dolorosa | ✓ Good — RLS isola dados cross-user, verificado ao vivo em produção (v1.3) |
| Metas avaliadas mensal **e** anual | Usuário quer visão de curto e longo prazo da aderência | ✓ Good — dashboard de aderência mensal+anual provado ao vivo (v1.3) |
| Reservas com alvo opcional + entradas/saídas | Flexível: nem toda reserva tem meta; saída permite usar o dinheiro guardado | ✓ Good — provado ao vivo (v1.3) |
| MEI completo no v1 (NF + limite R$81k + relatório DASN) | Facilitar a declaração anual é objetivo explícito | ✓ Good — construído e provado local; prod walkthrough hands-on (12-06) pendente |
| PDF de fatura adiado para v1.x; OFX/CSV no v1 | PDF BR varia muito por banco e é frágil; OFX/CSV são determinísticos. PDF entra com spike sobre amostras reais | ✓ Good — PDF Santander entregue no v1.3 (spike `getText` → mesmo pipeline, review humano, sem auto-commit) |
| Aporte em reserva conta na meta de Investimentos (alocação), não como gasto de consumo | Usuário vê reserva como investimento; deve creditar a meta de investimento, não inflar gasto | ✓ Good — implementado na view `security_invoker` (CTE alloc_total); provado ao vivo |
| Denominador das metas % = receita líquida recebida no mês | % sobre o que efetivamente caiu (recorrentes + avulsos) | ✓ Good — provado ao vivo (v1.3) |
| Metas têm direção: teto (consumo, não exceder) vs alvo (investimento/poupança, atingir) | "lazer 10%" é teto; "investimentos 20%" é alvo — aderência se mede diferente | ✓ Good — aderência por direção provada ao vivo (v1.3) |
| Dinheiro em centavos inteiros (bigint), nunca float | Erro de float em dinheiro é irreversível; padrão convergente da pesquisa | ✓ Good — implementado e provado por testes (local) |
| (v1.2) Etiqueta `carro_id` em transactions é lente não-destrutiva | Gasto etiquetado continua contando na categoria/metas; aba Carro só agrega, não muda contabilidade | ✓ Good — D4 provado byte-idêntico (Wave-0 integration test) |
| (v1.2) Abastecimento híbrido (vincula à fatura OU custo manual, XOR) | Combustível pago no cartão reaproveita o custo do lançamento (sem digitar/contar 2x); dinheiro/pix entra manual. Espelha reserva_ledger.transaction_id | ✓ Good — CHECK XOR no banco + validação no server; sem double-count (auditado) |
| (v1.2) Consumo pelo método tanque-cheio | Mais preciso que km/l por abastecimento isolado; requer flag tanque_cheio + odômetro | ✓ Good — edge same-odometer (WR-02) fechado no v1.3 via migration 0029 (DEBT-01) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-18 — milestone v1.4 "IA de Classificação (BYOK)" iniciado via `/gsd-new-milestone`. Foco: wire IA no seam `suggestCategory()` (memory-first, confirmação humana) + BYOK multi-provedor (Gemini/Claude/DeepSeek, Settings UI com chave criptografada) + quitar dívida v1.3. Fases continuam a partir de 14.*
