# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

> Full per-phase detail for shipped milestones lives in `.planning/milestones/v{X.Y}-ROADMAP.md`. This file is the lean milestone-grouped index. All milestones through v1.6 are shipped (v1.6 collapsed below; deferred deploy items in STATE.md). Continuous phase numbering (never restart at 01). Next milestone via `/gsd-new-milestone`.

## Milestones

- 🟡 **v1.0 MVP** — Phases 1–6 (core ledger + upload/IA-seam + MEI + hardening) — code-complete local; deployed + live-verified via Phase 12 (v1.3)
- ✅ **v1.1 Identidade visual** — Phase 7 (re-skin navy+gold + dark mode + charts + mobile) — shipped 2026-06-17
- ✅ **v1.2 Carro** — Phases 8–11 (módulo de veículo) — shipped 2026-06-18 (`milestones/v1.2-*`)
- ✅ **v1.3 Produção & PDF** — Phases 12–13 (app no ar + core value live memory-only + PDF de fatura) — shipped 2026-06-18 (`milestones/v1.3-*`)
- ✅ **v1.4 IA de Classificação (BYOK)** — Phases 14–17 (wire IA no seam `suggestCategory()` + BYOK Settings + dívida v1.3) — shipped 2026-06-19 (`milestones/v1.4-*`)
- ✅ **v1.5 Classificação determinística** — Phases 18–20 (pipeline memória→palavra-chave→IA + prompt da IA kind-aware + Marketplace em PROD) — shipped 2026-06-20 (`milestones/v1.5-*`; 8/8 requisitos — MKT-01 live human-verify fechado 2026-06-20)
- ✅ **v1.6 Classificação fluida & ingestão robusta** — Phases 21–24 (match wildcard + procedência persistida → sugestão de palavra-chave inline+batch → aplicar sugestões em lote por confiança → PDF em PROD + parser robusto + re-import liberado) — shipped 2026-06-21 (`milestones/v1.6-*`; 8/8 requisitos code-side, audit `tech_debt` — PROD push de 0037+0038 + UATs de P22/P24 diferidos)
- 🟢 **v1.7 Abastecimento de ponta-a-ponta + UX da grid** — Phases 25–28 (fix de scroll na criação de palavra-chave → substrato do abastecimento ponta-a-ponta: relaxa o XOR de custo + parcelas + attach-later + categoria "Combustível" → registro rápido na lista /carros + parcelado → vínculo reverso por valor na importação + consumo sem double-count) — ACTIVE (`REQUIREMENTS.md`; 8/8 requisitos mapeados — UX-01 → P25 · FUEL-01 → P26 · CAR-07/08 → P27 · CAR-09/10/11/12 → P28)

## Phases

<details>
<summary>🟡 v1.0 MVP (Phases 1–6) — code-complete local, deployed + live-verified via Phase 12 (v1.3)</summary>

- [~] Phase 1: Fundação (auth, RLS, dinheiro, schema) — 3/4 plans (01-04 executado na Phase 12)
- [~] Phase 2: Receitas, categorias e lançamentos manuais — 3/5 plans (02-05 executado na Phase 12)
- [~] Phase 3: Metas, aderência e reservas — 5/6 plans (03-06 executado na Phase 12)
- [~] Phase 4: Upload + classificação inteligente — 3/4 plans (04-04 executado na Phase 12)
- [~] Phase 5: Módulo MEI / DASN-SIMEI — 3/4 plans (05-04 executado na Phase 12)
- [~] Phase 6: Endurecimento (LGPD, isolamento, auditoria) — 1/5 plans (06-05 executado na Phase 12)

Os 6 walkthroughs `autonomous:false` diferidos (deploy/live-verify) foram executados pela Phase 12 do v1.3. Detalhe pré-v1.3 em `milestones/v1.2-ROADMAP.md`.

</details>

<details>
<summary>✅ v1.1 Identidade visual (Phase 7) — SHIPPED 2026-06-17</summary>

- [x] Phase 7: Identidade visual e polimento — 7/7 plans — completed 2026-06-17

</details>

<details>
<summary>✅ v1.2 Carro (Phases 8–11) — SHIPPED 2026-06-18</summary>

- [x] Phase 8: Substrato Carro + CRUD + navegação — 3/3 plans — completed 2026-06-17
- [x] Phase 9: Etiquetar gastos da fatura ao carro — 3/3 plans — completed 2026-06-17
- [x] Phase 10: Abastecimento híbrido + consumo — 3/3 plans — completed 2026-06-17
- [x] Phase 11: Detalhe do carro + gráfico de consumo — 4/4 plans — completed 2026-06-17

