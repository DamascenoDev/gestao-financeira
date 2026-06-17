# Plan 04-04 Summary — Verificação humana (gate + walkthrough)

**Phase:** 4 — Upload + classificação por memória (AI deferred)
**Plan:** 04 (checkpoint, autonomous: false)
**Completed:** 2026-06-16
**Status:** Automated gate PASSED; human browser walkthrough DEFERRED (milestone-wide defer-browser decision)

## Task 1 — Automated full-suite gate ✅
- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run`: **380 passed | 0 todo** (47 files)
- `npx tsc --noEmit`: clean
- `npm run build`: success (`/importar`, `/importar/[statementId]` compile)

## Task 2 — Human-only browser walkthrough ⏸ DEFERRED
The five visual/interaction confirmations require a real browser (`npm run dev` against the local stack) and real file uploads. Deferred to the user (same pattern as prior phases):

1. **Upload (IMP-01)** — drop an OFX/CSV; confirm progress bar + landing on the review screen.
2. **CSV column-mapping (IMP-02)** — upload a non-standard CSV; map data/descritor/valor; confirm preview + that the profile reuses next time.
3. **Review + classify + confirm (IMP-05/CLS-03)** — classify amber (memory-miss) rows, bulk-classify via SelectionActionBar, Confirmar.
4. **Learn → auto-classify (CLS-04)** — re-upload a statement with the same merchants; confirm they're now auto-classified by memory.
5. **"0 novas" (IMP-04)** — re-upload a byte-identical file; confirm the summary shows "0 novas".

**How to run when ready:**
```
supabase start   # if stopped
npm run dev      # http://localhost:3000 → Importar
```
Synthetic OFX/CSV fixtures live in `tests/fixtures/`; the user should also try real (anonymised) bank exports to validate the parser against actual layouts.

The full ingest→dedup→memory-classify→learn→aporte→point-in-time→recurring→IDOR pipeline is automated and GREEN; the deferred items are browser-interaction confirmations only.

## Requirements
IMP-01..05, CLS-01/03/04/05/06, RSV-06, SEC-03 → implemented + automated-tested in 04-01/02/03; browser confirmation pending. **CLS-02 (LLM suggestion) remains Deferred** — the pluggable seam ships (returns null), the live LLM call is post-v1.

## Notable
- Supply chain kept tight: only `papaparse` added; **no `ofx-data-extractor`, no AI SDK** — in-house OFX parser.
- `ownership.ts` extracted as a shared module so the IDOR/reserva-aporte logic is reused by both `transactions.ts` and `import.ts` (no cross-sibling drift) — the Phase 2-3 lesson applied.
