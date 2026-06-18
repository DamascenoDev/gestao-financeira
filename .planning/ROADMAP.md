# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

> Full per-phase detail (plans, success criteria, dependencies, research flags) for shipped milestones lives in `.planning/milestones/v1.2-ROADMAP.md`. This file is the lean current index; the **active milestone (v1.3)** carries full phase detail below.

## Milestones

- 🟡 **v1.0 MVP** — Phases 1–6 (core ledger + upload/IA + MEI + hardening) — code-complete no stack local; deploy/verify remoto diferido
- ✅ **v1.1 Identidade visual** — Phase 7 (re-skin navy+gold + dark mode + charts + mobile) — complete 2026-06-17
- ✅ **v1.2 Carro** — Phases 8–11 (módulo de veículo: substrato + etiquetagem + abastecimento/consumo + detalhe) — code-complete 2026-06-18 (`milestones/v1.2-*`)
- 🟢 **v1.3 Produção & PDF** — Phases 12–13 (deploy ao vivo dos 6 walkthroughs diferidos + live-verify do core value + WR-02 + PDF de fatura) — ACTIVE

## Phases

<details>
<summary>🟡 v1.0 MVP (Phases 1–6) — code-complete local, deploy deferred</summary>

- [~] Phase 1: Fundação (auth, RLS, dinheiro, schema) — 3/4 plans (01-04 deploy/verify diferido)
- [~] Phase 2: Receitas, categorias e lançamentos manuais — 3/5 plans (02-05 human-verify/deploy diferido)
- [~] Phase 3: Metas, aderência e reservas — 5/6 plans (03-06 human-verify/deploy diferido)
- [~] Phase 4: Upload + classificação inteligente — 3/4 plans (04-04 human-verify/deploy diferido)
- [~] Phase 5: Módulo MEI / DASN-SIMEI — 3/4 plans (05-04 human-verify/deploy diferido)
- [~] Phase 6: Endurecimento (LGPD, isolamento, auditoria) — 1/5 plans (06-05 human-verify/deploy diferido)

All `autonomous:true` work shipped and verified on the local stack; each phase's remaining plan is the deferred `autonomous:false` remote-wiring + Vercel deploy + live-verify walkthrough (pending user credentials). **These six deferred plans are executed by Phase 12 below.**

</details>

<details>
<summary>✅ v1.1 Identidade visual (Phase 7) — SHIPPED 2026-06-17</summary>

- [x] Phase 7: Identidade visual e polimento — 7/7 plans — completed 2026-06-17

Note: `07-07-PLAN.md` is `autonomous:false` but is a LOCAL visual/UI human-verify (contraste navy+gold, dark mode, charts, mobile nav) — NOT remote-deploy wiring. It carries no v1.3 requirement and is not part of the Phase 12 deploy backlog.

</details>

<details>
<summary>✅ v1.2 Carro (Phases 8–11) — SHIPPED 2026-06-18</summary>

- [x] Phase 8: Substrato Carro + CRUD + navegação — 3/3 plans — completed 2026-06-17
- [x] Phase 9: Etiquetar gastos da fatura ao carro — 3/3 plans — completed 2026-06-17
- [x] Phase 10: Abastecimento híbrido + consumo — 3/3 plans — completed 2026-06-17
- [x] Phase 11: Detalhe do carro + gráfico de consumo — 4/4 plans — completed 2026-06-17

</details>

### 🟢 v1.3 Produção & PDF (Phases 12–13) — ACTIVE

**Overview:** Onze fases (v1.0/v1.1/v1.2) estão code-complete e verificadas no stack Supabase **local** — o app inteiro existe, com testes verdes, mas nunca subiu. Este milestone leva o app ao ar de verdade e prova o core value ao vivo, depois adiciona o upload de fatura em PDF (adiado do v1). O trabalho remoto NÃO é greenfield: são seis walkthroughs `autonomous:false` já escritos e diferidos (gated nas credenciais do usuário). A Fase 12 sequencia e executa esses planos existentes + corrige a dívida WR-02 (migration 0029, antes de migrar dados pra prod) + verifica o core value ao vivo. A Fase 13 traz o PDF como feature best-effort: spike contra amostras reais do Santander, build do extrator, e plug no pipeline de classificação/metas que já existe.

