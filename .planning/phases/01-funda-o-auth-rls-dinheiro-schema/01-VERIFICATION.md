---
phase: 01-funda-o-auth-rls-dinheiro-schema
verified: 2026-06-16T16:35:00Z
status: passed
score: 10/10 must-haves verified (local scope; 01-04 remote/deploy deferred by design)
overrides_applied: 0
re_verification:
  previous_status: null
  previous_score: null
deferred:
  - truth: "Browser session persists across a real page refresh (AUTH-02 browser-bound confirmation)"
    addressed_in: "Phase 1 Plan 01-04 (autonomous:false, deferred by user decision)"
    evidence: "Middleware getClaims() refresh + (app)/layout re-check are wired and typecheck-clean; the cross-refresh cookie behavior is only confirmable in a real browser, scheduled in 01-04 (live remote verify)."
  - truth: "Logout from a deployed page redirects + blocks protected routes (AUTH-04 browser-bound confirmation)"
    addressed_in: "Phase 1 Plan 01-04 (autonomous:false, deferred by user decision)"
    evidence: "LogoutButton in the shared (app) shell calls signOut() → redirect('/auth/login'); the redirect+block UX is browser-confirmed in 01-04."
  - truth: "Migrations applied to the REMOTE project via supabase db push and skeleton deployed to a reachable Vercel URL"
    addressed_in: "Phase 1 Plan 01-04 (autonomous:false, deferred by user decision)"
    evidence: "01-04 requires the user's personal Supabase credentials + Vercel auth; verified locally against http://127.0.0.1:55321 instead. Not an implementation gap."
---

# Phase 1: Fundação (auth, RLS, dinheiro, schema) Verification Report

**Phase Goal:** Usuário entra na própria conta e o sistema garante, desde o primeiro byte gravado, que cada dado é isolado por `user_id` e que dinheiro é exato — front-loading dos dois erros irreversíveis (float e vazamento RLS).
**Verified:** 2026-06-16T16:35:00Z
**Status:** passed (local must-haves all met; 01-04 remote/deploy deferred by user decision)
**Re-verification:** No — initial verification

## Scope Note

Plan 01-04 (real Supabase credentials, remote `db push`, Vercel deploy, live browser verification) is `autonomous:false` and **intentionally deferred by user decision** — it requires the user's personal credentials. This verification confirms the **LOCAL** implementation (plans 01-01/02/03) against the phase Success Criteria. The local Supabase stack is running and reachable (`http://127.0.0.1:55321` → HTTP 200); the full test suite (26/26) and typecheck are green. Remote-only confirmations are recorded under Deferred Items, not as failures.

## Goal Achievement

### Observable Truths

| # | Truth (mapped to ROADMAP Success Criteria) | Status | Evidence |
|---|---|---|---|
| 1 | SC1 — Login email/senha funciona (Server Action + form custom) | ✓ VERIFIED | `src/actions/auth.ts` `signIn`/`signUp` (Zod-gated, `{error}` on failure, redirect on success) + `src/components/auth-form.tsx` (RHF + Zod + shadcn `field`, not `@supabase/auth-ui-react`) → `/auth/login` & `/auth/signup`. `src/actions/auth.test.ts` 8/8 GREEN. Live local round-trip logged `ROUNDTRIP_OK`. |
| 2 | SC1 — Sessão persiste (SSR + middleware getClaims refresh) | ✓ VERIFIED (code) | `src/lib/supabase/middleware.ts` `updateSession()` uses `getClaims()` with NO code between `createServerClient` and `getClaims()` (random-logout footgun avoided); `src/middleware.ts` matcher excludes `_next/static`/images; `(app)/layout.tsx` re-checks `getClaims()` (defense-in-depth). Browser cross-refresh persistence → Deferred (01-04). |
| 3 | SC1 — Logout disponível em qualquer página | ✓ VERIFIED (code) | `LogoutButton` rendered in the shared `(app)/layout.tsx` header (every authenticated page) → `signOut()` → `redirect('/auth/login')`. Browser redirect/block UX → Deferred (01-04). |
| 4 | SC2 — Toda tabela tem `user_id` + RLS (`(select auth.uid()) = user_id` USING + WITH CHECK); bucket privado `statements` com RLS por pasta `{user_id}/`; query negada retorna vazio | ✓ VERIFIED | `0001_profiles.sql` + `0002_categories.sql`: `user_id` + index, `enable row level security`, single `for all to authenticated` policy with USING **and** WITH CHECK. `0003_storage_statements.sql`: private bucket + `storage.foldername(name))[1] = (select auth.uid())::text` in both clauses. DML grants present → RLS is the genuine row gate (false-green fixed). `tests/rls-isolation.test.ts` 8/8 GREEN: user B reads/inserts/updates/deletes 0 of user A's rows across 4 verbs × 2 tables, with real JWTs. |
| 5 | SC3 — Todo valor monetário em centavos inteiros (`bigint`), nunca float; `0,10 + 0,20 = 0,30` | ✓ VERIFIED | `src/lib/money.ts` `parseBRLToCents` (`Math.round(x*100)` once) + `formatCents` (`Intl.NumberFormat pt-BR BRL`). `src/lib/money.test.ts` asserts `parseBRLToCents('0,10') + parseBRLToCents('0,20') === 30` — GREEN (6/6). No `float`/`real`/`double`/`numeric` money column type anywhere in `supabase/migrations/` (Phase-1 tables carry no money; convention is enforced at the helper before any money table lands). |
| 6 | SC4 — Conjunto padrão BR de categorias semeado ao criar a conta | ✓ VERIFIED | `handle_new_user()` (`SECURITY DEFINER`, pinned `search_path = public`) on `AFTER INSERT ON auth.users` seeds 1 profile + exactly 11 categories. `tests/seed-categories.test.ts` 2/2 GREEN: exactly 11; Investimentos + Reserva = `alocacao`, the other 9 = `consumo`. |
| 7 | SC5 — Service-role só no servidor, nunca `NEXT_PUBLIC_`, ausente do bundle | ✓ VERIFIED | `client.ts`/`server.ts`/`middleware.ts` use only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Grep of `src/app`,`src/components`,`src/actions`,`src/lib/supabase` for `sb_secret_|service_role|SUPABASE_SECRET_KEY` → NONE. `scripts/check-bundle-secrets.sh` over the real `.next/static` build → exit 0 (pass); `tests/bundle-secret-grep.test.ts` GREEN. |
| 8 | Walking Skeleton — scaffold + routing + real DB read/write + real UI login | ✓ VERIFIED (local) | Next 16 App Router (TS strict) scaffold; routes `/auth/login`, `/auth/signup`, protected `/dashboard` + middleware emitted in build; real write (signup → seed trigger), real read (`dashboard/page.tsx` `select('name, kind')` RLS-filtered, not hardcoded), real UI auth forms. Deploy path = 01-04 (deferred). |
| 9 | Typed client never drifts | ✓ VERIFIED | `src/types/database.types.ts` generated from the live local schema; `categories` + `profiles` Row/Insert/Update present; `tsc --noEmit` exit 0 (strict + noUncheckedIndexedAccess). |
| 10 | `npx vitest run` executes the full suite green | ✓ VERIFIED | 5 files, **26/26 passed** against the live local stack. |