Full detail: `milestones/v1.2-ROADMAP.md`.

</details>

<details>
<summary>✅ v1.3 Produção & PDF (Phases 12–13) — SHIPPED 2026-06-18</summary>

- [x] Phase 12: Produção & Live-Verify — 11/11 plans — completed 2026-06-18 (DEPLOY-01..05 + DEBT-01/02; app no ar + core value provado ao vivo)
- [x] Phase 13: PDF de Fatura — 4/4 plans — completed 2026-06-18 (PDF-01..05; Santander PDF pelo mesmo pipeline, review humano)

Full detail: `milestones/v1.3-ROADMAP.md`. Audit: `milestones/v1.3-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>✅ v1.4 IA de Classificação (BYOK) (Phases 14–17) — SHIPPED 2026-06-19</summary>

- [x] Phase 14: Key Storage + BYOK Settings — 5/5 plans — completed 2026-06-19
- [x] Phase 15: Classification Wire — 2/2 plans — completed 2026-06-19
- [x] Phase 16: Review-Grid Suggestion Affordances — 1/1 plan — completed 2026-06-18
- [x] Phase 17: v1.3 Debt Cleanup (ISOLATED) — 4/4 plans — completed 2026-06-19 (DATA-02 delete destrutivo executado ao vivo)

Full detail: `milestones/v1.4-ROADMAP.md`. Audit: `milestones/v1.4-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>✅ v1.5 Classificação determinística (Phases 18–20) — SHIPPED 2026-06-20</summary>

- [x] Phase 18: AI classifica compras corretamente — 2/2 plans — completed 2026-06-20 (CLSAI-09 kind-aware prompt + anti-allocation gate; `0035` Marketplace em PROD; **MKT-01 live human-verify fechado 2026-06-20** — 18-UAT.md 3/3 pass)
- [x] Phase 19: Cadastro de palavras-chave por categoria — 2/2 plans — completed 2026-06-19 (KW-01/KW-06; `category_keywords` migration `0036` RLS-scoped + actions + `CategoryKeywordsDialog`)
- [x] Phase 20: Auto-classificação por palavra-chave no upload — 2/2 plans — completed 2026-06-19 (KW-02/03/04/05; pipeline memória→palavra-chave→IA, maior-keyword-vence, sobrescrevível, aprende no confirm)

Full detail: `milestones/v1.5-ROADMAP.md`. Audit: `milestones/v1.5-MILESTONE-AUDIT.md` (`passed` — 8/8 requisitos; MKT-01 live human-verify fechado 2026-06-20).

</details>

<details>
<summary>✅ v1.6 Classificação fluida & ingestão robusta (Phases 21–24) — SHIPPED 2026-06-21 (full detail: <code>milestones/v1.6-ROADMAP.md</code>)</summary>

**Milestone goal:** Reduzir o atrito da classificação (auto-sugestão de palavras-chave inline + em lote, match wildcard glob, aplicar sugestões em lote por confiança) e endurecer a ingestão (PDF funcionando em PROD, parser que degrada com clareza, re-import liberado quando não confirmado). Brownfield: o pipeline **memória → palavra-chave → IA** já roda em PROD; este milestone o refina e fecha findings do v1.4.

- [x] **Phase 21: Match wildcard + procedência persistida** - Wildcard glob (`*`) na palavra-chave (maior keyword vence preservado) + widening do CHECK de `0020` para gravar `palavra-chave` em `transactions.classification_source` (completed 2026-06-20)
- [x] **Phase 22: Sugestão de palavra-chave (inline + batch)** - Opt-in inline ao confirmar merchant→categoria + painel batch em `/categorias` que analisa `merchant_patterns` e sugere keywords candidatas (completed 2026-06-20)
- [x] **Phase 23: Aplicar sugestões em lote por confiança** - No review grid, aplicar de uma vez todas as sugestões (memória/palavra-chave/IA) acima de um limiar de confiança, deixando as fracas para revisão manual (sem auto-commit) (completed 2026-06-21)
- [x] **Phase 24: Ingestão robusta (PDF em PROD + re-import)** - Worker do `pdfjs` disponível no bundle serverless da Vercel + parser que degrada com clareza (sem OCR) + re-upload liberado quando a importação anterior não foi confirmada — **1 plan** (completed 2026-06-21)

## Phase Details (v1.6)

### Phase 21: Match wildcard + procedência persistida

