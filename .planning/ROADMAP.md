# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

> Full per-phase detail for shipped milestones lives in `.planning/milestones/v{X.Y}-ROADMAP.md`. This file is the lean milestone-grouped index, with the ACTIVE milestone (v1.6) expanded below. Continuous phase numbering (never restart at 01).

## Milestones

- 🟡 **v1.0 MVP** — Phases 1–6 (core ledger + upload/IA-seam + MEI + hardening) — code-complete local; deployed + live-verified via Phase 12 (v1.3)
- ✅ **v1.1 Identidade visual** — Phase 7 (re-skin navy+gold + dark mode + charts + mobile) — shipped 2026-06-17
- ✅ **v1.2 Carro** — Phases 8–11 (módulo de veículo) — shipped 2026-06-18 (`milestones/v1.2-*`)
- ✅ **v1.3 Produção & PDF** — Phases 12–13 (app no ar + core value live memory-only + PDF de fatura) — shipped 2026-06-18 (`milestones/v1.3-*`)
- ✅ **v1.4 IA de Classificação (BYOK)** — Phases 14–17 (wire IA no seam `suggestCategory()` + BYOK Settings + dívida v1.3) — shipped 2026-06-19 (`milestones/v1.4-*`)
- ✅ **v1.5 Classificação determinística** — Phases 18–20 (pipeline memória→palavra-chave→IA + prompt da IA kind-aware + Marketplace em PROD) — shipped 2026-06-20 (`milestones/v1.5-*`; 8/8 requisitos — MKT-01 live human-verify fechado 2026-06-20)
- 🟢 **v1.6 Classificação fluida & ingestão robusta** — Phases 21–24 (match wildcard + procedência persistida → sugestão de palavra-chave inline+batch → aplicar sugestões em lote por confiança → PDF em PROD + parser robusto + re-import liberado) — **ACTIVE**

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

### 🟢 v1.6 Classificação fluida & ingestão robusta (Phases 21–24) — ACTIVE

**Milestone goal:** Reduzir o atrito da classificação (auto-sugestão de palavras-chave inline + em lote, match wildcard glob, aplicar sugestões em lote por confiança) e endurecer a ingestão (PDF funcionando em PROD, parser que degrada com clareza, re-import liberado quando não confirmado). Brownfield: o pipeline **memória → palavra-chave → IA** já roda em PROD; este milestone o refina e fecha findings do v1.4.

- [ ] **Phase 21: Match wildcard + procedência persistida** - Wildcard glob (`*`) na palavra-chave (maior keyword vence preservado) + widening do CHECK de `0020` para gravar `palavra-chave` em `transactions.classification_source`
- [ ] **Phase 22: Sugestão de palavra-chave (inline + batch)** - Opt-in inline ao confirmar merchant→categoria + painel batch em `/categorias` que analisa `merchant_patterns` e sugere keywords candidatas
- [ ] **Phase 23: Aplicar sugestões em lote por confiança** - No review grid, aplicar de uma vez todas as sugestões (memória/palavra-chave/IA) acima de um limiar de confiança, deixando as fracas para revisão manual (sem auto-commit)
- [ ] **Phase 24: Ingestão robusta (PDF em PROD + re-import)** - Worker do `pdfjs` disponível no bundle serverless da Vercel + parser que degrada com clareza (sem OCR) + re-upload liberado quando a importação anterior não foi confirmada

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

**Plans**: 4 plans
**Wave 1**

- [ ] 21-01-PLAN.md — Gate: normalizeKeyword preserva `*` no cadastro + addKeyword rejeita literal-count-0 (KW-09)
- [ ] 21-02-PLAN.md — matchKeyword glob ancorado ReDoS-safe + especificidade por literal-count (KW-09, puro/TDD)
- [ ] 21-03-PLAN.md — migration 0037: amplia o CHECK de transactions.classification_source para 'palavra-chave' + db push (KW-10)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 21-04-PLAN.md — wiring import.ts: compileRule no pre-fetch + re-derivação server-side da procedência no commit (KW-09 + KW-10)

### Phase 22: Sugestão de palavra-chave (inline + batch)

**Goal**: O usuário deixa de cadastrar palavras-chave só no braço: ao confirmar um padrão merchant→categoria na grid, recebe a opção inline de virar aquele descritor numa keyword; e em `/categorias` há um painel que varre os padrões já confirmados (`merchant_patterns`) e sugere keywords candidatas para aprovar ou descartar em lote.
**Depends on**: Phase 21 (o matcher com wildcard + a procedência persistida são a base sobre a qual as keywords sugeridas operam; mantém um único modelo de keyword)
**Requirements**: KW-07, KW-08
**Success Criteria** (what must be TRUE):

  1. Ao confirmar um padrão merchant→categoria no review grid, o usuário vê uma opção inline (opt-in, nunca automática) de criar uma palavra-chave para aquele descritor; aceitando, a keyword aparece cadastrada naquela categoria.
  2. Em `/categorias`, um painel analisa os padrões já confirmados (`merchant_patterns`) e lista palavras-chave candidatas com a categoria sugerida.
  3. No painel, o usuário aprova ou descarta as candidatas em lote; as aprovadas viram keywords cadastradas (escopadas por `user_id` + RLS), as descartadas somem da lista sem efeito colateral.
  4. Nenhuma keyword é criada sem ação explícita do usuário (sem auto-cadastro) — inline e batch são ambos opt-in.

