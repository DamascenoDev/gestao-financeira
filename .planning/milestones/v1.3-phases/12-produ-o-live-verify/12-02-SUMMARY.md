---
phase: 12-produ-o-live-verify
plan: 02
subsystem: production deploy (Supabase sa-east-1 remote + Vercel gru1) — live auth/RLS foundation
status: complete
requirements_completed: [DEPLOY-01, DEPLOY-02, DEPLOY-03, DEBT-01]
tags: [deploy, supabase, vercel, rls, auth, live-verify, sec-02, single-deploy, human-verified]
requires:
  - "12-01 local stack green: migrations 0001-0029 applied locally, carro-consumo suite GREEN, 0029 (WR-02) present"
  - "scripts/check-bundle-secrets.sh (SEC-02 client-bundle gate)"
  - "the user's personal Supabase project (São Paulo sa-east-1, Free tier) + Vercel account"
provides:
  - "remote Supabase (sa-east-1) with migrations 0001-0029 applied, RLS enforced on every domain table, statements bucket PRIVATE, v_abastecimento_consumo present (DEPLOY-01 + DEBT-01 remote)"
  - "ONE production Vercel deploy (region gru1) at a *.vercel.app URL with the three env vars set (DEPLOY-02) — the single bundle Plan 12-03 verifies against (D-08)"
  - ".env.local wired with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY (gitignored)"
  - "live-verified auth flow: open signup → /dashboard with 11 seeded BR categories, session persists, logout blocks protected routes, no secret in client JS (DEPLOY-03 + CAT-01 isolation + SEC-02)"
affects:
  - "12-03 (verifies the LIVE auth/upload/classification flows against THIS exact deployed bundle — no re-deploy per D-08)"
  - "waves 3-7 (all subsequent Phase-12 verifies run against this single production deployment)"
tech-stack:
  added: []
  patterns:
    - "single-deploy contract (D-08): the whole phase verifies against ONE production bundle; downstream plans must NOT re-deploy"
    - "service-role secret (SUPABASE_SECRET_KEY) set as a NON-public server env var in both .env.local and Vercel — never NEXT_PUBLIC_ (SEC-02)"
key-files:
  created:
    - .env.local
  modified:
    - src/types/database.types.ts
decisions:
  - "Deploy executed via the Vercel DASHBOARD (Git import from origin/main @ 40b19ab), not the CLI — so there is NO .vercel/ dir in the repo, and that is expected (the project link lives in the Vercel project, not the working tree)."
  - "Migration set pushed to remote is 0001-0029 (D-07): production is born with the WR-02 view fix (0029) already applied — no post-deploy migration needed."
  - "ONE deploy for the entire phase (D-08): Plan 12-03 and all subsequent waves verify against this bundle; re-deploying would invalidate the verified-bundle contract and the SEC-02 spot check."
metrics:
  duration: "~5 min (record-only; the credentialed steps were performed live by the operator)"
  completed: 2026-06-18
  tasks: 4
  files: 2
---

# Phase 12 Plan 02: Production deploy + live auth verify (DEPLOY-01/02/03 + DEBT-01) Summary

Took the locally-green app (with the 0029 WR-02 fix from 12-01) to PRODUCTION in a single deploy and proved the live auth/RLS foundation. This plan sequenced and ran the already-written walkthrough `01-04-PLAN.md` (Tasks 1-3) against the operator's real Supabase (São Paulo sa-east-1) and Vercel (gru1), with the two Phase-12 deltas: the `db push` applied 0001-**0029** (D-07), and this is the ONE deploy for the whole phase (D-08). All three credentialed checkpoints were performed and verified live by the human operator.

## What Was Built

### Task 1 — Pre-flight gate (auto, GREEN)

The deploy candidate was confirmed green before any remote step: full suite **736/736 vitest passing** (with 0001-0029 applied locally), `npx tsc --noEmit` clean, `npm run build` compiled (19 routes), and `bash scripts/check-bundle-secrets.sh .next/static` exit 0 (SEC-02 — the service-role secret used by LGPD delete server-side does NOT appear in the client bundle). All four gates passed, so the bundle subsequently deployed was the green one.

### Task 2 — Wire the personal Supabase project + disable email confirmation (executes 01-04 Task 1) — human-verified

