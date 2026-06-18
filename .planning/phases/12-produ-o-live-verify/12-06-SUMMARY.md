---
phase: 12-produ-o-live-verify
plan: 06
status: complete
requirements_completed: [MEI-01, MEI-02, MEI-03, MEI-04, MEI-05, MEI-06]
verified: live (production *.vercel.app, Chrome DevTools MCP, 2026-06-18)
production_url: https://gestao-financeira-ebon-mu.vercel.app/
---

# 12-06 — MEI module live-verify — APPROVED

Sequenced the deferred walkthrough `05-04` against the production bundle (post gap-closure redeploy).
All eight checks driven live in production via Chrome DevTools MCP.

## Verified (live, production)

- **MEI-03 — config:** `/mei/configuracoes` saved a start date **01/04/2026** (non-January) + "Tinha
  funcionário em 2026?" ON. Date field renders dd/mm/aaaa (G-06).
- **MEI-02/03 — proportional limit:** `/mei` shows **"Limite proporcional 2026 · R$ 60.750,00 — 9 meses
  a partir de abril/2026"** (9/12 × 81.000), NOT a bare R$ 81.000. Empty gauge verde 0%.
- **MEI-01 — NF CRUD + activity split:** registered NF Serviços R$30.000 + NF Comércio/Indústria
  R$20.000; both list with the correct Atividade badge, green + value, and "Receita bruta no ano
  R$ 50.000,00". The "Tipo de atividade" Select renders the label (G-01 OK here too).
- **MEI-02/05 — gauge + status + 80% alert:** at R$50.000 the gauge reads **82,3%**, status
  "Aproximando do limite", and the amber alert row **"Você atingiu 82,3% do seu limite de 2026…"**
  appears; "Faltam R$ 10.750,00".
- **MEI-05 — delete updates totals:** deleting the Comércio NF dropped "Receita bruta no ano" to
  R$ 30.000,00 (persisted; gauge reacts — proven 0%→82,3% on add and back down on delete).
- **MEI-04 — DASN-SIMEI report:** `/mei/relatorio` shows Receita bruta total = R$ 50.000,00, split
  Comércio R$ 20.000,00 + Serviços R$ 30.000,00 (sums to total), **Empregado: Sim**, deadline
  **"31 de maio de 2027"**; "Exportar CSV" + "Imprimir" present. (The downloaded `dasn-2026.csv` content —
  BOM/`;`/pt-BR — was not opened here; CSV format is covered by the 05-04 source-phase tests and is a
  user spot-check.)
- **MEI-06 — disclaimer:** "Este módulo é informativo e não constitui consultoria fiscal." visible above
  content on all four MEI screens (/mei, /mei/notas, /mei/configuracoes, /mei/relatorio), neutral tone.
- **Year isolation:** switching the YearSelector to 2025 shows Receita R$ 0,00 / "Nenhuma receita
  registrada em 2025" / Empregado "Não" / deadline "31 de maio de 2026" — 2026 NFs do not bleed in.

**Verdict:** MEI-01..06 confirmed live in production. 12-06 APPROVED.
