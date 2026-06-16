---
phase: 01-funda-o-auth-rls-dinheiro-schema
plan: 03
subsystem: auth-ssr-vertical-slice
tags: [supabase-ssr, auth, getclaims, server-actions, zod, shadcn-forms, rls-read, middleware, sec-02, auth-01, auth-02, auth-04]
requires:
  - "Plan 01-01: Next 16 scaffold, shadcn base-nova (field primitive), zod/react-hook-form/@hookform/resolvers/sonner deps, vitest harness, scripts/check-bundle-secrets.sh + tests/bundle-secret-grep.test.ts"
  - "Plan 01-02: applied local migrations (profiles/categories + seed trigger + RLS + grants), src/types/database.types.ts, local stack at http://127.0.0.1:55321"
provides:
  - "src/lib/supabase/{client,server,middleware}.ts — typed @supabase/ssr three-client split (publishable key + getClaims())"
  - "src/middleware.ts — middleware entry with the official matcher; protects every route via updateSession()"
  - "src/lib/auth-schema.ts — shared Zod authSchema (single source of truth: email + password>=8)"
  - "src/actions/auth.ts — 'use server' signIn/signUp/signOut, Zod-gated, returns { error } on failure, redirects on success"
  - "src/components/auth-form.tsx — custom shadcn auth form (field + RHF + Zod resolver + sonner)"
  - "src/app/(auth)/auth/{login,signup}/page.tsx — custom login/signup pages served at /auth/login & /auth/signup"
  - "src/app/(app)/layout.tsx — protected shell re-checking getClaims() server-side + logout in shared chrome (AUTH-04)"
  - "src/components/logout-button.tsx — client logout control wired to the signOut action"
  - "src/app/(app)/dashboard/page.tsx — real RLS-filtered read of the signed-in user's categories"
affects:
  - "every later authenticated page renders inside (app)/layout.tsx and inherits the getClaims() gate + logout shell"
  - "all later server reads use the typed publishable-key server client established here (createClient from @/lib/supabase/server)"
  - "Plan 04 swaps .env.local LOCAL values for the user's real remote creds + Vercel envs; the wiring here is creds-agnostic"
tech-stack:
  added: []
  patterns:
    - "@supabase/ssr three-client split typed with the generated Database generic; never store a client in a module-global (Fluid compute)"
    - "getClaims() (validates JWT signature) for protection in BOTH middleware and (app)/layout — never getSession()/getUser()"
    - "no code between createServerClient and getClaims() in middleware (random-logout footgun comment kept verbatim)"
    - "auth mutations are 'use server' actions calling the SERVER client so the cookie is written on the response; never the browser client"
    - "one Zod schema (auth-schema.ts) validates the form resolver AND the action boundary; action returns { error } (never throws) on parse/Supabase failure"
    - "custom shadcn forms (field primitive + react-hook-form + sonner) — NOT @supabase/auth-ui-react (CONTEXT lock)"
    - "secret key never imported into any client/page/action module; publishable-key client only; bundle-secret grep gate enforced after build (SEC-02)"
key-files:
  created:
    - src/lib/supabase/client.ts
    - src/lib/supabase/server.ts
    - src/lib/supabase/middleware.ts
    - src/middleware.ts
    - src/lib/auth-schema.ts
    - src/actions/auth.ts
    - src/actions/auth.test.ts
    - src/components/auth-form.tsx
    - src/components/logout-button.tsx
    - src/app/(auth)/auth/login/page.tsx
    - src/app/(auth)/auth/signup/page.tsx
    - src/app/(app)/layout.tsx
    - src/app/(app)/dashboard/page.tsx
  modified:
    - src/app/layout.tsx
    - src/app/page.tsx
    - vitest.config.ts
decisions:
  - "Auth pages live under a literal /auth/ segment (src/app/(auth)/auth/login) so they render at /auth/login & /auth/signup — matching the verbatim RESEARCH middleware redirect target and the signOut redirect, which both point to /auth/login (the plan's (auth)/login → /login would 404 on redirect)"
  - "Added @/* alias resolution to vitest.config.ts so action tests can import app modules by the same alias the app uses (Rule 3 — test harness gap, not a substitution)"
  - "Kept the deprecated `middleware.ts` convention (Next 16 prefers `proxy`) because RESEARCH reproduces the official middleware verbatim and the convention still builds + runs; migration is out of scope (logged to deferred-items)"
  - "/ redirects to /dashboard so the root is coherent (middleware sends unauthenticated users to /auth/login first); replaced the create-next-app scaffold landing page"
metrics:
  duration_minutes: 8
  tasks_completed: 3
  files_created: 13
  files_modified: 3
  completed: 2026-06-16T15:39:31Z
---

# Phase 1 Plan 03: Auth SSR Vertical Slice Summary

