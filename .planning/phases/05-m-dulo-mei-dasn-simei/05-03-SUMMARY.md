---
phase: 05
plan: 03
subsystem: mei-nf-settings-report
tags: [mei, dasn, nf-crud, settings, report, csv-export, print, rsc, wave-3]
requires:
  - "05-02: actions/mei.ts (createMeiInvoice/updateMeiInvoice/deleteMeiInvoice/upsertMeiSettings/upsertMeiYearFlag), schemas/mei.ts (meiInvoiceSchema + MEI_ACTIVITY_TYPES + MeiActivityType), /mei segment layout (YearSelector + MeiDisclaimer)"
  - "05-01: src/lib/mei/csv.ts (meiReportToCsv + MeiReport), limit.ts (applicableLimitCents), rules.ts (DASN_DEADLINE, MEI_ANNUAL_LIMIT_CENTS); v_mei_year_summary security_invoker view"
  - "src/components/{money-input,amount-cell}.tsx + transacao-form/extrato-table/category-row-actions patterns; ui/{dialog,alert-dialog,dropdown-menu,select,switch,table,tooltip,empty,card,separator,field} vendored primitives"
  - "src/lib/month.ts (currentYear, yearBounds) + centsToEditableBRL/formatCents"
provides:
  - "src/components/atividade-badge.tsx — neutral DASN-split badge (Comércio/Indústria vs Serviços)"
  - "src/components/nf-form.tsx — NF create/edit dialog (RHF-shape manual state + zodResolver(meiInvoiceSchema)), activity_type select → createMeiInvoice/updateMeiInvoice"
  - "src/components/nf-table.tsx — dense NF list (AtividadeBadge + income AmountCell + gross year total footer + edit/delete via deleteMeiInvoice)"
  - "src/components/mei-settings-form.tsx — mei_start_date + per-year has_employee → upsertMeiSettings + upsertMeiYearFlag"
  - "src/components/dasn-report-view.tsx — print-friendly DASN card (total + split + employee + deadline + disclaimer in print header)"
  - "src/components/export-csv-button.tsx — meiReportToCsv Blob download (dasn-{ano}.csv) — the Phase-6 DATA-01 export pattern"
  - "src/components/print-button.tsx — window.print() affordance"
  - "src/lib/month.ts todaySP() — TZ-pinned 'today' form default"
  - "src/app/(app)/mei/{notas,configuracoes,relatorio}/page.tsx — the three MEI sub-route RSCs"
  - "@media print block (globals.css) — hides shell/nav/actions, report+disclaimer on white"
affects:
  - "Plan 05-04 (manual walkthrough) verifies NF CRUD + year total + dashboard gauge update + settings → proportional limit + DASN report split/employee + CSV download + disclaimer on every screen + print"
  - "Phase 6 DATA-01 reuses the ExportCsvButton Blob-download pattern over meiReportToCsv"
tech-stack:
  added: []
  patterns:
    - "controlled-NfForm-from-row-menu: the per-row dropdown drives an edit NfForm + a delete alert-dialog (category-row-actions twin), seeding the edit form via centsToEditableBRL"
    - "MeiReport assembled in the RSC from v_mei_year_summary (zero-filled when no view row) + mei_settings + mei_year_flags — a zero-revenue year still renders a valid DASN report (never blocked)"
    - "print via CSS @media print + data-print='hide' / data-print-root markers (no print library) — disclaimer rides in the report header so it survives print"
    - "never-hardcode grep gate extended to the report test (applicableLimitCents fixture imports MEI_ANNUAL_LIMIT_CENTS, same self-flag fix as 05-01/05-02)"
