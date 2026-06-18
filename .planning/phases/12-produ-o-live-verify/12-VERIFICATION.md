---
phase: 12-produ-o-live-verify
status: gaps_found
verified_by: live-verify (Chrome DevTools MCP, production *.vercel.app)
date: 2026-06-18
production_url: https://gestao-financeira-ebon-mu.vercel.app/
next_action: "Run /gsd-plan-phase 12 --gaps to create fix plans, then execute, push (auto-redeploy), and resume waves 4-7 verification on the clean build."
---

# Phase 12 — Live-Verify Findings (gaps_found)

Verification of waves 3-4 against the production deploy (12-02 bundle) surfaced 6 defects.
Waves 2-3 PASSED (DEPLOY-01/02/03 live; INC-02/TXN-03/TXN-04 live). Wave 4 (12-04) FAILED on the
defects below — **not approved**. Waves 5-7 (12-05 core value, 12-06 MEI, 12-07 LGPD) were NOT yet
run because gap G-01 (Select) is systemic and would contaminate their selects/pickers.

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
