# Plan 03-06 Summary — Verificação humana (gate + walkthrough)

**Phase:** 3 — Metas, aderência e reservas
**Plan:** 06 (checkpoint, autonomous: false)
**Completed:** 2026-06-16
**Status:** Automated gate PASSED; human browser walkthrough DEFERRED (consistent with the milestone-wide defer-browser-verification decision)

## Task 1 — Automated full-suite gate ✅
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run`: **269/269 GREEN** (32 files)
- `npx tsc --noEmit`: clean
- `npm run build`: success (`/dashboard`, `/reservas`, `/reservas/[id]`, `/extrato` compile)

## Task 2 — Human-only browser walkthrough ⏸ DEFERRED
The three visual confirmations from 03-VALIDATION.md require a real browser (`npm run dev` against the local stack). Deferred to the user (same pattern as 01-04 / 02-05):

1. **Dashboard mensal/anual (BUD-02)** — set targets, log data; confirm direction-aware color (teto red-over / alvo green-at-target) and 80/100% alerts, and that mensal↔anual stay consistent.
2. **"Qual reserva?" sub-flow (RSV-02)** — log a transaction in the "Reserva" category; confirm the reserva picker appears inside the dialog and links the aporte.
3. **Reserva progress bar (RSV-01/05)** — create a reserva with and without alvo; confirm the bar shows only when alvo is set.

**How to run when ready:**
```
supabase start   # if stopped
npm run dev      # http://localhost:3000
```

The core math behind all three (direction-aware adherence, alocação grouping so an aporte counts as investment never consumption, derived reserva balance, saída-never-negative incl. concurrent, IDOR rejection) is fully automated and GREEN; the deferred items are browser-render confirmations only.

## Requirements
BUD-02, RSV-01, RSV-02, RSV-05 — implemented + automated-tested in 03-03/03-04/03-05; browser confirmation pending user walkthrough.

## Notable: a real bug caught by Wave-0 test-first
The concurrent-saída Wave-0 test (03-02) surfaced a genuine TOCTOU overdraw in `register_reserva_saida` (two concurrent saídas could drive saldo negative). Fixed via migration `0017` (`SELECT ... FOR UPDATE` row lock) before any slice shipped.
