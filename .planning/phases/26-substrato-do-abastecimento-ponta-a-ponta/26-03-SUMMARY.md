---
phase: 26-substrato-do-abastecimento-ponta-a-ponta
plan: 03
subsystem: database
tags: [supabase, postgres, migration, handle_new_user, security-definer, categories, seed]

# Dependency graph
requires:
  - phase: 26-01
    provides: "RED Nyquist test tests/categorias-combustivel.test.ts (FUEL-01 SC1) that 0040 turns green"
  - phase: 26-02
    provides: "0039 schema migration (abastecimento parcelado) — 0040 numbers after it"
provides:
  - "Migration 0040 seeds the default 'Combustível' category (kind consumo, sort 4) for new + existing accounts"
  - "Re-seeded handle_new_user() with the 13-row category VALUES block (Combustível @ sort 4)"
  - "Idempotent backfill (where not exists name='Combustível') for existing accounts"
affects: [phase-28-apply-on-confirm, fuel-classification, abastecimento]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seed migration mirrors 0035 (Marketplace) 1:1 — re-seed handle_new_user() + idempotent backfill, no schema DDL → zero gen:types diff"

key-files:
  created:
    - supabase/migrations/0040_categorias_combustivel.sql
  modified: []

key-decisions:
  - "Insert-only backfill — existing categories NOT renumbered (parity with 0035); sort-4 tie with existing Saúde is a cosmetic display-order tie (categories.sort has no unique constraint)"
  - "Combustível slotted at sort 4 right after Transporte (D-06), shifting Saúde→Marketplace +1, Outros last (sort 13)"

patterns-established:
  - "Default-category seed pattern: copy handle_new_user() body verbatim from the prior seed migration, insert the new row in its sort slot, renumber the in-function VALUES block only, add idempotent where-not-exists backfill — keeps database.types.ts untouched"

requirements-completed: [FUEL-01]

# Metrics
duration: 2min
completed: 2026-06-21
status: complete
---

# Phase 26 Plan 03: Combustível default category seed (0040) Summary

**Migration 0040 seeds the default "Combustível" category (kind consumo, sort 4) into handle_new_user() for new signups and backfills existing accounts idempotently, mirroring 0035 with search_path pinned and zero gen:types diff.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-21T20:08:29Z
- **Completed:** 2026-06-21T20:09:17Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- Re-seeded `public.handle_new_user()` with a 13-row category VALUES block placing `Combustível` (consumo, sort 4, is_reserva false) right after Transporte, shifting Saúde→Marketplace +1 and keeping Outros last (sort 13).
- Added an idempotent backfill (`insert ... select ... where not exists (... name = 'Combustível')`) so existing accounts gain the category without a manual UI add and without duplicating on re-run.
- Preserved `security definer` + `set search_path = public` verbatim (search-path hijack mitigation T-26-07).
- Kept the file data + trigger-body only (no schema DDL) so database.types.ts is unaffected (T-26-08) — satisfies the Wave 0 no-types-diff contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write 0040_categorias_combustivel.sql — re-seed handle_new_user + idempotent backfill** - `2fcca8d` (feat)

**Plan metadata:** committed with SUMMARY/STATE/ROADMAP in final docs commit.

## Files Created/Modified
- `supabase/migrations/0040_categorias_combustivel.sql` - Seeds the default "Combustível" category: Part 1 re-seeds handle_new_user() with the 13-row VALUES block (Combustível @ sort 4); Part 2 idempotently backfills existing accounts.

## Decisions Made
- **Insert-only backfill, no renumber:** Existing accounts keep their current sort values; only the new Combustível row (sort 4) is inserted. The resulting sort-4 tie with an existing Saúde is a cosmetic display-order tie, not a correctness issue (categories.sort has no unique constraint). This matches 0035 exactly (RESEARCH A2).
- **Combustível at sort 4:** Placed directly after Transporte per D-06, with the in-function VALUES block renumbered so Outros stays last (sort 13).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. All three verification gates passed on the first run: `set search_path = public` present (SEARCH-PATH-PINNED), no schema DDL (NO-SCHEMA-DDL), 13-row VALUES block with Combustível at sort 4 kind consumo.

## User Setup Required
None - no external service configuration required. The migration applies via `supabase db push` / `npm run db:reset` (Plan 04 asserts the empty gen:types diff and turns `tests/categorias-combustivel.test.ts` green).

## Next Phase Readiness
- The "categoria default" half of FUEL-01 (SC1) is delivered. The apply-on-confirm half is Phase 28.
- Plan 04 (Wave 2, same phase) is responsible for applying 0040 locally, asserting the empty `src/types/database.types.ts` diff, and verifying the Wave 0 Nyquist test goes green.

## Self-Check: PASSED

- `supabase/migrations/0040_categorias_combustivel.sql` — FOUND
- Commit `2fcca8d` — FOUND in git log

---
*Phase: 26-substrato-do-abastecimento-ponta-a-ponta*
*Completed: 2026-06-21*
