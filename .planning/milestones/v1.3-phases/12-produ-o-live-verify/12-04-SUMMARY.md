---
phase: 12-produ-o-live-verify
plan: 04
status: complete
requirements_completed: [BUD-02]
verified: live (production *.vercel.app, Chrome DevTools MCP, 2026-06-18)
production_url: https://gestao-financeira-ebon-mu.vercel.app/
---

# 12-04 — Metas/Aderência + Reservas (live-verify) — APPROVED

Sequenced the deferred walkthrough `03-06` against the production bundle (no re-deploy, D-08).
Verified live in production by the operator (browser-driven). Re-run AFTER the gap-closure
redeploy (12-08..12-11) and the migration 0030 `db push`, so the surface verified is the clean build.

## Verified (live, production)

- **BUD-02 — adherence, monthly + annual (DEPLOY-05 goal half):**
  - Set a TETO on Alimentação (30%) and an ALVO on Investimentos/Reserva; logged spend.
  - Dashboard adherence list renders direction-aware status: under-teto → **"Dentro"** (G-04 fix
    live), zero-spend teto (Transporte 10%) **now shows** R$0,00 / 0% / "Dentro" (G-03 fix live
    after migration 0030 `db push`), alocação line "Abaixo".
  - **Mensal** tab and **Anual (YTD)** tab both render: same category order + color logic; YTD label
    "Acumulado de 2026 (jan–junho)"; the % differs only because the YTD income denominator (R$11.822,
    2 income months) differs from the monthly (R$5.911) — internally consistent (BUD-03). Monthly+annual
    goal adherence proven live.
  - Long label "Alocação (investimentos + reserva)" truncates and no longer overlaps the bar (G-02 fix live).
- **RSV-02 — "Qual reserva?" sub-flow:** picking the "Reserva" category in Novo lançamento reveals the
  picker below the categoria select with helper "Este lançamento será registrado como aporte nesta
  reserva."; submitting an R$200 aporte to "Viagem" linked it to that reserva's ledger (saldo R$0 → R$200).
- **RSV-01/05 — progress bar only with alvo:** "Emergência" (alvo R$30.000) shows the bar (0,3%);
  "Viagem" (no alvo) shows NO bar even with a saldo.
- **RSV-05 — saída guard:** a saída of R$500 against a R$200 saldo was blocked with
  "A saída não pode ser maior que o saldo da reserva (R$ 200,00)."; a valid R$50 saída dropped the
  derived saldo to R$150,00 (persisted to the remote DB).

## Notes
- The Select label fix (G-01) is live here too — categoria shows the name, the reserva picker lists
  reservas by name (Emergência/Viagem), carro shows "Nenhum".
- No re-deploy occurred during the walkthrough (D-08 honored within the verify; the only deploys were
  the gap-closure redeploys, which superseded the original single-deploy contract per 12-VERIFICATION).

**Verdict:** BUD-02 + RSV-01/02/05 confirmed live in production. 12-04 APPROVED.
