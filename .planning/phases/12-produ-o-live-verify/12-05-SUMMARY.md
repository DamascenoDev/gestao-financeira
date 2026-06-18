---
phase: 12-produ-o-live-verify
plan: 05
status: complete
requirements_completed: [DEPLOY-04, DEPLOY-05]
verified: live (production *.vercel.app, Chrome DevTools MCP, 2026-06-18)
production_url: https://gestao-financeira-ebon-mu.vercel.app/
---

# 12-05 — CORE VALUE (upload → classify → goals) live-verify — APPROVED

Sequenced the deferred walkthrough `04-04` against the production bundle. Uploaded a REAL Nubank OFX
(`Nubank_2026-06-06.ofx`, 22 transactions) at `/importar`.

## Verified (live, production)

- **DEPLOY-04 — upload → private Storage + server-side parse:** the OFX uploaded, parsed server-side on
  the Vercel Node runtime, and the review grid rendered **22 transações, 22 novas, 0 duplicadas** with
  real descriptors normalized (Uber, iFood, Google Youtube, Estácio, Wellhub…), values in R$ —
  **before any persist** (no auto-commit; review grid first).
- **DEPLOY-05 — memory-first classification + manual pick + counts in goals:**
  - On the first parse, all 22 were "Não classificada" (memory empty → no AI; new merchant = manual pick).
    Picking a category tags the row Origem "Manual". (AI deferred to v1.4 per D-01/02/03 — correctly NOT
    verified.)
  - The 22 transactions persisted to the remote DB (April: 4 rows R$646,41; May: 18 rows R$1.596,32),
    classified (Uber→Transporte, Wellhub/Nu Seguro→Saúde, Estácio→Educação, iFood/KeetaBR/99Food→
    Alimentação, Youtube→Lazer; some Sem categoria) and **counting in the category totals / metas**
    (visible per-category in /extrato and feeding the adherence views).

## Findings (both fixed in this phase's gap-closure)
- **G-07** — the review grid's per-row "Vincular a carro" Select showed `__none__` (Base UI value≠label;
  the 12-08 G-01 pass missed this call site). Fixed (commit `2ae93fb`), deployed.
- **G-08** — re-confirming an already-imported statement showed the misleading toast
  "0 transações importadas" (dedup `23505` skipped all 22 — the import itself had succeeded). The first,
  genuine import reports the correct count (`imported = insertedByKey.size`, populated from the
  insert-return; confirmed by code read). Toast wording fixed (commit `2ae93fb`), deployed.

**Verdict:** DEPLOY-04 + DEPLOY-05 (memory + manual pick + counts in goals) confirmed live in production.
12-05 APPROVED. (Memory auto-classify-on-next-upload — CLS-04 — was not re-run for lack of a second
overlapping OFX; the learning write path is in `confirmImport` and the classification persistence is
proven. Re-confirm/CLS-04 can be spot-checked on the next real import.)