`.env.local` created in the repo root with the three vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SECRET_KEY` (NOT prefixed `NEXT_PUBLIC_`, required because LGPD account-delete uses the service role server-side, D-10). The personal `gestao-financeira` Supabase project is provisioned in region São Paulo (`sa-east-1`), Free tier (D-05). Email confirmation is OFF (Auth → Providers → Email, D-11) for frictionless v1 signup. `npm run dev` + `localhost:3000` redirects an unauthenticated visitor to `/auth/login` — confirming the middleware talks to the REAL project. (Filesystem confirms `.env.local` and `supabase/.temp/linked-project.json` present.)

### Task 3 — Link remote + db push 0001-0029 (executes 01-04 Task 2; DEPLOY-01 / DEBT-01 remote) — human-verified

`supabase link` to the personal project, then `supabase db push` applied migrations **0001-0029** (including the 0029 WR-02 fix, D-07) to the remote — `db diff` showed the expected non-destructive delta before the push (idempotent `if not exists` / `create or replace`, D-12). `supabase gen types typescript --linked > src/types/database.types.ts` produced no drift versus the local-generated file. In the remote Dashboard, every domain table shows **RLS enabled** — no "Unrestricted" badge anywhere (D-12) — and the `statements` bucket is **PRIVATE**. The DEBT-01 spot check confirmed `v_abastecimento_consumo` exists remotely (0029 applied). DEPLOY-01 + DEBT-01 (remote) verified.

### Task 4 — ONE Vercel production deploy + live auth verify (executes 01-04 Task 3; DEPLOY-02 / DEPLOY-03) — human-verified

One production deploy via the **Vercel dashboard** (Git import from `origin/main @ 40b19ab`), region **gru1**, with the three env vars set (`SUPABASE_SECRET_KEY` server-only, NOT `NEXT_PUBLIC_`). Supabase Auth Site URL + Redirect URLs were pointed at the generated `*.vercel.app` URL (D-06) so auth redirects resolve in production. Live verification on the deployed URL:

- Login page served at `/auth/login`.
- Open signup → redirected to `/dashboard` showing the **11 seeded BR categories** (CAT-01 + RLS isolation proven live — only the new user's own data).
- Refresh → session **persists** (SSR + middleware token refresh).
- Logout → redirected to `/auth/login`; visiting `/dashboard` directly → redirected back to login (protected routes enforced).
- (SEC-02 spot check) No `sb_secret_` / `service_role` string appears in the deployed client JS.

DEPLOY-02 + DEPLOY-03 verified. This single bundle is what Plan 12-03 verifies (D-08).

## Single-deploy / no-redeploy contract (D-08)

There is exactly ONE production deployment for the entire phase. Plan 12-03 and all subsequent waves (3-7) verify their live flows against THIS bundle. Downstream plans must NOT re-deploy — re-deploying would invalidate the verified-bundle contract and the SEC-02 client-JS spot check performed here. Production is already born with the WR-02 fix (0029, D-07), so no post-deploy migration is pending.

## Deviations from Plan

None — plan executed exactly as written. Note: the deploy was performed via the Vercel **dashboard** (Git import), so there is intentionally NO `.vercel/` directory in the working tree; the project link lives in the Vercel project rather than the repo. This matches the plan's allowance for dashboard-driven deploy and is not a missing artifact.

## Threat Mitigations

- **T-12-envleak (I):** `.env.local` is gitignored; `SUPABASE_SECRET_KEY` set as a non-public server var in both `.env.local` and Vercel; the deployed-bundle grep gate passed (Task 1 exit 0) and the Task 4 devtools spot check found no secret in client JS (SEC-02).
- **T-12-clobber (T):** `supabase db diff` reviewed before push (non-destructive delta); migrations idempotent.
- **T-12-rls-remote (I):** remote Dashboard confirms NO table is "Unrestricted"; live signup shows only the new user's own 11 categories.
- **T-12-storage-remote (I):** remote `statements` bucket confirmed PRIVATE.
- **T-12-authurl (S):** Supabase Auth Site URL + Redirect URLs set to the `*.vercel.app` URL (D-06).
- **T-12-SC (T):** accepted — zero new packages installed this phase.

## Notes for Downstream

- The live production URL is the `*.vercel.app` URL configured in Supabase Auth (region gru1). Plan 12-03 verifies the upload → classification → review flows against this exact deployment.
- Remote schema is at 0001-0029; the typed client (`src/types/database.types.ts`) has no drift from the remote.

## Self-Check: PASSED

- `.env.local` exists (confirmed on disk).
- `supabase/.temp/linked-project.json` exists (remote link confirmed on disk).
- Highest migration `0029_consumo_same_odometer_fix.sql` present (the WR-02 fix pushed to remote).
- `.planning/phases/12-produ-o-live-verify/12-02-SUMMARY.md` written.