**Phase Numbering:** continuação sequencial — v1.2 terminou na Phase 11, então v1.3 começa na Phase 12. Integer phases (12, 13) = trabalho planejado; decimal phases (12.1, 12.2) = inserções urgentes (marked INSERTED), aparecem na ordem numérica entre os inteiros.

- [ ] **Phase 12: Produção & Live-Verify** — Sobe o app (Supabase pessoal + Vercel), corrige WR-02, e prova o core value ao vivo em produção
- [ ] **Phase 13: PDF de Fatura** — Upload de fatura em PDF (spike Santander → extrator → review grid → pipeline existente), best-effort com confirmação humana

## Phase Details

### Phase 12: Produção & Live-Verify

**Goal**: O app sai do stack local e fica no ar de verdade (Supabase pessoal remoto + Vercel produção), com o core value provado ao vivo no browser e a dívida WR-02 fechada antes de qualquer dado entrar em produção.
**Depends on**: Phase 11 (toda a base code-complete no stack local)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, DEBT-01, DEBT-02
**Gated on**: credenciais do usuário (Supabase pessoal: URL + keys + DB password/access token; Vercel: login/link; chave do provedor de IA / AI Gateway). Toda esta fase é credencial/interativa — `autonomous:false`.

**Executa os planos diferidos JÁ ESCRITOS — sequenciar e rodar por caminho, NÃO re-planejar o wiring remoto do zero:**

  - `.planning/phases/01-funda-o-auth-rls-dinheiro-schema/01-04-PLAN.md` — wire `.env.local` + Supabase remoto, `db push` das migrations, deploy do skeleton na Vercel, verify de auth no browser (DEPLOY-01/02/03)
  - `.planning/phases/02-receitas-categorias-e-lan-amentos-manuais/02-05-PLAN.md` — verify de receitas/lançamentos manuais ao vivo
  - `.planning/phases/03-metas-ader-ncia-e-reservas/03-06-PLAN.md` — verify do dashboard de aderência (mensal+anual) + sub-fluxo de reservas
  - `.planning/phases/04-upload-classifica-o-inteligente/04-04-PLAN.md` — verify de upload OFX/CSV → review → classificação memória/IA → aprendizado de padrão (núcleo de DEPLOY-04/05)
  - `.planning/phases/05-m-dulo-mei-dasn-simei/05-04-PLAN.md` — verify do módulo MEI (NF, limite anual, relatório DASN) ao vivo
  - `.planning/phases/06-endurecimento-lgpd-isolamento-auditoria/06-05-PLAN.md` — verify de export CSV/LGPD + delete + gate de segredos no bundle (isolamento de DEPLOY-03)
  - **`07-07-PLAN.md` NÃO entra:** é `autonomous:false` mas é verify VISUAL/UI contra o stack LOCAL (contraste, dark mode, charts, nav mobile) — não é wiring de deploy e não satisfaz nenhum requisito DEPLOY. Pode ser reconfirmado oportunamente depois que o app subir; não carrega requisito v1.3 nem bloqueia esta fase.

