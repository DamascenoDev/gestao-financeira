---
phase: 05
plan: 02
subsystem: mei-actions-dashboard
tags: [mei, server-actions, idor, dashboard, rsc, year-selector, disclaimer, wave-2]
requires:
  - "05-01 substrate: mei_settings/mei_year_flags/mei_invoices tables + v_mei_year_summary security_invoker view"
  - "src/lib/mei/{rules,limit,status}.ts (the SOLE fiscal-number + math libs)"
  - "src/lib/ownership.ts assertOwnedMeiInvoice (IDOR re-derive)"
  - "src/actions/incomes.ts action shape (Zod→getClaims→parseBRLToCents→moneyWriteError→revalidatePath) + incomes.test.ts chainable mock"
  - "src/components/adherence-bar.tsx gauge pattern + month-selector.tsx selector shape + app-sidebar NAV_ITEMS"
provides:
  - "src/actions/mei.ts — 5 IDOR-checked Server Actions (createMeiInvoice/updateMeiInvoice/deleteMeiInvoice/upsertMeiSettings/upsertMeiYearFlag)"
  - "src/lib/schemas/mei.ts — meiInvoiceSchema/meiSettingsSchema/meiYearFlagSchema (shared form↔action)"
  - "src/lib/mei/presentation.ts — meiStatusTokens (MeiStatus → fill/text/label/glyph), the badge+gauge single source"
  - "src/components/{year-selector,mei-disclaimer,limite-gauge,limite-status-badge}.tsx"
  - "src/app/(app)/mei/{layout,page}.tsx — segment layout (disclaimer+YearSelector) + the dashboard RSC"
  - "MEI nav item in app-sidebar"
affects:
  - "Plan 05-03 (NF list + settings form + DASN report) consumes mei.ts actions, schemas/mei.ts, YearSelector, the /mei/{notas,configuracoes,relatorio} sub-routes the dashboard links to"
  - "Plan 05-04 (manual walkthrough) verifies the dashboard gauge/status/alert + disclaimer end-to-end"
tech-stack:
  added: []
  patterns:
    - "MEI status → UI-token mapper (presentation.ts) as the adherence.ts twin — single source of the verde/âmbar/vermelho wording + glyph"
    - "dashboard reads BOTH mei_settings (config gate) AND v_mei_year_summary (authoritative numbers) because the view JOINs invoices×settings and only yields a row when the year has NFs"
    - "configured-but-no-NFs derives the applicable limit from mei_start_date via limit.ts (gross 0, ratio 0) — never a wrong/zero/absent limit"
    - "never-hardcode grep gate extended to page.tsx (the teto/banda digits reworded out of the file comment, same fix as 05-01)"
key-files:
  created:
    - src/lib/schemas/mei.ts
    - src/actions/mei.ts
    - src/actions/mei.test.ts
    - src/lib/mei/presentation.ts
    - src/components/year-selector.tsx
    - src/components/mei-disclaimer.tsx
    - src/components/limite-gauge.tsx
    - src/components/limite-status-badge.tsx
    - src/app/(app)/mei/layout.tsx
    - src/app/(app)/mei/page.tsx
  modified:
    - src/components/app-sidebar.tsx
decisions:
  - "presentation.ts added as the MeiStatus→token mapper (adherence.ts twin) so the gauge and badge share ONE fill/text/label/glyph source — no duplicated mapping"
  - "the dashboard does TWO reads: mei_settings (the config gate → Configure-seu-MEI empty state) + v_mei_year_summary (authoritative gross/limit/ratio); configured-but-no-NFs computes the limit from mei_start_date via limit.ts"
  - "the global MonthSelector stays in the shell header for non-MEI routes (the MEI screens read ?ano via YearSelector and ignore ?mes) — accepted by the plan, avoids touching the shell"
  - "minimal /mei page stub committed in Task 2 (replaced by the dashboard in Task 3) so the layout segment is a complete route and Next typed-routes are valid"
metrics:
  duration: ~10m
  completed: 2026-06-17
  tasks: 3
  files_created: 10
  files_modified: 1
  commits: 3
  tests_added: 16
---

# Phase 5 Plan 02: MEI Actions + Dashboard Slice Summary

