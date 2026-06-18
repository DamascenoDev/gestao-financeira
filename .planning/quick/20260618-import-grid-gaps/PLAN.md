---
type: quick
date: 2026-06-18
phase: 12-produ-o-live-verify
autonomous: true
status: complete
gaps: [G-07, G-08]
files: [src/components/import-review-table.tsx]
---

# Quick task: import review grid gap-closure (G-07, G-08)

Gap-closure fix for two live-verify findings in
`.planning/phases/12-produ-o-live-verify/12-VERIFICATION.md`. Both live in
`src/components/import-review-table.tsx`. Local acceptance only — push + redeploy
is the remaining user step.

## Tasks

1. **G-07** — `InlineReviewCarroCell` per-row "Vincular a carro" `<Select>` shows the raw
   `__none__` sentinel instead of "Nenhum". Give the Base UI `<Select>` Root an `items`
   value→label map (`{ [NENHUM_CARRO]: 'Nenhum', ...carros→apelido }`), the proven 12-08
   G-01 pattern from `carro-picker.tsx`. The 12-08 pass missed this call site. CategoryCell
   is left alone (already renders the label).

2. **G-08** — confirming an already-imported statement shows the misleading toast
   "0 transações importadas". Branch the confirm-success toast (presentation-only; do NOT
   touch `confirmImport`): `imported===0 && duplicated>0` → "Todas as {duplicated}
   transações já estavam no extrato"; `imported>0 && duplicated>0` → append "({d} já
   existiam)"; otherwise keep "{n} transação(ões) importada(s)". Extract into a pure
   exported `confirmToastMessage()` helper so it can be pinned.

## Gate (local, GREEN required)

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run`
- `npx tsc --noEmit`
- `npm run build`
