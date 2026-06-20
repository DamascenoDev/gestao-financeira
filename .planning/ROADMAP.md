# Roadmap: Gestão Financeira Pessoal

**Created:** 2026-06-16
**Mode:** mvp (vertical slices — each phase delivers an end-to-end user-visible capability)
**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente (memória que aprende com cada confirmação) junto com a aderência às metas.

> Full per-phase detail for shipped milestones lives in `.planning/milestones/v{X.Y}-ROADMAP.md`. This file is the lean milestone-grouped index. Continuous phase numbering (never restart at 01).

## Milestones

- 🟡 **v1.0 MVP** — Phases 1–6 (core ledger + upload/IA-seam + MEI + hardening) — code-complete local; deployed + live-verified via Phase 12 (v1.3)
- ✅ **v1.1 Identidade visual** — Phase 7 (re-skin navy+gold + dark mode + charts + mobile) — shipped 2026-06-17
- ✅ **v1.2 Carro** — Phases 8–11 (módulo de veículo) — shipped 2026-06-18 (`milestones/v1.2-*`)
- ✅ **v1.3 Produção & PDF** — Phases 12–13 (app no ar + core value live memory-only + PDF de fatura) — shipped 2026-06-18 (`milestones/v1.3-*`)
- ✅ **v1.4 IA de Classificação (BYOK)** — Phases 14–17 (wire IA no seam `suggestCategory()` + BYOK Settings + dívida v1.3) — shipped 2026-06-19 (`milestones/v1.4-*`)
- ✅ **v1.5 Classificação determinística** — Phases 18–20 (pipeline memória→palavra-chave→IA + prompt da IA kind-aware + Marketplace em PROD) — shipped 2026-06-20 (`milestones/v1.5-*`; close com MKT-01 live human-verify diferido)

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

- [x] Phase 18: AI classifica compras corretamente — 1/2 plans — completed 2026-06-19 (CLSAI-09 kind-aware prompt + anti-allocation gate; `0035` Marketplace em PROD. **18-02 MKT-01 live human-verify diferido**)
- [x] Phase 19: Cadastro de palavras-chave por categoria — 2/2 plans — completed 2026-06-19 (KW-01/KW-06; `category_keywords` migration `0036` RLS-scoped + actions + `CategoryKeywordsDialog`)
- [x] Phase 20: Auto-classificação por palavra-chave no upload — 2/2 plans — completed 2026-06-19 (KW-02/03/04/05; pipeline memória→palavra-chave→IA, maior-keyword-vence, sobrescrevível, aprende no confirm)

Full detail: `milestones/v1.5-ROADMAP.md`. Audit: `milestones/v1.5-MILESTONE-AUDIT.md` (close `gaps_found` — MKT-01 live human-verify diferido, 7/8 requisitos; ver STATE.md Deferred Items).

</details>

## Progress

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
| 18. AI classifica compras corretamente | v1.5 | 1/2 | Complete (MKT-01 live human-verify diferido) | 2026-06-19 |
| 19. Cadastro de palavras-chave por categoria | v1.5 | 2/2 | Complete | 2026-06-19 |
| 20. Auto-classificação por palavra-chave no upload | v1.5 | 2/2 | Complete | 2026-06-19 |

---
*Roadmap created: 2026-06-16 — v1.0 Coverage: 47/47 v1 requirements mapped.*
*Reorganized 2026-06-18 at v1.3 close — milestone-grouped lean index; full v1.0–v1.3 phase detail in `milestones/v{X.Y}-ROADMAP.md`.*
*v1.4 shipped + collapsed 2026-06-19 — Phases 14–17, 17/17 v1.4 requirements. Full detail in `milestones/v1.4-ROADMAP.md`.*
*v1.5 shipped + collapsed 2026-06-20 — Phases 18–20, 7/8 v1.5 requirements satisfeitos (MKT-01 live human-verify diferido). Full detail in `milestones/v1.5-ROADMAP.md`. Próximo milestone via `/gsd-new-milestone`.*
