---
phase: 12-produ-o-live-verify
plan: 08
subsystem: ui
tags: [base-ui, select, react, typescript, gap-closure]

requires:
  - phase: 12-produ-o-live-verify
    provides: G-01 root-cause analysis (Select trigger renders raw value, not label)
provides:
  - Every value≠label <Select> renders its human label in the collapsed trigger
  - CarroPicker / SelectionActionBar carro Select show "Nenhum", never the __none__ sentinel
  - Render test pinning the Select value→label trigger contract
affects: [live-verify-waves-4-7, extrato, receitas, dashboard, mei, importacao]

tech-stack:
  added: []
  patterns:
    - "Base UI value≠label Selects must carry an items value→label map (Record<string,string>) so Select.Value auto-renders the label"

key-files:
  created:
    - src/components/select-value-label.test.tsx
  modified:
    - src/components/carro-picker.tsx
    - src/components/reserva-picker.tsx
    - src/components/transacao-form.tsx
    - src/components/selection-action-bar.tsx
    - src/components/nf-form.tsx
    - src/components/category-delete-dialog.tsx

key-decisions:
  - "Fixed per-call-site with Base UI's items map (root-cause mechanism 1) — ui/select.tsx left UNCHANGED, since Root already forwards items"
  - "Label maps derived from the same array the SelectItems iterate (single source) — no duplicated label literals"

patterns-established:
  - "value≠label Select: pass items={Object.fromEntries(arr.map(x => [x.value, x.label])) as Record<string,string>}"

requirements-completed: []

duration: ~6min
completed: 2026-06-18
status: complete
---

# Phase 12 Plan 08: Select value→label trigger fix (G-01) Summary

**Every value≠label `<Select>` now renders the human label in its collapsed trigger (category name, carro apelido, "Nenhum", activity label) instead of the raw UUID / `__none__` sentinel, via Base UI `items` maps at all six broken call sites.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 6 + 1 test created

## Accomplishments
- Closed G-01 (systemic, HIGH) — the highest-risk defect contaminating receitas/lançamentos, dashboard, MEI and importação surfaces.
- Added a Base UI `items` value→label map at all six value≠label call sites; Base UI's `<Select.Value>` now auto-renders the label.
- New render test pins the trigger-display contract (apelido shown, `__none__` never leaks as visible text).
- `ui/select.tsx` left untouched — the fix is purely per-call-site.

## Task Commits

1. **Task 1: RED — render test proving a value≠label Select shows the label** - `ad8ebc4` (test)
2. **Task 2: GREEN — items label-map at every value≠label Select** - `eb8e129` (fix)

### TDD proof-of-gap (RED → GREEN)

Task 1's test was RED against the pre-fix CarroPicker. Captured failure output:

```
Expected element to have text content: Gol
Received:                              car-uuid-1▼
...
Expected element to have text content: Nenhum
Received:                              __none__▼
```

The trigger rendered the raw id (`car-uuid-1`) and the literal sentinel (`__none__`) — exactly the G-01 defect. After Task 2 the same test is GREEN (trigger shows `Gol` / `Nenhum`).

## Files Created/Modified
- `src/components/select-value-label.test.tsx` - Render test: CarroPicker trigger shows apelido / "Nenhum", never the imported `CARRO_NONE` sentinel.
- `src/components/carro-picker.tsx` - items = { [NONE]: 'Nenhum', ...id→apelido }.
- `src/components/reserva-picker.tsx` - items = id→nome map on the inner Select.
- `src/components/transacao-form.tsx` - categoria Select items = id→name map.
- `src/components/selection-action-bar.tsx` - categoria items = id→name; carro items = { [CARRO_NONE]: 'Nenhum (desvincular)', ...id→apelido }.
- `src/components/nf-form.tsx` - atividade items = ATIVIDADE_OPTIONS value→label map.
- `src/components/category-delete-dialog.tsx` - reassignment target items = id→name (from reassignTargets).

## Six call sites fixed (exact)
1. `transacao-form.tsx` — categoria Select (UUID → category name)
2. `carro-picker.tsx` — carro Select (id/`__none__` → apelido/"Nenhum")
3. `reserva-picker.tsx` — reserva Select (id → nome)
4. `selection-action-bar.tsx` — categoria Select AND carro Select
5. `nf-form.tsx` — atividade Select (activity value → label)
6. `category-delete-dialog.tsx` — reassignment target Select (UUID → name)

## Gate Results (LOCAL — all GREEN)

- `SUPABASE_DISABLE_TELEMETRY=1 npx vitest run` → **87 test files passed, 738 tests passed** (incl. new `select-value-label.test.tsx`).
- `npx tsc --noEmit` → exit 0, no type errors (items maps typed `Record<string, string>`).
- `npm run build` → `✓ Compiled successfully`, all routes built.

## Decisions Made
- Used Base UI's `items` map (root-cause mechanism 1) at each call site rather than the `<Select.Value>` render-prop — smallest, most idiomatic change, no wrapper edit.
- Label values derived from the same arrays the SelectItems iterate, so the trigger label and the option text share a single source and cannot drift.
- Cast each map `as Record<string, string>` to satisfy `Object.fromEntries`'s widened `Record<string, unknown>` return under TS strict (Base UI accepts `Record<string, React.ReactNode>`, so this is type-compatible).

## Deviations from Plan
None - plan executed exactly as written. The already-correct sites (extrato-table, import-review-table, abastecimento-form, carro-form, csv-column-mapper) were left untouched per the call-site inventory.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. No production dependency (local UI fix).

## Next Phase Readiness
- G-01 closed and isolated. Live-verify waves 4-7 can re-run against a redeploy with the Select trigger displaying labels correctly.
- ui/select.tsx unchanged, so no risk to the already-correct render-prop call sites.

## Self-Check: PASSED

All 7 created/modified files present; both task commits (`ad8ebc4`, `eb8e129`) found in git history.

---
*Phase: 12-produ-o-live-verify*
*Completed: 2026-06-18*
