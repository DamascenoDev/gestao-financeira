---
phase: 08-substrato-carro-crud-navega-o
plan: 02
subsystem: server-actions
tags: [zod, supabase, rls, idor, ownership, server-actions, carros, typescript]

# Dependency graph
requires:
  - phase: 08-substrato-carro-crud-navega-o
    plan: 01
    provides: "carros table + transactions.carro_id + typed Database client (the tables/types these actions write against)"
  - phase: 05-mei
    provides: "actions/mei.ts + mei.test.ts grammar (Zod safeParse → getClaims → assertOwned re-derive → write → { ok } | { error }) cloned verbatim"
  - phase: 03-reservas
    provides: "reserva.ts schema + reservas.ts action + assertOwnedReserva ownership re-derive (the exactly-1-row IDOR pattern cloned for carros)"
provides:
  - "src/lib/schemas/carro.ts — carroSchema (apelido required; modelo/placa/ano/combustivel_padrao optional; combustivel enum Flex/Gasolina/Etanol/Diesel/GNV; ano bound 1900..currentYear+1) + CarroInput type"
  - "src/lib/ownership.ts +assertOwnedCarro — exactly-1-row RLS re-derive (the IDOR substrate for carro writes now + transactions.carro_id/abastecimentos FKs in Phase 9/10)"
  - "src/actions/carros.ts — createCarro / updateCarro / archiveCarro / unarchiveCarro server actions ({ ok } | { error }, never throw)"
  - "src/actions/carros.test.ts — action unit tests: Zod gate, session gate, IDOR no-write on forged id, result shape"
