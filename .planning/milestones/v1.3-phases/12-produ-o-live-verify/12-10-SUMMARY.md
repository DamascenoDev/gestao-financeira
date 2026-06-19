---
phase: 12-produ-o-live-verify
plan: 10
subsystem: ui
tags: [receitas, delete, alert-dialog, dropdown-menu, server-action, base-ui]

# Dependency graph
requires:
  - phase: 12-produ-o-live-verify
    provides: "deleteOccurrence server action (src/actions/incomes.ts) and EditOccurrenceDialog (INC-02 edit affordance)"
provides:
  - "ReceitaRowActions: a per-row Ações menu (Editar + confirmed Excluir) on /receitas"
  - "Confirmed delete affordance for income occurrences with recurring-vs-avulsa copy"
affects: [receitas re-verify, live-verify waves 4-7]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Row-actions DropdownMenu + AlertDialog confirm mirroring NfRowActions (canonical destructive-action pattern)"
    - "EditOccurrenceDialog made controllable (optional trigger + open/onOpenChange) so a host menu can open it"

key-files:
  created:
    - "src/components/receita-row-actions.test.tsx"
  modified:
    - "src/components/receita-form.tsx"
    - "src/app/(app)/receitas/page.tsx"

key-decisions:
  - "Reused the existing deleteOccurrence server action verbatim — no new action (the gap was UI-only)"
  - "Delete of a recurring occurrence is scoped to THIS month; confirm copy states the template is unaffected and the row may reappear on re-open (matches ensureMonthOccurrences materialize-on-read semantics)"
  - "Made EditOccurrenceDialog controllable rather than duplicating the edit dialog, so ReceitaRowActions hosts both Editar and Excluir from one menu"
  - "Used fireEvent (already installed) instead of adding @testing-library/user-event as a new dependency"

patterns-established:
  - "Receitas table row actions follow the NfRowActions grammar: ghost icon-sm trigger labelled 'Ações' → DropdownMenu with a normal Editar item + a destructive Excluir item → AlertDialog confirm running the delete in a useTransition + toast"

requirements-completed: [INC-02]

# Metrics
duration: 8 min
completed: 2026-06-18
status: complete
---

# Phase 12 Plan 10: Receitas Delete Affordance (G-05) Summary

**`/receitas` rows now expose an Ações menu (Editar + a destructive AlertDialog-confirmed Excluir) wired to the existing `deleteOccurrence` server action, with recurring-vs-avulsa confirm copy.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-18T10:39:00Z (approx)
- **Completed:** 2026-06-18T10:43:00Z (approx)
- **Tasks:** 2
- **Files modified:** 2 (+1 test created)

## Accomplishments
- Added `ReceitaRowActions` to `receita-form.tsx`, mirroring the canonical `NfRowActions` DropdownMenu + AlertDialog confirm pattern.
- Wired it into the receitas table "Ações" cell, replacing the lone `EditOccurrenceDialog` — each row now offers both Editar and a confirmed Excluir.
- Confirm copy branches on `templateId`: recorrente → "só neste mês, template não é alterado, pode voltar ao reabrir o mês"; avulsa → "Esta ação não pode ser desfeita."
- Made `EditOccurrenceDialog` controllable (optional `trigger`, optional `open`/`onOpenChange`) so the row menu hosts it without duplicating the dialog.

## Task Commits

1. **Task 1 (RED): failing test for ReceitaRowActions** - `e918b46` (test)
2. **Task 1 (GREEN): implement ReceitaRowActions** - `069ea80` (feat)
3. **Task 2: wire ReceitaRowActions into receitas Ações cell** - `02481b9` (feat)

_TDD task 1 produced a test commit then a feat commit; no refactor commit was needed._

## Files Created/Modified
- `src/components/receita-form.tsx` - Added `ReceitaRowActions` (Editar + confirmed Excluir → `deleteOccurrence`); made `EditOccurrenceDialog` controllable; added AlertDialog/DropdownMenu/MoreHorizontalIcon/deleteOccurrence imports.
- `src/app/(app)/receitas/page.tsx` - Ações cell now renders `<ReceitaRowActions>`; dropped the now-unused `Button` and `EditOccurrenceDialog` imports.
- `src/components/receita-row-actions.test.tsx` - New test: menu exposes Editar+Excluir, confirm copy branches on `templateId`, confirm calls `deleteOccurrence(occurrenceId)`.

