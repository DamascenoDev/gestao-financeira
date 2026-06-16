---
phase: 01-funda-o-auth-rls-dinheiro-schema
reviewed: 2026-06-16T13:30:00Z
depth: deep
reviewer: gsd-code-reviewer
files_reviewed: 25
files_reviewed_list:
  - supabase/migrations/0001_profiles.sql
  - supabase/migrations/0002_categories.sql
  - supabase/migrations/0003_storage_statements.sql
  - src/lib/supabase/client.ts
  - src/lib/supabase/server.ts
  - src/lib/supabase/middleware.ts
  - src/middleware.ts
  - src/actions/auth.ts
  - src/lib/auth-schema.ts
  - src/lib/money.ts
  - src/app/(app)/layout.tsx
  - src/app/(app)/dashboard/page.tsx
  - src/app/(auth)/auth/login/page.tsx
  - src/app/(auth)/auth/signup/page.tsx
  - src/app/page.tsx
  - src/app/layout.tsx
  - src/components/auth-form.tsx
  - src/components/logout-button.tsx
  - src/types/database.types.ts
  - tsconfig.json
  - scripts/check-bundle-secrets.sh
  - tests/rls-isolation.test.ts
  - tests/seed-categories.test.ts
  - tests/helpers/local-supabase.ts
  - .gitignore
findings:
  critical: 0
  high: 2
  medium: 4
  low: 4
  total: 10
status: findings
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-16T13:30:00Z
**Depth:** deep (cross-file: middleware ↔ routes, actions ↔ schema, RLS ↔ test harness)
**Files Reviewed:** 25
**Status:** findings (0 CRITICAL, 2 HIGH, 4 MEDIUM, 4 LOW)

## Summary

The Phase-1 foundation is, on its highest-stakes axes, **correct and well-built**. I attacked the two irreversible footguns first and could not break either:

- **Secret handling (SEC-02):** No secret/service-role key reaches any client or `"use client"` surface. `grep` across `src/` finds the secret key referenced nowhere — all three clients use only `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The secret key lives exclusively in the test-only `tests/helpers/local-supabase.ts`, which is hard-guarded to `127.0.0.1`/`localhost`. `.env.local` is gitignored (`.env*` + `!.env.example`) and confirmed **untracked** (`git ls-files` shows only `.env.example`). The `.next/static` grep gate exists. No leak. Phase 1 genuinely needs no secret key, so the absence of `import 'server-only'` guards is acceptable (there is no secret-touching module to guard) — see LOW-04.
- **RLS / isolation (AUTH-03):** Every table has `ENABLE ROW LEVEL SECURITY`, a uniform `for all to authenticated using ((select auth.uid()) = user_id) with check (...)` policy with **both** USING and WITH CHECK, and the table-level `grant ... to authenticated` so RLS is the genuine gate rather than a privilege-deny false-green (the exact Pitfall-2 trap, correctly avoided and even commented). Storage has a private bucket + per-`{user_id}/`-folder policy. The two-user isolation test exercises all four verbs.
- **Money:** No float anywhere money is *stored* — schema columns are deferred and the convention helper rounds once. (Two real edge-case defects in the helper below.)
- **Auth correctness:** `getClaims()` is used (not `getSession`/`getUser`), with **no code between `createServerClient` and `getClaims()`** in middleware; `(app)/layout.tsx` re-checks server-side (defense in depth); Server Actions validate with Zod before touching Supabase. Unit tests (money + auth actions) pass: 14/14 green.

The findings below are real but none are CRITICAL: two HIGH items are silent-failure money bugs that will corrupt amounts the moment Phase 2 wires the helper to a DB write, plus a schema integrity gap that lets the 1:1 `profiles` invariant be violated. The rest are robustness/correctness/quality items.

## High

### HG-01: `parseBRLToCents` silently returns `NaN` on common real inputs (money corruption vector)

**File:** `src/lib/money.ts:9-12`
**Issue:** The helper does `Math.round(Number(normalized) * 100)` with **no validation of the parse result**. Verified empirically:
- `parseBRLToCents('R$ 10,00')` → **`NaN`** (a currency-prefixed string is the single most likely thing a user pastes/types)
- `parseBRLToCents('abc')` → **`NaN`**
- `parseBRLToCents('')` → **`0`** (a blank field is silently treated as zero reais)

`NaN` is not an integer and `Math.round(NaN)` is `NaN`; if/when Phase 2 feeds this into a `bigint` column the write either errors opaquely or (worse, depending on the path) lands a wrong value. A blank-→-0 coercion is an even quieter data-integrity bug for a financial app. The existing test (`money.test.ts:23-27`) only asserts integer-ness over *known-good* inputs, so this is uncaught. This is foundation code whose whole reason to exist (Pitfall 1) is money exactness — it must reject non-money rather than emit `NaN`/silent-0.
**Fix:**
```typescript
export function parseBRLToCents(input: string): number {
  // Strip an optional R$ prefix and surrounding whitespace, then normalize
  // pt-BR grouping (.) / decimal (,) to a JS-parseable number.
  const normalized = input
    .trim()
    .replace(/^R\$\s*/i, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const value = Number(normalized)
  if (normalized === '' || !Number.isFinite(value)) {
    throw new Error(`Valor monetário inválido: "${input}"`)
  }
  return Math.round(value * 100)
}
```
Add tests for `''`, `'abc'`, `'R$ 10,00'`, and a negative value to lock the contract.

### HG-02: `profiles` "1:1 with auth.users" invariant is not enforced — `user_id` lacks UNIQUE

**File:** `supabase/migrations/0001_profiles.sql:7-12`
**Issue:** The table is documented as 1:1 with `auth.users` and the uniform RLS shape relies on `id == user_id`. But only `id` is `primary key`; `user_id` has **no UNIQUE constraint**. The RLS `WITH CHECK ((select auth.uid()) = user_id)` permits an authenticated user to `INSERT` *additional* profile rows for themselves with a different `id` (any `id` value that is also a valid `auth.users(id)` — e.g. their own duplicated, which the PK blocks, but the model still allows N rows per `user_id` if `id` ever diverges from `user_id` in a future migration or manual insert). The moment any Phase-2+ code does `.from('profiles').single()` it can throw `PGRST116` (multiple/zero rows) on a "1:1" table the schema never actually constrained to 1:1. Cheap to enforce now, expensive to retrofit after rows exist.
**Fix:**
```sql
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);
```
(`unique` on `user_id` also makes the `profiles_user_id_idx` index redundant — the unique constraint creates its own index — so that `create index` line can be dropped.)

## Medium

### MD-01: `formatCents` loses precision above `Number.MAX_SAFE_INTEGER` centavos

**File:** `src/lib/money.ts:20-22`
**Issue:** Money is stored as `bigint` (correctly), but `formatCents(cents: number)` takes a JS `number` and does `cents / 100`. Any centavos value beyond `2^53` (≈ R$ 90 trillion) silently loses precision — and more practically, reading a `bigint` column through supabase-js can yield a `string` or `number` depending on size/driver, so passing it straight in is fragile. For a personal-finance app the headline risk is low, but the type boundary (`bigint` DB ↔ `number` helper) is exactly where the "no float in money" discipline leaks. Establish the safe boundary now since this is the convention everything inherits.
**Fix:** Accept `number | bigint`, do integer division for the major unit and keep the remainder exact:
```typescript
export function formatCents(cents: number | bigint): string {
  const c = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(cents))
  const reais = Number(c / 100n)
  const centsPart = Number(c % 100n < 0n ? -(c % 100n) : c % 100n)
  // ...format via Intl with explicit minor unit; or at minimum document the
  // safe range and assert Number.isSafeInteger(cents) in the number path.
}
```
At a minimum, guard the `number` path with `if (!Number.isSafeInteger(cents)) throw ...`.

### MD-02: Authenticated users are not redirected away from `/auth/login` and `/auth/signup`

**File:** `src/lib/supabase/middleware.ts:37-45`
**Issue:** The redirect only sends *unauthenticated* users to `/auth/login`. There is no inverse guard, and the `(auth)` pages do not call `getClaims()`. A logged-in user navigating to `/auth/login` or `/auth/signup` sees the login form and can re-submit `signUp` (which, with confirmations off, errors as "User already registered") — confusing, and a minor open-signup surface. Not a security hole (RLS still isolates), but a correctness/UX gap in the protected-routing model.
**Fix:** In the `(auth)` route group add a layout (or per-page check) that redirects authenticated users to `/dashboard`:
```typescript
const { data } = await supabase.auth.getClaims()
if (data?.claims) redirect('/dashboard')
```

### MD-03: `signOut` failure is swallowed — user believes they logged out when they may not have

**File:** `src/actions/auth.ts:58-62`
**Issue:** `await supabase.auth.signOut()` ignores its returned `{ error }`, then unconditionally `redirect('/auth/login')`. If `signOut` fails (network/cookie issue), the session cookie may persist while the UI claims the user is logged out — a security-relevant false sense of logout on a financial app, and it diverges from the rest of the file which carefully threads errors. The `logout-button.tsx` calls this fire-and-forget with no error channel either.
**Fix:**
```typescript
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    // log server-side; do not silently pretend the session is gone
    console.error('signOut failed:', error.message)
  }
  redirect('/auth/login')
}
```
(Ideally surface failure to the user; at minimum stop discarding it.)

### MD-04: Storage policy is `for all to authenticated` with no per-operation scoping, and the bucket row itself is world-listable to authenticated

**File:** `supabase/migrations/0003_storage_statements.sql:13-23`
**Issue:** The object-level policy is correct and path-scoped. However: (a) `for all` bundles SELECT/INSERT/UPDATE/DELETE under one predicate — fine for now, but when upload lands in Phase 4 you'll likely want INSERT-time checks distinct from SELECT (e.g. content-type/size) and a single `for all` makes that harder to evolve safely; (b) there is no policy on `storage.buckets`, so any authenticated user can enumerate the existence/metadata of the `statements` bucket. Neither leaks file contents (object policy holds), but the boundary is looser than the "private from the first byte" intent. Acceptable for Phase 1 *if consciously deferred*; flagging so it is not forgotten when upload ships.
**Fix:** Document the deferral in the migration, and in Phase 4 split into explicit `for select` / `for insert` / `for update` / `for delete` policies. Consider whether `storage.buckets` should be locked down for the multi-user (wife) scenario.

## Low

### LW-01: Dead `/login` branch in the middleware redirect guard

**File:** `src/lib/supabase/middleware.ts:39`
**Issue:** The guard exempts `request.nextUrl.pathname.startsWith('/login')`, but no `/login` route exists — the only auth routes are `/auth/login` and `/auth/signup`, already covered by the `'/auth'` prefix. The `/login` check is dead (verbatim carryover from the upstream Supabase template). Harmless, but misleading: a reader assumes a `/login` route exists, and the broad `startsWith('/auth')` also unintentionally exempts *any* future `/auth/*` route from protection.
**Fix:** Remove the `/login` clause; consider tightening `/auth` to the exact auth routes if future `/auth/*` routes should be protected.

### LW-02: `<html lang="en">` on a pt-BR-only application

**File:** `src/app/layout.tsx:28`
**Issue:** The entire UI, content, and currency are pt-BR, but the root `lang` is `"en"`. This misinforms screen readers and translation tooling.
**Fix:** `lang="pt-BR"`.

### LW-03: `Home` redirects to `/dashboard` relying solely on middleware for the unauth case

**File:** `src/app/page.tsx:3-7`
**Issue:** `/` unconditionally `redirect('/dashboard')`. For an unauthenticated user the middleware catches `/dashboard` and bounces to `/auth/login`, so the net behavior is correct — but it's two redirects and couples `/` correctness to the middleware matcher. Minor; works today.
**Fix:** Optionally check `getClaims()` in `page.tsx` and redirect to `/auth/login` directly when unauthenticated, saving a hop. Not required.

### LW-04: No `import 'server-only'` on the server Supabase module (defense-in-depth gap)

**File:** `src/lib/supabase/server.ts:1`
**Issue:** `server-only` is installed (per `package.json`) and SEC-02 calls for guarding any secret-touching server module with it. Phase 1 legitimately touches **no** secret key, so there is no leak today — but `server.ts` is the natural home for any future admin/secret client, and adding the guard now makes a later accidental client import fail the build loudly rather than silently bundle. Low because there is presently nothing secret to protect.
**Fix:** Add `import 'server-only'` at the top of `src/lib/supabase/server.ts` (and any future module that may import the secret key).

---

## Verification notes (what I tried to break and couldn't)

- **Secret in bundle:** `grep -rniE "SECRET_KEY|service_role|sb_secret" src/` → no matches. Secret confined to localhost-guarded test helper. `.env.local` untracked + gitignored. PASS.
- **RLS false-green:** grants to `authenticated` are present on both tables, so the two-user isolation test proves the *policy* (not a privilege denial). USING + WITH CHECK present on every table and on storage. PASS.
- **`getClaims` placement:** no code between `createServerClient` and `getClaims()` in `middleware.ts`. PASS.
- **Zod boundary:** `signIn`/`signUp` call `parseCredentials` (safeParse) before any Supabase call; auth-action tests assert Supabase is *not* called on invalid input. PASS.
- **Seed correctness:** trigger is `security definer` + pinned `search_path`, inserts 1 profile + 11 categories, `Investimentos`/`Reserva` = `alocacao`. Matches CAT-01. PASS.
- **Email confirmation:** `supabase/config.toml` → `enable_confirmations = false` (v1 intent). Consistent with the signUp redirect-on-success comment. PASS.
- **Unit tests:** `vitest run` on money + auth actions → 14/14 green.

---

_Reviewed: 2026-06-16T13:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
