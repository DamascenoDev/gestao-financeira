---
phase: 12-produ-o-live-verify
plan: 11
subsystem: ui
tags: [date-input, pt-BR, masked-input, date-fns, forms, react]

# Dependency graph
requires:
  - phase: 12-08
    provides: Base UI Select `items` value→label map in transacao-form/nf-form (sequencing avoided a date-input edit collision)
provides:
  - BrDateField — shared controlled pt-BR dd/mm/aaaa date field with ISO yyyy-MM-dd storage contract
  - All six date entry forms (receita, transacao, saida, nf, abastecimento, mei-settings) now render dd/mm/aaaa instead of the browser's native MM/DD/YYYY
affects: [any future form with a date input — use BrDateField, never native HTML date input]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BrDateField: controlled masked text input (value=ISO, onChange=ISO) replacing native HTML date inputs app-wide; mirrors money-input.tsx forwardRef/cn/invalid pattern"
    - "Display/entry locale (dd/mm/aaaa) is decoupled from the persisted ISO yyyy-MM-dd storage contract — emit '' on incomplete/impossible input so parent ISO-shape validation still fires"

key-files:
  created:
    - src/components/br-date-field.tsx
    - src/components/br-date-field.test.tsx
  modified:
    - src/components/receita-form.tsx
    - src/components/transacao-form.tsx
    - src/components/saida-form.tsx
    - src/components/nf-form.tsx
    - src/components/abastecimento-form.tsx
    - src/components/mei-settings-form.tsx
    - src/components/mei-settings-form.test.tsx

key-decisions:
  - "Masked text input (inputMode=numeric) chosen over react-day-picker calendar — smaller, dependency-free, matches existing manual-typing UX"
  - "Reject impossible dates (e.g. 31/02) via date-fns parse + display round-trip check, not isValid alone (date-fns normalizes 31/02 → 03/03)"
  - "BrDateField emits '' (never a partial/wrong ISO) on incomplete/invalid entry so each form's existing /^\\d{4}-\\d{2}-\\d{2}$/ + monthKeyOf 'Data inválida' validation is untouched"

patterns-established:
  - "Never use native <input type=date>; use BrDateField for pt-BR dd/mm/aaaa entry with ISO storage"

requirements-completed: []

# Metrics
duration: 8 min
completed: 2026-06-18
status: complete
---

# Phase 12 Plan 11: pt-BR Date Field (G-06) Summary

**Shared `BrDateField` masked input renders/accepts dd/mm/aaaa while storing ISO yyyy-MM-dd, replacing every native date input across all six forms — fixes the en-US MM/DD/YYYY regression with zero storage/validation change.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-06-18
- **Tasks:** 2
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- `BrDateField` — a controlled pt-BR date field: `value`=ISO `yyyy-MM-dd` (or ''), `onChange` emits ISO (or '' while incomplete/impossible). Auto-masks digits to dd/mm/aaaa, rejects non-digits and impossible calendar dates (31/02), mirrors `money-input.tsx`'s forwardRef/`cn`/`invalid` pattern.
- RED→GREEN round-trip test (`br-date-field.test.tsx`, 7 cases): ISO→display, display→ISO, incomplete→'', impossible→'', auto-mask, aria-invalid.
- All six native `<input type="date">` swapped for `BrDateField` (receita, transacao, saida, nf, abastecimento, mei-settings). `grep -rn 'type="date"' src/` now returns nothing.
- ISO state shape, defaults (`${monthKey}-15`, `todaySP()`), server actions, and validation regex/`monthKeyOf` all unchanged — pure input-component swap.
- 12-08 Base UI Select `items` map in transacao-form/nf-form left intact (verified post-edit).

## Task Commits

1. **Task 1 (RED): failing dd/mm/aaaa↔ISO round-trip test** — `02cbe97` (test)
2. **Task 1 (GREEN): BrDateField implementation** — `0388a23` (feat)
3. **Task 2: swap 6 native date inputs for BrDateField** — `06d82ea` (feat)

## Files Created/Modified
- `src/components/br-date-field.tsx` — new shared pt-BR dd/mm/aaaa date field (ISO storage contract)
- `src/components/br-date-field.test.tsx` — RED→GREEN round-trip + invalid-input tests
- `src/components/receita-form.tsx` — occurredOn date field → BrDateField
- `src/components/transacao-form.tsx` — occurredOn date field → BrDateField (12-08 Select untouched)
- `src/components/saida-form.tsx` — occurredOn date field → BrDateField
- `src/components/nf-form.tsx` — issuedOn date field → BrDateField (12-08 Select untouched)
- `src/components/abastecimento-form.tsx` — data date field → BrDateField
- `src/components/mei-settings-form.tsx` — meiStartDate field → BrDateField; dropped now-unused Input import
- `src/components/mei-settings-form.test.tsx` — seed assertion updated to dd/mm/aaaa display (`01/04/2026`); stored value stays ISO

## Decisions Made
- Masked text input over a calendar/popover: smaller, dependency-free, matches the existing manual-typing UX (per root_cause).
- Impossible-date rejection uses date-fns `parse` + a display round-trip check because `isValid` alone passes 31/02 (date-fns normalizes it to 03/03).
- BrDateField never emits a malformed/partial ISO; it emits '' so the unchanged parent validation surfaces "Data inválida".

## Deviations from Plan

None - plan executed exactly as written.

The mei-settings-form.test.tsx update was not a deviation but in-scope: Task 2 changes that exact field, so its test (which pinned the old native-input raw-ISO display) was updated to assert the new dd/mm/aaaa display. The seeding behavior and ISO storage are preserved.

## Gate Results (LOCAL — all GREEN)

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` → **89 files / 756 tests passed** (incl. the dd/mm/aaaa ⇄ ISO round-trip test)
- `npx tsc --noEmit` → **clean**
- `npm run build` → **✓ Compiled successfully in 6.2s; 19/19 static pages generated**
- `grep -rn 'type="date"' src/` → **no matches**

## Issues Encountered
- mei-settings-form test initially failed (asserted raw ISO `2026-04-01`); updated to the new `01/04/2026` display. Resolved; suite GREEN.

## User Setup Required
None - no external service configuration required. No production dependency added.

## Next Phase Readiness
- G-06 closed locally. Ready to push (auto-redeploy) and re-verify date surfaces against the new bundle in the waves 4-7 live-verify pass.
- Future date fields should use BrDateField, never native HTML date inputs.

## Self-Check: PASSED
- `src/components/br-date-field.tsx` — FOUND
- `src/components/br-date-field.test.tsx` — FOUND
- Commits 02cbe97, 0388a23, 06d82ea — FOUND in git log
- `grep -rn 'type="date"' src/` — no matches (confirmed)

---
*Phase: 12-produ-o-live-verify*
*Completed: 2026-06-18*