**Goal**: O matcher determinístico de palavra-chave ganha poder e honestidade: além do substring atual, o usuário pode escrever wildcard glob (`UBER*`, `*IFOOD*`) numa keyword, e quando uma linha é classificada por keyword o sistema finalmente grava a procedência real `palavra-chave` na transação (hoje grava o coarse `memória`).
**Depends on**: Nothing (extends o matcher já shipado no v1.5 — `matchKeyword` + pipeline em `src/actions/import.ts`; widening da migration `0020`)
**Requirements**: KW-09, KW-10
**Success Criteria** (what must be TRUE):

  1. O usuário cria uma palavra-chave com wildcard glob (ex.: `UBER*`) e, no upload, um descritor que casa o padrão (`UBER TRIP 123`) chega pré-classificado naquela categoria — além do match por substring, que continua funcionando.
  2. Quando um descritor casa keywords de mais de uma categoria (incluindo wildcards), a palavra-chave mais específica vence — "maior keyword vence" preservado, sem regressão do comportamento do v1.5.
  3. Uma linha classificada por palavra-chave, ao ser confirmada, persiste `classification_source = 'palavra-chave'` em `transactions` (CHECK da migration `0020` ampliado via nova migration) — deixa de gravar o coarse `memória`.
  4. O wildcard é opt-in (regex puro fica fora) e seguro: um padrão sem `*` continua sendo tratado como substring; não há risco de ReDoS.

**Plans**: 4/4 plans complete
**Wave 1**

- [x] 21-01-PLAN.md — Gate: normalizeKeyword preserva `*` no cadastro + addKeyword rejeita literal-count-0 (KW-09)
- [x] 21-02-PLAN.md — matchKeyword glob ancorado ReDoS-safe + especificidade por literal-count (KW-09, puro/TDD)
- [x] 21-03-PLAN.md — migration 0037: amplia o CHECK de transactions.classification_source para 'palavra-chave' + db push (KW-10)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 21-04-PLAN.md — wiring import.ts: compileRule no pre-fetch + re-derivação server-side da procedência no commit (KW-09 + KW-10)

### Phase 22: Sugestão de palavra-chave (inline + batch)

**Goal**: O usuário deixa de cadastrar palavras-chave só no braço: ao confirmar um padrão merchant→categoria na grid, recebe a opção inline de virar aquele descritor numa keyword; e em `/categorias` há um painel que varre os padrões já confirmados (`merchant_patterns`) e sugere keywords candidatas para aprovar ou descartar em lote.
**Depends on**: Phase 21 (o matcher com wildcard + a procedência persistida são a base sobre a qual as keywords sugeridas operam; mantém um único modelo de keyword)
**Requirements**: KW-07, KW-08
**Success Criteria** (what must be TRUE):

  1. Ao confirmar um padrão merchant→categoria no review grid, o usuário vê uma opção inline (opt-in, nunca automática) de criar uma palavra-chave para aquele descritor; aceitando, a keyword aparece cadastrada naquela categoria.
  2. Em `/categorias`, um painel analisa os padrões já confirmados (`merchant_patterns`) e lista palavras-chave candidatas com a categoria sugerida.
  3. No painel, o usuário aprova ou descarta as candidatas em lote; as aprovadas viram keywords cadastradas (escopadas por `user_id` + RLS), as descartadas somem da lista sem efeito colateral.
  4. Nenhuma keyword é criada sem ação explícita do usuário (sem auto-cadastro) — inline e batch são ambos opt-in.

**Plans**: 3/3 plans complete

Plans:
**Wave 1**

- [x] 22-01-PLAN.md — KW-07 inline "+ palavra-chave" control in the import review grid (gated origin === 'manual', reuses addKeyword) [Wave 1]
- [x] 22-02-PLAN.md — KW-08 server side: getKeywordSuggestions + approveKeywordSuggestions + batch-item schema + action tests [Wave 1]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 22-03-PLAN.md — KW-08 client: global suggestions dialog + /categorias launcher (RSC preserved) + dialog tests [Wave 2, depends on 22-02]

**UI hint**: yes

### Phase 23: Aplicar sugestões em lote por confiança

**Goal**: O usuário acelera a revisão de um upload aplicando de uma só vez todas as sugestões pendentes (de memória, palavra-chave ou IA) cuja confiança esteja acima de um limiar — deixando só as fracas para olhar uma a uma — sem que nada seja commitado automaticamente.
**Depends on**: Phase 21 (a procedência persistida `palavra-chave` e o source unificado tornam a confiança por origem consistente na grid)
**Requirements**: CLSAI-10
**Success Criteria** (what must be TRUE):

  1. No review grid de um upload, existe uma ação explícita do usuário que aplica de uma vez todas as sugestões pendentes (memória / palavra-chave / IA) com confiança acima de um limiar.
  2. As sugestões abaixo do limiar permanecem pendentes e sem categoria aplicada, deixadas para revisão manual linha a linha.
  3. Aplicar em lote NÃO commita nada no upload: as categorias só são preenchidas na grid (sobrescrevíveis); a persistência e o aprendizado merchant→categoria continuam acontecendo apenas no confirm humano.

