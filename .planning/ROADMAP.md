# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

> Full per-phase detail (plans, success criteria, dependencies, research flags) for shipped milestones lives in `.planning/milestones/v1.2-ROADMAP.md`. This file is the lean current index.

## Milestones

- 🟡 **v1.0 MVP** — Phases 1–6 (core ledger + upload/IA + MEI + hardening) — code-complete no stack local; deploy/verify remoto diferido
- ✅ **v1.1 Identidade visual** — Phase 7 (re-skin navy+gold + dark mode + charts + mobile) — complete 2026-06-17
- ✅ **v1.2 Carro** — Phases 8–11 (módulo de veículo: substrato + etiquetagem + abastecimento/consumo + detalhe) — code-complete 2026-06-18 (`milestones/v1.2-*`)

## Phases

<details>
<summary>🟡 v1.0 MVP (Phases 1–6) — code-complete local, deploy deferred</summary>

- [~] Phase 1: Fundação (auth, RLS, dinheiro, schema) — 3/4 plans (01-04 deploy/verify diferido)
- [~] Phase 2: Receitas, categorias e lançamentos manuais — 3/5 plans (02-05 human-verify/deploy diferido)
- [~] Phase 3: Metas, aderência e reservas — 5/6 plans (03-06 human-verify/deploy diferido)
- [~] Phase 4: Upload + classificação inteligente — 3/4 plans (04-04 human-verify/deploy diferido)
- [~] Phase 5: Módulo MEI / DASN-SIMEI — 3/4 plans (05-04 human-verify/deploy diferido)
- [~] Phase 6: Endurecimento (LGPD, isolamento, auditoria) — 1/5 plans (06-05 human-verify/deploy diferido)

All `autonomous:true` work shipped and verified on the local stack; each phase's remaining plan is the deferred `autonomous:false` remote-wiring + Vercel deploy + live-verify walkthrough (pending user credentials).

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

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Fundação | v1.0 | 3/4 | Code-complete (deploy diferido) | - |
| 2. Receitas, categorias e lançamentos | v1.0 | 3/5 | Code-complete (deploy diferido) | - |
| 3. Metas, aderência e reservas | v1.0 | 5/6 | Code-complete (deploy diferido) | - |
| 4. Upload + classificação inteligente | v1.0 | 3/4 | Code-complete (deploy diferido) | - |
| 5. Módulo MEI / DASN-SIMEI | v1.0 | 3/4 | Code-complete (deploy diferido) | - |
| 6. Endurecimento | v1.0 | 1/5 | Code-complete (deploy diferido) | - |
| 7. Identidade visual e polimento | v1.1 | 7/7 | Complete | 2026-06-17 |
| 8. Substrato Carro + CRUD + navegação | v1.2 | 3/3 | Complete | 2026-06-17 |
| 9. Etiquetar gastos da fatura ao carro | v1.2 | 3/3 | Complete | 2026-06-17 |
| 10. Abastecimento híbrido + consumo | v1.2 | 3/3 | Complete | 2026-06-17 |
| 11. Detalhe do carro + gráfico de consumo | v1.2 | 4/4 | Complete | 2026-06-17 |

## Deferred (cross-milestone)

The v1.0 deploy track is parked as six `autonomous:false` walkthroughs (remote Supabase wiring + Vercel deploy + live browser verify), pending the user's credentials: **01-04, 02-05, 03-06, 04-04, 05-04, 06-05**. Run them in order when credentials are at hand; that is the natural "deploy & ship" milestone candidate.

---
*Roadmap created: 2026-06-16 — Coverage: 47/47 v1 requirements mapped*
*Reorganized 2026-06-18 at v1.2 close — milestone-grouped index; full v1.0–v1.2 phase detail archived in `milestones/v1.2-ROADMAP.md`.*
