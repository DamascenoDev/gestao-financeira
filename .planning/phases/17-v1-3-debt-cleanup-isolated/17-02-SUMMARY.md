---
phase: 17-v1-3-debt-cleanup-isolated
plan: 02
status: complete
requirements_completed: [DEBT-03, DEBT-04]
requirements_companion_confirmed: [DATA-01]
verified: live (production gestao-financeira-ebon-mu.vercel.app, Chrome DevTools MCP, authenticated session, 2026-06-18) + git deploy-ancestry
production_url: https://gestao-financeira-ebon-mu.vercel.app/
autonomous: false
driven_by: orchestrator (browser MCP) — non-destructive reads only; no writes to the personal account
---

# 17-02 — SC1 (G-07/G-08 live) + SC2 (MEI download content) — COMPLETE (non-destructive)

Orchestrator-driven live verification against the **authenticated** production session (the MCP
Chrome profile was already logged into the personal prod account). Every action here was a
**non-destructive read/export** — no `confirmImport`, no DB write, the destructive delete (SC3) was
NOT touched.

## SC1 / DEBT-03 — G-07/G-08 in the live PROD bundle ✅

**Confirmed via deploy-ancestry (git-proven):**
- `2ae93fb` ("fix(12): import review grid carro select label + all-duplicate toast" — G-07 + G-08,
  `import-review-table.tsx`) is an **ancestor of** `97366e5` ("fix(import): lazy-load pdf-parse … unbreak
  ALL uploads in prod (DOMMatrix)", 2026-06-18 22:29), which is an **ancestor of** `HEAD`.
- `97366e5` and `9c5d270` ("hotfix migration 0034 … to reach PROD") are explicit production redeploys
  made AFTER `2ae93fb`. A prod deploy at/after `97366e5` necessarily contains `2ae93fb`'s code.
- Live prod is serving (Vercel, `x-vercel-id: gru1::…`); uploads work in prod (the `97366e5` fix is live),
  which is only true if that deploy — and therefore `2ae93fb` — shipped.

**G-07/G-08 code signatures (for reference):** G-08 → `confirmToastMessage()` renders the calm
`Todas as N transações já estavam no extrato` for all-duplicate (NOT the failure-looking
`0 transações importadas`); G-07 → `NENHUM_CARRO` → label `'Nenhum'` map so the collapsed carro trigger
renders the label, not the raw `__none__` sentinel.

**Deliberately NOT done (safety):** the live-UI render of the G-08 toast was not separately triggered —
observing it requires clicking **Confirmar** on an import (a `confirmImport` write path) on the **personal
prod account**. Per the revised plan's Fix #2, that write risk is not worth taking when the code is already
git-provably live; the toast text is additionally covered by the 12-05 source-phase tests. **Fallback
(plan Fix #3):** had the fixes been observed absent from the live bundle, DEBT-03 would NOT be closed here
and a redeploy plan for `2ae93fb` would be required — not the case; deploy-ancestry holds.

DEBT-03 closed on deploy-ancestry evidence (the plan's accepted confirm-only path).

## SC2 / DEBT-04 — MEI DASN download content ✅ (definitive)

Navigated `/mei/relatorio` (real data: Receita bruta total R$ 30.000,00 — Serviços R$ 30.000,00,
Comércio R$ 0,00, Empregado Sim, prazo 31/05/2027, limite proporcional R$ 60.750,00). Clicked
**"Exportar CSV"** and captured the generated blob (export-only, no DB write):

- **filename:** `dasn-2026.csv` ✓
- **MIME:** `text/csv;charset=utf-8;`, 151 bytes
- **First bytes:** `EF BB BF 41 6E 6F 3B 52` → **UTF-8 BOM** (`EF BB BF`) ✓, then `Ano;` (`3B` = `;`)
- **`;` delimiter** ✓ — header `Ano;Receita bruta total;Comércio/Indústria;Serviços;Funcionário;Limite aplicável`
- **pt-BR formatting** ✓ — `2026;R$ 30.000,00;R$ 0,00;R$ 30.000,00;Sim;R$ 60.750,00` (`.`-thousands /
  `,`-decimals, accented headers), **CRLF** (`\r\n`) line endings (Excel-friendly)

This is precisely the residual 12-06 left open ("the downloaded `dasn-2026.csv` content — BOM/`;`/pt-BR —
was not opened here"). DEBT-04 closed with hard evidence.

## DATA-01 companion (12-07 LGPD-export residual) ✅ (structural)

Navigated `/conta`, clicked **"Baixar meus dados"** (NOT "Apagar conta"), captured the blob
**structurally only** (no raw personal values pulled into context):

- **type:** `application/json`, **size:** 169 109 bytes, **valid JSON** ✓
- **top-level shape:** `{ exportedAt: string, userId: string, tables: object(14 keys), csv: object(2 keys) }`

The LGPD export is complete, well-formed, and `userId`-scoped (matches the page copy: "cópia completa …
JSON + CSVs … receitas, transações, categorias, metas, reservas e movimentações, dados do MEI e padrões
de classificação"). Labeled a **DATA-01 companion** — not a DEBT-04 gating criterion (per plan Fix #1).

## Remaining

- **SC3 / DEBT-05 / DATA-02** — the destructive throwaway-account delete — is the only outstanding item,
  human-executed per `17-SC3-DELETE-RUNBOOK.md` (plan 17-04, Wave 2). Never agent-run.
