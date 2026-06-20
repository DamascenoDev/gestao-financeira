---
phase: 22-sugest-o-de-palavra-chave-inline-batch
plan: 03
subsystem: categorias
tags: [keyword, suggestions, dialog, categorias, KW-08]
status: complete
requires:
  - getKeywordSuggestions() / approveKeywordSuggestions(items) / type KeywordSuggestion (src/actions/category-keywords.ts, Plan 02) — imported verbatim
  - keywordSuggestionItemSchema shape ({categoryId, keyword}) — the approve item contract the dialog maps to
  - category-keywords-dialog.tsx skeleton (controlled open/onOpenChange + useTransition + sonner) — mirrored
  - category-row-actions.tsx client-owns-open-state pattern — mirrored by the launcher
  - import-review-table.tsx Select/Checkbox/CategoryBadge grammar — reused for the per-candidate controls
provides:
  - KeywordSuggestionsDialog — global batch dialog (load-on-open, multi-select, edit term+category, bulk approve, session discard, Empty state)
  - KeywordSuggestionsLauncher — client component owning the dialog open state + the /categorias header trigger
  - /categorias header entry point "Sugerir palavras-chave" (RSC preserved)
affects:
  - src/components/keyword-suggestions-dialog.tsx
  - src/components/keyword-suggestions-launcher.tsx
  - src/app/(app)/categorias/page.tsx
  - src/components/keyword-suggestions-dialog.test.tsx
tech-stack:
  added: []
  patterns:
    - "Client launcher owns dialog open state so the page stays an RSC (mirrors CategoryRowActions)"
    - "Load-on-open via a plain async effect (NOT startTransition) — the list is primary content, a deferrable transition starves the seed render under load"
    - "Derive transient 'loading' from open/!loaded instead of a synchronous setState in the effect body (satisfies react-hooks/set-state-in-effect)"
    - "Discard is pure local-state removal — NO server call (session-only, no dismissed table)"
    - "Client never re-filters candidates — renders exactly what the server returned (already-covered exclusion is server-side, Plan 02)"
key-files:
  created:
    - src/components/keyword-suggestions-dialog.tsx
    - src/components/keyword-suggestions-launcher.tsx
    - src/components/keyword-suggestions-dialog.test.tsx
  modified:
    - src/app/(app)/categorias/page.tsx
decisions:
  - "Load via a plain async effect, not startTransition: under the full 911-test run a transition let React defer the candidate seed render, racing the rows and timing out 2 tests; the disabled controls + 'Carregando…' affordance already cover the in-flight state"
  - "'loading' is derived (open && !loaded), not stateful — avoids a synchronous setState(true) in the effect body that the react-hooks lint rejects"
  - "Reset (loaded/candidates) happens in the effect cleanup on close/unmount, keeping the effect a pure async-sync effect (no synchronous setState in the body)"
  - "Test re-establishes the action mock implementations in beforeEach — a sibling test file also mocks @/actions/category-keywords, and inline factory impls were fragile across the multi-file run"
metrics:
  duration: ~16m
  completed: 2026-06-20
  tasks: 3
  files: 4
  tests: 911 (5 new)
---

# Phase 22 Plan 03: KW-08 Client Side (KeywordSuggestionsDialog + launcher) Summary

The KW-08 client surface ships: a global **"Sugestões de palavras-chave"** dialog on `/categorias` that, on open, calls `getKeywordSuggestions()` and lists the server-computed candidates (checkbox · editable term `Input` · editable category `Select` · "{N} usos" · session-only discard `X`), lets the user multi-select and edit term/category, bulk-approves via `approveKeywordSuggestions(selected)` with the created/skipped toast (keeping the dialog open), discards rows **session-only with no server call**, and renders the `Empty` primitive when there are no candidates. A small client `KeywordSuggestionsLauncher` owns the dialog open state and mounts a non-primary (outline) **"Sugerir palavras-chave"** trigger in the `/categorias` header beside "Nova categoria" — and `/categorias/page.tsx` stays an RSC. ZERO new primitive / token / registry / package / migration.

## What Was Built

