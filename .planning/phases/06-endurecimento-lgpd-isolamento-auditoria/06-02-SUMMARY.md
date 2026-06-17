---
phase: 06-endurecimento-lgpd-isolamento-auditoria
plan: 02
subsystem: ui
tags: [csv, data-01, lgpd, export, conta, nav, rsc, ptbr]

# Dependency graph
requires:
  - phase: 06-endurecimento-lgpd-isolamento-auditoria
    plan: 01
    provides: "src/lib/transactions/csv.ts (transactionsToCsv + TransactionCsvRow) — the pure pt-BR serializer this slice wires into a button"
  - phase: 05-mei-dasn
    provides: "src/components/export-csv-button.tsx — the ExportCsvButton Blob-download shape this mirrors exactly"
provides:
  - "src/components/export-transactions-button.tsx — ExportTransactionsButton: client outline button that serializes RLS-scoped rows via transactionsToCsv → transacoes-{yyyy-MM}.csv"
  - "src/app/(app)/conta/page.tsx — Privacidade e conta shell (h1 + subtitle + DataExportSection card) with the transactions CSV affordance; marked placeholders for the 06-03 LGPD bundle + delete zone"
  - "Conta nav item (lucide Shield, last) + UserMenu Privacidade e conta link"
affects: [06-03-lgpd-export-delete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ExportTransactionsButton reuses the Phase-5 ExportCsvButton shape verbatim (outline Button + Download glyph + Blob download + sonner toast), parameterized for transactions — no new component grammar"
    - "CSV rows assembled in the RSC (RLS-scoped) and passed to a client button that never fetches — the cross-user/secret surface stays structurally absent (T-06-07)"
    - "DB kind (string) narrowed to the CSV Tipo union (consumo/alocacao/null) at the RSC boundary via a local toCategoryKind helper"

key-files:
  created:
    - src/components/export-transactions-button.tsx
    - src/app/(app)/conta/page.tsx
  modified:
    - src/app/(app)/extrato/page.tsx
    - src/components/app-sidebar.tsx
    - src/components/user-menu.tsx

key-decisions:
  - "ExportTransactionsButton receives already-RLS-scoped rows (no fetch in the component) so RLS makes 'only my rows' structural (T-06-07 mitigation)"
  - "Added `kind` to the Extrato categories select so the CSV Tipo column resolves point-in-time; the rest of the page (filter/table/form) consumes a subset and was unaffected"
  - "The transactions CSV on Conta is scoped to the current ?mes, read the same way the Extrato does (createClient + monthBounds), so both surfaces agree"

patterns-established:
  - "Reuse-not-rebuild: a second CSV affordance (transactions) ships as a parameterized reuse of the single ExportCsvButton shape rather than a new button"

requirements-completed: [DATA-01]

# Metrics
duration: ~10min
completed: 2026-06-17
---

# Phase 6 Plan 02: DATA-01 CSV Export Slice + Conta Shell Summary

**ExportTransactionsButton (Phase-5 ExportCsvButton shape over transactionsToCsv) wired into the Extrato header + the new Privacidade e conta shell, plus the Conta nav item and UserMenu link — a real user can now download the current month's ledger as a pt-BR `transacoes-{yyyy-MM}.csv` (DATA-01).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-17T10:22:00Z (approx)
- **Completed:** 2026-06-17T10:32:13Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- **ExportTransactionsButton (DATA-01)** — a `'use client'` outline `Button` with the `Download` glyph and copy "Exportar transações (CSV)", accessible name "Exportar transações em CSV". On click it calls `transactionsToCsv(rows)` → `Blob([..], { type: 'text/csv;charset=utf-8;' })` → downloads `transacoes-{mes}.csv` → `toast.success('Transações exportadas.')`. It receives the already-RLS-scoped `rows` and the `mes` from the caller — it never fetches data and never formats money, so the secret/cross-user surface is structurally absent (T-06-07) and the serializer owns all pt-BR formatting + escaping (T-06-08). An empty period exports a valid header-only CSV (no crash, no hide).
- **Extrato header wiring** — the page now builds `csvRows: TransactionCsvRow[]` by joining each month transaction to its category (point-in-time `category_name`, `category_kind` narrowed from the DB `string`), and renders `<ExportTransactionsButton rows={csvRows} mes={mes} />` beside "Novo lançamento". `kind` was added to the categories select so Tipo resolves; the CSV reflects the current `?mes` window the Extrato shows.
- **Privacidade e conta shell** — `(app)/conta/page.tsx` is an RSC: h1 "Privacidade e conta" + `text-muted-foreground` subtitle, then a `--card` DataExportSection (title "Exportar meus dados", body + what's-included + faturas note per the UI-SPEC copy) carrying the transactions CSV button (scoped to the current `?mes`, read like the Extrato). Clearly-marked `TODO(06-03)` placeholders sit where the LGPD bundle button (Section A completion) and the AccountDeleteZone (Section B) land next.
- **Nav surface** — "Conta" (lucide `Shield`) is the last sidebar item, after MEI; the UserMenu gains a "Privacidade e conta" link (lucide `Shield`) above Sair with a separator, so the order is email · sep · Privacidade e conta · sep · Sair.

## Task Commits

1. **Task 1: ExportTransactionsButton + Extrato header wiring (DATA-01)** — `b41a1d0` (feat)
2. **Task 2: Conta route shell + nav entry + UserMenu link** — `59a4d00` (feat)

**Plan metadata:** final docs commit — see below.

## Files Created/Modified

- `src/components/export-transactions-button.tsx` — ExportTransactionsButton (mirrors ExportCsvButton; transactionsToCsv → transacoes-{mes}.csv)
- `src/app/(app)/conta/page.tsx` — Privacidade e conta shell + DataExportSection with the transactions CSV affordance + 06-03 placeholders
- `src/app/(app)/extrato/page.tsx` — csvRows assembly + ExportTransactionsButton in the header; `kind` added to the categories select
- `src/components/app-sidebar.tsx` — Conta nav item (Shield), last after MEI
- `src/components/user-menu.tsx` — "Privacidade e conta" link above Sair with a separator

## Decisions Made

- **Component receives RLS-scoped rows, never fetches** — the CSV button serializes only what the RSC already returned, making T-06-07 (cross-user disclosure) structurally impossible.
- **`kind` added to the Extrato categories select** — needed to resolve the CSV Tipo column point-in-time; downstream consumers (CategoryFilter, ExtratoTable, TransacaoForm) take a subset of the Pick and were unaffected.
- **Conta CSV scoped to the current `?mes`** — read identically to the Extrato (createClient + monthBounds), so the two surfaces never disagree on the exported window.

## Deviations from Plan

None — plan executed exactly as written. Both tasks used the inherited shapes (ExportCsvButton, RSC page shape, NAV_ITEMS, UserMenu dropdown) verbatim; no auto-fixes were required.

A note on scope: the plan's two tasks are `type="auto"` and define no component tests; adding tests is 06-04's domain (the constraint declares "06-04 owns tests/scripts; zero overlap"). Behavior is verified via `tsc --noEmit` clean + `npm run build` compiling `/extrato` and `/conta` + the full existing suite GREEN.

## Issues Encountered

`tests/view-leak.test.ts` failed once in a full-suite run because two parallel `supabase status` invocations contended for the CLI; it passes on a direct re-run (the local stack is up on `:55321`). Not a regression from this plan — no source under test changed there.

## Known Stubs

The Conta screen carries two intentional, clearly-marked `TODO(06-03)` placeholders: the LGPD bundle button (`ExportDataButton`, Section A completion) and the `AccountDeleteZone` (Section B). These are by design — this plan stands up the shell + the transactions CSV affordance; 06-03 fills the LGPD export/delete sections (per the plan objective and UI-SPEC §1). The transactions CSV affordance is fully wired and functional, so the plan's DATA-01 goal is met; the placeholders do not block it.

## Threat Flags

None — no security surface introduced beyond the plan's `<threat_model>`. The CSV button is pure client serialization of RLS-scoped rows (T-06-07 mitigated by no-fetch), odd descriptions are neutralized by the 06-01 `field()` escaper (T-06-08), and zero new packages were added (T-06-SC accepted).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run build` — compiles `/extrato` and `/conta` (16 routes generated).
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` — 551 passed | 7 skipped | 13 todo (view-leak transient, GREEN on re-run). No regressions.
- Transactions CSV: ExportTransactionsButton serializes the month's RLS-scoped rows via transactionsToCsv (resolved category name + Consumo/Alocação Tipo, pt-BR money, BOM + `;`), file `transacoes-{yyyy-MM}.csv`. Manual download UX verified in 06-05.
- "Conta" appears last in the sidebar; "Privacidade e conta" appears in the UserMenu.

## Self-Check: PASSED

- FOUND: src/components/export-transactions-button.tsx
- FOUND: src/app/(app)/conta/page.tsx
- FOUND (modified): src/app/(app)/extrato/page.tsx, src/components/app-sidebar.tsx, src/components/user-menu.tsx
- FOUND commit: b41a1d0 (Task 1)
- FOUND commit: 59a4d00 (Task 2)

---
*Phase: 06-endurecimento-lgpd-isolamento-auditoria*
*Completed: 2026-06-17*
