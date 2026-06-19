---
phase: 12-produ-o-live-verify
plan: 07
status: human_needed
requirements_completed: [SEC-01]
requirements_pending_human: [DATA-01, DATA-02]
verified: live (production *.vercel.app, Chrome DevTools MCP, 2026-06-18)
production_url: https://gestao-financeira-ebon-mu.vercel.app/
---

# 12-07 — LGPD export/delete + secret gate live-verify — PARTIAL (human items remain)

Sequenced the deferred walkthrough `06-05` against the production bundle. The automatable + non-destructive
parts were verified live; the file-content inspection and the destructive delete are left as hands-on
user steps (by design — file downloads and a throwaway-account delete cannot be safely automated).

## Verified (live, production — by the agent)

- **SEC-01 — no secret in the served client bundle:** fetched and scanned all **24 same-origin JS chunks**
  the production page loads; **zero** occurrences of `sb_secret_` / `service_role` / `SUPABASE_SECRET`.
  The service-role secret used by the LGPD delete stays server-side. (Complements the 12-02 build-time
  `check-bundle-secrets.sh` gate — now confirmed on the actually-served bundle.)
- **DATA-02 delete — type-to-confirm GATE (mechanism, non-destructive):** on `/conta` the "Apagar conta"
  dialog shows the full consequences list, initial focus is on **Cancelar**, and the "Apagar conta" button
  is **disabled** while the input is empty AND while a lowercase "apagar" is typed — it **enables only on
  the exact "APAGAR"**. Verified without confirming; the dialog was dismissed by navigating away (the
  personal account was NOT deleted).
- **Affordances present:** `/conta` exposes "Baixar meus dados" (LGPD bundle), "Exportar transações em CSV"
  (month-scoped), and "Apagar conta". The transactions CSV button is also on `/extrato`.

## Pending — HUMAN hands-on (close these to finish the plan)

- **DATA-01 — transactions CSV content:** click "Exportar transações (CSV)" on `/extrato` AND `/conta`,
  open `transacoes-{yyyy-MM}.csv` in a spreadsheet, confirm BOM (no mojibake), `;` columns, comma decimals,
  the Data/Descrição/Categoria/Tipo/Valor columns, and resolved category NAMES.
- **DATA-02 export — bundle JSON:** click "Baixar meus dados", open `meus-dados-{yyyy-MM-dd}.json`, confirm
  a `tables` object (receitas, transações, categorias, metas, reservas, MEI, padrões, statements metadata)
  + a `csv` section.
- **DATA-02 delete — EXECUTION on a THROWAWAY production account only:** sign up a fresh throwaway user,
  add a row, run the APAGAR delete, confirm "Apagando…" → sign-out to `/auth/login`, the throwaway account
  can no longer sign in, and the PERSONAL account still signs in with data intact (surgical).

**Verdict:** SEC-01 confirmed live; DATA-02 delete-confirm gate confirmed live. DATA-01 + DATA-02 download
content and the destructive delete remain as user hands-on steps. Flip this plan to `complete` once those
pass. This is the last plan of the D-07 walkthrough sequence; closing it closes Phase 12.
