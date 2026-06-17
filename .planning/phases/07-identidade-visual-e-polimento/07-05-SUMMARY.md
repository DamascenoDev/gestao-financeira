---
phase: 07-identidade-visual-e-polimento
plan: 05
subsystem: auth-identity
tags: [brand, auth, layout, re-skin, favicon]
requires:
  - "07-02 BrandMark inline-SVG (navy tile + gold bar-trio, token-driven, auto-themes)"
  - "07-01 navy+gold token substrate (--sidebar navy chrome, --primary gold, --card, --font-heading Inter Tight)"
provides:
  - "AuthShell — two-column identity layout (navy brand panel + form on --card) wrapping the existing auth form"
  - "(auth)/layout.tsx wraps children in AuthShell with the inverse auth guard preserved verbatim"
  - "src/app/icon.svg — navy tile + gold ascending bar-trio favicon (static single-theme asset)"
affects:
  - "Login/signup screens (/auth/login, /auth/signup) — now carry product identity instead of a bare centered form"
tech-stack:
  added: []
  patterns:
    - "AuthShell composes BrandMark + wordmark over the navy --sidebar surface (gold Financeira allowed ONLY on the auth hero per UI-SPEC §Brand), with the existing form passthrough on --card"
    - "Responsive panel via Tailwind classes (flex-col md:flex-row) — navy panel collapses to a compact header band <md; no JS/useIsMobile (SSR-stable)"
    - "Favicon = the BrandMark glyph in static navy+gold hex (Next.js App Router icon.svg convention)"
key-files:
  created:
    - src/components/auth-shell.tsx
    - src/app/icon.svg
  modified:
    - src/app/(auth)/layout.tsx
decisions:
  - "AuthShell wraps {children} (the login/signup pages, which keep their own centering <main> + Card) — the form panel is a flex container on --card so the existing AuthForm renders intact, zero changes to auth-form.tsx or actions/auth.ts"
  - "Gold touches the wordmark ('Financeira' in text-primary) ONLY in AuthShell — the auth hero is the single sanctioned place per UI-SPEC §Brand; in-app chrome keeps the wordmark foreground-colored"
  - "Favicon uses static navy (#1b2542) + gold (#c79a3a) hex rather than CSS vars — a favicon is a single-theme static asset that cannot read the .dark flip; the hex mirrors the identity token values"
  - "Inverse auth guard (getClaims → redirect('/dashboard')) preserved verbatim — AuthShell is pure presentation chrome; only `return children` became `return <AuthShell>{children}</AuthShell>` (T-07-11 mitigation held)"
metrics:
  duration: ~6 min
  completed: 2026-06-17
  tasks: 1
  files: 2 created / 1 modified
---

# Phase 7 Plan 05: Auth Identity (AuthShell two-column layout + navy+gold favicon) Summary

Replaced the bare centered auth form with `AuthShell`, a two-column identity layout: a navy brand panel (BrandMark 32px + the "Gestão Financeira" wordmark with "Financeira" in gold + the exact value prop + private/MEI framing) beside the existing auth form on `--card`, collapsing to a compact navy header band on mobile — plus a navy+gold `icon.svg` favicon. A pure chrome wrap: the inverse auth guard and the login/signup form/actions stayed frozen, and the suite held at 593 passing.

## What Was Built

**Task 1 (commit `9ebe878`, feat):**
- `src/components/auth-shell.tsx` — `AuthShell({ children })`, a `flex min-h-svh flex-col md:flex-row` layout. The left/top `<aside>` sits on the navy chrome surface (`bg-sidebar text-sidebar-foreground`) and carries `<BrandMark size={32} />` + the wordmark "Gestão Financeira" in `font-heading` 600 with "Financeira" in gold (`text-primary` — the one sanctioned gold-on-wordmark spot per UI-SPEC §Brand), the EXACT value prop ("Sua gestão financeira pessoal — privada, precisa e sob seu controle.") shown in both modes, and the private/MEI framing paragraph (`hidden md:block`). The right panel is a `flex flex-1 bg-card` container rendering `{children}` (the existing form, intact). Below `md` the navy panel becomes a compact header band over the form; no illustration (deferred per UI-SPEC).
- `src/app/(auth)/layout.tsx` — imports `AuthShell`; the inverse auth guard (`createClient` → `getClaims()` → `redirect('/dashboard')` if authenticated) is preserved verbatim; only the final `return children` became `return <AuthShell>{children}</AuthShell>`.
- `src/app/icon.svg` — favicon = a rounded navy tile (`#1b2542`) carrying the gold ascending bar-trio (`#c79a3a`, three rising `<rect>`s), the same visual language as BrandMark, in static hex since a favicon is single-theme. Registered by Next.js App Router as the `/icon.svg` route.

## Verification

- `npx tsc --noEmit` → clean (exit 0).
- `npm test` → **593 passed / 71 files** (held the baseline; ≥559 required, ~591 unit baseline — the env-dependent `tests/mei-view-leak.test.ts` passed here with the local Supabase stack up). Chrome-only change broke no behavior.
- `npm run build` → ✓ Compiled successfully (exit 0); `/auth/login` + `/auth/signup` compile, `/icon.svg` registered as a static route.
- Grep gates: `AuthShell` in layout ×2 (import + use); `getClaims` ×2, `redirect('/dashboard')` ×1 (guard preserved); `BrandMark` in auth-shell ×3; exact value prop ×1; `<rect` in icon.svg ×4 (≥3 tile+trio); `git status` for `auth-form.tsx` and `actions/auth.ts` empty (untouched — auth behavior frozen).

## Deviations from Plan

None - plan executed exactly as written. No deviation rules (1-4) triggered; the 07-02 BrandMark and 07-01 navy+gold substrate (`--sidebar`, `--card`, `--primary`, `--font-heading`) provided every dependency, so all three artifacts dropped in as specified. The auth form, actions, and inverse guard were left frozen per the re-skin constraint.

## Self-Check: PASSED

- `src/components/auth-shell.tsx` — FOUND
- `src/app/icon.svg` — FOUND
- `src/app/(auth)/layout.tsx` — FOUND (modified)
- Commit `9ebe878` — FOUND