### Task 1 — `keyword-suggestions-dialog.tsx` (`feat`, f5044dc; hardened in 932eac3)
- `'use client'`; controlled `{ open, onOpenChange, categories }` props (the launcher passes the RSC's `{id,name,color}[]` for the per-candidate category `Select`).
- Imports `getKeywordSuggestions, approveKeywordSuggestions, type KeywordSuggestion` from `@/actions/category-keywords`; composes only vendored primitives (`Dialog*`, `Empty*`, `Checkbox`, `Select*`, `Input`, `Badge`-free `CategoryBadge`, `Button`, `X`).
- **Load-on-open** (effect keyed on `open`): seeds an editable working copy `{ key, descriptorNorm, term, categoryId, categoryName, hitCount, selected }` (term starts = descriptorNorm); error path toasts the UI-SPEC fallback. Resets on close via the effect cleanup so the next open re-loads fresh and session discards are forgotten.
- **Candidate rows** in DOM order checkbox → editable term `Input` (`maxLength={60}`, `aria-label` keyed to the descriptor) → editable category `Select` (renders `CategoryBadge`) → "{hitCount} usos" (`text-xs text-muted-foreground tabular-nums`) → muted discard `<button>` (`aria-label="Descartar sugestão {term}"`), inside a `max-h-[50vh] overflow-y-auto` scroll region with an optional "Selecionar todas" header checkbox.
- **Discard** removes the row from local state ONLY — no action call. **Bulk approve** maps selected rows to `{ categoryId, keyword: term }`, calls `approveKeywordSuggestions`, toasts `"{N} palavras-chave criadas."` / singular / `"{N} criadas · {M} já cadastradas."`, removes approved rows, keeps the dialog open. **Empty** state ("Nenhuma sugestão por enquanto") renders after load when there are zero candidates. The client never re-filters (server already excluded covered descriptors).

### Task 2 — `keyword-suggestions-launcher.tsx` + `/categorias/page.tsx` (`feat`, 6d10b7f)
- `keyword-suggestions-launcher.tsx` (`'use client'`): holds `React.useState(false)` for `open`, renders a `variant="outline"` "Sugerir palavras-chave" `Button` (non-primary per UI-SPEC §Color) and the controlled `<KeywordSuggestionsDialog>`.
- `categorias/page.tsx`: imports the launcher and mounts it beside `<CategoriaForm />` inside a `flex gap-2` wrapper in the header, passing `rows.map((c) => ({ id, name, color }))`. No other change — the page stays an RSC (no `'use client'`, fetches/table untouched).

### Task 3 — `keyword-suggestions-dialog.test.tsx` (`test`, d79e74c; hardened in 932eac3)
- jsdom suite mocking `@/actions/category-keywords` + `sonner`. Five cases: load-on-open lists both candidates as editable term inputs; approve calls `approveKeywordSuggestions([{categoryId:'cat-1',keyword:'uber trip'}])` + `toast.success`; discard removes the row and fires NO action call; the Empty state renders for an empty feed; approve is disabled at zero selection and enables (with the count) after a select.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Batch dialog load was non-deterministic at the full-suite gate**
- **Found during:** Task 3 verification (`npm test` full run, the wave-merge gate in `<verification>`).
- **Issue:** The plan suggested loading inside a `useTransition`. In isolation the 5 cases passed, but in the full 911-test run two tests (`approve`, `discard`) timed out at 5s: a `startTransition`-wrapped load is deferrable, so under full-suite CPU contention React starved the candidate-seed render and the load-gated rows never appeared. Separately, the inline `vi.mock` factory implementations were fragile across the multi-file run (a sibling file — `category-keywords-dialog.test.tsx` — also mocks `@/actions/category-keywords`), which could leave the mock returning `undefined`.
- **Fix:** Load via a plain async effect (not a transition) so the seed render is high-priority; derive `loading` from `open && !loaded` and reset in the effect cleanup to avoid the `react-hooks/set-state-in-effect` lint error; in the test, re-establish the action mock implementations in `beforeEach` and widen the `findBy` budget. `startTransition`/`isPending` is still used for the approve path.
- **Files modified:** `src/components/keyword-suggestions-dialog.tsx`, `src/components/keyword-suggestions-dialog.test.tsx`
- **Commit:** 932eac3
- **Result:** Full suite 911/911 green, stable across repeated runs; ESLint + tsc clean.

## Verification

- `npx vitest run src/components/keyword-suggestions-dialog.test.tsx` — 5 passed.
- `npx vitest run` (full wave-merge gate, Plans 01–03 together) — **911 passed (100 files)**, stable across repeated runs.
- `npx tsc --noEmit` — clean (no new errors).
- `npx eslint` on all four files — clean.
- `grep -c "'use client'" "src/app/(app)/categorias/page.tsx"` === 0 — the page stays an RSC.
- `grep -c removeKeyword src/components/keyword-suggestions-dialog.tsx` === 0 — discard makes no server call.
- `getKeywordSuggestions`/`approveKeywordSuggestions` each appear in the dialog; the pt-BR copy ("Sugestões de palavras-chave", "Aprovar selecionadas", "Nenhuma sugestão por enquanto", "usos") is present.

## Threat Mitigations Applied

- **T-22-07 (Tampering / edited term):** accepted, mitigated in Plan 02 — the dialog sends the edited `{categoryId, keyword}` to `approveKeywordSuggestions`, which re-runs Zod + normalize + owner-gate + RLS per item server-side. This plan adds only client composition; nothing client-side is trusted.
- **T-22-08 (Information Disclosure):** accepted, mitigated in Plan 02 — the dialog only consumes the pre-filtered candidate shape from `getKeywordSuggestions` (RLS-scoped, no raw merchant rows); it never queries `merchant_patterns` directly.
- **T-22-SC (package legitimacy):** ZERO packages installed this plan — every primitive is vendored. No `npm install` / `npx shadcn add`.

## Known Stubs

None.

## Threat Flags

None — no new network endpoint, auth path, file access, or schema surface introduced (client-only composition over Plan 02's already-gated actions).

## Self-Check: PASSED
- src/components/keyword-suggestions-dialog.tsx — FOUND
- src/components/keyword-suggestions-launcher.tsx — FOUND
- src/components/keyword-suggestions-dialog.test.tsx — FOUND
- src/app/(app)/categorias/page.tsx — FOUND (KeywordSuggestionsLauncher mounted, RSC preserved)
- Commit f5044dc (feat: dialog) — FOUND
- Commit 6d10b7f (feat: launcher + page) — FOUND
- Commit d79e74c (test) — FOUND
- Commit 932eac3 (fix: gate determinism) — FOUND
