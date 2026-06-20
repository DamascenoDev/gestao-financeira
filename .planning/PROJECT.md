# Gestão Financeira Pessoal

## What This Is

Sistema web **pessoal e privado** de gestão financeira. Eu cadastro meus recebimentos, faço upload das minhas faturas e o sistema classifica os gastos automaticamente — aprendendo com cada confirmação — para mostrar o quanto estou aderente às minhas metas por categoria. Inclui reservas de oportunidade (poupança por objetivo) e uma aba para gestão do meu MEI. Single-user no v1, com modelo de dados já preparado para minha esposa entrar depois.

## Core Value

Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das minhas confirmações — junto com a aderência às minhas metas. Se tudo mais falhar, **classificação inteligente com memória + visão de metas** tem que funcionar.

## Current State

**v1.5 "Classificação determinística" — SHIPPED 2026-06-20.** A classificação no upload ganhou uma camada determinística, grátis e controlada pelo usuário, rodando antes da IA. Pipeline agora é **memória → palavra-chave → IA**: o usuário cadastra/remove palavras-chave por categoria em `/categorias` (tabela `category_keywords`, migration `0036`, RLS user-scoped; actions `addKeyword`/`removeKeyword` com Zod + owner gate + dedupe), e no upload um descritor que CONTÉM uma keyword cadastrada chega pré-classificado (`source = "palavra-chave"`, badge próprio na grid), **maior keyword vence**, sobrescrevível, sem auto-commit, aprendendo no confirm como hoje — reduzindo as chamadas de IA. A camada de IA ficou **kind-aware** (CLSAI-09): cada categoria vai ao prompt com seu `kind` (consumo/alocação) + regra dura anti-alocação + code gate, corrigindo "AliExpress/Mercado Livre → Investimentos". E a categoria default **"Marketplace"** (migration `0035`) foi aplicada em PROD, dando à IA e às regras um bucket de compras. Tag git: `v1.5`.

Suíte 857 testes verde, `tsc --noEmit` + `npm run build` limpos, 3/3 fases SECURED + nyquist-compliant. Auditoria do milestone: **`passed` — 8/8 requisitos**. MKT-01 (live human-verify) fechado ao vivo em PROD 2026-06-20 via `/gsd-verify-work 18`: `0035` na coluna Remote, "Marketplace" presente em `/categorias`, e um descritor de marketplace nunca visto recebeu sugestão de consumo (nunca Investimentos/Reserva) — 18-UAT.md 3/3 pass → 18-VERIFICATION.md `passed`. Ver `milestones/v1.5-MILESTONE-AUDIT.md`.

<details>
<summary>Milestones anteriores (v1.0–v1.4)</summary>

- **v1.4 IA de Classificação (BYOK)** (Phases 14-17) — IA wired no seam `suggestCategory()` com BYOK multi-provedor (Gemini/Claude): Vault `ai_settings` + RLS + RPCs (`0033`), Settings write-only, pipeline memory-first → 1 chamada batched/enum-gated → sugestão não-vinculante na grid (procedência + confiança) → aprende só no confirm. Live-smokes real-key/PROD fechados ao vivo (quick-task `260619-d68`). Dívida v1.3 quitada na Phase 17 (delete destrutivo DATA-02 ao vivo). SHIPPED 2026-06-19 (`milestones/v1.4-*`).

- **v1.0 MVP** (Phases 1-6) — core ledger + upload OFX/CSV/IA-seam + metas/reservas + MEI/DASN + endurecimento. Code-complete no stack local; deploy/live-verify executado na Phase 12 (v1.3).
- **v1.1 Identidade visual** (Phase 7) — re-skin navy+gold, dark mode, charts, mobile nav. SHIPPED 2026-06-17.
- **v1.2 Carro** (Phases 8-11) — cadastro multi-car, etiquetagem não-destrutiva, abastecimento híbrido + odômetro, consumo km/l + R$/km com gráfico. 6/6 CAR. SHIPPED 2026-06-18 (`milestones/v1.2-*`).
- **v1.3 Produção & PDF** (Phases 12-13) — app no ar (Supabase `sa-east-1` + Vercel `gru1`), core value memory-only provado ao vivo, PDF de fatura (Santander) pelo mesmo pipeline. SHIPPED 2026-06-18 (`milestones/v1.3-*`).

</details>

## Current Milestone: v1.6 Classificação fluida & ingestão robusta

**Goal:** Reduzir o atrito da classificação (auto-sugestão de palavras-chave, match wildcard, aplicar sugestões em lote) e endurecer a ingestão (PDF funcionando em PROD, re-import liberado quando não confirmado).

**Target features:**

