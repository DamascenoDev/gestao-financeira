---
phase: 04-upload-classifica-o-inteligente
plan: 03
subsystem: import-confirm-learn
tags: [server-actions, idor, dedup, learn-on-confirm, point-in-time, recurring, reserva-aporte, react, tanstack, ui]

requires:
  - phase: 04-01
    provides: "merchant_patterns / v_recurring_descriptors / transactions ALTER schema, normalize, dedupe, lookupMemory, confirmImportRowSchema, the 5 RED integration tests"
  - phase: 04-02
    provides: "ingestStatement + statements.parsed_rows/summary jsonb (the pre-persist review payload this slice reads back)"
provides:
  - "confirmImport — persist point-in-time rows + learn merchant_patterns on confirm + reserva aporte via reused Phase-3 path + dedupe (per-row 23505-skip) + IDOR re-derive"
  - "src/lib/ownership.ts — shared assertOwnedCategories/Reserva/Statement + isReservaCategory + syncReservaLedgerForTransaction + moneyWriteError (consumed by transactions.ts AND import.ts, no cross-sibling drift)"
  - "ImportReviewTable (ExtratoTable sibling) + ImportSummaryHeader + OriginBadge + RecorrenteTag + inert SuggestionSlot"
  - "/importar/[statementId] review RSC reading parsed_rows + summary by statementId"
affects:
  - "Plan 04-04 (human-verify walkthrough) verifies the confirm→persist→learn→auto-classify loop + aporte + point-in-time + recurring + '0 novas' end-to-end"

tech-stack:
  added: []
  patterns:
    - "Shared ownership/IDOR + reserva-aporte helpers extracted to a PLAIN lib module (not 'use server') so both Server-Action siblings consume one consistent ledger path"
    - "ON CONFLICT DO NOTHING against a PARTIAL unique index = per-row INSERT swallowing 23505 (PostgREST .upsert({onConflict}) hits 42P10 on a partial index)"
    - "Learn-on-confirm: UPSERT merchant_patterns only for classified rows, only on human confirm (no poisoning); patterns keyed by category_id (point-in-time)"
    - "Review grid is a client-state ExtratoTable sibling — nothing persisted until Confirmar drives confirmImport"

key-files:
  created:
    - src/lib/ownership.ts
    - src/components/import-review-table.tsx
    - src/components/import-summary-header.tsx
    - src/components/origin-badge.tsx
    - src/components/recorrente-tag.tsx
    - src/components/suggestion-slot.tsx
    - src/app/(app)/importar/[statementId]/page.tsx
  modified:
    - src/actions/import.ts
    - src/actions/import.test.ts
    - src/actions/transactions.ts
    - tests/import-learn-on-confirm.test.ts
    - tests/import-point-in-time.test.ts
    - tests/import-recurring.test.ts
    - tests/import-reserva-aporte.test.ts
    - tests/import-idor.test.ts
    - tests/import-dedup.test.ts

decisions:
  - "Extracted the IDOR/reserva helpers to src/lib/ownership.ts (the plan's shared-module directive) so transactions.ts and import.ts share ONE ledger path — the Phase 2-3 lesson, no drift"
  - "confirmImport persists per-row INSERT swallowing 23505 instead of .upsert({onConflict}) — the dedupe index is PARTIAL (where dedupe_key is not null); PostgREST can't target it (42P10). Discovered via the dedup integration test (Rule 1)."
  - "merchant_patterns upsert sets last_used_at + re-points category/reserva on conflict; hit_count is not arithmetically incremented (supabase-js upsert can't do col = col + 1) — non-load-bearing in v1, no test depends on it"
  - "Integration tests assert the substrate DB operations confirmImport performs via the RLS-active userClient (the Server Action needs Next cookies) — the established Wave-0 pattern from 04-01/02"

metrics:
  duration: "~17 min"
  completed: 2026-06-16

requirements-completed: [IMP-05, CLS-03, CLS-04, CLS-05, CLS-06, RSV-06, SEC-03]
---

# Phase 4 Plan 03: Review + confirm + learn slice Summary

**The phase's core value made real: the user reviews parsed transactions in a dense pre-persist grid (an ExtratoTable sibling), classifies memory-miss rows inline or in bulk, and on Confirmar importação the rows persist to `transactions` with their point-in-time category, the merchant→category (and merchant→reserva) patterns are LEARNED — only for classified rows, only on human confirm — Reserva rows fire the aporte 'in' ledger entry via the reused Phase-3 path, and dedupe_key collapses overlaps; a forged FK rejects the whole write. After this slice, confirming an import auto-classifies the same merchant on the next upload (CLS-04).**

## Performance

- **Duration:** ~17 min
- **Tasks:** 2 (Task 1 TDD)
- **Files created:** 7 / modified: 9

