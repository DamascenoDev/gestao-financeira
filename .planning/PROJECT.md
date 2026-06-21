# Gestão Financeira Pessoal

## What This Is

Sistema web **pessoal e privado** de gestão financeira. Eu cadastro meus recebimentos, faço upload das minhas faturas e o sistema classifica os gastos automaticamente — aprendendo com cada confirmação — para mostrar o quanto estou aderente às minhas metas por categoria. Inclui reservas de oportunidade (poupança por objetivo) e uma aba para gestão do meu MEI. Single-user no v1, com modelo de dados já preparado para minha esposa entrar depois.

## Core Value

Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das minhas confirmações — junto com a aderência às minhas metas. Se tudo mais falhar, **classificação inteligente com memória + visão de metas** tem que funcionar.

## Current State

**v1.6 "Classificação fluida & ingestão robusta" — SHIPPED 2026-06-21 (code-side).** O atrito da classificação caiu e a ingestão endureceu. A palavra-chave ganhou **wildcard glob** (`UBER*`, `*IFOOD*`, ReDoS-safe, maior keyword vence preservado) e a procedência `palavra-chave` agora **persiste** em `transactions.classification_source` (migration `0037`). O usuário deixa de cadastrar keyword só no braço: opção **inline** "+ palavra-chave" por linha na grid de revisão + um **painel batch** em `/categorias` que minera `merchant_patterns` confirmados e sugere candidatas para aprovar/descartar em lote (sem auto-cadastro). O "aplicar todas as sugestões" virou **aplicar por confiança** — só as de IA com `confidence >= 0.6`, deixando as fracas para revisão manual. E a ingestão de PDF parou de quebrar: worker do `pdfjs` forçado no bundle serverless da Vercel (`outputFileTracingIncludes`), parser que degrada limpo em PDF ruim (sem OCR), e migration `0038` libera o re-import de arquivo não-confirmado (`statements.status` aceita `'imported'`). Tag git: `v1.6`.

Suíte **917/917** verde, `tsc --noEmit` + `npm run build` limpos, code review por fase (review→fix→re-review limpo). Auditoria do milestone: **`tech_debt`** — 8/8 requisitos code-side satisfeitos, integração cross-phase WIRED 8/8, 0 blockers. **Deferred (autonomous:false, credential/deploy-gated):** `supabase db push` de `0037`+`0038` ao PROD + live-verify de PDF em PROD (SC1) e dos UATs de P22/P24 — code-complete + localmente provado (`0038` replay `UPDATE 1`, antes 23514). Ver `milestones/v1.6-MILESTONE-AUDIT.md` + STATE.md "Deferred Items".

<details>
<summary>Milestones anteriores (v1.0–v1.5)</summary>

- **v1.5 Classificação determinística** (Phases 18-20) — pipeline **memória → palavra-chave → IA** no upload (cadastro de keyword por categoria em `/categorias`, `category_keywords`/`0036`, maior keyword vence, sem auto-commit), prompt da IA **kind-aware** (CLSAI-09, corrige marketplace→Investimentos), categoria default **"Marketplace"** (`0035`) em PROD. SHIPPED 2026-06-20, 8/8 requisitos (`milestones/v1.5-*`).

- **v1.4 IA de Classificação (BYOK)** (Phases 14-17) — IA wired no seam `suggestCategory()` com BYOK multi-provedor (Gemini/Claude): Vault `ai_settings` + RLS + RPCs (`0033`), Settings write-only, pipeline memory-first → 1 chamada batched/enum-gated → sugestão não-vinculante na grid (procedência + confiança) → aprende só no confirm. Live-smokes real-key/PROD fechados ao vivo (quick-task `260619-d68`). Dívida v1.3 quitada na Phase 17 (delete destrutivo DATA-02 ao vivo). SHIPPED 2026-06-19 (`milestones/v1.4-*`).

- **v1.0 MVP** (Phases 1-6) — core ledger + upload OFX/CSV/IA-seam + metas/reservas + MEI/DASN + endurecimento. Code-complete no stack local; deploy/live-verify executado na Phase 12 (v1.3).
- **v1.1 Identidade visual** (Phase 7) — re-skin navy+gold, dark mode, charts, mobile nav. SHIPPED 2026-06-17.
- **v1.2 Carro** (Phases 8-11) — cadastro multi-car, etiquetagem não-destrutiva, abastecimento híbrido + odômetro, consumo km/l + R$/km com gráfico. 6/6 CAR. SHIPPED 2026-06-18 (`milestones/v1.2-*`).
- **v1.3 Produção & PDF** (Phases 12-13) — app no ar (Supabase `sa-east-1` + Vercel `gru1`), core value memory-only provado ao vivo, PDF de fatura (Santander) pelo mesmo pipeline. SHIPPED 2026-06-18 (`milestones/v1.3-*`).

</details>

## Current Milestone: none — v1.6 shipped 2026-06-21

