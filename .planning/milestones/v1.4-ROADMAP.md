# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

> Full per-phase detail for shipped milestones lives in `.planning/milestones/v{X.Y}-ROADMAP.md`. This file is the lean milestone-grouped index, with the ACTIVE milestone (v1.4) expanded below. Continuous phase numbering (never restart at 01).

## Milestones

- 🟡 **v1.0 MVP** — Phases 1–6 (core ledger + upload/IA-seam + MEI + hardening) — code-complete local; deployed + live-verified via Phase 12 (v1.3)
- ✅ **v1.1 Identidade visual** — Phase 7 (re-skin navy+gold + dark mode + charts + mobile) — shipped 2026-06-17
- ✅ **v1.2 Carro** — Phases 8–11 (módulo de veículo) — shipped 2026-06-18 (`milestones/v1.2-*`)
- ✅ **v1.3 Produção & PDF** — Phases 12–13 (app no ar + core value live memory-only + PDF de fatura) — shipped 2026-06-18 (`milestones/v1.3-*`)
- 🚧 **v1.4 IA de Classificação (BYOK)** — Phases 14–17 (wire IA no seam `suggestCategory()` + BYOK Settings + dívida v1.3) — in progress

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

### 🚧 v1.4 IA de Classificação (BYOK) (In Progress)

**Milestone Goal:** Ligar classificação assistida por IA no seam `suggestCategory()` já pronto — memory-first, IA só no cache-miss, usuário confirma antes de virar padrão — com BYOK multi-provedor (Gemini/Claude no lançamento) configurável numa Settings UI com chave criptografada no Supabase Vault; e quitar a dívida carregada do v1.3.

**Hard constraint (research):** dependência estrita **key storage/encryption → AI call → review-grid UI**. A dívida v1.3 (Phase 17) é **isolada** das fases de feature porque contém um delete destrutivo em produção.

- [~] **Phase 14: Key Storage + BYOK Settings** - Migração 0033 (Vault + RLS + decrypt RPC) + Settings UI com chave write-only criptografada + testar conexão — 5/5 plans, code-complete + LOCAL-verified (797/797, RLS smoke + key-never-on-client provados); **PROD push do 0033 deferido (item humano)**
- [~] **Phase 15: Classification Wire** - Provider factory + classify batched + corpo real de `suggestCategory()` (memory-first, enum vivo, fallback gracioso) — 2/2 plans, code-complete + LOCAL-verified (812/812; memory-first/1-call/enum-gate/no-auto-commit/PII-descriptorNorm provados por teste; bug de fallback do upload pego no review + corrigido); **smoke com chave real + maxDuration PROD = itens humanos**
- [x] **Phase 16: Review-Grid Suggestion Affordances** - `SuggestionSlot` recebe `row.suggestion` + badge de procedência (memória vs IA) + dica de confiança + ordenação baixa-confiança-primeiro — 1/1 plan, complete (819/819, 7/7 grid edges, no-auto-commit + no-render-throw provados no review; grid renderiza ao vivo em PROD)
- [x] **Phase 17: v1.3 Debt Cleanup (ISOLATED)** - Redeploy G-07/G-08 + walkthroughs prod MEI/LGPD (delete destrutivo) + VALIDATION.md Nyquist (Phases 12+13) — 4/4 plans, complete (SC1 deploy-ancestry + SC2 MEI CSV + SC4 12/13 VALIDATION + **DATA-02 delete destrutivo EXECUTADO ao vivo 2026-06-19**); conta PROD apagada (só dados de teste)

## Phase Details

### Phase 14: Key Storage + BYOK Settings

**Goal**: Usuário configura seu provedor de IA (Gemini/Claude) e cola a própria chave numa tela de Settings; a chave é criptografada at-rest (Supabase Vault), escopada por `user_id` + RLS, nunca volta ao client, e pode ser testada/removida — sendo a raiz da cadeia de dependência (storage/encryption antes de qualquer chamada de IA).
**Depends on**: Nothing (first phase of v1.4; root of the dependency chain)
**Requirements**: BYOK-01, BYOK-02, BYOK-03, BYOK-04, BYOK-05
**Success Criteria** (what must be TRUE):

  1. Usuário escolhe o provedor (Gemini ou Claude) e cola a própria chave API numa tela de Settings de IA (`conta/configuracoes-ia/`); ao salvar a tela mostra "chave configurada ✓" — nunca a chave de volta (form write-only)
  2. A chave está criptografada at-rest no Supabase Vault — a linha `ai_settings` guarda só o secret id (UUID) + provider + model, e o client só recebe `has_key` + `provider` (verificado: chave nunca aparece em Network tab / RSC payload / bundle)
  3. Usuário clica "testar conexão" e recebe ok/erro de um ping barato que valida chave + provedor antes de confiar na config
  4. Cross-user isolation provado: a tabela `ai_settings` tem RLS com as quatro políticas (`select/insert/update/delete`) + `with check`, e o decrypt acontece server-only via RPC `SECURITY DEFINER` filtrado por `auth.uid()`
  5. Usuário remove/troca a chave; sem chave o app volta ao estado pré-IA (pick manual) sem quebrar