**Score:** 10/10 truths verified (local scope)

### Deferred Items

Items not confirmable without the user's personal credentials / a real browser; addressed in Plan 01-04 (`autonomous:false`, deferred by user decision). NOT implementation gaps.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Browser session persists across a real refresh (AUTH-02) | 01-04 | Middleware `getClaims()` refresh + layout re-check wired & typecheck-clean; cross-refresh cookie behavior is browser-only. |
| 2 | Logout from a deployed page redirects + blocks protected routes (AUTH-04) | 01-04 | `LogoutButton` → `signOut()` → redirect wired; redirect/block UX is browser-confirmed. |
| 3 | Remote `db push` + Vercel deploy reachable, live login → dashboard | 01-04 | Requires user's real Supabase + Vercel auth; verified locally instead. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/money.ts` | centavos parse/format helper | ✓ VERIFIED | `parseBRLToCents`/`formatCents`; rounds once; tested 6/6 |
| `supabase/migrations/0001_profiles.sql` | profiles + index + uniform RLS + grants | ✓ VERIFIED | USING+WITH CHECK, DML grants present |
| `supabase/migrations/0002_categories.sql` | categories + RLS + seed trigger | ✓ VERIFIED | 11-category seed, alocacao/consumo correct, SECURITY DEFINER + pinned search_path |
| `supabase/migrations/0003_storage_statements.sql` | private bucket + per-folder RLS | ✓ VERIFIED | `public=false`, `storage.foldername(name)[1] = auth.uid()` both clauses |
| `src/types/database.types.ts` | generated typed schema | ✓ VERIFIED | categories + profiles present; tsc clean |
| `src/lib/supabase/{client,server,middleware}.ts` | three-client split, publishable key | ✓ VERIFIED | publishable key only; `getClaims()`; no secret import |
| `src/middleware.ts` | route protection + session refresh | ✓ VERIFIED | official matcher; `updateSession` |
| `src/actions/auth.ts` | Zod-gated signIn/signUp/signOut | ✓ VERIFIED | returns `{error}`, redirects; tested 8/8 |
| `src/app/(app)/layout.tsx` | getClaims gate + logout shell | ✓ VERIFIED | server re-check + LogoutButton |
| `src/app/(app)/dashboard/page.tsx` | real RLS-filtered categories read | ✓ VERIFIED | real `from('categories').select(...)`, not hardcoded |
| `src/components/auth-form.tsx` | custom shadcn form | ✓ VERIFIED | RHF + Zod + field; not auth-ui-react |
| `scripts/check-bundle-secrets.sh` | SEC-02 grep gate | ✓ VERIFIED | exit 0 over real `.next/static` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `0002_categories.sql` | `auth.users` | AFTER INSERT trigger `on_auth_user_created` → `handle_new_user()` | ✓ WIRED | trigger present; seed test green proves it fires |
| `tests/rls-isolation.test.ts` | `public.categories`/`profiles` | two-user select/insert/update/delete | ✓ WIRED | 8/8 green against live stack |
| `dashboard/page.tsx` | Supabase `categories` | server client `.from('categories').select()` RLS-filtered | ✓ WIRED + FLOWING | real query; round-trip returns the user's own 11 |
| `auth-form.tsx` | `signIn`/`signUp` | Server Action prop `action={signIn}` | ✓ WIRED | form posts to action; redirect on success |
| `(app)/layout.tsx` | `signOut` | `LogoutButton` → `signOut()` | ✓ WIRED | logout in shared shell |
| client surfaces | publishable key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only | ✓ WIRED | no secret in any client module |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `dashboard/page.tsx` | `categories` | `supabase.from('categories').select('name, kind').order('sort')` under user JWT | Yes — RLS-filtered live query; round-trip returns 11 seeded rows, 0 when signed out | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite green | `npx vitest run` | 5 files, 26/26 passed | ✓ PASS |
| Strict typecheck | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Local stack reachable | `curl http://127.0.0.1:55321/rest/v1/` | HTTP 200 | ✓ PASS |
| Secret absent from client surfaces | `grep sb_secret_|service_role|SUPABASE_SECRET_KEY src/app src/components src/actions src/lib/supabase` | none found | ✓ PASS |
| Bundle-secret gate over real build | `bash scripts/check-bundle-secrets.sh` | exit 0, no markers in `.next/static` | ✓ PASS |
| No float money column | `grep float|real|double|numeric|money supabase/migrations` | only the word "real" in a comment | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared for this phase; the SEC-02 gate (`scripts/check-bundle-secrets.sh`) was executed directly (exit 0). Not applicable beyond that.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AUTH-01 | 01-03 | Login email/senha | ✓ SATISFIED | signIn/signUp actions + forms; round-trip OK; 8/8 tests |
| AUTH-02 | 01-03 | Sessão persiste (SSR + middleware) | ✓ SATISFIED (code) | middleware getClaims refresh + layout re-check; browser refresh → 01-04 |
| AUTH-03 | 01-02 | RLS por user_id em tabelas + Storage | ✓ SATISFIED | uniform RLS + grants; two-user test green ×4 verbs ×2 tables + storage policy |
| AUTH-04 | 01-03 | Logout de qualquer página | ✓ SATISFIED (code) | LogoutButton in shared shell → signOut redirect |
| CAT-01 | 01-02 | Categorias padrão BR semeadas | ✓ SATISFIED | trigger seeds 11; alocacao/consumo correct; test green |
| SEC-02 | 01-01, 01-03 | Service-role só no servidor; dinheiro exato | ✓ SATISFIED | bundle gate green; money centavos test green; no secret in client |

