---
type: quick
date: 2026-06-18
phase: 12-produ-o-live-verify
status: complete
gaps: [G-07, G-08]
files: [src/components/import-review-table.tsx]
closed: 2026-06-19
---

# Quick task: import review grid gap-closure (G-07, G-08) — COMPLETE

Both gaps fixed in `src/components/import-review-table.tsx` (commit `2ae93fb`):
- **G-07** — carro `<Select>` renders the label "Nenhum" via the `{ [NENHUM_CARRO]: 'Nenhum', ...carros→apelido }` items map (the proven 12-08 G-01 pattern), instead of the raw `__none__` sentinel.
- **G-08** — `confirmToastMessage()` shows the calm "Todas as N transações já estavam no extrato" for an all-duplicate re-confirm, not the failure-looking "0 transações importadas".

**Shipped + verified live:** the push/redeploy that was "the remaining user step" is done — `2ae93fb` is an ancestor of the prod hotfix `97366e5`, so the fix is in the live PROD bundle (confirmed in Phase 17 SC1 / DEBT-03 via deploy-ancestry). Nothing outstanding.