**Plans**: 5 plans

- [ ] 14-01-PLAN.md — instalar @ai-sdk/google + @ai-sdk/anthropic (checkpoint de legitimidade) + scaffolds de teste Wave 0
- [ ] 14-02-PLAN.md — migração 0033 (ai_settings + RLS + Vault + RPCs get/save/remove) + [BLOCKING] schema push LOCAL+PROD
- [ ] 14-03-PLAN.md — camada lib/ai: aiSettingsSchema + registry client-safe + provider-factory + decrypt DAL server-only
- [ ] 14-04-PLAN.md — Server Actions saveAiSettings/testConnection/removeAiKey (Vault RPC + ping + mapeamento de erro pt-BR)
- [ ] 14-05-PLAN.md — RSC /conta/configuracoes-ia + AiSettingsForm write-only + card em /conta + [SECURITY GATE] write-only-key

**UI hint**: yes

### Phase 15: Classification Wire

**Goal**: Para descritor novo (cache-miss da memória), o sistema chama a IA do provedor configurado e anexa uma sugestão de categoria à linha — memory-first (zero IA p/ merchant conhecido), uma chamada batched/deduplicada por upload, restrita ao enum vivo do usuário, degradando graciosamente para o pick manual em qualquer falha. A IA nunca auto-commita; o upload nunca falha por causa dela.
**Depends on**: Phase 14 (importa o decrypt read server-only + o provider factory; não pode ser ligado sem eles)
**Requirements**: CLSAI-01, CLSAI-02, CLSAI-03, CLSAI-04, CLSAI-05, CLSAI-06
**Success Criteria** (what must be TRUE):

  1. Upload com merchant NOVO (cache-miss) → a IA sugere uma categoria, anexada como `row.suggestion`; upload só com merchants CONHECIDOS faz ZERO chamadas de IA (memory-first verificável)
  2. Os descritores não-vistos de um upload são deduplicados e enviados numa ÚNICA chamada de IA por upload (custo ∝ unique-unseen, não ∝ total de linhas)
  3. A sugestão é restrita às categorias ATUAIS do usuário (enum vivo, lido no momento da chamada via `validateSuggestion`); editar/renomear categoria entre uploads não produz categoria stale/inventada — quando nada encaixa o slot fica vazio
  4. Sem chave / chave inválida / erro de provedor / rate-limit / saída malformada degrada para o pick manual com toast não-bloqueante — o upload e a review grid continuam plenamente usáveis (inner `try/catch` → `{}`)
  5. NENHUMA sugestão é auto-commitada: `merchant_patterns` continua sendo escrito SÓ no `confirmImport` em confirmação humana — o loop confirm/learn do v1.3 permanece intacto

**Plans**: 2 plans

- [ ] 15-01-PLAN.md — classify.ts batched doGenerate (flat schema + enum-gate + try/catch fallback) + ParsedReviewRow.suggestion (TDD; wave 1)
- [ ] 15-02-PLAN.md — import.ts two-pass wire + suggestCategory delegate + maxDuration≥60 + test updates (wave 2)

**Research flag**: yes — adapter por-provedor (Claude flat-schema, sem `$ref`/`name`) e re-verificar model-ids no build; A/B em descritores BR reais. Usar `/gsd-plan-phase --research-phase`.

### Phase 16: Review-Grid Suggestion Affordances

**Goal**: A review grid renderiza a sugestão produzida pela Phase 15 no `SuggestionSlot` já existente, mostrando a procedência (memória vs IA) e uma dica de confiança por linha, com as linhas de baixa confiança ordenando primeiro — pura UI sobre o pipeline já provado, sem auto-commit (aprendizado continua no `confirmImport`).
**Depends on**: Phase 15 (precisa das sugestões fluindo do wire; renderiza o que a Phase 15 produz)
**Requirements**: CLSAI-07, CLSAI-08
**Success Criteria** (what must be TRUE):

  1. Cada linha sem categoria mostra a sugestão no `SuggestionSlot` (`import-review-table.tsx:771` recebe `row.suggestion`); o usuário clica "Aplicar sugestão" e a categoria é preenchida (sem commit até confirmar)
  2. Usuário vê a procedência de cada sugestão (badge "memória" vs "IA") e distingue visualmente o que foi sugerido pela IA do que já é padrão confirmado
  3. Usuário vê uma dica de confiança por linha, e as linhas de baixa confiança ordenam PRIMEIRO na review grid (revisar o duvidoso antes)
  4. Aplicar uma sugestão da IA e confirmar ainda passa pelo mesmo gate do pick manual — nenhum `merchant_patterns` é escrito sem confirmação explícita