**Plans**: 1/1 plans complete

- [x] 23-01-PLAN.md — Gate bulk-apply on confidence (`>= 0.6`): only confident IA suggestions applied, low-confidence left pending; relabel button + toast to LOCKED "confiáveis" copy; confirmImport untouched. Single-file edit (`import-review-table.tsx` + test).

**UI hint**: yes

### Phase 24: Ingestão robusta (PDF em PROD + re-import)

**Goal**: A ingestão de faturas para de quebrar em produção e de bloquear re-uploads legítimos: o worker do `pdfjs` passa a existir no bundle serverless da Vercel (upload de PDF funciona em PROD), o parser degrada de forma clara em entradas ruins (sem OCR), e o mesmo arquivo pode ser re-importado quando a importação anterior nunca foi confirmada.
**Depends on**: Nothing (operacional/independente das fases de classificação; pode rodar em paralelo — corrige findings do v1.4 nas rotas de ingest/PDF)
**Requirements**: PDF-06, PDF-07, IMP-07
**Success Criteria** (what must be TRUE):

  1. Em PROD (Vercel), o upload de uma fatura PDF é parseado com sucesso — o worker do `pdfjs` está disponível no bundle serverless, sem o erro de "worker faltando" que quebrava em produção.
  2. Diante de um PDF ruim (image-only / 0 linhas extraíveis), o parser degrada de forma clara e previsível — sem travar e sem produzir linhas silenciosamente erradas — orientando o usuário (sem OCR no escopo).
  3. O re-upload do mesmo arquivo é permitido quando a importação anterior NÃO foi confirmada (rows que nunca viraram `transactions`); o `content_hash` continua bloqueando apenas o que já foi confirmado.

**Plans**: 1/1 plans complete

Plans:

- [x] 24-01-PLAN.md — Migration 0038 widens `statements.status` CHECK → `'imported'` (IMP-07, unlocks the re-import fast-path); strengthen the generic PDF degradation test (PDF-07/SC2); source-assert the next.config pdfjs worker include (PDF-06); deferred `autonomous:false` PROD push of 0037+0038. SC1 (live PDF in PROD) = deferred human-verify UAT.

</details>

## Milestone v1.7 — Abastecimento de ponta-a-ponta + UX da grid

**Milestone goal:** Registrar abastecimento na hora (sem esperar a fatura), casar o lançamento da fatura por valor quando ela chegar, e tirar o atrito da criação de palavra-chave na importação. Brownfield: estende o módulo **Carro (v1.2)** reusando `AbastecimentoForm`, `src/actions/abastecimentos.ts` (create/update/delete) e as views de consumo `v_abastecimento_consumo`/`v_carro_resumo` — NÃO re-planeja o que já existe. Numeração continua de 24 → 25+.

- [x] **Phase 25: Fix de scroll na criação de palavra-chave** - Criar palavra-chave inline na grid de importação para de resetar o scroll pro topo (escopar/remover o `revalidatePath('/categorias')` cross-page em `addKeyword`) + re-classificação ao vivo da grid ao criar a keyword (client-side, sem refresh) — **independente, pequeno, sem dependências** (completed 2026-06-21)
- [x] **Phase 26: Substrato do abastecimento ponta-a-ponta** - Migration que relaxa o `abastecimentos_cost_xor` para "esperado manual + vínculo depois", adiciona colunas de parcelamento (nº parcelas + valor total) e habilita re-link em abastecimento pré-existente; + categoria default "Combustível" (kind `consumo`) seedada estilo `0035` — substrato das fases 27 e 28 (completed 2026-06-21)
- [x] **Phase 27: Registro rápido + abastecimento parcelado** - Botão "Novo abastecimento" por carro na lista `/carros` (reusa o `AbastecimentoForm` do detalhe) + marcar o abastecimento manual como parcelado (nº parcelas + valor total) (completed 2026-06-22)
- [x] **Phase 28: Vínculo reverso por valor + consumo sem double-count** - Ao subir a fatura, sugere casar lançamento↔abastecimento pré-registrado por valor (à vista = total; parcelado = ~total/N), confirma na grid de revisão (sem auto-commit) etiquetando `carro_id` + aplicando "Combustível"; uma parcela por fatura ao longo dos meses sem recontar o custo; o consumo (km/l + R$/km) reflete os registros manuais e os vinculados (completed 2026-06-22)

