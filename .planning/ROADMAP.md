# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

> Full per-phase detail for shipped milestones lives in `.planning/milestones/v{X.Y}-ROADMAP.md`. This file is the lean milestone-grouped index, with the ACTIVE milestone (v1.5) expanded below. Continuous phase numbering (never restart at 01).

## Milestones

- 🟡 **v1.0 MVP** — Phases 1–6 (core ledger + upload/IA-seam + MEI + hardening) — code-complete local; deployed + live-verified via Phase 12 (v1.3)
- ✅ **v1.1 Identidade visual** — Phase 7 (re-skin navy+gold + dark mode + charts + mobile) — shipped 2026-06-17
- ✅ **v1.2 Carro** — Phases 8–11 (módulo de veículo) — shipped 2026-06-18 (`milestones/v1.2-*`)
- ✅ **v1.3 Produção & PDF** — Phases 12–13 (app no ar + core value live memory-only + PDF de fatura) — shipped 2026-06-18 (`milestones/v1.3-*`)
- ✅ **v1.4 IA de Classificação (BYOK)** — Phases 14–17 (wire IA no seam `suggestCategory()` + BYOK Settings + dívida v1.3) — shipped 2026-06-19 (`milestones/v1.4-*`; tech_debt close — real-key/PROD live-smokes deferred)
- 🟢 **v1.5 Classificação determinística** — Phases 18–20 (regras de palavra-chave por categoria → camada determinística no pipeline memória→palavra-chave→IA + prompt da IA kind-aware + Marketplace em PROD) — **ACTIVE**

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

Full detail: `milestones/v1.3-ROADMAP.md`. Audit: `milestones/v1.3-MILESTONE-AUDIT.md` (3 itens diferidos no close — quitados nesta milestone na Phase 17).

</details>

<details>
<summary>✅ v1.4 IA de Classificação (BYOK) (Phases 14–17) — SHIPPED 2026-06-19</summary>

- [x] Phase 14: Key Storage + BYOK Settings — 5/5 plans — code-complete + LOCAL-verified (797/797; Vault + RLS + key-never-on-client); **PROD push do 0033 deferido (item humano)**
- [x] Phase 15: Classification Wire — 2/2 plans — code-complete + LOCAL-verified (812/812; memory-first/1-call/enum-gate/no-auto-commit/PII-descriptorNorm provados); **smoke chave real + maxDuration PROD deferidos (itens humanos)**
- [x] Phase 16: Review-Grid Suggestion Affordances — 1/1 plan — complete (819/819; SuggestionSlot + procedência memória/IA + dica de confiança + ordenação baixa-confiança-primeiro; grid ao vivo em PROD)
- [x] Phase 17: v1.3 Debt Cleanup (ISOLATED) — 4/4 plans — complete (SC1 deploy-ancestry + SC2 MEI dasn CSV + SC4 12/13 VALIDATION + **DATA-02 delete destrutivo EXECUTADO ao vivo 2026-06-19**); conta PROD apagada (só dados de teste)

Full detail: `milestones/v1.4-ROADMAP.md`. Audit: `milestones/v1.4-MILESTONE-AUDIT.md` (close `tech_debt` — código completo + 100% wired pelo integration-checker; 14/15/16 live-smokes real-key/PROD deferidos). 17/17 requisitos v1.4 mapeados + wired.

</details>

### 🟢 v1.5 Classificação determinística (Phases 18–20) — ACTIVE

**Milestone goal:** Reduzir a dependência da IA fraca (gemini-2.5-flash-lite) dando à classificação uma camada determinística e controlada pelo usuário — regras de palavra-chave → categoria que ele mesmo cadastra — além de um prompt de IA mais esperto para o que sobrar. Pipeline: **memória → palavra-chave → IA**.

- [ ] **Phase 18: AI classifica compras corretamente** - Marketplace em PROD + prompt da IA kind-aware (para de mandar compra para Investimentos/Reserva)
- [ ] **Phase 19: Cadastro de palavras-chave por categoria** - O usuário registra/remove keywords numa categoria em `/categorias`, escopado por user_id + RLS
- [ ] **Phase 20: Auto-classificação por palavra-chave no upload** - Pipeline memória → palavra-chave → IA, auto-classificando o match no upload (maior keyword vence, sobrescrevível, aprende no confirm)

## Phase Details (v1.5)

### Phase 18: AI classifica compras corretamente

**Goal**: A camada de IA existente (já wired no v1.4) para de errar a classe de compras de marketplace — há um bucket "Marketplace" disponível em PROD e o prompt instrui o modelo a nunca atribuir categorias de alocação (Investimentos/Reserva) a um gasto.
**Depends on**: Nothing (first phase of the milestone; extends the already-shipped v1.4 AI path — `src/lib/ai/classify.ts`)
**Requirements**: MKT-01, CLSAI-09
**Success Criteria** (what must be TRUE):

  1. A categoria default "Marketplace" está presente na conta em PROD (migration `0035` aplicada via `supabase db push`), disponível como alvo de classificação.
  2. Num upload com um descritor de marketplace nunca visto (ex.: AliExpress, Mercado Livre, Shopee), a sugestão da IA cai em "Marketplace" (ou outra categoria de consumo) — nunca em Investimentos/Reserva.
  3. Cada categoria é enviada ao prompt com seu `kind` (consumo/alocação) e o prompt instrui explicitamente o modelo a não escolher categorias de alocação para compras/gastos.

