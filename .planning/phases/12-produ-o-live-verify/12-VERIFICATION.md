---
phase: 12-produ-o-live-verify
status: passed
verified_by: live-verify (Chrome DevTools MCP, production *.vercel.app)
date: 2026-06-18
resolved: 2026-06-19 — the 12-06 (MEI downloads) + 12-07 (LGPD export + destructive delete) residuals were completed live in Phase 17 (SC2 dasn CSV content; DATA-01 export; DATA-02 destructive delete executed). All Phase 12 human items now satisfied.
production_url: https://gestao-financeira-ebon-mu.vercel.app/
next_action: "RESOLVED via Phase 17. 12-06 MEI dasn CSV content (BOM/;/pt-BR) confirmed live; 12-07 LGPD DATA-01 export validated + DATA-02 destructive delete executed live 2026-06-19. Nothing outstanding."
gaps_resolved: "G-01..G-06 verified live in prod; G-07/G-08 fixed + deployed (tests green)."
---

# Phase 12 — Live-Verify Findings (gaps_found)

Verification of waves 3-4 against the production deploy surfaced 8 defects (G-01..G-08), now ALL
resolved. Current state (2026-06-18):
- **Waves 2-3 PASSED** (DEPLOY-01/02/03 live; INC-02/TXN-03/TXN-04 live) — 12-02/12-03 approved.
- **G-01..G-06 fixed** (gap plans 12-08..12-11 + migration 0030) and **re-verified live in prod**.
- **12-04 APPROVED** live after the fix (BUD-02 monthly+annual, RSV-01/02/05).
- **12-05 APPROVED** live — DEPLOY-04/05 core value proven (22-row Nubank OFX → parse → review → classify
  → counts in goals). Surfaced **G-07** (import-grid carro `__none__`) + **G-08** ("0 importadas" toast),
  both fixed + deployed (tests green).
- **Remaining (human-hands-on, not gaps):** 12-06 (MEI) and 12-07 (LGPD) browser walkthroughs — file
  downloads (CSV/JSON) and a throwaway-account destructive delete that must be run by the user. Once
  those pass, the phase closes.

> **D-08 supersession:** the "single deploy / no redeploy" contract held only until bugs were found.
> Closing these gaps requires a code change + a new production deploy; D-08 is intentionally superseded
> for the gap-closure cycle. After redeploy, waves 4-7 re-verify against the NEW bundle.

## Gaps

### G-01 — [HIGH, systemic] Select renders raw `value` instead of the item label
- **Observed (prod):** in `/extrato` → "Novo lançamento": picking a category shows the category UUID
  (`13ec1164-…`) in the trigger instead of "Alimentação"; the Carro select shows `__none__` instead of
  "Nenhum".
- **Root cause:** `src/components/ui/select.tsx:4` wraps **Base UI** (`@base-ui/react/select`). Base UI's
  `<Select.Value>` renders the selected `value` directly unless `Select.Root` is given an `items`
  value→label map (or `<Select.Value>` is given a render function). The shadcn-style wrapper passes only
  `placeholder`, so every `<Select>` whose `value` ≠ visible label shows the raw value.
- **Blast radius:** transacao-form categoria + carro (CarroPicker), and any other value≠label Select —
  reserva-picker, MEI selects, importação review grid. The inline extrato "Alterar categoria" combobox
  only looks correct because there `value == name`.
- **Fix target:** make the `ui/select.tsx` wrapper resolve labels — accept an `items` map and pass it to
  `Select.Root` (Base UI then auto-renders the label), or give `SelectValue` a render-prop that maps
  value→label; update call sites (`transacao-form.tsx`, `carro-picker.tsx`, meta/MEI/reserva selects).

### G-02 — [MED] Adherence row long label overlaps the progress bar
- **Observed (prod):** on `/dashboard` the "Alocação (investimentos + reserva)" adherence row label
  overflows and overlaps the `AdherenceBar`.
- **Root cause:** `src/components/adherence-row.tsx:84` grid `md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]`;
  the `CategoryBadge` in column 1 does not truncate, so a long name overflows into the bar column.
- **Fix target:** truncate the category label (`truncate` + `min-w-0`) in `adherence-row.tsx` /
  `category-badge.tsx`, or widen/clamp column 1.

