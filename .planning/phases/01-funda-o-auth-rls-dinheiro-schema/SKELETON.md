# Walking Skeleton — Gestão Financeira Pessoal

**Phase:** 1
**Generated:** 2026-06-16

## Capability Proven End-to-End

> One sentence: the smallest user-visible capability that exercises the full stack.

A new user signs up / logs in, lands on a deployed `/dashboard` page that reads **their own RLS-isolated, trigger-seeded BR categories** from their personal Supabase project, their session persists across a browser refresh, and they can log out from any page — proving scaffold + routing + real DB write (signup seed trigger) + real DB read (dashboard) + real UI interaction (auth) + the two irreversible security boundaries (RLS isolation, secret-key containment) all work together, locally and on Vercel.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.9 App Router, TypeScript strict (no JS) | Locked in PROJECT.md; Server Actions + middleware are the home for auth; strict TS is a hard user preference. Scaffolded with `--src-dir`, `@/*` alias, Turbopack. |
| Data layer | Supabase Postgres, money as `bigint` centavos | Locked stack. Money is integer centavos forever (`src/lib/money.ts`), never float — front-loads the irreversible float pitfall. Aggregation libs (`decimal.js`) deferred to Phase 2/3. |
| Auth | Supabase Auth email/password via `@supabase/ssr` (publishable key + `getClaims()`) | **The** current App Router pattern. `getAll`/`setAll` cookie interface, middleware session refresh, `getClaims()` (not `getSession()`/`getUser()`) for spoof-safe protection. Custom shadcn forms (NOT `@supabase/auth-ui-react`). Email confirmation OFF in v1. |
| Authorization / isolation | Postgres RLS `(select auth.uid()) = user_id` (USING + WITH CHECK, `TO authenticated`) on every table + per-folder Storage RLS | RLS is the security boundary, not app code. Every table carries `user_id` + an index from day one (multi-user-ready; spouse joins with zero migration). Denials return empty, so a two-user isolation test is mandatory. |
| Secret handling | Publishable key client-side; secret key server-only (`import 'server-only'`), never `NEXT_PUBLIC_`; CI grep on `.next/static` | Secret-in-bundle is the most catastrophic Supabase mistake. Phase 1 likely needs the secret key for nothing (seed runs via DB trigger). A build-time grep gate enforces SEC-02. |
| Per-user seed | `SECURITY DEFINER` `handle_new_user` trigger on `auth.users` (pinned `search_path`) | Seeds 1 profile + 11 BR categories atomically with account creation, inside Postgres — no app round-trip. Each user owns/edits their own copies. |
| Deployment target | Vercel (dev/preview deploy of the skeleton); local-first dev via Supabase CLI + Docker | Locked. Develop & verify entirely on the LOCAL Supabase stack (Docker is running) first; `db push` + Vercel deploy are credential/interactive (`autonomous: false`). |
| Directory layout | `src/app/(auth|app)/*`, `src/lib/supabase/*`, `src/actions/*`, `src/lib/money.ts`, `src/types/database.types.ts`; `supabase/migrations/*` at repo root; `tests/*` for integration | RESEARCH Recommended Structure (Claude's discretion → `src/`). Pure/testable libs isolated; all auth mutations in `actions/`; schema-as-SQL is the contract. Scaffolded INTO the existing repo, preserving `.planning/` and `agents/`. |

## Stack Touched in Phase 1

- [x] Project scaffold (Next 16 + TS strict + Tailwind v4 + shadcn; ESLint; vitest test runner)
- [x] Routing — `(auth)/login`, `(auth)/signup`, protected `(app)/dashboard` + middleware matcher
- [x] Database — real write (signup → `handle_new_user` seeds profile + 11 categories) AND real read (dashboard `select` on `categories`, RLS-filtered)
- [x] UI — custom shadcn login/signup forms + logout control wired to `signIn`/`signUp`/`signOut` Server Actions
- [x] Deployment — Vercel dev deploy of the skeleton (reachable URL: login → dashboard); local full-stack run via `supabase start` + `npm run dev`

## Out of Scope (Deferred to Later Slices)

> Anything that is *not* in the skeleton. Explicit, to prevent later phases re-litigating Phase 1's minimalism.

- Income (receitas), transactions, budgets/metas, reservas, MEI tables and UI → Phases 2-5 (only `profiles` + `categories` exist now).
- Storage **upload/parse** flow → Phase 4 (this phase only **establishes** the private bucket + per-folder RLS; no signed URLs, no file handling).
- AI classification, `merchant_patterns` memory, parsing libs (`ai`, `pdf-parse`, `papaparse`, `ofx-data-extractor`) → Phase 4.
- Aggregation libs (`decimal.js`, `date-fns`), charts (`recharts`), tables (`@tanstack/react-table`) → Phases 2-3.
- Shared-account/family UI and re-enabling email confirmation → v2 (when the spouse joins, MUL-01).
- LGPD export/delete, CSV export, full two-user hardening audit → Phase 6.
- Category CRUD (create/rename/remove, consumo/alocação editing) → Phase 2 (Phase 1 only seeds the defaults).

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions (RLS shape, centavos money, SSR auth, `user_id`-scoping):

- Phase 2: Receitas (recurring + ad-hoc), editable categories, manual transactions with a filterable extrato — the manual data loop.
- Phase 3: Metas/aderência (monthly + annual, % of net received income) + reservas with derived balances.
- Phase 4: Upload OFX/CSV → parse → dedup → memory-first → AI fallback → review that learns merchant→category patterns.
- Phase 5: MEI / DASN-SIMEI (NFs, applicable R$81k limit, annual report) — independent module on the Phase-1 foundation.
- Phase 6: Endurecimento — LGPD export/delete, CSV export, two-user isolation hardening, secret/PII audit.