**Plans**: TBD
**UI hint**: yes

### Phase 23: Aplicar sugestões em lote por confiança

**Goal**: O usuário acelera a revisão de um upload aplicando de uma só vez todas as sugestões pendentes (de memória, palavra-chave ou IA) cuja confiança esteja acima de um limiar — deixando só as fracas para olhar uma a uma — sem que nada seja commitado automaticamente.
**Depends on**: Phase 21 (a procedência persistida `palavra-chave` e o source unificado tornam a confiança por origem consistente na grid)
**Requirements**: CLSAI-10
**Success Criteria** (what must be TRUE):

  1. No review grid de um upload, existe uma ação explícita do usuário que aplica de uma vez todas as sugestões pendentes (memória / palavra-chave / IA) com confiança acima de um limiar.
  2. As sugestões abaixo do limiar permanecem pendentes e sem categoria aplicada, deixadas para revisão manual linha a linha.
  3. Aplicar em lote NÃO commita nada no upload: as categorias só são preenchidas na grid (sobrescrevíveis); a persistência e o aprendizado merchant→categoria continuam acontecendo apenas no confirm humano.

**Plans**: TBD
**UI hint**: yes

### Phase 24: Ingestão robusta (PDF em PROD + re-import)

**Goal**: A ingestão de faturas para de quebrar em produção e de bloquear re-uploads legítimos: o worker do `pdfjs` passa a existir no bundle serverless da Vercel (upload de PDF funciona em PROD), o parser degrada de forma clara em entradas ruins (sem OCR), e o mesmo arquivo pode ser re-importado quando a importação anterior nunca foi confirmada.
**Depends on**: Nothing (operacional/independente das fases de classificação; pode rodar em paralelo — corrige findings do v1.4 nas rotas de ingest/PDF)
**Requirements**: PDF-06, PDF-07, IMP-07
**Success Criteria** (what must be TRUE):

  1. Em PROD (Vercel), o upload de uma fatura PDF é parseado com sucesso — o worker do `pdfjs` está disponível no bundle serverless, sem o erro de "worker faltando" que quebrava em produção.
  2. Diante de um PDF ruim (image-only / 0 linhas extraíveis), o parser degrada de forma clara e previsível — sem travar e sem produzir linhas silenciosamente erradas — orientando o usuário (sem OCR no escopo).
  3. O re-upload do mesmo arquivo é permitido quando a importação anterior NÃO foi confirmada (rows que nunca viraram `transactions`); o `content_hash` continua bloqueando apenas o que já foi confirmado.

**Plans**: TBD

## Progress

**Execution Order (v1.6):** 21 (substrato do matcher: wildcard + procedência persistida — base das fases 22 e 23) → 22 (sugestão de keyword inline + batch, depende de 21) · 23 (aplicar em lote por confiança, depende de 21) · 24 (ingestão robusta — independente, pode rodar em paralelo a qualquer momento). 22 e 23 podem rodar em paralelo após 21; 24 não tem dependências.

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
| 21. Match wildcard + procedência persistida | v1.6 | 0/4 | Planned | - |
| 22. Sugestão de palavra-chave (inline + batch) | v1.6 | 0/TBD | Not started | - |
| 23. Aplicar sugestões em lote por confiança | v1.6 | 0/TBD | Not started | - |
| 24. Ingestão robusta (PDF em PROD + re-import) | v1.6 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-06-16 — v1.0 Coverage: 47/47 v1 requirements mapped.*
*Reorganized 2026-06-18 at v1.3 close — milestone-grouped lean index; full v1.0–v1.3 phase detail in `milestones/v{X.Y}-ROADMAP.md`.*
*v1.4 shipped + collapsed 2026-06-19 — Phases 14–17, 17/17 v1.4 requirements. Full detail in `milestones/v1.4-ROADMAP.md`.*
*v1.5 shipped + collapsed 2026-06-20 — Phases 18–20, 8/8 v1.5 requirements satisfeitos (MKT-01 live human-verify fechado 2026-06-20 via `/gsd-verify-work 18`). Full detail in `milestones/v1.5-ROADMAP.md`.*
*v1.6 added 2026-06-20 — Phases 21–24, 8/8 v1.6 requirements mapped (KW-09/KW-10 → P21 · KW-07/KW-08 → P22 · CLSAI-10 → P23 · PDF-06/PDF-07/IMP-07 → P24). Brownfield: refina o pipeline memória→palavra-chave→IA já em PROD + endurece a ingestão. Phases continue from 20 → 21+.*