**One-liner:** Wired the `@supabase/ssr` three-client split (publishable key + `getClaims()`, typed with the generated `Database` generic) with a session-refresh middleware that protects every route, Zod-validated `signIn`/`signUp`/`signOut` Server Actions (TDD, 8/8 green), and custom shadcn login/signup forms plus a protected `(app)` shell with logout-anywhere and a `/dashboard` that performs a REAL RLS-filtered categories read — proven by a live local round-trip (signUp → active session → reads exactly the user's 11 isolated seeded categories → second user sees only their own 11 → no session returns 0).

## What Shipped

### Task 1 — @supabase/ssr three-client split + session-refresh middleware (`5357950`)
- `src/lib/supabase/{client,server,middleware}.ts` reproduced verbatim from RESEARCH §1–§3, each typed with `createBrowserClient<Database>` / `createServerClient<Database>` from `@/types/database.types`.
- Uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not the legacy anon name) and `getClaims()` (not `getUser()`/`getSession()`). The random-logout-footgun comment is kept; no code runs between `createServerClient` and `getClaims()`. Server client's `setAll` stays wrapped in try/catch.
- `src/middleware.ts` per §4 (official matcher excluding `_next/static`, `_next/image`, `favicon.ico`, image files); `updateSession` redirects unauthenticated requests (no claims, path not `/login`/`/auth`) to `/auth/login`.
- No secret-key reference in `src/lib/supabase/`; `tsc --noEmit` clean.

### Task 2 — Zod-validated auth Server Actions, TDD (`dc6b265` RED → `041f61a` GREEN)
- `src/lib/auth-schema.ts`: shared `authSchema = { email: z.string().email(), password: z.string().min(8) }` — the single source of truth for the form resolver AND the action boundary.
- `src/actions/auth.test.ts` written FIRST and confirmed RED (no `./auth` module), then GREEN: validates bad email/short password BEFORE the Supabase call, error path returns `{ error }` (no throw/redirect), success triggers `redirect('/dashboard')`, `signOut` redirects to `/auth/login`.
- `src/actions/auth.ts`: `'use server'` `signIn`/`signUp`/`signOut`, each calling `createClient()` from `@/lib/supabase/server` (server client → cookie on response). Parse FormData with the Zod schema; on failure return `{ error }`; on Supabase error return `{ error: error.message }`; on success redirect. Credentials never logged. No secret-key reference in `src/actions/`.

### Task 3 — Custom shadcn forms + protected (app) shell + dashboard RLS read (`56bd00e`)
- `src/components/auth-form.tsx`: client component using `react-hook-form` + `@hookform/resolvers` Zod resolver over `auth-schema.ts`, the shadcn `Field`/`Input`/`Button`/`Card` primitives, submitting to the Server Action and rendering `{ error }` via a sonner toast. NOT `@supabase/auth-ui-react` (CONTEXT lock).
- `src/app/(auth)/auth/login/page.tsx` + `signup/page.tsx` served at `/auth/login` & `/auth/signup`.
- `src/app/(app)/layout.tsx`: Server Component re-checks `getClaims()` server-side (defense in depth) and redirects to `/auth/login` when there is no user; renders the shared chrome with the logout control on every `(app)` page (AUTH-04).
- `src/components/logout-button.tsx`: client button calling the `signOut` action.
- `src/app/(app)/dashboard/page.tsx`: server client `supabase.from('categories').select('name, kind').order('sort')` — RLS-filtered to the signed-in user; renders the list with generated Row types.
- Root `layout.tsx`: `<Toaster/>` added + real metadata; root `page.tsx` redirects to `/dashboard`.
- `npm run build` clean; `bash scripts/check-bundle-secrets.sh` exit 0; `tests/bundle-secret-grep.test.ts` GREEN (no secret in `.next/static`).

## Routes & Components Shipped
| Route / Component | Kind | Purpose | Req |
|---|---|---|---|
| `/auth/login` | page (custom shadcn form) | email/senha login → signIn action | AUTH-01 |
| `/auth/signup` | page (custom shadcn form) | open signup → signUp action (active session, confirm off) | AUTH-01 |
| `/dashboard` | protected page | real RLS-filtered categories read | (isolation proof) |
| `(app)/layout` | protected shell | server `getClaims()` gate + logout chrome | AUTH-02, AUTH-04 |
| `src/middleware.ts` | middleware | session refresh + route protection | AUTH-02 |
| `LogoutButton` | client | logout from any (app) page | AUTH-04 |
| `AuthForm` | client | shared RHF+Zod+sonner form | AUTH-01 |

## Test + Build Status
| Check | Result |
|---|---|
| `npx vitest run src/actions/auth.test.ts` | ✅ 8/8 GREEN |
| Full suite `npx vitest run` | ✅ 5 files, 26/26 GREEN (was 18; +8 auth) |
| `npm run build` | ✅ clean (routes /auth/login, /auth/signup, /dashboard, middleware emitted) |
| `npx tsc --noEmit` | ✅ exit 0 (TS strict + noUncheckedIndexedAccess) |
| `bash scripts/check-bundle-secrets.sh` | ✅ exit 0 — no secret in `.next/static` (SEC-02) |
| `tests/bundle-secret-grep.test.ts` | ✅ 2/2 GREEN |
| secret grep over `src/app`,`src/components`,`src/actions`,`src/lib/supabase` | ✅ none found |

