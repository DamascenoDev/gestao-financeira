---
phase: 07-identidade-visual-e-polimento
plan: 02
subsystem: app-shell
tags: [brand, navigation, dark-mode, mobile, re-skin]
requires:
  - "07-01 navy+gold token substrate (--primary gold, --sidebar-* navy, --font-heading Inter Tight)"
  - "07-01 ThemeToggle (3-way mount-guarded) + ThemeProvider wired in root layout"
  - "src/hooks/use-mobile.ts (useIsMobile 768px)"
provides:
  - "BrandMark inline-SVG (navy tile + gold bar-trio, token-driven, auto-themes light/dark)"
  - "Sidebar re-skin: BrandMark + wordmark header, active=gold text + sidebar-accent bg + 2px gold left-indicator"
  - "ThemeToggle integrated in UserMenu dropdown (theme switchable from any app page)"
  - "BottomNav persistent mobile (<md) nav for primary destinations, active=gold, ≥48px targets"
affects:
  - "Every (app) route chrome (sidebar header + active state + top-bar UserMenu + mobile bottom bar)"
  - "Mobile layout: main gains pb-20 so BottomNav never covers content"
tech-stack:
  added: []
  patterns:
    - "Inline-SVG token-driven brand mark (var(--token) fills, no PNG per theme) — copies CategoryDot convention"
    - "BottomNav copies app-sidebar NAV_ITEMS shape + usePathname active-detection verbatim (frozen nav behavior)"
key-files:
  created:
    - src/components/brand-mark.tsx
    - src/components/bottom-nav.tsx
  modified:
    - src/components/app-sidebar.tsx
    - src/components/user-menu.tsx
    - src/app/(app)/layout.tsx
decisions:
  - "BrandMark tile = --primary-foreground (navy ink), bars = --primary (gold) — the brand-paired tokens flip together so navy-tile+gold-glyph holds in light and dark with zero hardcoded hex"
  - "Active sidebar indicator via data-active:before pseudo-element (2px gold left bar) — token-driven, no extra DOM, no behavior change"
  - "ThemeToggle wrapped in a plain padded div inside the dropdown (not a DropdownMenuItem) so its three plain buttons keep their own role=group/aria-pressed semantics and stay out of the dropdown roving-focus item set"
  - "BottomNav primary subset = Dashboard/Extrato/Importar/MEI/Reservas (UI-SPEC §Responsive); Receitas/Categorias/Conta stay sidebar-only"
metrics:
  duration: ~7 min
  completed: 2026-06-17
  tasks: 2
  files: 2 created / 3 modified
---

# Phase 7 Plan 02: App-Shell Identity (BrandMark + Active-Gold Nav + ThemeToggle + Mobile BottomNav) Summary

Applied the navy+gold identity to the app shell: a token-driven inline-SVG `BrandMark` in the sidebar header, the active nav item re-skinned to gold text + accent bg + a 2px gold left-indicator, the `ThemeToggle` surfaced in the `UserMenu` dropdown (theme switchable from any app page), and a persistent mobile `BottomNav` for the primary destinations — a pure chrome re-skin that left navigation/auth behavior and the full 587-test suite untouched.

## What Was Built

**Task 1 (commit `3c57429`, feat):**
- `src/components/brand-mark.tsx` — `BrandMark({ size = 24 })`, an inline SVG copying the `aria-hidden`/`role`/token-driven convention of `CategoryDot` (category-badge.tsx) but reading brand CSS vars: a rounded navy tile (`fill="var(--primary-foreground)"`) carrying a gold ascending bar-trio (three rising `<rect>`s, `fill="var(--primary)"`). Because the tile and bars use the brand-paired tokens that flip together in 07-01's `.dark` block, the navy-tile + gold-glyph identity holds in both modes with no hardcoded hex. `role="img"` + `aria-label="Gestão Financeira"`.
- `src/components/app-sidebar.tsx` — `SidebarHeader` now renders `<BrandMark size={24} />` beside the "Gestão Financeira" wordmark in `font-heading` 600 (still hidden in icon-collapse). The active `SidebarMenuButton` evolved from the loose `data-active:bg-muted data-active:text-primary` to the UI-SPEC grammar: `data-active:bg-sidebar-accent` + gold text (`data-active:text-primary` — `--primary` is now gold via 07-01) + a 2px gold left-indicator drawn as a `data-active:before` pseudo-element (`before:w-0.5 before:bg-primary`), with `transition-colors`. `NAV_ITEMS`, `usePathname` active-detection, and the `render={<Link/>}` composition are intact — nav behavior frozen.

**Task 2 (commit `fe717f2`, feat):**
- `src/components/user-menu.tsx` — imports and renders `<ThemeToggle/>` inside the `DropdownMenuContent`, under a "Tema" `DropdownMenuLabel`, wrapped in a plain padded `div` (kept out of the dropdown item roving-focus set so its three `role=group` buttons keep their own semantics). The email label, "Privacidade e conta" link, and "Sair" item are unchanged (AUTH-04 frozen).
- `src/components/bottom-nav.tsx` — `"use client"` `BottomNav`, copying the app-sidebar `{ href, label, icon }` shape (the 5 primary destinations `/dashboard`, `/extrato`, `/importar`, `/mei`, `/reservas`) and the verbatim active-detection `pathname === href || pathname.startsWith(href + '/')`. Renders a `fixed inset-x-0 bottom-0` bar over `bg-card` with a top border; each item is an icon+label `<Link>` with `min-h-12` (≥48px) touch targets; active item is gold (`text-primary` + `font-medium`) with `aria-current="page"`. Gated by `useIsMobile` (768px) — returns `null` on desktop, plus a `md:hidden` belt-and-suspenders. `data-print="hide"` so it never prints.
- `src/app/(app)/layout.tsx` — mounts `<BottomNav/>` inside `SidebarInset` after `<main>`; `<main>` gains `pb-20 md:pb-6` so the persistent bar never covers content on mobile.

## Verification

- `npx tsc --noEmit` → clean (exit 0), both tasks.
- `npm test` → **587 passed / 69 files** (held the 07-01 baseline exactly; ≥559 required — chrome-only change broke no behavior).
- `npm run build` → ✓ Compiled successfully (exit 0), all ~20 routes.
- Task 1 greps: `<rect` ×4 (≥3 tile+trio), `var(--` ×4, `#` ×0 (no hardcoded hex), `BrandMark` in sidebar ×2, active references `sidebar-accent`/`data-active`, `NAV_ITEMS` + `usePathname` present.
- Task 2 greps: `ThemeToggle` in user-menu ×2 (import + use), `BottomNav` exported, `useIsMobile` imported, all 5 primary hrefs present, `text-primary` active ×2, `min-h-12` present, `BottomNav` in layout ×3.

## Deviations from Plan

None - plan executed exactly as written. No deviation rules (1-4) triggered; the 07-01 substrate (gold `--primary`, navy `--primary-foreground`, `--sidebar-accent`, `--font-heading`, `ThemeToggle`, `useIsMobile`) provided every dependency, so all four artifacts dropped in as specified.

## Self-Check: PASSED

- `src/components/brand-mark.tsx` — FOUND
- `src/components/bottom-nav.tsx` — FOUND
- `src/components/app-sidebar.tsx` — FOUND (modified)
- `src/components/user-menu.tsx` — FOUND (modified)
- `src/app/(app)/layout.tsx` — FOUND (modified)
- Commit `3c57429` — FOUND
- Commit `fe717f2` — FOUND