key-files:
  created:
    - src/components/atividade-badge.tsx
    - src/components/nf-form.tsx
    - src/components/nf-table.tsx
    - src/components/nf-table.test.tsx
    - src/components/mei-settings-form.tsx
    - src/components/mei-settings-form.test.tsx
    - src/components/dasn-report-view.tsx
    - src/components/export-csv-button.tsx
    - src/components/print-button.tsx
    - src/components/dasn-report-view.test.tsx
    - src/app/(app)/mei/notas/page.tsx
    - src/app/(app)/mei/configuracoes/page.tsx
    - src/app/(app)/mei/relatorio/page.tsx
  modified:
    - src/lib/month.ts
    - src/app/globals.css
    - src/app/(app)/layout.tsx
    - src/app/(app)/mei/layout.tsx
decisions:
  - "NfForm activity_type uses a Select (not a two-option switch) — matches the transacao-form categoria control and reads cleaner with two labelled options"
  - "per-row actions live in a NfRowActions sub-component (controlled NfForm edit + delete AlertDialog), mirroring category-row-actions — keeps NfTable a pure presentational table"
  - "the report RSC always assembles a MeiReport (zero-filled when the view has no row) so a zero-revenue or unconfigured MEI still renders + exports a valid DASN document — the DASN is obligatory even at zero revenue"
  - "print is pure CSS @media print (data-print markers), no library; the disclaimer is inside DasnReportView's header so it prints with the document (MEI-06)"
  - "todaySP() added to month.ts (the single TZ owner) rather than inlining formatInTimeZone in the NF page — the new-NF issued_on default never slips a day via UTC"
metrics:
  duration: ~25m
  completed: 2026-06-17
  tasks: 3
  files_created: 13
  files_modified: 4
  commits: 3
  tests_added: 9
---

# Phase 5 Plan 03: MEI NF + Settings + DASN Report Slice Summary

The MEI module's user-facing surfaces, assembled over the Plan-01 substrate and Plan-02 actions/layout with zero new actions, schema, or deps: NF register/edit/delete with the per-NF comércio/serviços split + a gross year total, the settings form (start date + per-year employee flag), and the DASN-SIMEI report (the exact declaration fields on screen + CSV export + print-friendly with the disclaimer carried into print). Closes MEI-01/03/04 and reinforces MEI-06.

## What Was Built

### Task 1 — NF form + list (commit ce306b1)
- `atividade-badge.tsx`: a neutral `outline` badge mapping `activity_type` → "Comércio/Indústria" / "Serviços" (grayscale chrome — activity is a classification, not a money signal).
- `nf-form.tsx` ('use client'): create/edit dialog mirroring transacao-form — fields issued_on (date input, default today SP), amount (MoneyInput), tomador, descrição, activity_type (Select of the two DASN buckets); client zod via `meiInvoiceSchema.safeParse` + server re-parse; create → `createMeiInvoice`, edit (seeded from a row) → `updateMeiInvoice(id, fd)`; toast "Nota fiscal salva". Controlled-open so a row menu can drive the edit dialog.
- `nf-table.tsx` ('use client'): dense table (extrato grammar) — Data (dd/MM) · Tomador (truncate+tooltip) · Descrição (truncate+tooltip) · Atividade (AtividadeBadge) · Valor (AmountCell, kind='income' → green `+`, NF value is gross money-in) · ações (NfRowActions: Editar → NfForm edit, Excluir → alert-dialog "Excluir nota fiscal / Esta ação não pode ser desfeita." → `deleteMeiInvoice`, toast "Nota fiscal excluída"); totais footer "Receita bruta no ano" = Σ gross (mono/600, right-aligned).
- `app/(app)/mei/notas/page.tsx` (RSC): reads `?ano` (default currentYear), selects mei_invoices between `yearBounds(ano)` ordered by issued_on desc (RLS-scoped); h1 "Notas fiscais" + "Registrar NF" CTA; passes rows to NfTable; empty ("Nenhuma nota em {ano}" + CTA) + inline error states. Rows already sorted server-side.
- `month.ts`: `todaySP()` (TZ-pinned 'today') for the form default.
- `nf-table.test.tsx`: AtividadeBadge labels + NfTable gross-total footer + per-row rendering (3 tests).