### G-03 — REOPENED → fixed by migration 0030 (remote stale view)
- **Observed (prod):** a teto set on Transporte (10%) with no Transporte spend does NOT appear in the
  adherence list → looks like "meta não configurada" (the user's bug #1). Confirmed: setting an
  Alimentação teto DID appear once Alimentação had a R$50 gasto.
- **Root cause (CORRECTED):** the repo's `v_adherence_month`/`v_adherence_ytd` are ALREADY income-driven
  (0014 was created spend-driven in `bd768f0`, then revised income-driven in `fabc0a4`). The remote
  (pre-existing/legacy project, D-10) had 0014 applied at the OLD spend-driven state, so 12-02's
  `supabase db push` skipped re-running 0014 (already in remote migration history). Production therefore
  still serves the stale SPEND-DRIVEN view → a teto with zero spend produces no row. Local + repo are
  correct; only the remote view is stale.
- **Fix:** new migration `supabase/migrations/0030_adherence_views_refresh.sql` DROP+CREATEs both views
  with the current income-driven bodies (byte-for-byte from 0014, `security_invoker = true` preserved).
  A higher migration number is the only thing `db push` will apply to refresh the stale remote view.
  Verified: `supabase db reset` clean (0001..0030), `vitest run` 756/756 GREEN, `tsc --noEmit` clean.
- **Remaining action (user):** run `supabase db push` against the remote. DB-ONLY change — NO app
  redeploy needed.

### G-04 — [LOW] Status label "No limite" at 2,8% of a 30% teto is misleading
- **Observed (prod):** Alimentação at 2,8% of a 30% teto shows status "No limite" (suggests near the cap).
- **Fix target:** review the teto status thresholds/copy in `src/lib/adherence.ts` (`adherenceStatus`/
  `adherenceTokens`) so a well-under teto reads as a calm "Dentro"/"Abaixo", not "No limite".

### G-05 — [MED] No delete affordance for receitas
- **Observed (prod):** `/receitas` offers no way to delete an added income (the user's 12-03 finding).
- **Root cause:** delete not implemented — `src/app/(app)/receitas/page.tsx` and
  `src/components/receita-form.tsx` have no delete handler (grep: no matches).
- **Fix target:** add a delete affordance for income occurrences (with the same "só neste mês" vs
  template semantics as edit, where applicable) + the server action + confirm.

### G-06 — [MED] Dates render in US MM/DD/YYYY; require pt-BR dd/mm/aaaa system-wide
- **Observed (prod):** the native `<input type="date">` in forms renders MM/DD/YYYY (browser en-US locale).
  User requirement: all system dates in dd/mm/aaaa.
- **Note:** native `<input type=date>` display order follows the browser/OS locale and is not reliably
  forceable per-app via CSS. Table/label displays already render pt-BR (e.g. "15/06", "junho 2026").
- **Fix target:** replace the native date input with a pt-BR-formatted date field (masked input or the
  existing date-picker component formatted via date-fns/`Intl` `pt-BR`), and audit every date surface to
  confirm dd/mm/aaaa. Keep storage as ISO `yyyy-MM-dd`.

### G-07 — fixed (local, GREEN) — needs redeploy [MED] Import review grid carro select shows `__none__` (G-01 residual)
- **Observed (prod):** in `/importar/[id]` review grid, the per-row "Vincular a carro" column renders
  `__none__` instead of "Nenhum".
- **Root cause:** `src/components/import-review-table.tsx` → `InlineReviewCarroCell` (~line 705) uses
  `<SelectValue placeholder=…>` with NO Base UI `items` map, so the trigger shows the raw `NENHUM_CARRO`
  sentinel. The 12-08 G-01 fix covered transacao-form/carro-picker/reserva-picker/selection-action-bar/
  nf-form/category-delete-dialog but NOT this import-grid cell. (The grid's CategoryCell is fine — it
  renders the label correctly.)
- **Fix target:** give the `InlineReviewCarroCell` `<Select>` an `items` value→label map
  (`{ [NENHUM_CARRO]: 'Nenhum', ...carros→apelido }`) exactly like the 12-08 call sites.
- **Resolution (quick-task 20260618-import-grid-gaps, commit `2ae93fb`):** `items` map added to
  `InlineReviewCarroCell` `<Select>` — collapsed trigger now renders "Nenhum"/apelido, never the raw
  sentinel. Contract pinned by the existing `select-value-label.test.tsx` (identical Base UI fix).
  GREEN locally (`vitest` 761/761, `tsc --noEmit` clean, `npm run build` OK). **Needs redeploy.**

### G-08 — fixed (local, GREEN) — needs redeploy [MED] "0 transações importadas" toast on re-confirm of an already-imported statement
- **Observed (prod):** confirming an import whose rows are all already in the DB shows the toast
  "0 transações importadas", which reads like a failure. (The real import of 22 transactions succeeded;
  the user re-confirmed an already-imported statement → dedup `23505` skipped all 22 → imported=0.)
- **Root cause:** `import-review-table.tsx:380` always renders `${result.imported} … transações
  importadas`; when `imported === 0 && duplicated > 0` it produces "0 transações importadas". The
  result already carries `duplicated`.
- **Fix target:** branch the toast — when `imported === 0 && duplicated > 0`, show e.g. "Todas as
  {duplicated} transações já estavam no extrato" (reuse the page's existing all-duplicate copy tone);
  optionally surface duplicated count on partial imports. ALSO verify (defensive) that the first,
  genuine import reports the correct count (insertedByKey populated from the insert-return).
- **Resolution (quick-task 20260618-import-grid-gaps, commit `2ae93fb`):** confirm-success toast now
  branches via the pure exported `confirmToastMessage(imported, duplicated)` helper:
  `imported===0 && duplicated>0` → "Todas as {duplicated} transações já estavam no extrato"; partial →
  "{n} transações importadas ({d} já existiam)"; clean → unchanged "{n} transação(ões) importada(s)".
  `confirmImport` persist/dedup logic untouched (presentation-only). Pinned by
  `import-review-confirm-toast.test.tsx` (5 cases). **Defensive note:** the first genuine import
  reports correctly — `confirmImport` builds `imported = insertedByKey.size` from the per-row insert's
  RETURNING `dedupe_key` (only freshly-inserted rows populate the map; `23505` dedup-skips are excluded),
  so a clean 22-row import yields `imported=22, duplicated=0` → "22 transações importadas".
  GREEN locally (`vitest` 761/761, `tsc --noEmit` clean, `npm run build` OK). **Needs redeploy.**