The first user-visible MEI slice end-to-end: 5 IDOR-checked Server Actions (NF CRUD + the single settings row + the per-year employee flag) mirroring incomes.ts, and the `/mei` dashboard RSC that reads `v_mei_year_summary` for the selected year and renders the receita-bruta hero, the COMPUTED applicable-limit line, the LimiteGauge (AdherenceBar pattern), the tiered status badge, and the 80%/100% alert — plus the MEI nav item, the segment layout with the always-visible disclaimer, and the YearSelector.

## What Was Built

### Task 1 — MEI Zod schemas + NF/settings Server Actions (commit b2c0e4e)
- `schemas/mei.ts`: `meiInvoiceSchema` (issuedOn YYYY-MM-DD, amount raw pt-BR string, tomador trimmed 1..120, descricao optional ≤240, activityType enum), `meiSettingsSchema` (meiStartDate), `meiYearFlagSchema` (year 2000..2100 coerced int, hasEmployee coerced bool). `MEI_ACTIVITY_TYPES` exported.
- `actions/mei.ts` (`'use server'`) mirrors incomes.ts EXACTLY: `firstIssue` + `idSchema` helpers, `parseBRLToCents`, `moneyWriteError` + `assertOwnedMeiInvoice` from ownership.ts, `createClient`. `createMeiInvoice` / `updateMeiInvoice(id, fd)` / `deleteMeiInvoice(id)` / `upsertMeiSettings` / `upsertMeiYearFlag(year, hasEmployee)`. Edit/delete validate the uuid then `assertOwnedMeiInvoice` BEFORE the `.eq('id', id)` write (T-05-05). `amount_cents` is GROSS (commented). `revalidatePath('/mei')` on success.
- `actions/mei.test.ts`: 16 unit tests on the chainable supabase mock (cloned from incomes.test.ts + an `ownershipSelectResult` for the re-derive select) — positive insert, money rejection, enum rejection, missing-tomador rejection, both activity buckets, non-uuid reject, owned update, **forged-id reject with NO update issued**, delete owned + forged-reject, settings upsert + bad-date reject, year-flag upsert + out-of-range reject, session gate.

### Task 2 — MEI nav + segment layout + YearSelector + MeiDisclaimer (commit 05329fe)
- `app-sidebar.tsx`: MEI nav item (`FileText`) after Reservas; the existing `startsWith('/mei/')` active logic covers sub-pages.
- `year-selector.tsx` ('use client'): mirrors MonthSelector — reads `?ano` (default `currentYear()`), ‹ › `router.replace` ±1, arrows `aria-label` "Ano anterior"/"Próximo ano", year mono/600.
- `mei-disclaimer.tsx`: full-width `--muted` rounded `role="note"` banner with the calm `Info` glyph (never destructive/teal), the MEI-06 key clause in `text-foreground` font-semibold + the second copy line, not dismissible.
- `app/(app)/mei/layout.tsx`: server segment layout rendering the YearSelector header + the MeiDisclaimer above `{children}` on every MEI screen; does NOT re-render the shell, does NOT render the global MonthSelector.

### Task 3 — MEI dashboard: LimiteGauge + status badge + alert (commit 50b5b92)
- `lib/mei/presentation.ts`: `meiStatusTokens` — the adherence.ts twin mapping `MeiStatus` → `{fill, text, label, glyph}` reusing the income/consumption/destructive tokens; the four labels (the single source of the status wording) + the four lucide glyph names. The 20%-band sub-distinction is label+glyph, never a second red.
- `limite-gauge.tsx`: reuses AdherenceBar verbatim — `h-2` `bg-muted` track + tiered fill clamped at 100% + an 80% threshold tick + a 100% limite marker; `role="progressbar"` + `aria-valuenow`(gross)/`min`(0)/`max`(limite cents) + `aria-valuetext`. The applicable limit is always passed in (no fiscal literal).
- `limite-status-badge.tsx`: `outline` badge rendering the status label + its glyph in the status `text` token — the single source of the verde/âmbar/vermelho(banda)/vermelho(fora) wording.
- `app/(app)/mei/page.tsx`: the dashboard RSC. Reads `mei_settings` (the config gate → "Configure seu MEI" empty state when absent) AND `v_mei_year_summary` for `?ano`. Renders the receita-bruta hero (28px mono, status-colored), the COMPUTED applicable-limit line (proportional copy in the opening year, "Limite anual {ano}" otherwise), the LimiteGauge + true %, the LimiteStatusBadge, the remaining-to-limit line under 100%, and the MEI-05 alert affordance (amber row ≥80%, within-band vs over-band consequence line ≥100%). Configured-but-no-NFs shows R$0,00/verde/0% + the "Registre sua primeira NF" hint. Quick links to Registrar NF / Relatório / Configurações.