_Classificação fluida_
- Auto-sugestão de palavra-chave **inline** ao confirmar merchant→categoria + **painel batch** em `/categorias` analisando padrões confirmados (era KW-F1; v1.5 era só cadastro manual)
- Match **wildcard glob (`*`)** em palavra-chave, opt-in além de substring, mantendo "maior keyword vence" (era KW-F2; regex puro fica fora por risco de ReDoS)
- Persistir `palavra-chave` em `transactions.classification_source` (widen do CHECK da migration `0020`, hoje grava o coarse `memória`)
- Aplicar sugestões **em lote** no review grid **por limiar de confiança** (finding v1.4: "aplicar todas as sugestões")

_Ingestão robusta_
- PDF worker disponível em **PROD** (finding v1.4: upload de PDF quebra em produção por worker faltando) + robustez genérica do parser — **sem OCR**, per-bank só quando aparecer banco real falhando
- **Re-import liberado** quando a importação anterior do mesmo arquivo NÃO foi confirmada (finding v1.4: `content_hash` bloqueia re-upload de rows que nunca viraram transactions)

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
- ✓ **Classificação assistida por IA** (CLSAI-01..08) — memory-first + uma chamada IA batched/enum-gated no cache-miss + `row.suggestion` na grid (procedência + confiança + ordenação) + aprende só no confirm (sem auto-commit) — **v1.4** (código completo + 100% wired; smoke real-key ao vivo diferido)
- ✓ **BYOK multi-provedor** (BYOK-01..05) — Settings UI write-only, chave criptografada at-rest (Supabase Vault) escopada `user_id` + RLS, decrypt server-only, testar/remover — **v1.4** (LOCAL-provado; PROD push do `0033` diferido)
- ✓ **Dívida v1.3 quitada** (DEBT-03..06) — G-07/G-08 live, walkthroughs MEI/LGPD, VALIDATION.md 12/13, delete destrutivo DATA-02 executado ao vivo — **v1.4** (Phase 17)
- ✓ **Regras de palavra-chave determinísticas** (KW-01..06) — cadastro manual por categoria em `/categorias` (RLS user-scoped); no upload o pipeline roda **memória → palavra-chave → IA**, auto-classificando o match (maior keyword vence, sobrescrevível, aprende no confirm, sem auto-commit) — **v1.5**
- ✓ **Prompt da IA kind-aware** (CLSAI-09) — cada categoria enviada com seu `kind` + regra dura anti-alocação + code gate; corrige "AliExpress/Mercado Livre → Investimentos/Reserva" — **v1.5**
- ✓ **Categoria default "Marketplace"** (MKT-01) — migration `0035` aplicada em PROD; bucket de compras para IA + regras — **v1.5** (live human-verify fechado 2026-06-20: "Marketplace" em /categorias + descritor de marketplace → sugestão de consumo)

### Active

<!-- Hipóteses até serem entregues e validadas. Detalhamento na REQUIREMENTS.md do próximo milestone. -->

- **v1.6 Classificação fluida & ingestão robusta** — auto-sugestão de palavra-chave (inline + batch), match wildcard glob, persistir `palavra-chave` no source, aplicar sugestões em lote por confiança, PDF worker em PROD + robustez do parser, re-import liberado quando não confirmado. Detalhamento na `REQUIREMENTS.md`.

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
| (v1.5) Classificação ganha camada determinística de palavra-chave antes da IA | IA fraca (flash-lite) erra; regra cadastrada pelo usuário é grátis, instantânea, previsível e reduz chamadas de IA | ✓ Good — pipeline memória→palavra-chave→IA wired no upload; suíte 857 verde |
| (v1.5) Match por substring no `descriptor_norm`, maior keyword vence | Substring cobre o caso de uso sem regex; "maior keyword" desambígua conflito de categorias pelo match mais específico | ✓ Good — KW-04 provado por testes |
| (v1.5) `palavra-chave` é procedência review-time only (não persistida em `transactions`) | CHECK da migration `0020` não inclui o valor; widening = migration futura, fora do escopo determinístico do v1.5 | ⚠️ Revisit — tech-debt documentada; persistir o enum em milestone futuro |
| (v1.5) Prompt da IA kind-aware (envia `kind` + regra anti-alocação) | Sem o kind, o modelo mandava compra de marketplace para Investimentos/Reserva | ✓ Good — CLSAI-09 verificado (code gate + fixtures) |

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
*Last updated: 2026-06-20 — Milestone v1.6 "Classificação fluida & ingestão robusta" iniciado via `/gsd-new-milestone`. Escopo: auto-sugestão de palavra-chave (inline + batch), match wildcard glob, persistir `palavra-chave` no `classification_source`, aplicar sugestões em lote por confiança, PDF worker em PROD + robustez do parser (sem OCR), re-import liberado quando não confirmado. Requirements/roadmap a seguir. Anterior: v1.5 SHIPPED + arquivado (`milestones/v1.5-*`), tag git `v1.5`, 8/8 requisitos.*