affects: [08-03-nav-crud-ui, 09-etiquetar-gastos-carro, 10-abastecimento-consumo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-action grammar cloned from actions/mei.ts: Zod safeParse → firstIssue → createClient → getClaims (sub gate) → assertOwned re-derive → write → revalidatePath → { ok } | { error }, never throws"
    - "Optional Zod fields mapped to null at the DB boundary via a shared carroWriteFields() helper (a carro with only an apelido stores null modelo/placa/ano/combustivel)"
    - "archive/unarchive share ONE private setArchived(id, boolean) so the id-guard + ownership re-derive + revalidate live in a single code path"

key-files:
  created:
    - "src/lib/schemas/carro.ts"
    - "src/actions/carros.ts"
    - "src/lib/schemas/carro.test.ts"
    - "src/actions/carros.test.ts"
  modified:
    - "src/lib/ownership.ts"

key-decisions:
  - "assertOwnedCarro lives in the shared src/lib/ownership.ts (not inline in carros.ts) so the Phase 9 transactions.carro_id FK write + Phase 10 abastecimentos.carro_id write consume ONE re-derive path — no cross-sibling drift (the same factoring as assertOwnedReserva/assertOwnedStatement/assertOwnedMeiInvoice)"
  - "ano validated as z.number().int().min(1900,'Ano inválido').max(currentYear+1,'Ano inválido').optional() — same friendly message both bounds; currentYear+1 allows next-model-year cars"
  - "DB errors mapped to friendly generic strings ('Não foi possível salvar/atualizar o carro.'); no moneyWriteError needed (carro has no money columns); raw DB details never returned"
  - "CAR-01 kept In progress (not Complete): this plan ships the validated/IDOR-safe server boundary; the /carros list + CRUD UI that completes CAR-01 lands in 08-03"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-06-17
---

# Phase 8 Plan 02: Carro Server Layer Summary

**The typed, validated, IDOR-safe Carro write boundary: `carroSchema` (apelido required + the four optional fields + the fixed combustivel enum), `assertOwnedCarro` (exactly-1-row RLS re-derive in the shared ownership module), and the four `createCarro`/`updateCarro`/`archiveCarro`/`unarchiveCarro` server actions — every write Zod-gated, session-gated, ownership-re-derived before touching a row, returning `{ ok } | { error }` without ever throwing — mirroring the proven reservas/MEI grammar exactly.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-17T16:01:15Z
- **Completed:** 2026-06-17T16:04:48Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `src/lib/schemas/carro.ts`: `carroSchema` with `apelido` required (`'Informe o apelido'`), `modelo`/`placa` optional free text, `ano` optional integer bounded 1900..currentYear+1 (`'Ano inválido'`), `combustivel_padrao` optional `z.enum(['Flex','Gasolina','Etanol','Diesel','GNV'])`; exported `CarroInput`.
- `src/lib/ownership.ts`: `assertOwnedCarro(supabase, id)` — verbatim clone of `assertOwnedReserva` retargeted to `from('carros').select('id').eq('id', id)` returning `data.length === 1`; doc-comment states FKs are not RLS-aware and this is the IDOR substrate for the Phase 9/10 carro_id FK writes.
- `src/actions/carros.ts` (`'use server'`): `createCarro` / `updateCarro` / `archiveCarro` / `unarchiveCarro`, each Zod safeParse → `getClaims()` sub gate → (writes) `assertOwnedCarro` re-derive → `.update(...).eq('id', id)` → `revalidatePath('/carros')`; `{ ok } | { error }`, never throws; DB errors mapped to friendly strings. `archiveCarro`/`unarchiveCarro` share one private `setArchived(id, boolean)`.
- Tests: `src/lib/schemas/carro.test.ts` (6 cases — required apelido, ano bound, combustivel enum, optionals) + `src/actions/carros.test.ts` (16 cases — happy-path insert/update/archive/unarchive, Zod gate with NO write, session gate, IDOR forged-id NO write, never-throw shape). All green.
- `npx tsc --noEmit` clean; full suite **632 passed / 76 files** (up from 610), no regressions.

## Task Commits

Each task followed the RED → GREEN TDD cycle:

1. **Task 1: Carro Zod schema + assertOwnedCarro** — `250139a` (test, RED) → `57e4fa0` (feat, GREEN)
2. **Task 2: carros server actions + unit tests** — `940f3e7` (test, RED) → `486d5a7` (feat, GREEN)

## Files Created/Modified
- `src/lib/schemas/carro.ts` (created) — `carroSchema` + `CarroInput`
- `src/lib/ownership.ts` (modified) — `+assertOwnedCarro` exactly-1-row re-derive
- `src/actions/carros.ts` (created) — the four server actions + shared `carroWriteFields`/`setArchived` helpers
- `src/lib/schemas/carro.test.ts` (created) — schema Zod boundary unit tests
- `src/actions/carros.test.ts` (created) — action-level unit tests (cloned from mei.test.ts harness)

## Decisions Made
- Followed the plan and the reservas/MEI grammar verbatim — no structural deviation. The schema unit test (`carro.test.ts`) covers the Task-1 `<behavior>` for the Zod gate; the `assertOwnedCarro` behavior (exactly-1-row → false on a forged/0-row id) is asserted through the IDOR no-write cases in `carros.test.ts` (it needs the RLS-active client mock that the action harness provides), satisfying the Task-1 ownership behavior end-to-end.
- DB-error mapping uses plain friendly strings (no `moneyWriteError`) because carros carry no money columns — the 23514 money-check branch is not reachable here.

## Threat Model Coverage
- **T-08-06 (IDOR / EoP):** `assertOwnedCarro` re-derives ownership before update/archive/unarchive; the forged-id tests assert `{ error: 'Carro inválido.' }` and NO update recorded. Mitigated.
- **T-08-07 (Tampering):** `carroSchema` at the boundary — empty apelido, out-of-range ano, and a bad combustivel all return `{ error }` with NO insert/update. Mitigated.
- **T-08-08 (Spoofing):** `user_id` derives from `getClaims().sub`; no session → `{ error: 'Sessão expirada.' }` with no write. Mitigated.
- **T-08-09 (DoS/leak):** DB errors mapped to generic strings; raw details never returned; actions never throw. Mitigated.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - this is a server-only plan; no UI/data-source stubs introduced.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration. (Local Supabase stack is up; remote push/deploy remains the standing deferred blocker 01-04, unrelated to this plan.)

## Next Phase Readiness
- CAR-01's write path is live: the validated, IDOR-safe server boundary the Plan 08-03 UI calls (`createCarro`/`updateCarro`/`archiveCarro`/`unarchiveCarro`) exists and is unit-tested.
- 08-03 (nav + CarroForm + CarroCard + `/carros` list + `/carros/[id]` detail) can wire these actions directly; CAR-01 completes when that list/CRUD UI ships.
- `assertOwnedCarro` is in place for Phase 9 (`transactions.carro_id` etiquetagem) and Phase 10 (`abastecimentos.carro_id`) FK writes.
- No blockers introduced.

## Self-Check: PASSED

---
*Phase: 08-substrato-carro-crud-navega-o*
*Completed: 2026-06-17*