## Phase Details (v1.7)

### Phase 25: Fix de scroll na criação de palavra-chave

**Goal**: Criar uma palavra-chave inline na grid de revisão de importação (`/importar/[id]`) deixa de jogar o scroll da página pro topo. Hoje `addKeyword` (`src/actions/category-keywords.ts:94`) chama `revalidatePath('/categorias')`, que numa página diferente força um re-render que reseta a posição de scroll. Bug isolado de UX — escopar/remover essa revalidação cross-page sem quebrar o caso legítimo (a página `/categorias` ainda reflete a keyword nova quando for ela a origem da ação). **Escopo expandido (founder):** ao criar a keyword inline, re-classificar ao vivo as outras linhas da grid client-side (sem refresh, reusando o matcher puro `compileRule`/`matchKeyword`) — aplicando a linhas não-classificadas e sobrescrevendo auto-classificadas (memória/IA), nunca tocando `origin === 'manual'`.
**Depends on**: Nothing (isolado e independente — corrige o efeito colateral do `revalidatePath` adicionado no v1.5/v1.6 para a UI inline do v1.6)
**Requirements**: UX-01, UX-02
**Success Criteria** (what must be TRUE):

  1. Após criar uma palavra-chave inline ("+ palavra-chave") numa linha da grid de importação, a página `/importar/[id]` mantém a posição de scroll — não pula pro topo após salvar.
  2. A keyword recém-criada continua aparecendo cadastrada na categoria correta (em `/categorias` e no matcher do upload) — a correção do scroll não regride a persistência nem a cobertura da regra.
  3. O cadastro inline (caminho `origin === 'manual'`) e o cadastro a partir de `/categorias` (onde a revalidação É desejada) continuam ambos funcionando — a mudança escopa a revalidação à origem certa, sem remover o refresh legítimo da página de categorias.
  4. Ao criar a keyword inline, as demais linhas da grid que casam com a nova palavra-chave são re-classificadas ao vivo (client-side, sem refresh): aplicada às linhas não-classificadas (`category_id === null`) e sobrescrevendo as auto-classificadas (memória/IA), com as linhas recém-casadas recebendo provenance `'palavra-chave'`.
  5. O re-classify ao vivo nunca altera linhas com `origin === 'manual'` — a intenção explícita do usuário é preservada.

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 25-01-PLAN.md — Server-side: helper privado `insertKeyword` + `addKeywordInline` (sem revalidate) preservando `addKeyword` (revalida `/categorias`) (UX-01)

**Wave 2** *(blocked on Wave 1)*

- [x] 25-02-PLAN.md — Client-side: export puro `reclassifyRowsWithKeyword` + lift-state + swap do caller para `addKeywordInline` + UAT vivo (UX-01, UX-02)

### Phase 26: Substrato do abastecimento ponta-a-ponta

**Goal**: O modelo de dados deixa de exigir o custo no momento da criação e passa a suportar o fluxo "registro agora, fatura depois". A migration (próxima da fila, `~0039`+) relaxa o CHECK `abastecimentos_cost_xor` (migration `0027`) — que hoje força `transaction_id` XOR `amount_cents` — para permitir um abastecimento com **valor manual esperado E vínculo de transação estabelecido depois** (attach-later), adiciona colunas de **parcelamento** (nº de parcelas + valor total), e libera o **re-link** de uma transação num abastecimento já existente (hoje o vínculo é só no create). Em paralelo, seeda a categoria default **"Combustível"** (kind `consumo`) para todos os usuários, no padrão `handle_new_user` + backfill idempotente do `0035` (Marketplace). Substrato puro de dados — habilita as fases 27 (parcelado) e 28 (vínculo reverso + auto-Combustível).
**Depends on**: Nothing (migration sobre o schema de `abastecimentos` do v1.2 + seed estilo `0035`; é a base das fases 27 e 28)
**Requirements**: FUEL-01
**Success Criteria** (what must be TRUE):

  1. Existe a categoria default "Combustível" (kind `consumo`) para todo usuário — presente em `/categorias` numa conta nova (via `handle_new_user`) e backfillada nas contas existentes (idempotente, estilo `0035`), sem efeito no `gen:types` (data/trigger only).
  2. Um abastecimento pode ser registrado com um **valor manual esperado** e ter a transação da fatura **vinculada depois** — o CHECK de custo aceita esse estado (manual esperado + link posterior), sem permitir custo duplicado nem nenhum.
  3. Um abastecimento pode ser marcado como **parcelado** com nº de parcelas + valor total persistidos (colunas novas), preservando o caso à-vista existente sem regressão.
  4. Uma transação pode ser **re-vinculada** a um abastecimento pré-existente (re-link habilitado no banco/contrato), destravando o attach-later que o v1.2 só permitia no create.
  5. Migrations aplicam limpas em ordem no stack local (replay) e `database.types.ts` é regenerado refletindo as colunas de parcelamento.