v1.6 fechado (code-side, audit `tech_debt`, 8/8 requisitos). Nenhum milestone ativo. Próximo via `/gsd-new-milestone`. **Pendência de deploy antes de declarar o app 100% atualizado em PROD:** `supabase db push` de `0037`+`0038` + deploy na Vercel + live-verify dos UATs de P22/P24 (ver STATE.md "Deferred Items").

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
- ✓ **Classificação fluida** (KW-07/KW-08/KW-09/KW-10 + CLSAI-10) — wildcard glob (`*`) na palavra-chave (ReDoS-safe, maior keyword vence) + procedência `palavra-chave` persistida em `transactions.classification_source` (`0037`); sugestão de keyword **inline** na grid + **batch** em `/categorias` minerando `merchant_patterns` confirmados; **aplicar sugestões em lote por confiança** (`>= 0.6`, fracas ficam para revisão manual). Sem auto-cadastro/auto-commit — **v1.6**
- ✓ **Ingestão robusta** (PDF-06/PDF-07/IMP-07) — worker do `pdfjs` forçado no bundle serverless da Vercel; parser degrada limpo em PDF ruim (sem OCR); re-import liberado quando a importação anterior não foi confirmada (`0038` libera `status='imported'`) — **v1.6** (code-side + localmente provado; PROD push de `0037`+`0038` + live-verify diferidos)

### Active

<!-- Hipóteses até serem entregues e validadas. Detalhamento na REQUIREMENTS.md do próximo milestone. -->

- _Nenhum milestone ativo._ v1.6 fechado 2026-06-21 (code-side). Próximo milestone via `/gsd-new-milestone` (gera uma `REQUIREMENTS.md` fresca). Antes de declarar PROD 100% atualizado: `supabase db push` de `0037`+`0038` + deploy na Vercel + UATs de P22/P24 (ver STATE.md "Deferred Items").

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
| (v1.5) `palavra-chave` é procedência review-time only (não persistida em `transactions`) | CHECK da migration `0020` não inclui o valor; widening = migration futura, fora do escopo determinístico do v1.5 | ✓ Resolved — v1.6 KW-10: migration `0037` faz o widening do CHECK; `deriveSource` re-deriva server-side e persiste `palavra-chave` (guarda de igualdade de categoria) |
| (v1.5) Prompt da IA kind-aware (envia `kind` + regra anti-alocação) | Sem o kind, o modelo mandava compra de marketplace para Investimentos/Reserva | ✓ Good — CLSAI-09 verificado (code gate + fixtures) |
| (v1.6) Wildcard glob opt-in na palavra-chave (não regex puro) | Glob (`*`) cobre prefixo/contém sem o risco de ReDoS de regex livre; especificidade por contagem de literais mantém "maior keyword vence" | ✓ Good — KW-09 ReDoS-safe, provado por testes |
| (v1.6) Sugestão de keyword é sempre opt-in (inline + batch), nunca auto-cadastro | Cadastro automático poluiria as regras; o usuário aprova a partir de sinais já confirmados (`merchant_patterns`) | ✓ Good — KW-07/KW-08; descarte batch é session-only (sem nova tabela) |
| (v1.6) Aplicar-em-lote por confiança reusa o `LOW_CONFIDENCE` 0.6 existente | As linhas deixadas pendentes são exatamente o conjunto amber "baixa confiança"; limiar único, sem nova constante nem slider na UI | ✓ Good — CLSAI-10; só IA é "pendente" (memória/keyword já são bindings aplicados) |
| (v1.6) PDF worker via `outputFileTracingIncludes` (não rebuild do bundling) | O `@vercel/nft` não vê o import dinâmico do `pdf.worker.mjs`; forçar o asset no trace é o fix mínimo e idiomático | ✓ Good — PDF-06 (code, `fb91b58`); live-verify em PROD diferido |
| (v1.6) Re-import destravado por widening do CHECK de `status` (não refactor do fluxo) | A fast-path "já confirmado → bloqueia" já existia mas estava morta (confirmImport gravava `'imported'`, rejeitado por 23514 e engolido); a migration `0038` é a correção cirúrgica | ✓ Good — IMP-07; `0038` replay-provado local (`UPDATE 1`); PROD push diferido |

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
*Last updated: 2026-06-21 — Milestone v1.6 "Classificação fluida & ingestão robusta" SHIPPED (code-side) + arquivado (`milestones/v1.6-*`), tag git `v1.6`. 8/8 requisitos code-side (KW-07..10 · CLSAI-10 · PDF-06/07 · IMP-07); auditoria `tech_debt` (0 blockers, integração WIRED, 917/917). Diferido (autonomous:false): `supabase db push` de `0037`+`0038` + deploy Vercel + live-verify dos UATs de P22/P24 — ver STATE.md "Deferred Items". Resolveu a tech-debt v1.5 (procedência `palavra-chave` agora persistida). Próximo milestone via `/gsd-new-milestone`.*
