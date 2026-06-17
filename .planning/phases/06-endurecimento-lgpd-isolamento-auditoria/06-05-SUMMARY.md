# Plan 06-05 Summary — Verificação humana (gate + walkthrough)

**Phase:** 6 — Endurecimento (LGPD, isolamento, auditoria) — FINAL phase
**Plan:** 05 (checkpoint, autonomous: false)
**Completed:** 2026-06-17
**Status:** Automated gate PASSED; human browser walkthrough DEFERRED (milestone-wide defer-browser decision). The delete walkthrough must only be run against a throwaway LOCAL user.

## Task 1 — Automated full-suite gate ✅
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run`: **574 passed / 0 todo / 0 failed** (66 files)
- `npx tsc --noEmit`: clean
- `npm run build`: success (17 routes)
- `scripts/check-bundle-secrets.sh` against real `.next/static`: service-role/secret **ABSENT** (clean)

## Task 2 — Human-only browser walkthrough ⏸ DEFERRED
Browser confirmations require `npm run dev` against the local stack. Deferred to the user. **⚠ Run the delete flow ONLY against a throwaway LOCAL user** — it is irreversible.

1. **Export CSV de transações (DATA-01)** — from Extrato/Conta, export the period; confirm pt-BR fields (BOM/;/comma, category name).
2. **Baixar meus dados (DATA-02)** — Conta → "Baixar meus dados"; confirm a JSON bundle with all 14 tables + embedded CSVs downloads.
3. **Apagar conta (DATA-02, DANGEROUS)** — Conta → danger zone; confirm the type-to-confirm "APAGAR" gate (confirm disabled until the phrase matches), the irreversibility warning, deletion, and sign-out. Use a throwaway local user.
4. **Disclaimer/consequences** — confirm the delete consequences are visible (not a tooltip).

**How to run when ready:**
```
supabase start   # if stopped
npm run dev      # http://localhost:3000 → Conta
```

All export/delete/isolation/audit logic is automated and GREEN; deferred items are browser-download confirmations only.

## Requirements
DATA-01, DATA-02, SEC-01 → all implemented + automated-tested in 06-01/02/03/04; browser confirmation pending.

## Notable — the SEC-01 proof (the phase's reason to exist)
- **Isolation matrix:** 4 verbs × all 14 user-owned tables (data-driven over `src/lib/data/owned-tables.ts`) — user B cannot SELECT/INSERT/UPDATE/DELETE any of user A's rows; + Storage 2-user isolation. This is the multi-user-ready proof that gates the future spouse-as-second-user (MUL-01, v2).
- **Service-role discipline:** the delete is the first use of the service-role key; it lives only in `import 'server-only'` `src/lib/supabase/admin.ts`, imported solely by `deleteMyAccount`, and the real-build secret audit proves it never reaches the client bundle.
- **Delete safety:** Storage-first then `auth.admin.deleteUser` (cascade across 14 tables); proven that deleting user A leaves user B fully intact.