**Plans**: 1 plan

- [ ] 16-01-PLAN.md — bridge SuggestionSlot (`row.suggestion`→chip) + badge procedência memória/IA (CLSAI-07) + tag baixa-confiança + sort baixa-confiança-primeiro (CLSAI-08); pura UI, sem auto-commit

**UI hint**: yes

### Phase 17: v1.3 Debt Cleanup (ISOLATED)

**Goal**: Quitar a dívida carregada do v1.3 — redeploy dos fixes cosméticos G-07/G-08, walkthroughs hands-on em produção do MEI e do LGPD (incluindo um delete destrutivo de conta throwaway), e VALIDATION.md de Nyquist para as Phases 12+13. Fase OPERACIONAL/human-verify (sem código de feature novo), DELIBERADAMENTE ISOLADA das fases de feature porque contém um passo destrutivo em produção e o dev server aponta para o Supabase de PROD.
**Depends on**: Nothing (independent of 14–16; sequence apart from feature commits — never interleave)
**Requirements**: DEBT-03, DEBT-04, DEBT-05, DEBT-06
**Success Criteria** (what must be TRUE):

  1. Os fixes G-07/G-08 (sentinel do grid de importação + toast "0 importadas", commit `2ae93fb`) estão no bundle de PRODUÇÃO (redeploy confirmado ao vivo)
  2. Walkthrough hands-on em produção do MEI (12-06: downloads CSV/JSON) confirma os reqs MEI-* ao vivo
  3. Walkthrough hands-on em produção do LGPD (12-07: export de dados + delete de conta) confirma DATA-*/SEC-01 ao vivo — executado com **backup do DB tirado ANTES**, **`user_id` throwaway explicitamente criado e confirmado**, **double-confirm do delete**, e **nunca via dev server** (que aponta para PROD); o cascade fica escopado ao `user_id` throwaway via RLS
  4. `VALIDATION.md` de Nyquist gerado/preenchido para as Phases 12 e 13 (12 ausente, 13 draft → ambas completas)

**Plans**: 3/4 plans executed
Plans:

- [x] 17-01-PLAN.md — SC4/DEBT-06: criar 12-VALIDATION.md + finalizar 13-VALIDATION.md (Nyquist pragmático-retroativo) [autonomous]
- [x] 17-02-PLAN.md — SC1/DEBT-03 + SC2/DEBT-04: confirmar G-07/G-08 no bundle PROD + conteúdo dos downloads MEI CSV/JSON ao vivo (browser MCP, não-destrutivo) [human-verify]
- [x] 17-03-PLAN.md — SC3/DEBT-05 (doc): escrever o runbook de segurança do delete destrutivo (5 guard-rails) [autonomous]
- [ ] 17-04-PLAN.md — SC3/DEBT-05 (exec): humano executa o delete destrutivo da conta throwaway pelo runbook [human-executed, wave 2]

**Execution note**: operational / human-verify (`autonomous:false` style) — NÃO auto-executar sem o humano no loop; contém um passo destrutivo em produção.

## Progress

**Execution Order (v1.4):** 14 → 15 → 16 (strict dependency chain) ; 17 isolated (any time, separate from feature commits).

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
| 14. Key Storage + BYOK Settings | v1.4 | 5/5 | Code-complete (LOCAL-verified; PROD push deferred) | 2026-06-18 |
| 15. Classification Wire | v1.4 | 2/2 | Code-complete (LOCAL-verified; real-key smoke deferred) | 2026-06-18 |
| 16. Review-Grid Suggestion Affordances | v1.4 | 1/1 | Complete (LOCAL-verified + live in PROD) | 2026-06-18 |
| 17. v1.3 Debt Cleanup (ISOLATED) | v1.4 | 4/4 | Complete — SC1/SC2/SC4 + DATA-02 delete executed live | 2026-06-19 |

---
*Roadmap created: 2026-06-16 — v1.0 Coverage: 47/47 v1 requirements mapped.*
*Reorganized 2026-06-18 at v1.3 close — milestone-grouped lean index; full v1.0–v1.3 phase detail in `milestones/v{X.Y}-ROADMAP.md`.*
*v1.4 added 2026-06-18 — Phases 14–17, 17/17 v1.4 requirements mapped (BYOK-01..05 → P14 · CLSAI-01..06 → P15 · CLSAI-07/08 → P16 · DEBT-03..06 → P17). Dependency order key-storage → AI call → grid; debt isolated.*
