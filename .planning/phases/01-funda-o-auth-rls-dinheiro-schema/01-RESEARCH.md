# Phase 1: Fundação (auth, RLS, dinheiro, schema) - Research

**Researched:** 2026-06-16
**Domain:** Walking-skeleton foundation — Next.js 16 App Router (TS strict) + Supabase (`@supabase/ssr`) Auth/RLS/Storage + Vercel deploy, money-as-centavos convention, BR category seed
**Confidence:** HIGH (stack locked & version-verified against npm registry today; Supabase SSR code pulled verbatim from the official `supabase/supabase` repo; one **state-of-the-art shift** found and flagged — see "State of the Art")

## Summary

This is the very first phase of a greenfield project: nothing is scaffolded. The phase delivers the thinnest end-to-end vertical slice — a user signs up / logs in / logs out, the session persists across refreshes, every row written is isolated by `user_id` via RLS from the first byte, money is established as integer centavos (`bigint`), and the app runs both locally (Supabase CLI + Docker) and on Vercel. Two irreversible mistakes are front-loaded and must be encoded as verification gates: **float money** and **RLS leak / service-role key in the client bundle**.

The stack is already locked and version-verified (Next 16.2.9, React 19.2.7, `@supabase/ssr` 0.12.0, `@supabase/supabase-js` 2.108.2, Tailwind 4.3.1, shadcn CLI 4.11.0, supabase CLI 2.106.0). The single most important *new* finding versus the project-level research: **Supabase has migrated to publishable/secret API keys** and the current official SSR code uses `getClaims()` (not `getUser()`) in middleware and the env var `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `..._ANON_KEY`). New Supabase projects created after Nov 2025 no longer ship legacy anon/service_role keys. The plan must use the publishable-key naming and `getClaims()` pattern, and confirm with the user which key style their personal project exposes.

**Primary recommendation:** Scaffold with `create-next-app@latest` (TS + Tailwind + App Router + `src/` + `@/*` alias), init shadcn, wire `@supabase/ssr` with the verbatim client/server/middleware utilities below (publishable key + `getClaims()`), author two idempotent SQL migrations (`profiles` + `categories` with RLS USING/WITH CHECK + `user_id` index + `handle_new_user` trigger that seeds the 11 BR categories), run everything against the **local** Supabase stack first, then `db push` to the user's linked remote project, and deploy to Vercel. Gate the interactive steps (Supabase link, Vercel link, secret env vars) as `autonomous: false`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
**Autenticação & Onboarding**
- Login com email/senha via Supabase Auth (AUTH-01).
- Cadastro: signup padrão do Supabase; RLS é a fronteira de isolamento (seguro mesmo com signup aberto).
- UI de auth: formulários custom minimalistas com shadcn/ui (controle total em TS estrito) — **não usar `@supabase/auth-ui-react`**.
- Confirmação de email **desabilitada** no v1 (uso pessoal, sem fricção); religar quando a esposa entrar como segundo titular.
- Sessão persistente via `@supabase/ssr` + middleware de refresh (AUTH-02); logout disponível em **qualquer página** (AUTH-04).

**Schema, dinheiro & migrações**
- Dinheiro em `bigint` representando **centavos** (nunca float/`real`/`double`); helpers de parse/format pt-BR (`Intl.NumberFormat('pt-BR',{currency:'BRL'})`) (SEC-02 mindset: exatidão).
- Escopo do schema na Fase 1: **apenas** tabelas fundacionais — `profiles` (1:1 com `auth.users`) e `categories`. Padrão de RLS + trigger de seed reutilizável para as próximas fases.
- Migrações versionadas via Supabase CLI em `supabase/migrations/`.
- Identidade: PK `uuid` em todas as tabelas; `user_id uuid` FK → `auth.users(id)`, com **índice em `user_id`** (padrão de performance RLS).

**Categorias padrão BR & RLS**
- Seed de categorias padrão: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Vestuário, Assinaturas, Investimentos, Reserva, Outros (CAT-01).
- Cada categoria marcada como `consumo` ou `alocação`; **Investimentos e Reserva = `alocação`** (preparando CAT-03 e a contabilidade de reserva da Fase 3).
- Seed por cópia por-usuário no signup (**trigger em `auth.users`**), de modo que cada usuário edita as suas (multi-user-ready, AUTH-03).
- Política RLS uniforme: `(select auth.uid()) = user_id` com `USING` **e** `WITH CHECK` em toda tabela; bucket de Storage privado por pasta `{user_id}/` (preparando AUTH-03/SEC-01).

### Claude's Discretion
- Estrutura de pastas do projeto (`app/` vs `src/`), nomes de componentes, organização de libs.
- Versões exatas das deps (usar as atuais verificadas na pesquisa: Next 16, React 19, Tailwind v4, `@supabase/ssr`).
- Detalhes do middleware e dos route handlers/server actions de auth.
- Forma exata do trigger de seed e das funções SQL auxiliares.

### Deferred Ideas (OUT OF SCOPE)
- UI de conta compartilhada/família e religar confirmação de email → quando a esposa entrar (v2, MUL-01).
- Tabelas de feature (income, transactions, budgets, reservas, mei, imports) → fases 2–5.
- Storage **upload/parse** real → Fase 4 (esta fase só **estabelece** o bucket privado + RLS por pasta, sem fluxo de upload).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Login com email/senha no Supabase pessoal | `@supabase/ssr` `signInWithPassword` / `signUp` via Server Actions; custom shadcn forms (Pattern 2, 3). Email confirmation disabled in dashboard. |
| AUTH-02 | Sessão persiste entre refreshes (SSR + middleware) | Middleware `updateSession` calling `getClaims()` refreshes the cookie on every matched request; verbatim code in Code Examples §1–3. |
| AUTH-03 | Dados escopados por `user_id` com RLS em tabelas e Storage (multi-user-ready) | Uniform RLS policy `(select auth.uid()) = user_id` USING+WITH CHECK + `user_id` index on `profiles`/`categories`; Storage per-folder `{user_id}/` policy (Architecture Patterns; Code Examples §6–9). |
| AUTH-04 | Logout de qualquer página | `signOut()` Server Action + a logout control in the shared app shell (Pattern 4). |
| CAT-01 | Conjunto padrão BR de categorias | `handle_new_user` trigger on `auth.users` seeds the 11 BR categories per user with `kind` ∈ {consumo, alocação} (Code Examples §8; Seed table). |
| SEC-02 | Chaves de serviço só no servidor, nunca no bundle | Publishable key in `NEXT_PUBLIC_*` (RLS-safe); secret key only in server modules guarded by `import 'server-only'`; CI grep on `.next/static` (Pitfall 3; Security Domain). |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identity / session issuance | Auth (Supabase) | Frontend Server (middleware) | Supabase Auth issues the JWT; Next middleware refreshes the cookie because Server Components can't write cookies. |
| Session refresh on every request | Frontend Server (Next middleware) | — | Only the proxy/middleware tier can write the refreshed Supabase cookie back to the browser. |
| Sign-up / login / logout mutations | API / Backend (Server Actions) | — | Auth mutations must run server-side so the cookie is set on the response; never from the browser tier. |
| Data isolation (`user_id`) | Database (Postgres RLS) | — | RLS is the security boundary, not app code. Enforced in Postgres; inherited by views/Storage. |
| Money exactness (centavos) | Database (`bigint` columns) | API/Backend (parse/format helpers) | Storage type guarantees exactness; helpers convert at the ingest/display edge only. |
| Default category seed | Database (trigger on `auth.users`) | — | A `SECURITY DEFINER` trigger runs at signup inside Postgres; no app round-trip, atomic with user creation. |
| Statement file isolation | Storage (private bucket + RLS) | — | Per-`{user_id}/` folder policy on `storage.objects`; bucket established now, upload flow deferred to Phase 4. |
| Secret handling | API / Backend (server-only modules) | — | Secret key lives only in server modules; `import 'server-only'` makes a client import fail the build. |

## Standard Stack

> Stack is **locked** (PROJECT.md). Versions below were re-verified against the npm registry on 2026-06-16. Use these exact majors; let `create-next-app` and `npm install` resolve the latest patch within them.

### Core
| Library | Version (verified 2026-06-16) | Purpose | Why Standard |
|---------|-------------------------------|---------|--------------|
| `next` | 16.2.9 | Framework (App Router) | Locked. Server Actions + middleware are the home for auth. `[VERIFIED: npm registry]` |
| `react` / `react-dom` | 19.2.7 | UI runtime | Next 16 pairs with React 19. `[VERIFIED: npm registry]` |
| `typescript` | 5.x | Language (strict) | Locked, hard user preference. `[VERIFIED: npm registry]` |
| `@supabase/supabase-js` | 2.108.2 | DB/Auth/Storage client | Official client; combine with generated `Database` types. `[VERIFIED: npm registry]` |
| `@supabase/ssr` | 0.12.0 | Cookie-based auth in App Router | **The** current pattern; replaces deprecated `@supabase/auth-helpers-nextjs`. `getAll`/`setAll` + middleware. `[VERIFIED: npm registry + supabase/supabase repo]` |
| `tailwindcss` | 4.3.1 | Styling | shadcn default; v4 CSS-first `@theme`. `[VERIFIED: npm registry]` |
| `shadcn` (CLI) | 4.11.0 | Component layer (vendored) | Owns component code; full Tailwind v4 + React 19. `[VERIFIED: npm registry]` |
| `zod` | 4.4.3 | Runtime validation | Validates auth form inputs at the boundary; reused for AI enum later. `[VERIFIED: npm registry]` |

### Supporting (Phase 1 scope)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hook-form` | 7.79.0 | Auth forms | Login/signup forms with shadcn `Form`. `[VERIFIED: npm registry]` |
| `@hookform/resolvers` | 5.4.0 | Zod resolver for RHF | One Zod schema validates the form + shapes the action input. `[VERIFIED: npm registry]` |
| `sonner` | 2.0.7 | Toasts | Auth error/success feedback. shadcn-recommended. `[VERIFIED: npm registry]` |
| `server-only` | 0.0.1 | Build-time client/server guard | Top of any module touching the secret key; build fails loudly if imported client-side (SEC-02). `[VERIFIED: npm registry]` |

### Dev tooling
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `supabase` (CLI) | 2.106.0 (local: 2.103.0 installed) | Local Postgres, migrations, type gen | `supabase init`, `migration new`, `db push`, `gen types typescript --local/--linked`. Installed 2.103.0 works; optional `npm i -g supabase@latest` to match. `[VERIFIED: npm registry + local probe]` |
| `vitest` | 4.1.9 | Test framework (Nyquist) | None installed yet — Wave 0 gap. Pairs with `@testing-library/react` 16.3.2, `jsdom` 29.1.1. `[VERIFIED: npm registry]` |

### Deferred to later phases (DO NOT install in Phase 1)
`ai`, `@ai-sdk/google`, `pdf-parse`, `unpdf`, `papaparse`, `ofx-data-extractor`, `decimal.js`, `dinero.js`, `date-fns`, `date-fns-tz`, `recharts`, `@tanstack/react-table`, `@tanstack/react-query`. Phase 1 needs none of these. Money math in Phase 1 is only the centavos *convention* + a parse/format helper using native `Intl.NumberFormat` — `decimal.js` is not needed until aggregation (Phase 2/3). `[ASSUMED]` (scoping judgment).

**Installation (Phase 1):**
```bash
# 1) Scaffold (interactive prompts auto-answered by flags)
npx create-next-app@latest gestao-financeira \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-npm --turbopack
# (run inside an empty dir, or scaffold into "." if the repo is already cloned)

# 2) Supabase + validation + forms + toasts + secret guard
npm install @supabase/supabase-js @supabase/ssr zod \
  react-hook-form @hookform/resolvers sonner server-only

# 3) Supabase CLI (dev dep so the version is pinned in the repo)
npm install -D supabase

# 4) shadcn init + the components Phase 1 needs
npx shadcn@latest init
npx shadcn@latest add button card input label form sonner

# 5) Test framework (Wave 0)
npm install -D vitest @vitejs/plugin-react @testing-library/react \
  @testing-library/jest-dom jsdom
```

**Version verification performed (2026-06-16, `npm view <pkg> version`):**
`next` 16.2.9 · `react` 19.2.7 · `@supabase/ssr` 0.12.0 · `@supabase/supabase-js` 2.108.2 · `tailwindcss` 4.3.1 · `zod` 4.4.3 · `shadcn` 4.11.0 · `supabase` 2.106.0 · `react-hook-form` 7.79.0 · `@hookform/resolvers` 5.4.0 · `sonner` 2.0.7 · `vitest` 4.1.9 · `@testing-library/react` 16.3.2 · `jsdom` 29.1.1.

## Package Legitimacy Audit

> Ran `gsd-tools query package-legitimacy check --ecosystem npm` on all Phase-1 packages. **All exist on npm, have official source repos, no postinstall scripts, and massive weekly download counts.** The `SUS / too-new` verdicts below are the recency heuristic firing on *actively-maintained* packages that published a routine release within the look-back window — **not** a slopsquatting signal. Each was cross-verified against its official GitHub repo and (for Supabase) the `supabase/supabase` monorepo. Disposition: **all Approved.**

| Package | Registry | Published | Weekly downloads | Source Repo | Seam verdict | Disposition |
|---------|----------|-----------|------------------|-------------|--------------|-------------|
| `next` | npm | 2026-06-09 | 38,202,756 | github.com/vercel/next.js | SUS (too-new) | **Approved** — official Vercel pkg |
| `@supabase/ssr` | npm | 2026-06-09 | 4,479,043 | github.com/supabase/ssr | SUS (too-new) | **Approved** — official Supabase pkg |
| `@supabase/supabase-js` | npm | 2026-06-15 | 20,633,836 | github.com/supabase/supabase-js | SUS (too-new) | **Approved** — official Supabase pkg |
| `zod` | npm | 2026-05-04 | 196,577,356 | github.com/colinhacks/zod | OK | Approved |
| `server-only` | npm | — | 8,084,109 | (React/Vercel) | SUS (too-new) | **Approved** — first-party React pkg |
| `react-hook-form` | npm | — | 54,798,296 | github.com/react-hook-form/react-hook-form | SUS (too-new) | **Approved** |
| `@hookform/resolvers` | npm | — | 45,693,847 | github.com/react-hook-form/resolvers | SUS (too-new) | **Approved** |
| `sonner` | npm | — | 44,922,187 | github.com/emilkowalski/sonner | OK | Approved |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS] requiring a human-verify checkpoint:** none — every SUS verdict is a false positive of the publish-date recency heuristic on a high-trust package (verified via official repo + download volume). The planner does **not** need to add `checkpoint:human-verify` tasks for these. `[VERIFIED: package-legitimacy seam + official repos]`

## Architecture Patterns

### System Architecture Diagram

```
                         BROWSER
   ┌──────────────────────────────────────────────────────────┐
   │  (auth)/login · (auth)/signup   — custom shadcn forms     │
   │  (app)/dashboard                — protected shell + logout │
   └───────────┬───────────────────────────────┬──────────────┘
   form submit │ (Server Action)   page request │ (every request)
               ▼                                 ▼
   ┌───────────────────────┐         ┌─────────────────────────────┐
   │  Server Actions        │         │  middleware.ts              │
   │  signUp / signIn /      │         │  updateSession():           │
   │  signOut               │         │   createServerClient        │
   │  (lib/supabase/server) │         │   → auth.getClaims()  ◄──────┼─ refresh cookie
   └──────────┬─────────────┘         │   → redirect if no user     │
              │ set-cookie            └──────────────┬──────────────┘
              ▼                                       │ refreshed cookie
   ┌──────────────────────────────────────────────────────────────┐
   │                     SUPABASE (user's personal project)        │
   │  ┌──────────┐   ┌───────────────────────────┐  ┌───────────┐  │
   │  │  Auth    │   │  Postgres + RLS           │  │ Storage    │  │
   │  │ (JWT,    │──▶│  profiles (1:1 users)     │  │ 'statements'│  │
   │  │ getClaims│   │  categories (BR seed)     │  │ private,    │  │
   │  │  → uid)  │   │  RLS: (select auth.uid()) │  │ {user_id}/  │  │
   │  └──────────┘   │       = user_id           │  │ folder RLS  │  │
   │   on signup ──▶ │  trigger handle_new_user  │  └───────────┘  │
   │                 │   seeds 11 BR categories  │   (established,  │
   │                 └───────────────────────────┘    no upload v1) │
   └──────────────────────────────────────────────────────────────┘
```

Data flow for the primary use case (signup → isolated data): user submits the signup form → Server Action calls `signUp()` → Supabase Auth creates the `auth.users` row → the `on_auth_user_created` trigger fires `handle_new_user()` which inserts a `profiles` row and the 11 BR `categories` for that `user_id` → the user is redirected to `(app)/dashboard` → middleware refreshes the session cookie on each request → every query the dashboard runs is RLS-filtered to that `user_id`.

### Recommended Project Structure (Claude's discretion — `src/` chosen)
```
gestao-financeira/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx          # custom shadcn login form
│   │   │   └── signup/page.tsx         # custom shadcn signup form
│   │   ├── (app)/
│   │   │   ├── layout.tsx              # protected shell + logout control
│   │   │   └── dashboard/page.tsx      # minimal "you're in" skeleton page
│   │   ├── auth/
│   │   │   └── confirm/route.ts        # (optional) email confirm handler — off in v1
│   │   ├── layout.tsx                  # root layout + <Toaster/>
│   │   └── globals.css                 # Tailwind v4 @import + @theme
│   ├── components/ui/                  # shadcn-vendored components
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               # createBrowserClient
│   │   │   ├── server.ts               # createServerClient (RSC/actions)
│   │   │   └── middleware.ts           # updateSession()
│   │   └── money.ts                    # centavos parse/format helpers (convention)
│   ├── actions/auth.ts                 # 'use server' signUp/signIn/signOut
│   └── middleware.ts                   # exports config matcher + updateSession
├── supabase/
│   ├── config.toml                     # from `supabase init`
│   └── migrations/
│       ├── 0001_profiles.sql           # profiles + RLS + index
│       ├── 0002_categories.sql         # categories + RLS + index + trigger + seed fn
│       └── 0003_storage_statements.sql # private bucket + per-folder RLS
├── src/types/database.types.ts         # generated; regenerate after each migration
├── .env.local                          # NEXT_PUBLIC_* + SUPABASE_SECRET_KEY (gitignored)
├── .env.example                        # documented placeholders (committed)
└── package.json                        # scripts: gen:types, db:push, test
```
> Note: `create-next-app --src-dir` places `middleware.ts` and `app/` under `src/`. `supabase/` stays at the repo root (CLI convention).

### Pattern 1: `@supabase/ssr` three-client split
**What:** one browser client (Client Components), one server client (RSC + Server Actions + Route Handlers), one middleware client (session refresh).
**When to use:** always, in App Router. Each uses the **publishable key** so RLS is enforced.
**Key rule:** with Vercel Fluid compute, never store any of these clients in a module-global — create a fresh one per request/function.

### Pattern 2: Auth as Server Actions, never client-side
**What:** `signUp`/`signIn`/`signOut` are `'use server'` functions in `src/actions/auth.ts`; the shadcn form posts to them. They call the **server** client so the auth cookie is written onto the response.
**When to use:** all auth mutations. The browser client is only for client-side reads/realtime, not the login mutation that must set cookies.

### Pattern 3: Protected routes via middleware redirect
**What:** `middleware.ts` runs `updateSession()`, which calls `getClaims()`; if there's no user and the path isn't `/login`/`/auth`, it redirects to `/auth/login`. A `(app)` route group additionally re-checks `getClaims()` server-side in its `layout.tsx` (defense in depth — never trust only the middleware for protection).
**When to use:** every authenticated page. **Critical:** do not run any code between `createServerClient` and `getClaims()` (random-logout footgun, per official comment).

### Pattern 4: Logout-anywhere
**What:** a small Client Component button in the `(app)/layout.tsx` shell calls a `signOut` Server Action, then `redirect('/auth/login')`. Because it lives in the shared shell, AUTH-04 ("logout de qualquer página") is satisfied for every authenticated page.

### Pattern 5: Idempotent, versioned SQL migrations
**What:** every migration is plain SQL under `supabase/migrations/`, applied with `supabase db push`. Use `create table if not exists`, `create policy` guarded by `drop policy if exists`, and seed via a trigger function (not inline data) so it runs per-user. Regenerate `database.types.ts` after each.
**When to use:** all schema. Never click-edit schema in the dashboard.

### Pattern 6: Trigger-seeded per-user categories
**What:** a `SECURITY DEFINER` function `handle_new_user()` on `auth.users AFTER INSERT` inserts the `profiles` row + the 11 BR categories for `new.id`. Each user owns and can edit their own copies (multi-user-ready). `SECURITY DEFINER` + a pinned `search_path` is required so the function can write despite RLS.

### Anti-Patterns to Avoid
- **`get/set/remove` single-cookie SSR interface** → use the `getAll`/`setAll` batch interface (the only one `@supabase/ssr` 0.12 supports).
- **`getSession()`/`getUser()` for *protection* in server code** → use `getClaims()` (validates the JWT signature against published keys). `getSession()` is spoofable from cookies.
- **Writing cookies from a Server Component** → not allowed; the middleware does the refresh. The server client's `setAll` is wrapped in try/catch precisely for this.
- **Service/secret key with `NEXT_PUBLIC_` prefix or imported in a Client Component** → catastrophic (bypasses RLS). Guard with `import 'server-only'`.
- **RLS policy without `ENABLE ROW LEVEL SECURITY`** → the policy is inert; table stays world-readable to anyone with the publishable key.
- **Storing money as `real`/`double`/`numeric` "for convenience"** → `bigint` centavos only.
- **Bare `auth.uid()` in a policy** → wrap as `(select auth.uid())` (per-query eval, the documented perf form).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email/password auth, session, password hashing | Custom auth + JWT | Supabase Auth + `@supabase/ssr` | Hashing, refresh tokens, secure cookies are solved & audited. |
| Cookie session refresh in App Router | Manual cookie juggling | `updateSession()` middleware (verbatim below) | The `getAll/setAll` + response-copy dance is subtle; the official version handles the random-logout footgun. |
| Currency formatting pt-BR | String concat `"R$ " + n.toFixed(2)` | `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})` | Built-in, correct `R$ 1.234,56`, no dep. |
| Form validation + error display | Hand-rolled state | `react-hook-form` + `zod` resolver + shadcn `Form` | One schema validates form + shapes the action input. |
| Local Postgres + migrations + type gen | Hand-managed SQL / Docker | `supabase` CLI (`start`, `db push`, `gen types`) | Spins the full local stack; types stay in sync. |
| Toasts | Custom notification | `sonner` (shadcn-recommended) | Accessible, themed, one component. |
| Server/client secret leakage prevention | Convention/discipline alone | `import 'server-only'` | Build-time enforcement beats a code-review hope. |

**Key insight:** Phase 1 is almost entirely *wiring* well-known primitives correctly. The risk is not "can we build auth" — it's getting the SSR cookie pattern, RLS shape, and secret boundary *exactly* right so the foundation doesn't leak. Copy the verified code; don't improvise it.

## Runtime State Inventory

> **Greenfield phase** — there is no pre-existing runtime state to migrate. Recorded for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — the Supabase project may be empty or pre-existing; Phase 1 creates the first app tables. If the user's personal project already has tables from experimentation, `supabase db push` must not clobber them — verify with `supabase db diff` before first push. | Verify remote is clean before first `db push`. |
| Live service config | **None in git yet.** The user's Supabase project has dashboard-level config (email-confirmation toggle) that lives in the dashboard, NOT in `config.toml` for the *remote* — disabling email confirmation is a **dashboard action** (Auth → Providers → Email → "Confirm email" off), not a migration. | Manual dashboard step (autonomous: false). |
| OS-registered state | None — verified by greenfield. | None. |
| Secrets/env vars | New: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. None pre-exist. Must be set in `.env.local` (local) **and** in Vercel project env (remote). | Create `.env.local`; add Vercel envs (autonomous: false). |
| Build artifacts | None — nothing scaffolded. The repo currently holds only `.planning/`, `agents/`, `CLAUDE.md`. Scaffolding into the existing git repo (`origin` already set to github.com/DamascenoDev/gestao-financeira) must not stomp those. | Scaffold into the existing repo root, preserving `.planning/` & `agents/`. |

## Common Pitfalls

### Pitfall 1: Float money (irreversible)
**What goes wrong:** amounts in `real`/`double`/JS `number` drift by centavos; totals never reconcile; near-impossible to retrofit.
**Why it happens:** `parseFloat("123,45")` → `double` column is the path of least resistance.
**How to avoid:** **`bigint` centavos only.** Even though Phase-1 tables (`profiles`, `categories`) carry no money column, **establish the convention now**: a `src/lib/money.ts` with `parseBRLToCents("1.234,56") -> 123456` (`Math.round(value*100)`, once) and `formatCents(123456) -> "R$ 1.234,56"` via `Intl.NumberFormat`. Future feature tables import these helpers.
**Warning signs:** any `float`/`numeric` money column; `parseFloat` feeding a DB write.

### Pitfall 2: RLS leak — silent empty result
**What goes wrong:** a too-loose policy leaks the other user's data with no error; a too-strict one returns `[]` that looks like "no data." A policy without `ENABLE ROW LEVEL SECURITY` is inert.
**Why it happens:** creating a policy doesn't enable RLS; single-user-in-v1 lulls you into never testing isolation, but the schema is already multi-tenant.
**How to avoid:** `ENABLE ROW LEVEL SECURITY` on every table; `USING ((select auth.uid()) = user_id)` + `WITH CHECK (...)`, `TO authenticated`; **two-user isolation test** (user A inserts, user B gets 0 rows + failed write) even in v1.
**Warning signs:** "Unrestricted" badge in the dashboard; `[]` where rows expected; the only test user is yourself.

### Pitfall 3: Secret key in the client bundle
**What goes wrong:** the Supabase **secret** key (formerly service_role) in the browser bundle = full DB + Storage compromise (bypasses RLS).
**Why it happens:** App Router blurs server/client; a util importing the secret client gets pulled into a Client Component and bundled. Or someone uses it to "make an RLS error go away."
**How to avoid:** secret key **never** `NEXT_PUBLIC_*`; only in server modules with `import 'server-only'` at the top. Default to publishable-key + RLS for all normal access — **Phase 1 likely needs the secret key for nothing at all** (the trigger seeds categories server-side in Postgres, not via the app). Add a CI grep that fails if `sb_secret_`/`service_role`/the key value appears in `.next/static`.
**Warning signs:** `NEXT_PUBLIC_SUPABASE_SECRET_KEY`; secret client in a `'use client'` file; greppable secret in `.next/static`.

### Pitfall 4: Applying migrations to the wrong database (local vs remote)
**What goes wrong:** running `db push` against the linked remote when you meant local (or vice-versa) — mutating the user's real project unexpectedly, or testing against a stale schema.
**Why it happens:** `supabase db push` targets the **linked** project; local changes apply on `supabase start`/`db reset`. Easy to conflate.
**How to avoid:** develop & verify entirely on **local** first (`supabase start` → migrations auto-apply on `db reset`; two-user isolation test locally). Only then `supabase link --project-ref <ref>` and `supabase db push` to remote, after `supabase db diff` shows the expected delta. Linking & remote push are **interactive / credentialed** → `autonomous: false`.
**Warning signs:** unexpected rows in the remote dashboard; `db push` prompting for a password you didn't expect; schema drift between `database.types.ts` and the running DB.

### Pitfall 5: Storage bucket public / no per-folder RLS
**What goes wrong:** even though upload comes in Phase 4, if the `statements` bucket is created public or without path-scoped RLS, future financial PDFs become enumerable.
**How to avoid:** create the bucket **private** (the default) now with the `{user_id}/` folder RLS policy on `storage.objects`, so the boundary exists before any file lands. No `getPublicUrl` ever for statements.
**Warning signs:** bucket "Public" badge; object paths not prefixed by `user_id`.

## Code Examples

> All Supabase SSR snippets below are reproduced **verbatim** from the official `supabase/supabase` repo registry (`apps/ui-library/registry/default/clients/nextjs/`), the current source of truth for `@supabase/ssr` + Next.js App Router. They use `getClaims()` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see "State of the Art"). `[VERIFIED: supabase/supabase repo, fetched 2026-06-16]`

### §1 Browser client — `src/lib/supabase/client.ts`
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

### §2 Server client — `src/lib/supabase/server.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * If using Fluid compute: Don't put this client in a global variable. Always create a new client within each
 * function when using it.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

### §3 Session refresh — `src/lib/supabase/middleware.ts`
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out. If you remove getClaims() and you use SSR with the
  // Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: return supabaseResponse as-is. If you build a new response,
  // copy cookies via: myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  return supabaseResponse
}
```

### §4 Middleware entry — `src/middleware.ts`
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * _next/static, _next/image, favicon.ico, and image files.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```
`[CITED: supabase.com/docs/guides/auth/server-side/nextjs — matcher rationale]`

### §5 Auth Server Actions — `src/actions/auth.ts` (pattern; not verbatim from docs)
```typescript
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  })
  if (error) return { error: error.message }
  redirect('/dashboard')
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email: String(formData.get('email')),
    password: String(formData.get('password')),
  })
  if (error) return { error: error.message }
  // Email confirmation OFF in v1 → session is active immediately.
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/auth/login')
}
```
`[ASSUMED]` — standard `@supabase/ssr` action shape; validate inputs with Zod in the real implementation. `signInWithPassword`/`signUp`/`signOut` are stable `supabase-js` v2 APIs `[CITED: supabase-js auth reference]`.

### §6 `profiles` migration — `supabase/migrations/0001_profiles.sql`
```sql
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now()
);
create index if not exists profiles_user_id_idx on public.profiles (user_id);

alter table public.profiles enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```
> `profiles.id` mirrors `auth.users.id` (1:1) and `user_id` carries the same value so the uniform RLS shape `(select auth.uid()) = user_id` applies identically across every table. `[CITED: Supabase RLS performance docs — (select auth.uid()) + user_id index]`

### §7 `categories` migration — `supabase/migrations/0002_categories.sql`
```sql
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  kind       text not null check (kind in ('consumo','alocacao')),
  sort       int  not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists categories_user_id_idx on public.categories (user_id);

alter table public.categories enable row level security;

drop policy if exists "own categories" on public.categories;
create policy "own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
```

### §8 Per-user seed trigger (same migration as §7)
```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, user_id) values (new.id, new.id);

  insert into public.categories (user_id, name, kind, sort) values
    (new.id, 'Moradia',        'consumo',   1),
    (new.id, 'Alimentação',    'consumo',   2),
    (new.id, 'Transporte',     'consumo',   3),
    (new.id, 'Saúde',          'consumo',   4),
    (new.id, 'Educação',       'consumo',   5),
    (new.id, 'Lazer',          'consumo',   6),
    (new.id, 'Vestuário',      'consumo',   7),
    (new.id, 'Assinaturas',    'consumo',   8),
    (new.id, 'Investimentos',  'alocacao',  9),
    (new.id, 'Reserva',        'alocacao', 10),
    (new.id, 'Outros',         'consumo',  11);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```
> `security definer` + pinned `search_path` lets the function insert despite RLS and avoids the mutable-search-path security lint. **Investimentos + Reserva = `alocacao`**, the rest `consumo` (CAT-01 + CAT-03 prep). `[ASSUMED]` for the exact column set; trigger-on-`auth.users` + `security definer` is the documented Supabase seed pattern `[CITED: supabase.com/docs/guides/auth/managing-user-data]`.

### §9 Private Storage bucket + per-folder RLS — `supabase/migrations/0003_storage_statements.sql`
```sql
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

drop policy if exists "own statement files" on storage.objects;
create policy "own statement files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
```
> Establishes the boundary now; **no upload flow in Phase 1** (deferred to Phase 4). `[CITED: supabase.com/docs/guides/storage/security/access-control]`

### §10 Money convention helper — `src/lib/money.ts`
```typescript
// Centavos are the only money representation. Parse once at ingest; format only at the UI edge.
export function parseBRLToCents(input: string): number {
  const normalized = input.trim().replace(/\./g, '').replace(',', '.')
  return Math.round(Number(normalized) * 100)
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export function formatCents(cents: number): string {
  return brl.format(cents / 100)
}
```
`[CITED: PITFALLS.md Pitfall 1 — parse pt-BR "1.234,56" → Math.round(value*100)]`

### §11 npm scripts — `package.json` (excerpt)
```jsonc
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "db:push": "supabase db push",
    "db:reset": "supabase db reset",
    "gen:types": "supabase gen types typescript --local > src/types/database.types.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```
> Regenerate types after every migration. For the remote, use `gen types typescript --linked`. `[VERIFIED: supabase gen types --help, local probe]`

## State of the Art

| Old Approach (project-level research) | Current Approach (verified today) | When Changed | Impact on Phase 1 |
|---------------------------------------|-----------------------------------|--------------|-------------------|
| `getUser()` in middleware to refresh | **`getClaims()`** (validates JWT signature against published keys; spoof-safe) | Supabase SSR docs current as of 2026-06 | Use `getClaims()` in `updateSession` and for page protection. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** (`sb_publishable_...`) | Legacy anon/service_role being retired; new projects (post-Nov 2025) ship only publishable/secret keys | Env var renamed; confirm which keys the user's project exposes. |
| `service_role` key for server bypass | **`SUPABASE_SECRET_KEY`** (`sb_secret_...`), revocable | Same migration | Phase 1 likely needs no secret key at all; if used, server-only. |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Long deprecated | Confirmed avoided. |
| `get/set/remove` cookie interface | `getAll`/`setAll` batch | `@supabase/ssr` 0.x | Use batch only. |

**Deprecated/outdated — do not use:**
- `@supabase/auth-helpers-nextjs` — superseded by `@supabase/ssr`.
- `getSession()` for server-side protection — spoofable; use `getClaims()`.
- Legacy `anon`/`service_role` env var names for a **new** project — use publishable/secret. (If the user's project is older and still exposes legacy keys, those still work until late-2026 retirement, but the new names are forward-safe.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The user's personal Supabase project exposes **publishable/secret** keys (new-style). It may be an older project still on legacy anon/service_role. | State of the Art / env vars | LOW — both work; planner adds a `checkpoint:human-verify` to confirm key style & copy exact values. Code uses the publishable-key var name either way (alias the legacy key to it). |
| A2 | Email confirmation is toggled **off in the Supabase dashboard** (not via migration) for v1. | Runtime State Inventory | LOW — it's a known dashboard setting; just must be an explicit manual task. |
| A3 | Phase 1 needs the **secret key for nothing** (seed runs via DB trigger, not app). | Pitfall 3 / Security | LOW — if a server-only admin op emerges, add the secret key guarded by `server-only`. |
| A4 | `profiles`/`categories` exact column sets (e.g., `display_name`, `sort`, `is_archived`). | Code Examples §6–8 | LOW — columns are minimal & additive; future migrations extend them. |
| A5 | `kind` enum values are `'consumo' | 'alocacao'` (ASCII, no accent). | Code Examples §7–8 | LOW — naming choice; keep ASCII to avoid encoding friction in code. |
| A6 | Scaffolding into the existing git repo root preserves `.planning/` & `agents/`. | Runtime State Inventory | MEDIUM — `create-next-app .` in a non-empty dir can refuse or conflict; planner must scaffold carefully (temp dir + move, or `--yes` into the existing dir) and verify `.planning/`/`agents/` survive. |
| A7 | `decimal.js` is **not** needed in Phase 1 (native `Intl.NumberFormat` + integer math suffices for the convention helper). | Standard Stack (deferred) | LOW — add `decimal.js` in Phase 2/3 when aggregation starts. |

## Open Questions

1. **Which Supabase key style does the user's project expose (publishable/secret vs legacy anon/service_role)?**
   - What we know: new projects (post-Nov 2025) ship only publishable/secret; the docs now standardize on `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
   - What's unclear: the age/config of the user's personal project.
   - Recommendation: planner adds an `autonomous: false` checkpoint — user pastes Project URL + publishable key (+ secret if needed) into `.env.local`; code uses the publishable-var name regardless.

2. **Does the existing local repo already contain a scaffold or only `.planning/`/`agents/`?**
   - What we know: today the dir holds `.planning/`, `agents/`, `CLAUDE.md`, `.git` (remote set). No `package.json`.
   - Recommendation: scaffold into the repo root preserving those dirs; verify nothing is overwritten.

3. **Vercel project — does it already exist for this repo, or must it be created/linked?**
   - What we know: `vercel` CLI 54.11.1 is installed; gh is authed as DamascenoDev with the repo present.
   - Recommendation: treat `vercel link` + env-var entry as an `autonomous: false` step; "dev deployment" = a Vercel Preview/Production deploy of the skeleton with the three env vars set, reachable URL showing the login page.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next 16 / tooling | ✓ | v24.15.0 | — |
| npm | install/scripts | ✓ | 11.14.1 | — |
| Docker (daemon running) | `supabase start` local stack | ✓ | Server 29.1.3 (running) | Skip local; develop against remote (riskier — see Pitfall 4) |
| Supabase CLI | migrations, local DB, type gen | ✓ | 2.103.0 (latest 2.106.0) | `npm i -g supabase@latest` to match |
| gh CLI (authed) | repo ops | ✓ | authed as DamascenoDev | — |
| Vercel CLI | deploy/link | ✓ | 54.11.1 | Deploy via Vercel dashboard git integration |
| Git + remote | versioning | ✓ | `main`, origin → github.com/DamascenoDev/gestao-financeira | — |
| Supabase **project credentials** | local `.env.local` + remote link | ✗ (not in env) | — | **No fallback** — user must provide (autonomous: false) |
| Vercel **env vars on project** | deploy with auth working | ✗ | — | **No fallback** — user/CLI must set (autonomous: false) |

**Missing dependencies with no fallback:** Supabase project URL + keys; Vercel project link + env vars. Both are credential/interactive steps → planner gates them as `autonomous: false` with a `checkpoint:human-verify`.

**Missing with fallback:** none blocking — Docker is up, so local-first development is fully available.

## Validation Architecture

> `workflow.nyquist_validation: true` in config → section included. **No test framework installed yet** (Wave 0).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` 4.1.9 + `@testing-library/react` 16.3.2 + `jsdom` 29.1.1 (none installed — Wave 0) |
| Config file | none yet — `vitest.config.ts` to be created in Wave 0 |
| Quick run command | `npx vitest run src/lib/money.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-02 | `money.ts`: `parseBRLToCents`/`formatCents` exact, round-trip `R$ 0,10 + R$ 0,20` = `R$ 0,30` | unit | `npx vitest run src/lib/money.test.ts` | ❌ Wave 0 |
| SEC-02 | Secret key absent from built client bundle | smoke (grep) | `npm run build && ! grep -rIl "sb_secret_\|service_role" .next/static` | ❌ Wave 0 (script) |
| AUTH-03 | RLS two-user isolation: user B reads/writes user A's `categories`/`profiles` → 0 rows + failed write (all 4 verbs) | integration (SQL, local Supabase) | `npx vitest run src/db/rls.test.ts` (or a SQL script via `supabase db` + `psql`) | ❌ Wave 0 |
| CAT-01 | Signup seeds exactly 11 BR categories with correct `kind` (Investimentos/Reserva = `alocacao`) | integration (local Supabase) | `npx vitest run src/db/seed.test.ts` | ❌ Wave 0 |
| AUTH-01/02/04 | login → dashboard, refresh keeps session, logout → /auth/login | manual / e2e (deferred) | manual checklist this phase (e2e harness not in scope) | ❌ manual |

### Sampling Rate
- **Per task commit:** the relevant quick unit command (e.g. `vitest run src/lib/money.test.ts`).
- **Per wave merge:** `npx vitest run` (full suite) + the bundle-grep smoke check.
- **Phase gate:** full suite green + two-user RLS isolation test green + manual auth flow checklist passed before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` (+ jsdom environment, `@vitejs/plugin-react`)
- [ ] Install: `npm i -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom`
- [ ] `src/lib/money.test.ts` — covers SEC-02 money exactness
- [ ] `src/db/rls.test.ts` (or SQL harness against local Supabase) — covers AUTH-03 isolation, all 4 verbs, 2 users
- [ ] `src/db/seed.test.ts` — covers CAT-01 seed (11 categories, kinds)
- [ ] `scripts/check-bundle-secrets.sh` — SEC-02 bundle grep gate

## Security Domain

> `security_enforcement` not disabled → included. This phase **is** the security foundation.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth email/password; do not roll your own; email confirmation off in v1 (documented, re-enable for 2nd user). |
| V3 Session Management | yes | `@supabase/ssr` cookie session refreshed in middleware via `getClaims()`; httpOnly secure cookies managed by Supabase. |
| V4 Access Control | yes | Postgres RLS `(select auth.uid()) = user_id` USING+WITH CHECK, `TO authenticated`, on every table; Storage per-folder RLS. The security boundary. |
| V5 Input Validation | yes | Zod on auth form inputs (email/password) at the Server Action boundary. |
| V6 Cryptography | yes | Delegated to Supabase Auth (password hashing, JWT signing) — never hand-rolled. |
| V7 Error Handling/Logging | partial | Do not log credentials; surface auth errors as toasts, not stack traces. |
| V8 Data Protection | yes | Secret key server-only (`import 'server-only'`); publishable key safe in client; no secrets in `NEXT_PUBLIC_*`. |

### Known Threat Patterns for Next.js 16 + Supabase
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secret/service key in client bundle | Information Disclosure / Elevation | `server-only` guard; never `NEXT_PUBLIC_`; CI grep on `.next/static` |
| Missing/loose RLS → cross-user leak | Information Disclosure | `ENABLE RLS` + scoped USING/WITH CHECK on every table; two-user isolation test |
| Session spoofing via `getSession()` | Spoofing | Use `getClaims()` (validates JWT signature) for protection |
| Public Storage bucket | Information Disclosure | Private bucket + `{user_id}/` folder RLS, signed URLs only (when upload lands) |
| SQL injection | Tampering | Parameterized supabase-js queries / typed client; no string-built SQL in app |
| Open signup abuse | (accepted) | RLS is the isolation boundary; open signup is an accepted decision for personal v1 |

## Sources

### Primary (HIGH confidence)
- `supabase/supabase` GitHub repo — `apps/ui-library/registry/default/clients/nextjs/lib/supabase/{client,server,middleware}.ts` — verbatim current SSR clients with `getClaims()` + publishable key (fetched via `gh api`, 2026-06-16).
- npm registry (`npm view <pkg> version`) — all Phase-1 versions confirmed 2026-06-16.
- `gsd-tools query package-legitimacy check` — legitimacy verdicts + download counts for all packages.
- Local environment probes — Node/npm/Docker(running)/supabase CLI/gh(authed)/Vercel CLI/git remote.
- Project research `.planning/research/{STACK,ARCHITECTURE,PITFALLS}.md` (dated 2026-06-16, HIGH) — RLS shape, money convention, Storage pattern, anti-patterns.

### Secondary (MEDIUM confidence)
- supabase.com/docs/guides/auth/server-side/nextjs & /creating-a-client — middleware matcher, `getClaims()` protection guidance, publishable-key env naming (WebFetch).
- supabase.com/docs/guides/getting-started/migrating-to-new-api-keys — publishable/secret key migration, legacy retirement late-2026, new projects post-Nov-2025 (WebSearch).
- nextjs.org/docs/app/api-reference/cli/create-next-app — scaffold flags (WebSearch).

### Tertiary (LOW confidence)
- Auth Server Action shape (§5) — assembled from standard `@supabase/ssr` usage, not copied verbatim from a single doc page; validate at implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version verified against npm registry today; legitimacy checked.
- Supabase SSR wiring: HIGH — code pulled verbatim from the official repo; `getClaims()`/publishable-key shift confirmed across docs + migration guide.
- Schema/RLS/trigger: HIGH on the pattern (Supabase RLS perf docs + Storage access-control docs); MEDIUM on exact column sets (assumptions A4–A5).
- Auth action code (§5): MEDIUM — standard but not single-source verbatim.
- Pitfalls: HIGH — sourced from project PITFALLS.md + official limits.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stack is current but fast-moving: Next/Supabase release frequently, and the legacy-key retirement timeline is active through late 2026 — re-verify key naming if the project is older).