**Plans**: 4/4 plans complete

Plans:
**Wave 0**

- [x] 26-01-PLAN.md — Wave 0 tests (RED): 9-row CHECK truth table + junction unique/double-link/RLS + Combustível seed/backfill + parcelado no-double-count fixture (FUEL-01)

**Wave 1** *(blocked on Wave 0)*

- [x] 26-02-PLAN.md — Migration 0039 (schema): relaxa `abastecimentos_cost_xor` + colunas `parcelas_total`/`valor_total_cents` + junção `abastecimento_parcelas` (RLS) + reescrita de `v_abastecimento_consumo` do corpo 0029 (custo parcelado uma vez) + gen:types (FUEL-01)
- [x] 26-03-PLAN.md — Migration 0040 (seed): re-seed `handle_new_user()` com "Combustível" (consumo, sort 4) + backfill idempotente, padrão 0035, sem gen:types diff (FUEL-01)

**Wave 2** *(blocked on Wave 1)*

- [x] 26-04-PLAN.md — [BLOCKING] replay limpo `npm run db:reset` + `gen:types` com diff escopado + suíte vitest verde (SC5) (FUEL-01)

### Phase 27: Registro rápido + abastecimento parcelado

**Goal**: O usuário lança um abastecimento na hora, sem depender da fatura nem da página de detalhe do carro. Um botão **"Novo abastecimento"** por carro na lista `/carros` abre o `AbastecimentoForm` já existente (reaproveitado do `/carros/[id]`), permitindo registrar à vista/manual durante o mês. E no próprio form o usuário pode marcar o abastecimento como **parcelado**, informando nº de parcelas + valor total — gravados nas colunas criadas na Phase 26.
**Depends on**: Phase 26 (precisa do XOR relaxado para "valor manual esperado" e das colunas de parcelamento; reusa `AbastecimentoForm` + `createAbastecimento`/`updateAbastecimento` do v1.2)
**Requirements**: CAR-07, CAR-08
**Success Criteria** (what must be TRUE):

  1. Na lista `/carros`, cada carro expõe um botão "Novo abastecimento" que abre o `AbastecimentoForm` (o mesmo do detalhe) e registra o abastecimento sem precisar navegar para `/carros/[id]`.
  2. Pelo botão da lista, o usuário registra um abastecimento manual/à vista (litros + odômetro + valor) durante o mês, antes da fatura chegar — e ele aparece no histórico do carro.
  3. No form, o usuário marca o abastecimento como **parcelado** e informa nº de parcelas + valor total; o registro é salvo com esses dados (validados) — o caso à-vista continua funcionando inalterado.
  4. O registro respeita posse (IDOR-safe via `assertOwnedCarro`) e não double-conta: um parcelado registrado manualmente ainda não tem transação vinculada (o vínculo por valor vem na Phase 28).

**Plans**: 5/5 plans complete

Plans:
**Wave 1**

- [x] 27-01-PLAN.md — Schema (TDD): superRefine de 3 estados + campos valorTotalCents/parcelasTotal espelhando o CHECK abastecimentos_cost_xor do 0039 (CAR-08)

**Wave 2** *(blocked on Wave 1)*

- [x] 27-02-PLAN.md — Action: abastecimentoWriteFields parcelado-aware (transaction_id/amount_cents null) IDOR-safe + sem double-count (CAR-08)
- [x] 27-03-PLAN.md — Form: aba Parcelado + prop manual-only + onSourceChange de 3 estados + preview valor-por-parcela display-only (CAR-07, CAR-08)

**Wave 3** *(blocked on 27-03)*

- [x] 27-04-PLAN.md — Lista: botão "Novo abastecimento" na face do CarroCard hospedando o form manual-only; page /carros sem fetch de transacoes (CAR-07)

**Gap closure** *(UAT discoverability gap, major)*

- [x] 27-05-PLAN.md — Affordance "Ver detalhes" no menu ⋯ do CarroCard (espelha "Ver extrato" do ReservaCard) → torna histórico + Editar/CR-01 alcançáveis pela lista /carros (CAR-07, CAR-08)

**UI hint**: yes

### Phase 28: Vínculo reverso por valor + consumo sem double-count