## Verification Results

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run src/actions/mei.test.ts` — **16/16 GREEN** (insert, money/enum/tomador reject, IDOR-reject-no-write, settings/year-flag upsert + range reject, session gate).
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` — full suite **446 passed / 0 failed** (56 files; 430 prior + 16 new).
- `npx tsc --noEmit` — clean (the stale `.next/dev/types/validator.ts` that flagged `/mei` before the page existed was regenerated by the build).
- `npx next build` — **compiles `/mei`** (route listed: `ƒ /mei`).
- Never-hardcode grep gate `grep -rn "81000\|97200" src | grep -v rules.ts` — **returns nothing**; `grep -E "\b81000\b|\b97200\b" page.tsx` — **returns nothing**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] page.tsx comment tripped the never-hardcode grep gate**
- **Found during:** Task 3 (verify)
- **Issue:** The Task-3 verify's `! grep -qE "\b81000\b|\b97200\b" page.tsx` matched a bare `81000/97200` in the file's own header comment describing the gate (the same self-flag the 05-01 rules.test.ts hit).
- **Fix:** Reworded the comment to "the teto/banda digits" so the bare digits never appear in the file; the gate is clean.
- **Files modified:** src/app/(app)/mei/page.tsx
- **Commit:** 50b5b92

### Auto-added (beyond the literal file list)

**2. [Rule 2 - Cohesion] src/lib/mei/presentation.ts added as the status→token mapper**
- **Found during:** Task 3
- **Reason:** The gauge picks its fill "from the meiStatus result" and the badge is "the single source of the status wording" — both need the SAME `MeiStatus`→token mapping. Following the established adherence.ts/AdherenceBar split, the mapping lives in one pure lib (presentation.ts) instead of being duplicated in the two components. No fiscal literal, no new dep; pure presentation tokens.
- **Files created:** src/lib/mei/presentation.ts
- **Commit:** 50b5b92

## Known Stubs

The dashboard links to `/mei/notas`, `/mei/relatorio`, and `/mei/configuracoes` — sub-routes built in Plan 05-03 (the "Configurar MEI" empty-state CTA targets `/mei/configuracoes`). These are intentional forward links, not data stubs: the dashboard itself is fully wired to real data (mei_settings + v_mei_year_summary). The actions (`createMeiInvoice` etc.) are exercised by tests now and wired to the NF/settings forms in 05-03 per the plan. No empty-data-to-UI stubs.

## Requirements Progress

- **MEI-02 (limite aplicável + tiered status):** Complete — dashboard reads `v_mei_year_summary`, renders the COMPUTED applicable limit + the verde/âmbar/vermelho-banda/vermelho-fora status, never a hardcoded teto.
- **MEI-05 (80% alert):** Complete — the dashboard surfaces the amber alert row ≥80% and the within-band/over-band consequence line ≥100%; the dashboard IS the alert surface.
- **MEI-06 (disclaimer):** Complete — the MeiDisclaimer is rendered once in the `/mei` segment layout, visible (not a footer) on every MEI screen.
- **MEI-03 (activity_type split + employee flag):** Partial — the `activity_type` enum is enforced per NF in `createMeiInvoice`/`updateMeiInvoice` and `has_employee` per year in `upsertMeiYearFlag` (the action contract); the NF form + settings UI that drive them land in 05-03.
- **MEI-01 (NF model + IDOR):** Action contract shipped + IDOR-checked + unit-tested; the NF list/form UI completes in 05-03.

## Threat Flags

None. The actions and the dashboard read path map exactly onto the plan's threat register (T-05-05 IDOR re-derive, T-05-06 money parse, T-05-07 RLS+security_invoker view read, T-05-08 disclaimer, T-05-04 no-hardcoded-limit) — no new network endpoint, auth path, or trust-boundary surface introduced.

## Self-Check: PASSED

- All 10 created files + 1 modified file exist on disk.
- Commits b2c0e4e, 05329fe, 50b5b92 present in `git log`.
- Full suite 446 GREEN; tsc + build clean; grep gate clean; `/mei` compiles.