## Recurring-vs-avulsa delete semantics implemented
- **Avulsa (`template_id === null`):** the occurrence is the only record — Excluir removes it outright. Copy: "Esta ação não pode ser desfeita."
- **Recorrente (`template_id !== null`):** the occurrence is a materialized instance of a template. `deleteOccurrence` removes ONLY that month's row; `ensureMonthOccurrences` (materialize-on-read) re-creates it when the month is re-opened. The template is untouched. Copy: "Isto remove a receita recorrente apenas em {mês}. O template não é alterado e a ocorrência pode voltar ao reabrir o mês." This makes the inherently month-scoped behaviour explicit so the user is not surprised by a re-materialized row.

## Decisions Made
- Reused `deleteOccurrence` verbatim (already implemented, RLS-scoped, `revalidatePath('/receitas')`) — no new server action.
- Made `EditOccurrenceDialog` controllable instead of building a second edit dialog inside `ReceitaRowActions`.
- Used `fireEvent` (already available via `@testing-library/react`) for the component test instead of adding `@testing-library/user-event` as a new dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test framework: used fireEvent instead of @testing-library/user-event**
- **Found during:** Task 1 (RED)
- **Issue:** The initial test imported `@testing-library/user-event`, which is not installed. Per the package-install exclusion in the deviation rules, a missing test helper must not be auto-installed.
- **Fix:** Rewrote the test to use `fireEvent` from `@testing-library/react` (already a dependency), matching the existing `nf-table.test.tsx` style.
- **Files modified:** src/components/receita-row-actions.test.tsx
- **Verification:** RED failed for the right reason (ReceitaRowActions undefined), then GREEN passed (4/4).
- **Committed in:** e918b46 (RED), 069ea80 (GREEN)

**2. [Rule 1 - Bug] Strict-TS null-safety in test confirm-button lookup**
- **Found during:** Task 1 (GREEN verify, `tsc --noEmit`)
- **Issue:** `confirmButtons[confirmButtons.length - 1]` is typed `HTMLElement | undefined` under strict TS, failing `fireEvent.click`.
- **Fix:** Used `.at(-1)` with an explicit undefined guard that throws.
- **Files modified:** src/components/receita-row-actions.test.tsx
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** 069ea80 (Task 1 GREEN commit)

**3. [Rule 3 - Blocking] Removed now-unused imports in receitas/page.tsx**
- **Found during:** Task 2
- **Issue:** Replacing `EditOccurrenceDialog` with `ReceitaRowActions` left `EditOccurrenceDialog` and `Button` imported but unused.
- **Fix:** Dropped both unused imports.
- **Files modified:** src/app/(app)/receitas/page.tsx
- **Verification:** `npx tsc --noEmit` clean; `npm run build` succeeds.
- **Committed in:** 02481b9 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All three were mechanical fixes to satisfy strict TS / the no-new-package rule. No scope change; the plan's contract (UI-only delete via existing action) was delivered exactly.

## Issues Encountered
None beyond the auto-fixed deviations above.

## Local Gate Results (acceptance, GREEN)

```
SUPABASE_DISABLE_TELEMETRY=1 npx vitest run
  Test Files  88 passed (88)
       Tests  749 passed (749)

npx tsc --noEmit
  (exit 0, no output)

npm run build
  ✓ Generating static pages using 11 workers (19/19)
  Route (app) ... /receitas (ƒ Dynamic) listed
  (exit 0)
```

## Known Stubs
None — the delete affordance is fully wired to the live `deleteOccurrence` action.

## Next Phase Readiness
- G-05 closed. `/receitas` now supports a confirmed delete; the receitas re-verify is unblocked.
- No production dependency; change is local-only until the next deploy.
- Remaining phase-12 gaps (G-01 Select label, G-02/03/04 dashboard adherence, G-06 pt-BR dates) are independent and tracked separately.

## Self-Check: PASSED
- `src/components/receita-form.tsx` exists, exports `ReceitaRowActions`, imports `deleteOccurrence` — confirmed via grep.
- `src/app/(app)/receitas/page.tsx` renders `<ReceitaRowActions>` in the Ações cell — confirmed via grep.
- `src/components/receita-row-actions.test.tsx` exists (4 tests, all passing).
- Commits e918b46, 069ea80, 02481b9 present in git history.

---
*Phase: 12-produ-o-live-verify*
*Completed: 2026-06-18*