### Task 2 — MEI settings (commit 1b0b703)
- `mei-settings-form.tsx` ('use client'): single-column form — `mei_start_date` (date input, helper "Usamos esta data para calcular seu limite proporcional no primeiro ano.") → `upsertMeiSettings`, and "Tinha funcionário em {ano}?" (switch, default Não, helper "Campo exigido pela declaração DASN-SIMEI.") → `upsertMeiYearFlag(ano, hasEmployee)`; client zod on the start date; Save persists both → toast "Configurações salvas".
- `app/(app)/mei/configuracoes/page.tsx` (RSC): reads `?ano`, reads mei_settings + mei_year_flags(ano) (RLS-scoped, both may be null first-run), seeds the form; h1 "Configurações MEI"; first-run (empty start date + Não) + error states.
- `mei-settings-form.test.tsx`: per-year employee label + both helpers + start-date seeding + first-run empty (2 tests).

### Task 3 — DASN report + CSV + print (commit 6b2be36)
- `dasn-report-view.tsx`: print-friendly `--card` label/value grid with EXACTLY the DASN-SIMEI fields — cabeçalho "Ano-base {ano} · período jan–dez/{ano}" + "Prazo de entrega: {31 de maio de ano+1}." (deadline derived from `rules.ts` DASN_DEADLINE, not a literal); "Receita bruta total" hero; the split "Comércio, indústria e transporte" + "Prestação de serviços" (two figures summing to the total); "Empregado durante o ano-calendário: Sim/Não". `MeiDisclaimer` in the report header (survives print, MEI-06). No-config → an info row linking to Configurações; zero-revenue → renders with zeros + "Nenhuma receita registrada em {ano}." note.
- `export-csv-button.tsx` ('use client'): outline "Exportar CSV" → `meiReportToCsv(report)` → Blob download `dasn-{ano}.csv` (text/csv;charset=utf-8 with the serializer's BOM) → toast "Relatório exportado". The Phase-6 DATA-01 export pattern.
- `print-button.tsx` ('use client'): "Imprimir" → `window.print()`.
- `app/(app)/mei/relatorio/page.tsx` (RSC): reads `v_mei_year_summary` for `?ano` + mei_settings + mei_year_flags(ano) (RLS + security_invoker); assembles a `MeiReport` (zero-filled when the view has no row); h1 "Relatório DASN-SIMEI" + PrintButton; renders DasnReportView; error state inline. applicableLimit computed off mei_start_date via limit.ts when the view has no row.
- `globals.css`: `@media print` hides `[data-slot='sidebar']` + `[data-print='hide']` (header, YearSelector, action buttons), expands `[data-print-root]`, renders on white. `(app)/layout.tsx` header + `mei/layout.tsx` YearSelector row tagged `data-print="hide"`.
- `dasn-report-view.test.tsx`: exact DASN fields + deadline + disclaimer, split sums to total, zero-revenue renders, ExportCsvButton serializes a text/csv Blob on click (4 tests).

## Verification Results

- `npx tsc --noEmit` — clean.
- `npx next build` — compiles all four MEI routes (`ƒ /mei`, `ƒ /mei/configuracoes`, `ƒ /mei/notas`, `ƒ /mei/relatorio`).
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` — full suite **455 passed / 0 failed** (59 files; 446 prior + 9 new component tests).
- Task verify gates: `NF_SLICE_OK`, `SETTINGS_OK` (grep+file+tsc+build), `REPORT_OK` (`grep meiReportToCsv export-csv-button.tsx` + `grep "Receita bruta total" dasn-report-view.tsx` + `grep v_mei_year_summary relatorio/page.tsx`) — all pass.
- never-hardcode grep gate `grep -rn "81000\|97200" src | grep -v rules.ts` — **GREP_GATE_CLEAN** (the report-test fixture imports MEI_ANNUAL_LIMIT_CENTS).
- Local stack on :55321 left running for the 05-04 human-verify walkthrough.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] report-test fixture tripped the never-hardcode grep gate**
- **Found during:** Task 3 (full-suite + grep gate)
- **Issue:** `applicableLimitCents: 8100000` in dasn-report-view.test.tsx put the bare teto digits in source; the downstream grep gate excludes only `rules.ts`, so it would dirty the gate (the same self-flag class 05-01/05-02 fixed).
- **Fix:** Imported `MEI_ANNUAL_LIMIT_CENTS` from rules.ts and used it for the fixture so the bare digits never appear in source.
- **Files modified:** src/components/dasn-report-view.test.tsx
- **Commit:** 6b2be36

### Auto-added (beyond the literal file list)

**2. [Rule 2 - Cohesion] todaySP() added to month.ts**
- **Found during:** Task 1
- **Reason:** The NF form's issued_on default needs "today in America/Sao_Paulo"; there was no exported helper, only currentMonthKey/currentYear. Inlining `formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')` in the page would scatter TZ logic. Added `todaySP()` to the single month/TZ owner so the default never slips a day via UTC, consistent with the existing helpers. No new dep.
- **Files modified:** src/lib/month.ts
- **Commit:** ce306b1

**3. [Rule 2 - Cohesion] PrintButton + print stylesheet (the print affordance)**
- **Found during:** Task 3
- **Reason:** The UI-SPEC §4 requires a print affordance + a print-targeted layout that hides the shell/nav and keeps the disclaimer + report on white. Implemented as a small `print-button.tsx` (window.print) + a CSS `@media print` block + `data-print` markers (no print library, no new dep). The shared `(app)/layout.tsx` header and the MEI layout YearSelector row were tagged `data-print="hide"` (additive, no behavior change on screen).
- **Files created:** src/components/print-button.tsx
- **Files modified:** src/app/globals.css, src/app/(app)/layout.tsx, src/app/(app)/mei/layout.tsx
- **Commit:** 6b2be36

## Known Stubs

None. Every surface is wired to real data: /mei/notas reads mei_invoices and the forms call the live actions; /mei/configuracoes seeds + saves the real settings/flag; /mei/relatorio reads v_mei_year_summary and assembles a real MeiReport (zero-filled only when the year genuinely has no NFs — a valid DASN state, not a stub). The CSV export serializes the actual report row.

## Requirements Progress

- **MEI-01 (NF model + register):** Complete — NfForm registers/edits NFs via the actions (with IDOR re-derive on edit/delete) and NfTable lists the year's NFs with the gross total.
- **MEI-03 (activity split + employee flag):** Complete — the activity_type Select drives the per-NF comércio/serviços split; MeiSettingsForm sets the per-year has_employee flag.
- **MEI-04 (consolidated DASN report + CSV):** Complete — DasnReportView shows total + split (summing to total) + employee for the year and ExportCsvButton downloads the DASN CSV via meiReportToCsv.
- **MEI-06 (disclaimer):** Reinforced — the MeiDisclaimer (segment layout) is on all three new screens AND in the report's print header (so it survives print). Already marked Complete in 05-02; 05-03 carries it into the report/print view.

## Threat Flags

None. The new surfaces map exactly onto the plan's threat register: T-05-09 (year-scoped RLS reads of mei_invoices / v_mei_year_summary security_invoker), T-05-10 (edit/delete re-derive ownership via assertOwnedMeiInvoice in the actions), T-05-11 (CSV serializes only the caller's own RLS-scoped row), T-05-08 (disclaimer in the report print header). No new network endpoint, auth path, or trust-boundary surface introduced.

## Self-Check: PASSED

- All 13 created files + 4 modified files exist on disk.
- Commits ce306b1, 1b0b703, 6b2be36 present in `git log`.
- Full suite 455 GREEN; tsc + build clean (all 4 MEI routes compile); grep gate clean.