**Goal**: Quando a fatura chega, o sistema casa por **valor** um lançamento com um abastecimento pré-registrado (à vista = valor total; parcelado = ~valor total ÷ nº de parcelas) e sugere o vínculo na grid de revisão de importação (`src/components/import-review-table.tsx`), espelhando o padrão de sugestão/confirmação da classificação por IA — **sem auto-commit**. Ao confirmar, o lançamento fica vinculado ao abastecimento, o `carro_id` é etiquetado no lançamento e a categoria **"Combustível"** é sugerida/aplicada. Um abastecimento parcelado casa **uma parcela por fatura** ao longo dos meses sem recontar o custo, e as views de consumo (km/l + R$/km, `v_abastecimento_consumo`/`v_carro_resumo`) refletem tanto os registros manuais quanto os vinculados — sem double-count.
**Depends on**: Phase 26 (XOR relaxado + attach-later + re-link + colunas de parcelamento + categoria "Combustível"), Phase 27 (os abastecimentos pré-registrados à vista/parcelados que o matcher vai casar)
**Requirements**: CAR-09, CAR-10, CAR-11, CAR-12
**Success Criteria** (what must be TRUE):

  1. Ao subir uma fatura, um lançamento cujo valor casa um abastecimento pré-registrado (à vista = valor total; parcelado = ~valor total ÷ nº de parcelas) recebe uma **sugestão de vínculo** na grid de revisão — sem nada ser commitado automaticamente.
  2. O usuário **confirma ou descarta** a sugestão na grid; ao confirmar, o lançamento fica vinculado ao abastecimento, o `carro_id` é etiquetado no lançamento e a categoria "Combustível" é sugerida/aplicada (FUEL-01 apply-on-confirm).
  3. Um abastecimento **parcelado** casa **uma parcela por fatura** ao longo dos meses; cada parcela confirmada é registrada **sem recontar** o custo — sem double-count no consumo (`v_abastecimento_consumo`) nem no gasto total do carro (`v_carro_resumo`).
  4. O relatório de consumo (km/l e R$/km) reflete tanto os abastecimentos registrados manualmente quanto os vinculados à fatura; o **km/l é calculado só com litros + odômetro** (não exige a fatura para existir).

**Plans**: 5/5 plans complete
**Wave 1**

