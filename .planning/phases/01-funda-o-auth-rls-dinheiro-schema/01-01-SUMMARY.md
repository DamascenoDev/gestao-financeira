---
phase: 01-funda-o-auth-rls-dinheiro-schema
plan: 01
subsystem: foundation-substrate
tags: [scaffold, nextjs-16, supabase, vitest, money-centavos, sec-02, rls, tdd]
requires: []
provides:
  - "Next.js 16 App Router (TS strict) scaffold in repo root"
  - "src/lib/money.ts centavos convention (parseBRLToCents/formatCents)"
  - "vitest test harness + 4 Wave-0 Nyquist tests"
  - "scripts/check-bundle-secrets.sh SEC-02 grep gate"
  - "supabase/config.toml (local stack config)"
  - "tests/helpers/local-supabase.ts localhost-guarded test client factories"
affects:
  - "all later phases inherit centavos money + RLS-test contract + scaffold"
tech-stack:
  added:
    - "next@16.2.9 / react@19.2.4 / react-dom@19.2.4"
    - "tailwindcss v4 + shadcn (base-nova): button/card/input/label/field/sonner"
    - "@supabase/supabase-js@2.108 + @supabase/ssr@0.12"
    - "zod@4 + react-hook-form@7 + @hookform/resolvers@5 + sonner@2 + server-only"
    - "supabase CLI (dev dep)"
    - "vitest@4 + @vitejs/plugin-react@5 + jsdom@29 + @testing-library/{react,jest-dom}"
  patterns:
    - "Money is integer centavos forever; parse once at ingest, format only at UI edge"
    - "RED-first Nyquist tests; later-wave tests annotated // RED until Wave N"
    - "Test helpers hard-guarded to 127.0.0.1/localhost (never remote project)"
key-files:
  created:
    - src/lib/money.ts
    - src/lib/money.test.ts
    - vitest.config.ts
    - vitest.setup.ts
    - tests/helpers/local-supabase.ts
    - tests/rls-isolation.test.ts
    - tests/seed-categories.test.ts
    - tests/bundle-secret-grep.test.ts
    - scripts/check-bundle-secrets.sh
    - supabase/config.toml
    - .env.example
    - .gitignore
    - package.json
    - tsconfig.json
  modified: []
decisions:
  - "Pin @vitejs/plugin-react to ^5 (not 6) to avoid babel8 peer conflict with shadcn's babel7 chain"
  - "shadcn base-nova ships `field` (not legacy `form.tsx`) as the form primitive — used field + RHF"
  - "noUncheckedIndexedAccess enabled alongside strict for full TS-strict surface"
metrics:
  duration_minutes: 11
  tasks_completed: 3
  files_created: 13
  completed: 2026-06-16T15:15:32Z
---

# Phase 1 Plan 01: Foundation Substrate Summary

**One-liner:** Scaffolded Next.js 16 (App Router, TS strict) into the existing repo without clobbering `.planning/`/`agents/`, established the integer-centavos money convention (`src/lib/money.ts`, proven by a green SEC-02 unit test), and wired four Wave-0 Nyquist tests + the SEC-02 bundle-secret grep gate (money + bundle green; RLS + seed RED-first until Wave 2 migrations).

## What Shipped

### Task 1 — Scaffold + Phase-1 deps + supabase init (`e88e0cf`)
- `create-next-app@latest` (Next 16.2.9 / React 19.2.4 / Tailwind v4, `--src-dir`, `@/*` alias, Turbopack) scaffolded into a temp dir and **moved** into the repo root; `.planning/`, `agents/`, and the real root `CLAUDE.md` preserved and verified intact.
- TypeScript strict + `noUncheckedIndexedAccess`.
- Runtime deps: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, `sonner`, `server-only`. Dev dep: `supabase` CLI.
- shadcn (base-nova) init + `button/card/input/label/field/sonner`.
- `supabase init` → `supabase/config.toml` (`project_id = "gestao-financeira"`).
- `.env.example` with publishable/secret placeholders (no real values); `.gitignore` merged for env/supabase, `.env.example` exempted from ignore.
- npm scripts: `db:push`, `db:reset`, `gen:types`, `test`, `test:watch`.
- No deferred-phase library installed (verified programmatically).
- `npm run build` and `npx tsc --noEmit` both clean.

### Task 2 — money exactness TDD (`4328056` RED → `1d2ebef` GREEN)
- Installed vitest 4 + plugin-react 5 + jsdom + RTL + jest-dom; `vitest.config.ts` (jsdom, globals, setup, `src/**` + `tests/**` include) + `vitest.setup.ts`.
- `src/lib/money.test.ts` written FIRST and confirmed RED (no `money.ts`).
- `src/lib/money.ts`: `parseBRLToCents` (strip thousands dot, comma→decimal, `Math.round(x*100)` once) + `formatCents` (`Intl.NumberFormat('pt-BR', BRL)`).
- GREEN: 6/6 tests pass — `0,10 + 0,20 = 30` centavos exactly, round-trip, integer-only. (SEC-02)