## Accomplishments

- **`confirmImport`** (IMP-05 + CLS-03/04/05/06 + RSV-06 + SEC-03 seam): Zod-validates rows → getClaims → re-derives ownership of the statement_id + every category_id + every reserva_id BEFORE any FK write (a forged id rejects the WHOLE payload — IDOR T-04-02); persists each row with its **point-in-time** category_id (CLS-05), dedupe_key, classification_source, and is_recurring computed from `v_recurring_descriptors` (CLS-06); **learns** merchant_patterns ONLY for classified rows, ONLY here on human confirm (no poisoning — T-04-08); fires the **reserva aporte** 'in' ledger entry for is_reserva rows via the reused `syncReservaLedgerForTransaction` (RSV-06, no new ledger write — T-04-09); collapses overlaps via per-row insert swallowing the 23505 unique-violation (T-04-04). Returns `{ imported, duplicated }`.
- **`src/lib/ownership.ts`** — extracted `assertOwnedCategories`/`assertOwnedReserva` + new `assertOwnedStatement` + `isReservaCategory` + `syncReservaLedgerForTransaction` + `moneyWriteError` from `transactions.ts` into a shared plain module; **both** `transactions.ts` and `import.ts` now consume it (one consistent path, no cross-sibling drift — the verification's explicit requirement).
- **Review screen:** `ImportReviewTable` (ExtratoTable sibling — TanStack getRowId by dedupe_key, the same checkbox/select model, the same inline CategoryBadge Select cell, the same focused "Qual reserva?" ReservaPicker dialog) on **un-persisted** client-state rows; memory-miss rows show the `border-l-2 border-l-consumption` amber accent + "Não classificada" OriginBadge, dropping to `manual` on classify; bulk-classify reuses `SelectionActionBar` verbatim (label "Classificar", Reserva excluded); `Confirmar importação` → `confirmImport` → toast + route to `/extrato`, with the non-blocking K>0 "Importar sem classificar?" alert-dialog guard.
- **Badges/slot:** `OriginBadge` (memória/manual/não classificada/reserved-but-unrendered sugerida), `RecorrenteTag` (amber + tooltip), inert `aria-hidden` `SuggestionSlot` (reserves space so the column won't reflow when AI ships), `ImportSummaryHeader` (N/M/K/J + click-to-filter unclassified + "0 novas" re-upload line).
- **`/importar/[statementId]` RSC** reads `statements.parsed_rows` + `summary` jsonb by id (RLS-scoped, no re-parse), passes the user's categories (is_reserva flag) + reservas, and renders the calm-confirm / needs-attention / all-duplicates-empty / load-error states.
- **Flipped 6 `it.todo` integration markers to live GREEN** (learn-on-confirm, point-in-time, recurring, reserva-aporte, idor, **and** the dedup confirm-count) + **+8 confirmImport unit tests** (IDOR rejection of forged statement/category/reserva, learn-only-classified, no-learn-unclassified, dedupe skip, reserva aporte + merchant→reserva, recurring/point-in-time).

## Task Commits

1. **Task 1: confirmImport — persist + learn + reserva aporte + dedupe + IDOR** — `102e3fa` (feat; TDD test+impl)
2. **Task 2: review screen — ImportReviewTable + summary header + badges + slot** — `3a4212e` (feat)

**Plan metadata:** (this commit — docs)

## Decisions Made

- **Shared ownership module (`src/lib/ownership.ts`):** the plan offered `_ownership.ts` or `lib/ownership.ts`; chose the lib module because a PLAIN module (not `'use server'`) can freely export the sync `moneyWriteError` alongside the async re-derives, and both Server-Action siblings import it. `transactions.ts` was refactored to consume it with zero behavior change (all prior transaction/reserva tests stay GREEN).
- **Per-row insert + 23505-skip instead of `.upsert({onConflict})`:** see Deviations — the dedupe constraint is a partial unique index.
- **Integration tests assert the substrate via the RLS-active `userClient`:** the Server Action calls `createClient()` (Next cookies) which can't run in a vitest integration test against the local stack with a raw JWT; the established Wave-0 pattern (04-01/02) asserts the exact DB operations the action performs under the caller's RLS, which is what the IDOR/learn/aporte/dedupe/point-in-time guarantees actually rest on.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.upsert({ onConflict: 'user_id,dedupe_key' })` fails with 42P10 against the partial unique index**
- **Found during:** Task 1 (the dedup integration test against the live stack)
- **Issue:** The plan suggested `.upsert(rows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })` for the transaction-level dedupe. The `transactions_dedupe_uniq` index is a **partial** unique index (`where dedupe_key is not null`, migration 0020); PostgREST's ON CONFLICT inference cannot target a partial index and raises `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`. This would have broken `confirmImport` at runtime.
- **Fix:** Switched the persist to the plan's stated fallback — a per-row `INSERT(...).select().maybeSingle()` that **swallows the `23505` unique-violation**: a fresh dedupe_key inserts (counts into M novas), an already-present one is silently skipped (counts into J duplicadas). The dedup integration test asserts the per-row insert + 23505-skip mechanic against the live partial index.
- **Files modified:** src/actions/import.ts, src/actions/import.test.ts, tests/import-dedup.test.ts
- **Commit:** `102e3fa`

**2. [Rule 3 - Blocking] Test-fixture UUIDs failed Zod v4 strict uuid format**
- **Found during:** Task 1 (the confirmImport unit tests)
- **Issue:** Hardcoded test UUIDs like `22222222-2222-2222-2222-222222222222` have an invalid RFC-4122 variant nibble; Zod v4's `z.string().uuid()` (used by `confirmImportRowSchema.categoryId`) rejects them, so every confirmImport unit row failed parse before the logic under test ran.
- **Fix:** Switched the test constants to well-formed v4 UUIDs (version `4`, variant `8`). No production-code change — the schema is correctly strict.
- **Files modified:** src/actions/import.test.ts
- **Commit:** `102e3fa`

### Intentional plan interpretation

- **`merchant_patterns` `hit_count` is NOT arithmetically incremented** on conflict (supabase-js `.upsert` can't express `hit_count = hit_count + 1`). The upsert sets `last_used_at` + re-points category_id/reserva_id, which satisfies the learn/correction contract and every test; an arithmetic bump would need an RPC and is non-load-bearing in v1 (documented in-code).

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking) + 1 intentional interpretation.
**Impact on plan:** The dedupe-mechanic fix is the substantive one — it makes the dedupe path actually work against the partial index (the plan anticipated it as the "equivalent per-row insert" fallback). No scope change.

## Authentication Gates

None.

## Known Stubs

- `SuggestionSlot` renders inert (`aria-hidden` "—") in v1 because `suggestCategory()` returns null (CLS-02 deferred, inherited from 04-01/02 — the intentional deferred-AI seam, not a stub-to-fix). The slot + the reserved `sugerida` OriginBadge variant are built so AI is additive later. The `validateSuggestion` enum wrapper holds SEC-03 by construction.
- `ImportReviewTable` pre-confirm summary surfaces `novas == total` (parsed count) since duplicates are pre-marked at ingest and excluded from the grid; the authoritative M/J counts come from `confirmImport`'s `{ imported, duplicated }` return — by design (the grid is the candidate set; the server is the source of dedupe truth).

## Threat Flags

None — all FK writes (statement_id/category_id/reserva_id) are covered by the threat register's `mitigate` dispositions (T-04-02/04/08/09) and implemented as specified; no new trust-boundary surface introduced.

## Verification

- **Unit:** `src/actions/import.test.ts` — 24 passed (the 16 prior + 8 confirmImport: IDOR forged statement/category/reserva, learn-only-classified, no-learn-unclassified, dedupe skip, reserva aporte + merchant→reserva, recurring/point-in-time).
- **Integration (LOCAL stack):** the 5 named suites (learn-on-confirm, point-in-time, recurring, reserva-aporte, idor) + import-dedup — all `it.todo` flipped to live GREEN.
- **Full suite:** **380 passed | 0 todo** (47 files). `tsc --noEmit` clean. `eslint` clean on all new files (only the pre-existing `use-mobile.ts` error + the known `useReactTable` React-Compiler warning remain — both out of scope per the plan's `<done>`).
- **Build:** `npm run build` compiles `/importar/[statementId]` (dynamic route); `grep` confirms `SelectionActionBar` + `border-l-consumption` in `ImportReviewTable`.
- **Shared helpers:** `transactions.ts` + `import.ts` both import from `src/lib/ownership.ts` (no duplication/drift).

## Next Phase Readiness

- Plan 04-04 (human-verify, autonomous:false) can walk: OFX/CSV upload + drag, CSV mapping + profile reuse, inline + bulk classify + Reserva picker, Confirmar + the K>0 guard, the learn→auto-classify loop (CLS-04), point-in-time rename-safety (CLS-05), the recorrente flag (CLS-06), and "0 novas" re-upload.
- LOCAL stack left RUNNING (API 127.0.0.1:55321, migrations 0001-0024) for the Plan 04 walkthrough. No remote push, no new deps.

## Self-Check: PASSED

- All 7 created files verified present on disk (ownership lib, 5 components, the review RSC).
- Both task commits present in git log: `102e3fa`, `3a4212e`.

---
*Phase: 04-upload-classifica-o-inteligente*
*Completed: 2026-06-16*