- [x] 28-01-PLAN.md — Fundação: módulo puro de value-match (D-01/D-03/D-04) + assertOwnedAbastecimento + ParsedReviewRow.abastecimentoMatch + campos de vínculo no schema (CAR-09, CAR-11)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 28-02-PLAN.md — Pass de match batched em ingestStatement (fetch não-vinculados sem filtro de data + greedy 1:1 + attach não-vinculante) (CAR-09, CAR-11)
- [x] 28-04-PLAN.md — Grid: affordance de vínculo na coluna Carro + "Vincular todos" + apply-on-confirm de Combustível + RSC threading (CAR-10, FUEL-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 28-03-PLAN.md — Link-write em confirmImport (IDOR re-derive do abastecimentoId + à-vista update transaction_id + parcelado insert + D-09 dedupe-skip + duplo-link backstop) + teste DB-integration (CAR-10, CAR-11)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 28-05-PLAN.md — Verificação CAR-12: consumo sem double-count (parcelado UMA vez, à-vista coalesce, km/l só litros+odômetro) (CAR-12)

**UI hint**: yes

## Progress

**Execution Order (v1.6):** 21 (substrato do matcher: wildcard + procedência persistida — base das fases 22 e 23) → 22 (sugestão de keyword inline + batch, depende de 21) · 23 (aplicar em lote por confiança, depende de 21) · 24 (ingestão robusta — independente, pode rodar em paralelo a qualquer momento). 22 e 23 podem rodar em paralelo após 21; 24 não tem dependências.

**Execution Order (v1.7):** 25 (fix de scroll — independente, pode rodar a qualquer momento) · 26 (substrato: relaxa XOR + parcelas + attach-later + re-link + categoria "Combustível" — base das fases 27 e 28) → 27 (registro rápido na lista /carros + parcelado, depende de 26) → 28 (vínculo reverso por valor na importação + consumo sem double-count, depende de 26 e 27). 25 é independente e quick; 26 → 27 → 28 é a cadeia ponta-a-ponta.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fundação | v1.0 | 3/4 | Code-complete (01-04 via Phase 12) | 2026-06-18 |
| 2. Receitas, categorias e lançamentos | v1.0 | 3/5 | Code-complete (02-05 via Phase 12) | 2026-06-18 |
| 3. Metas, aderência e reservas | v1.0 | 5/6 | Code-complete (03-06 via Phase 12) | 2026-06-18 |
| 4. Upload + classificação inteligente | v1.0 | 3/4 | Code-complete (04-04 via Phase 12) | 2026-06-18 |
| 5. Módulo MEI / DASN-SIMEI | v1.0 | 3/4 | Code-complete (05-04 via Phase 12) | 2026-06-18 |
| 6. Endurecimento | v1.0 | 1/5 | Code-complete (06-05 via Phase 12) | 2026-06-18 |
| 7. Identidade visual e polimento | v1.1 | 7/7 | Complete | 2026-06-17 |
| 8. Substrato Carro + CRUD + navegação | v1.2 | 3/3 | Complete | 2026-06-17 |
| 9. Etiquetar gastos da fatura ao carro | v1.2 | 3/3 | Complete | 2026-06-17 |
| 10. Abastecimento híbrido + consumo | v1.2 | 3/3 | Complete | 2026-06-17 |
| 11. Detalhe do carro + gráfico de consumo | v1.2 | 4/4 | Complete | 2026-06-17 |
| 12. Produção & Live-Verify | v1.3 | 11/11 | Complete | 2026-06-18 |
| 13. PDF de Fatura | v1.3 | 4/4 | Complete | 2026-06-18 |
| 14. Key Storage + BYOK Settings | v1.4 | 5/5 | Complete | 2026-06-19 |
| 15. Classification Wire | v1.4 | 2/2 | Complete | 2026-06-19 |
| 16. Review-Grid Suggestion Affordances | v1.4 | 1/1 | Complete | 2026-06-18 |
| 17. v1.3 Debt Cleanup (ISOLATED) | v1.4 | 4/4 | Complete | 2026-06-19 |
| 18. AI classifica compras corretamente | v1.5 | 2/2 | Complete | 2026-06-20 |
| 19. Cadastro de palavras-chave por categoria | v1.5 | 2/2 | Complete | 2026-06-19 |
| 20. Auto-classificação por palavra-chave no upload | v1.5 | 2/2 | Complete | 2026-06-19 |
| 21. Match wildcard + procedência persistida | v1.6 | 4/4 | Complete    | 2026-06-20 |
| 22. Sugestão de palavra-chave (inline + batch) | v1.6 | 3/3 | Complete   | 2026-06-20 |
| 23. Aplicar sugestões em lote por confiança | v1.6 | 1/1 | Complete    | 2026-06-21 |
| 24. Ingestão robusta (PDF em PROD + re-import) | v1.6 | 1/1 | Complete   | 2026-06-21 |
| 25. Fix de scroll na criação de palavra-chave | v1.7 | 2/2 | Complete    | 2026-06-21 |
| 26. Substrato do abastecimento ponta-a-ponta | v1.7 | 4/4 | Complete    | 2026-06-21 |
| 27. Registro rápido + abastecimento parcelado | v1.7 | 5/5 | Complete    | 2026-06-22 |
| 28. Vínculo reverso por valor + consumo sem double-count | v1.7 | 5/5 | Complete   | 2026-06-22 |

---
*Roadmap created: 2026-06-16 — v1.0 Coverage: 47/47 v1 requirements mapped.*
*Reorganized 2026-06-18 at v1.3 close — milestone-grouped lean index; full v1.0–v1.3 phase detail in `milestones/v{X.Y}-ROADMAP.md`.*
*v1.4 shipped + collapsed 2026-06-19 — Phases 14–17, 17/17 v1.4 requirements. Full detail in `milestones/v1.4-ROADMAP.md`.*
*v1.5 shipped + collapsed 2026-06-20 — Phases 18–20, 8/8 v1.5 requirements satisfeitos (MKT-01 live human-verify fechado 2026-06-20 via `/gsd-verify-work 18`). Full detail in `milestones/v1.5-ROADMAP.md`.*
*v1.6 added 2026-06-20 — Phases 21–24, 8/8 v1.6 requirements mapped (KW-09/KW-10 → P21 · KW-07/KW-08 → P22 · CLSAI-10 → P23 · PDF-06/PDF-07/IMP-07 → P24). Brownfield: refina o pipeline memória→palavra-chave→IA já em PROD + endurece a ingestão. Phases continue from 20 → 21+.*
*v1.7 added 2026-06-21 — Phases 25–28, 8/8 v1.7 requirements mapped (UX-01 → P25 · FUEL-01 → P26 · CAR-07/CAR-08 → P27 · CAR-09/CAR-10/CAR-11/CAR-12 → P28). Brownfield: estende o módulo Carro (v1.2) reusando `AbastecimentoForm` + `actions/abastecimentos.ts` + views de consumo. Phases continue from 24 → 25+.*