**DEBT-01 (WR-02 / migration 0029):** criar e aplicar a migration 0029 que corrige o edge same-odometer em `v_abastecimento_consumo`. Fazer ANTES do `db push` para o remoto (idealmente no mesmo passo de aplicação de migrations da execução do 01-04), pra produção já nascer com a view corrigida.
**DEBT-02 (doc hygiene):** chore trivial — adicionar `requirements_completed` (CAR-02/03/04) ao frontmatter dos SUMMARY das fases 9/10. Não é fase própria; é um chore dentro desta fase.
**Success Criteria** (what must be TRUE):

  1. Supabase pessoal remoto provisionado com migrations 0001-0029 aplicadas (inclui a 0029 do WR-02), RLS ativo em todas as tabelas, typed client sem drift
  2. App no ar na Vercel (produção) com env vars/secrets configurados e `maxDuration` nas rotas de parsing; URL alcançável mostra login → dashboard
  3. Usuário loga em produção com a conta pessoal, a sessão persiste entre refresh, e a RLS isola os dados (nenhum acesso cross-user)
  4. Usuário sobe uma fatura real (OFX/CSV) em produção, vê a classificação (memória + IA no caso novo, com confirmação) e a aderência às metas (mensal **e** anual) funcionando ao vivo — core value provado
  5. `v_abastecimento_consumo` em produção computa km/l e R$/km corretos no edge same-odometer (WR-02 fechado); SUMMARYs das fases 9/10 trazem `requirements_completed`

**Plans**: 5/11 plans executed

Plans:
**Wave 1**