## Live Local Login Round-Trip (proof)
Ran against the local stack (`http://127.0.0.1:55321`, publishable key) with `@supabase/supabase-js`:
- `signUp` → **active session immediately** (email confirmation off locally).
- That user's categories read → **exactly 11**: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Vestuário, Assinaturas, Investimentos, Reserva, Outros; **alocacao** = Investimentos, Reserva.
- A **second** fresh user reads **11** (their own), not 22 → RLS isolation holds across the auth boundary.
- After `signOut` (no session) the categories read returns **0 rows** → RLS denies, never leaks.
- Result: `ROUNDTRIP_OK`. The end-to-end skeleton works (a real user logs in, sees their own data, logs out) — minus the live remote creds, which Plan 04 supplies.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Auth routes must render at `/auth/login` & `/auth/signup`, not `/login` & `/signup`**
- **Found during:** Task 3 (route wiring)
- **Issue:** the verbatim RESEARCH middleware and the `signOut` action both `redirect('/auth/login')`, but the plan's `(auth)/login/page.tsx` structure renders at `/login` (route groups add nothing to the URL). An unauthenticated redirect or a logout would land on a non-existent `/auth/login` (404).
- **Fix:** placed the pages under a literal `auth/` segment (`src/app/(auth)/auth/login/page.tsx`, `.../auth/signup/page.tsx`) so they render at `/auth/login` & `/auth/signup`, matching the redirect target; internal cross-links updated accordingly. The verbatim middleware was kept unchanged.
- **Files modified:** src/app/(auth)/auth/login/page.tsx, src/app/(auth)/auth/signup/page.tsx
- **Commit:** 56bd00e

**2. [Rule 3 - Blocking] vitest could not resolve the `@/*` path alias in action test**
- **Found during:** Task 2 (GREEN run)
- **Issue:** `src/actions/auth.ts` (correctly) imports `@/lib/auth-schema` and `@/lib/supabase/server`; vitest had no alias config (prior tests used relative imports), so the test failed with `Failed to resolve import "@/lib/auth-schema"`.
- **Fix:** added `resolve.alias` mapping `@` → `./src` in `vitest.config.ts` (mirrors the tsconfig path). Not a package substitution — purely a test-harness gap. Existing tests unaffected (full suite still 26/26).
- **Files modified:** vitest.config.ts
- **Commit:** 041f61a

### Notes (not deviations)
- `/` now `redirect('/dashboard')` (replacing the create-next-app scaffold landing page) so the root is coherent — the middleware first sends unauthenticated users to `/auth/login`.
- Root `layout.tsx` gained `<Toaster/>`; `next-themes` `useTheme` returns the default `"system"` without a `ThemeProvider`, which is correct for v1 (no theme switcher in scope).

## Authentication Gates
None — this plan is autonomous and local-only. `.env.local` was wired to the **local** stack values (URL `http://127.0.0.1:55321`, publishable + secret keys from `supabase status`); the file is gitignored and no real/remote secret is committed. Wiring the user's real remote creds + email-confirm-off + remote `db push` + Vercel deploy is Plan 04 (`autonomous: false`).

## Known Stubs
None. The dashboard performs a real DB read (not mock/empty data); the auth forms post to real Server Actions; the middleware genuinely refreshes the session. Empty-state and error branches in the dashboard are defensive UI, not stubs.

## Threat Flags
None — all introduced surface maps to the plan's `<threat_model>`: T-1-secrets (publishable-key-only client + server split, no secret import, bundle grep GREEN after build), T-1-spoof (`getClaims()` in middleware + `(app)/layout`, never `getSession()`/`getUser()`), T-1-input (Zod at the action boundary before any Supabase call), T-1-bypass (defense-in-depth `(app)/layout` re-check). No new endpoints, file access, or schema beyond the planned auth slice.

## Deferred Items
- Next 16 deprecates the `middleware.ts` convention in favor of `proxy` (build emits a non-blocking notice). Kept verbatim per RESEARCH; migrating the convention is a small follow-up out of scope for this auth slice. Logged for a future hardening/upkeep pass.

## Requirements Touched
- **AUTH-01** (login email/senha) — custom shadcn login/signup forms wired to Zod-validated Server Actions; live round-trip logs in.
- **AUTH-02** (session persists) — middleware `getClaims()` refresh on every matched request + `(app)/layout` server-side re-check.
- **AUTH-04** (logout anywhere) — logout control in the shared `(app)` shell; `signOut` clears session and redirects.
- **SEC-02** (publishable-key-only bundle) — secret key absent from `.next/static`; bundle grep GREEN after build; no secret import in any client surface.

## Self-Check: PASSED
All 13 created + 3 modified key files exist on disk; all four task commits (`5357950`, `dc6b265`, `041f61a`, `56bd00e`) present in git history.