### Task 3 — remaining Nyquist tests + bundle gate (`cfbd092`)
- `tests/helpers/local-supabase.ts`: `serviceClient()`/`userClient()` factories reading local creds from `supabase status`, **hard-guarded** to `127.0.0.1`/localhost (threat T-1-03).
- `tests/rls-isolation.test.ts`: two-user isolation, all 4 verbs × `categories` + `profiles` (AUTH-03). **RED until Wave 2.**
- `tests/seed-categories.test.ts`: 11 BR categories, Investimentos/Reserva = `alocacao` (CAT-01). **RED until Wave 2.**
- `tests/bundle-secret-grep.test.ts` + `scripts/check-bundle-secrets.sh`: grep `.next/static` for `sb_secret_`/`service_role`/`SUPABASE_SECRET_KEY`, comment-filtered, exit 0 on clean/absent (SEC-02 / T-1-01). **Gate green now; becomes a meaningful guard at Wave 3 build.**

## Test Status

| Test | Req | Status | Reason |
|------|-----|--------|--------|
| `src/lib/money.test.ts` | SEC-02 | ✅ GREEN (6/6) | money.ts implemented this wave |
| `tests/bundle-secret-grep.test.ts` | SEC-02 / T-1-01 | ✅ GREEN (2/2) | script contract holds on clean/absent bundle |
| `tests/rls-isolation.test.ts` | AUTH-03 | 🔴 RED (intended) | no `profiles`/`categories` migrations + no local stack for this project yet → Wave 2 |
| `tests/seed-categories.test.ts` | CAT-01 | 🔴 RED (intended) | no seed trigger/relation yet → Wave 2 |

Full suite: `4 files, 8 passed | 10 skipped`; 2 files RED-by-design with `// RED until Wave N` markers. `npm run build` + `npx tsc --noEmit` clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@vitejs/plugin-react` peer-dependency conflict**
- **Found during:** Task 2 (vitest install)
- **Issue:** latest `@vitejs/plugin-react@6` pulls `@rolldown/plugin-babel` → `@babel/plugin-transform-runtime@8` requiring `@babel/core@^8`, conflicting with shadcn's transitive `@babel/preset-typescript@7` (pins `@babel/core@7`). `npm install` failed with ERESOLVE.
- **Fix:** pinned `@vitejs/plugin-react@^5` (5.2.0 uses `@babel/core@^7.29` + `@rolldown/pluginutils`, no babel8). No `--force`/`--legacy-peer-deps` used. Not a package-legitimacy issue (all approved framework packages), so resolved inline per Rule 3.
- **Files modified:** package.json, package-lock.json
- **Commit:** 4328056

**2. [Rule 3 - Blocking] shadcn `form` component absent in base-nova style**
- **Found during:** Task 1 (shadcn add)
- **Issue:** `shadcn add form` is a silent no-op in the `base-nova` style — that style ships `field.tsx` (Field components + react-hook-form) as the form primitive instead of the legacy `form.tsx` wrapper.
- **Fix:** added `field` (the registry's current form primitive) alongside `input`/`label`; `react-hook-form` + `@hookform/resolvers` are installed for the auth-form wiring in later waves. The plan's intent ("components this phase needs" for auth forms) is satisfied.
- **Files modified:** src/components/ui/field.tsx, src/components/ui/separator.tsx
- **Commit:** e88e0cf

**3. [Rule 3 - Blocking] vitest setup `expect is not defined`**
- **Found during:** Task 2 (first RED run)
- **Issue:** `@testing-library/jest-dom` v6 extends the global `expect` in the setup file, which is undefined unless vitest globals are enabled.
- **Fix:** added `globals: true` to `vitest.config.ts`. After this the RED run failed for the correct reason (missing `./money` import).
- **Files modified:** vitest.config.ts
- **Commit:** 4328056

**4. [Rule 1 - Type] RLS test insert-row union tripped TS strict**
- **Found during:** Task 3 (tsc)
- **Issue:** the per-table union of two insert-row literal shapes confused supabase-js's untyped (Wave-0, no generated `Database`) insert typing → TS2345.
- **Fix:** typed the row as `Record<string, string>` (neutral until Wave 2 generates `database.types.ts`).
- **Files modified:** tests/rls-isolation.test.ts
- **Commit:** cfbd092

### Notes (not deviations)
- `react`/`react-dom` resolved to `19.2.4` (a valid patch within the verified 19.2 major; RESEARCH directs "let npm resolve patches").
- The moved `AGENTS.md` is Next's agent-rules file; the real root `CLAUDE.md` (GSD project guidance) was deliberately NOT overwritten.
- A pre-existing local Supabase container for an unrelated project ref was running; it is irrelevant to this scaffold (this project has no local stack started yet — correct for Wave 0).

## Authentication Gates
None — this plan is fully autonomous; no credentialed/interactive steps (Supabase link, Vercel, `.env.local` paste) are in scope (deferred to Plan 04, `autonomous: false`).

## Known Stubs
None. `src/lib/money.ts` is a complete implementation. The RLS/seed/bundle tests are intentional RED-first scaffolding (documented above and annotated in-file), driven green by Wave 2/3 per the plan — not stubs.

## Requirements Touched
- **SEC-02** (money exactness + bundle-secret grep gate) — money exactness proven GREEN; bundle gate in place (full enforcement at Wave 3 build).

## Self-Check: PASSED
All 14 listed key files exist on disk; all 4 commits (`e88e0cf`, `4328056`, `1d2ebef`, `cfbd092`) present in git history.