- [x] 12-01-PLAN.md — migration 0029 (WR-02/DEBT-01) on the local stack + DEBT-02 doc hygiene (autonomous)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02-PLAN.md — ONE production deploy: remote Supabase (sa-east-1) db push 0001-0029 + Vercel (gru1) + live auth verify (executes 01-04; DEPLOY-01/02/03 + DEBT-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 12-03-PLAN.md — live-verify receitas/categorias/extrato in production (executes 02-05; INC-02/TXN-03/TXN-04)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 12-04-PLAN.md — live-verify metas/aderência (mensal + anual) + reservas in production (executes 03-06; BUD-02/RSV-01/02/05 + DEPLOY-05 goal half)

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 12-05-PLAN.md — core-value live-verify: upload → private Storage + server parse → memory-classify → learn → auto-classify (executes 04-04; DEPLOY-04 + DEPLOY-05 + IMP/CLS)

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 12-06-PLAN.md — live-verify MEI module end-to-end in production (executes 05-04; MEI-01..06)

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 12-07-PLAN.md — live-verify LGPD export + type-to-confirm delete + deployed-bundle secret gate (executes 06-05; DATA-01/02 + SEC-01)

**Gap closure** *(local code fixes for the 6 live-verify defects G-01..G-06; verified LOCALLY — vitest/tsc/build — then redeploy + re-run waves 4-7 against the clean bundle. D-08 superseded for this cycle.)*

**Wave 8**

- [x] 12-08-PLAN.md — G-01 (systemic): Select trigger renders the item LABEL not the raw value/`__none__` — items label-map at every value≠label call site + render test (gap_closure, autonomous)

**Wave 9**

- [x] 12-09-PLAN.md — G-02+G-03+G-04 dashboard adherence cluster: truncate long labels (no bar overlap), render zero-spend metas, calm under-teto reads "Dentro"; RED→GREEN unit tests on adherence.ts (gap_closure, autonomous; re-verifies BUD-02)

**Wave 10**

- [ ] 12-10-PLAN.md — G-05: delete affordance for receitas (confirmed Excluir → existing deleteOccurrence action; recurring-vs-avulsa copy) (gap_closure, autonomous; re-verifies INC-02)

**Wave 11** *(depends on 12-08 — shared edits to transacao-form/nf-form)*

- [ ] 12-11-PLAN.md — G-06: replace native `<input type=date>` with a pt-BR dd/mm/aaaa BrDateField (ISO storage kept) across all 6 forms + round-trip test (gap_closure, autonomous)

### Phase 13: PDF de Fatura

**Goal**: Usuário sobe fatura em PDF pela mesma UI de upload e, após revisar/confirmar no grid, as transações entram no mesmo pipeline de classificação e metas — best-effort, com confirmação humana obrigatória (nunca auto-commit de linha PDF).
**Depends on**: Phase 12 (precisa do Storage privado + pipeline de classificação rodando em produção; valida o PDF contra a infra real)
**Requirements**: PDF-01, PDF-02, PDF-03, PDF-04, PDF-05
**Spike-first**: validar `pdf-parse` v2 `getTable()` (primário) + `unpdf` (fallback de texto) contra as amostras REAIS do Santander em `fixtures/faturas-pdf/santander/` (gitignored — dado financeiro pessoal; Santander é o banco mais usado → alvo primário do spike) ANTES de comprometer o build. Stack já fixado em PROJECT.md/CLAUDE.md: route handler em runtime Node com `maxDuration`, parse do buffer baixado do Storage, review grid antes de persistir. Se um banco der PDF image-only, é problema de OCR (fora de escopo) → mensagem clara orientando CSV/OFX.
**Success Criteria** (what must be TRUE):

  1. Usuário sobe um PDF pela mesma UI de upload (junto de CSV/OFX) e o arquivo persiste no Storage privado por `user_id`
  2. O sistema extrai as linhas de transação do PDF Santander real (`getTable`, `unpdf` fallback) e normaliza pro shape canônico (data, descrição, valor em centavos inteiros)
  3. As transações extraídas aparecem no review grid editável **antes** de persistir; nenhuma linha de PDF é auto-commitada — usuário corrige/confirma primeiro
  4. PDF sem texto extraível (image-only/escaneado) mostra mensagem clara orientando CSV/OFX daquele banco; nunca produz resultado vazio silencioso
  5. Após confirmação no grid, as transações do PDF entram no mesmo pipeline de classificação (memória → IA no caso novo) e contam nas metas, idêntico a CSV/OFX

**Plans**: TBD
**UI hint**: yes

Plans:

- [ ] 13-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: … → 11 → 12 → 13. Decimal phases (e.g. 12.1) would insert between their surrounding integers.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fundação | v1.0 | 3/4 | Code-complete (01-04 executado na Phase 12) | - |
| 2. Receitas, categorias e lançamentos | v1.0 | 3/5 | Code-complete (02-05 executado na Phase 12) | - |
| 3. Metas, aderência e reservas | v1.0 | 5/6 | Code-complete (03-06 executado na Phase 12) | - |
| 4. Upload + classificação inteligente | v1.0 | 3/4 | Code-complete (04-04 executado na Phase 12) | - |
| 5. Módulo MEI / DASN-SIMEI | v1.0 | 3/4 | Code-complete (05-04 executado na Phase 12) | - |
| 6. Endurecimento | v1.0 | 1/5 | Code-complete (06-05 executado na Phase 12) | - |
| 7. Identidade visual e polimento | v1.1 | 7/7 | Complete | 2026-06-17 |
| 8. Substrato Carro + CRUD + navegação | v1.2 | 3/3 | Complete | 2026-06-17 |
| 9. Etiquetar gastos da fatura ao carro | v1.2 | 3/3 | Complete | 2026-06-17 |
| 10. Abastecimento híbrido + consumo | v1.2 | 3/3 | Complete | 2026-06-17 |
| 11. Detalhe do carro + gráfico de consumo | v1.2 | 4/4 | Complete | 2026-06-17 |
| 12. Produção & Live-Verify | v1.3 | 5/11 | In Progress|  |
| 13. PDF de Fatura | v1.3 | 0/TBD | Not started | - |

## Deferred (cross-milestone)

The v1.0 deploy track (six `autonomous:false` walkthroughs: **01-04, 02-05, 03-06, 04-04, 05-04, 06-05**) is no longer "parked" — it is the explicit scope of **Phase 12 (v1.3)**, which sequences and executes those existing plans in order against the user's real Supabase/Vercel credentials. `07-07-PLAN.md` (a LOCAL visual verify) remains outside the deploy backlog and carries no v1.3 requirement.

---
*Roadmap created: 2026-06-16 — v1.0 Coverage: 47/47 v1 requirements mapped*
*Reorganized 2026-06-18 at v1.2 close — milestone-grouped index; full v1.0–v1.2 phase detail archived in `milestones/v1.2-ROADMAP.md`.*
*v1.3 "Produção & PDF" added 2026-06-18 — Phases 12–13; Coverage: 12/12 v1.3 requirements mapped.*