No orphaned requirements: all 6 phase requirements (AUTH-01/02/03/04, CAT-01, SEC-02) are claimed by plans 01-01/02/03 and satisfied locally.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No `TODO`/`FIXME`/`TBD`/`XXX`/`HACK` debt markers in phase-modified source; no placeholder/stub returns; dashboard reads real data | — | None |

The `// RED until Wave N` annotations in the test files are not stubs or debt markers — they were RED-first TDD scaffolding now driven GREEN (26/26). The `statements` bucket having no upload flow is the documented Phase-1 boundary-only scope (upload = Phase 4), not a stub.

### Human Verification Required

The browser-bound confirmations (session persistence across refresh, logout redirect/block in a real browser) and the remote deploy are scheduled into Plan 01-04 (`autonomous:false`), which is deferred by explicit user decision. They are recorded as Deferred Items above rather than as a blocking human gate, because:
- the underlying wiring is present, typecheck-clean, and exercised by a live local auth round-trip (`ROUNDTRIP_OK`), and
- the deploy/credential steps are intentionally out of autonomous scope.

When the user runs Plan 01-04 they should confirm: (1) login persists across a browser refresh on the deployed URL, (2) logout from a page redirects to `/auth/login` and protected routes are blocked, (3) the deployed Vercel URL serves login → dashboard against the remote project.

### Gaps Summary

No gaps. Every Phase-1 Success Criterion is satisfied in the local codebase with running-stack evidence: real email/password auth, uniform RLS (USING + WITH CHECK) with DML grants making RLS the genuine gate, two-user isolation proven across all four verbs on both tables plus the per-folder Storage policy, 11 BR categories seeded by a SECURITY DEFINER signup trigger (Investimentos + Reserva = alocacao), money as integer centavos with exactness proven, and the service-role key absent from the client bundle (gate green over a real build). The two irreversible pitfalls (float money, RLS leak) are front-loaded and verified. The only outstanding items are the credential/browser-bound confirmations deliberately deferred to Plan 01-04 — not implementation gaps.

---

_Verified: 2026-06-16T16:35:00Z_
_Verifier: Claude (gsd-verifier)_
