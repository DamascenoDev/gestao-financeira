---
phase: 07-identidade-visual-e-polimento
plan: 01
subsystem: design-system
tags: [tokens, dark-mode, next-themes, oklch, typography, re-skin]
requires:
  - "globals.css :root/.dark token substrate (Phases 2-3)"
  - "next-themes (installed, previously unwired)"
  - "ui/sonner.tsx (next-themes consumer convention)"
provides:
  - "Navy+gold OKLCH token substrate (light + dark) — every var(--token) consumer re-themed"
  - "next-themes ThemeProvider wired in root layout (alternável + persistente, anti-FOUC)"
  - "ThemeToggle 3-way Claro/Escuro/Sistema (mount-guarded)"
  - "--font-heading wired to Inter Tight 600; --font-sans bug fixed"
affects:
  - "All ~20 routes (chrome re-skin via CSS-var swap, zero logic change)"
  - "ui/sonner.tsx toasts now follow theme (provider exists)"
tech-stack:
  added:
    - "next/font/google Inter_Tight (--font-inter-tight, weight 600)"
  patterns:
    - "CSS-var theming — token names preserved, OKLCH coordinates re-tuned"
    - "next-themes class strategy + suppressHydrationWarning + mount-guard"
key-files:
  created:
    - src/components/theme-provider.tsx
    - src/components/theme-toggle.tsx
    - src/components/theme-toggle.test.tsx
  modified:
    - src/app/globals.css
    - src/app/layout.tsx
decisions:
  - "ThemeToggle renders three plain mount-guarded <button>s (not a base-ui dropdown) — testable in jsdom, drops into UserMenu later"
  - "Test uses fireEvent (project convention) — @testing-library/user-event is not a dependency"
metrics:
  duration: ~5 min
  completed: 2026-06-17
  tasks: 2
  files: 3 created / 2 modified
---

# Phase 7 Plan 01: Navy+Gold Token Substrate + Dark Mode Wiring Summary

Re-tuned the entire `globals.css` token substrate from grayscale-chrome+teal to private-banking OKLCH navy+gold (light + dark, money/status semantics preserved), fixed the two latent bugs (the self-referential `--font-sans` no-op and the unwired `ThemeProvider`), and wired `next-themes` end-to-end so dark mode is alternável and persistente — all as a pure CSS-var swap that left the full behavior suite green.

## What Was Built

**Task 1 (commit `c5807e6`, test — Wave-0 RED):** `src/components/theme-toggle.test.tsx` — the contract for `ThemeToggle` authored before the component: mount-guard (three pt-BR labels appear after mount), `setTheme('light'|'dark'|'system')` on selection, accessible name per control; `next-themes` mocked with a controllable `setTheme` spy.

**Task 2 (commit `e3480c7`, feat — GREEN):**
- `src/app/globals.css`: `:root` and `.dark` blocks rewritten to the UI-SPEC OKLCH values — navy chrome (hue ≈255–258), gold `--primary` (`oklch(0.76 0.13 88)` light / `oklch(0.82 0.13 88)` dark) with navy-ink `--primary-foreground`; semantic money tokens re-tuned (`--income` 152, `--expense` = neutral foreground, `--allocation` 250, `--consumption` 70, `--destructive` 27/25) with new `--destructive-foreground`; chart ramp `--chart-1..5` swapped grayscale→navy+gold categorical; all sidebar tokens navy (dark sidebar deeper than canvas). **Token NAMES preserved** — re-skin, not rename — so every `var(--token)` consumer keeps working. Lines 1-5 (`@import` + `@custom-variant dark`) and the `@layer base` + print stylesheet preserved verbatim.
- Font-bug fix: `@theme inline` `--font-sans` now `var(--font-geist-sans)` (was self-referential `var(--font-sans)`), `--font-heading` now `var(--font-inter-tight)`; `--color-destructive-foreground` mirrored.
- `src/app/layout.tsx`: registers `Inter_Tight` (`--font-inter-tight`, weight 600), adds `interTight.variable` + `suppressHydrationWarning` to `<html>`, wraps `{children}` + `<Toaster/>` in `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`.
- `src/components/theme-provider.tsx`: `"use client"` next-themes passthrough wrapper (analog `ui/sonner.tsx`).
- `src/components/theme-toggle.tsx`: `"use client"`, mount-guarded (`useState`+`useEffect`, returns null until mounted), `useTheme` from next-themes, lucide `Sun`/`Moon`/`Monitor`, three pt-BR buttons, CSS-var colors only.

## Verification

- `npm test -- theme-toggle` → GREEN (3/3).
- `npx tsc --noEmit` → clean (exit 0).
- `npm test` → **587 passed / 69 files** (≥559 baseline held — color-only change broke no behavior).
- `npm run build` → compiled successfully (exit 0), all ~20 routes + Inter Tight font.
- Grep gates: `oklch(0.76 0.13 88)` present (3×); `195` teal hue → 0; `--font-sans: var(--font-sans)` self-reference → 0; `var(--font-geist-sans)` present; `layout.tsx` has `ThemeProvider` + `suppressHydrationWarning` + `font-inter-tight`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test used the uninstalled `@testing-library/user-event`**
- **Found during:** Task 2 (running the verify chain; the Task-1 RED had masked this behind the missing-component error).
- **Issue:** `theme-toggle.test.tsx` imported `@testing-library/user-event`, which is not a project dependency (only `@testing-library/react` + `jest-dom` are installed). The suite failed at the transform/import-resolution stage — "no tests" — rather than a clean RED, and would never go GREEN.
- **Fix:** Rewrote the interaction to use `fireEvent` from `@testing-library/react` — the established project convention (e.g. `dasn-report-view.test.tsx`). No package installed (package installs are excluded from auto-fix; the existing convention covers the need). The contract (mount-guard + 3-way + setTheme) is unchanged.
- **Files modified:** `src/components/theme-toggle.test.tsx`
- **Commit:** `e3480c7` (the corrected test ships with the GREEN implementation)

## Self-Check: PASSED

- `src/components/theme-provider.tsx` — FOUND
- `src/components/theme-toggle.tsx` — FOUND
- `src/components/theme-toggle.test.tsx` — FOUND
- `src/app/globals.css` / `src/app/layout.tsx` — FOUND (modified)
- Commit `c5807e6` — FOUND
- Commit `e3480c7` — FOUND