**Plans**: 1/2 plans executed

- [x] 18-01-PLAN.md — CLSAI-09: prompt kind-aware (tag inline + glossário + regra dura) + gate de código + threading {id,name,kind} + 4 fixtures + 2 novos describes (autônomo)
- [ ] 18-02-PLAN.md — MKT-01: verificar 0035 em PROD (Claude) + human-verify (usuário roda `db push`, re-signup, "Marketplace" + sugestão de consumo)

### Phase 19: Cadastro de palavras-chave por categoria

**Goal**: O usuário consegue manter, na tela `/categorias`, a lista de palavras-chave de cada categoria — adicionar e remover keywords manualmente — com os dados isolados por usuário.
**Depends on**: Nothing (independent of Phase 18; precedes Phase 20)
**Requirements**: KW-01, KW-06
**Success Criteria** (what must be TRUE):

  1. Na tela `/categorias`, o usuário adiciona uma palavra-chave a uma categoria (ex.: "uber" em Transporte) e ela aparece persistida na lista daquela categoria.
  2. O usuário remove uma palavra-chave cadastrada e ela some da lista (cadastro manual, editável — não aprendido).
  3. As palavras-chave de um usuário são invisíveis a outro: a tabela é escopada por `user_id` com RLS, como toda tabela de domínio (multi-user-ready).

**Plans**: TBD
**UI hint**: yes

### Phase 20: Auto-classificação por palavra-chave no upload

**Goal**: Ao subir uma fatura, um descritor que contém uma palavra-chave cadastrada já chega pré-classificado para aquela categoria — sem clique, sem chamar a IA, e ainda corrigível antes de confirmar.
**Depends on**: Phase 19 (precisa das palavras-chave cadastradas), Phase 18 (Marketplace como alvo natural de regras de compra)
**Requirements**: KW-02, KW-03, KW-04, KW-05
**Success Criteria** (what must be TRUE):

  1. No upload, uma linha cujo `descriptor_norm` CONTÉM uma palavra-chave cadastrada chega pré-preenchida na categoria daquela palavra-chave, com `source = "palavra-chave"`, sem clique — espelhando o pré-preenchimento da memória.
  2. A classificação roda na ordem memória → palavra-chave → IA: um hit de memória prevalece sobre a palavra-chave; a palavra-chave roda antes do pass de IA; a IA só é chamada para os descritores que sobraram (menos chamadas de IA).
  3. Quando um descritor casa palavras-chave de mais de uma categoria, a palavra-chave mais longa (match mais específico) vence.
  4. Uma linha classificada por palavra-chave é sobrescrevível na grid de revisão; nada persiste até o confirm; o confirm aprende o padrão merchant→categoria na memória como hoje (sem auto-commit em `transactions`/`merchant_patterns` antes do confirm).

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order (v1.5):** 18 (independente; sensato primeiro — Marketplace é alvo das regras e da IA) · 19 (cadastro de keywords) → 20 (auto-classificação no upload, depende de 19). 18 e 19 podem rodar em paralelo; 20 depende de ambos.

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
| 14. Key Storage + BYOK Settings | v1.4 | 5/5 | Complete (LOCAL + PROD live-smoke 2026-06-19) | 2026-06-19 |
| 15. Classification Wire | v1.4 | 2/2 | Complete (LOCAL + PROD live-smoke 2026-06-19) | 2026-06-19 |
| 16. Review-Grid Suggestion Affordances | v1.4 | 1/1 | Complete (LOCAL-verified + live in PROD) | 2026-06-18 |
| 17. v1.3 Debt Cleanup (ISOLATED) | v1.4 | 4/4 | Complete — SC1/SC2/SC4 + DATA-02 delete executed live | 2026-06-19 |
| 18. AI classifica compras corretamente | v1.5 | 1/2 | In Progress|  |
| 19. Cadastro de palavras-chave por categoria | v1.5 | 0/0 | Not started | - |
| 20. Auto-classificação por palavra-chave no upload | v1.5 | 0/0 | Not started | - |

---
*Roadmap created: 2026-06-16 — v1.0 Coverage: 47/47 v1 requirements mapped.*
*Reorganized 2026-06-18 at v1.3 close — milestone-grouped lean index; full v1.0–v1.3 phase detail in `milestones/v{X.Y}-ROADMAP.md`.*
*v1.4 added 2026-06-18 — Phases 14–17, 17/17 v1.4 requirements mapped (BYOK-01..05 → P14 · CLSAI-01..06 → P15 · CLSAI-07/08 → P16 · DEBT-03..06 → P17). Dependency order key-storage → AI call → grid; debt isolated.*
*v1.4 shipped + collapsed 2026-06-19 — close `tech_debt` (code-complete + 100% wired; 14/15/16 real-key/PROD live-smokes deferred). Full detail in `milestones/v1.4-ROADMAP.md`.*
*v1.5 added 2026-06-19 — Phases 18–20, 8/8 v1.5 requirements mapped (MKT-01 + CLSAI-09 → P18 · KW-01/KW-06 → P19 · KW-02/03/04/05 → P20). Pipeline memória→palavra-chave→IA; camada de palavra-chave determinística/grátis/instantânea espelha a memória. Phases continue from 17 → 18+.*
