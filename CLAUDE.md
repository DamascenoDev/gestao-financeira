<!-- GSD:project-start source:PROJECT.md -->
## Project

**Gestão Financeira Pessoal**

Sistema web **pessoal e privado** de gestão financeira. Eu cadastro meus recebimentos, faço upload das minhas faturas e o sistema classifica os gastos automaticamente — aprendendo com cada confirmação — para mostrar o quanto estou aderente às minhas metas por categoria. Inclui reservas de oportunidade (poupança por objetivo) e uma aba para gestão do meu MEI. Single-user no v1, com modelo de dados já preparado para minha esposa entrar depois.

**Core Value:** Subir uma fatura e ver os gastos classificados automaticamente — o sistema aprende cada padrão merchant→categoria a partir das minhas confirmações — junto com a aderência às minhas metas. Se tudo mais falhar, **classificação inteligente com memória + visão de metas** tem que funcionar.

### Constraints

- **Tech stack**: Next.js (App Router) + **TypeScript estrito, sem JavaScript** — Supabase (auth + Postgres + Storage) — deploy na Vercel
- **Privacidade**: dados financeiros pessoais — escopo por `user_id` + RLS no Supabase, sem exposição pública
- **IA**: provedor de IA para classificação a definir na pesquisa (custo/qualidade para texto curto), com confirmação humana no loop
- **Time**: dev solo, projeto pessoal — preferir caminho simples e de baixo custo operacional
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js (App Router) | 16.x | Framework | Locked. App Router + Server Actions/Route Handlers are the natural home for server-side parsing and AI calls (keeps API keys off the client). |
| TypeScript (strict) | 5.x | Language | Locked. End-to-end type safety pairs with Supabase generated types + Zod for runtime validation at the boundaries (uploads, AI output). |
| `@supabase/supabase-js` | 2.108.x | DB/Auth/Storage client | Official client; combine with generated `Database` types for typed queries. |
| `@supabase/ssr` | 0.12.x | Cookie-based auth in App Router | **The** current pattern for Server Components, Route Handlers & middleware. Replaces the deprecated `@supabase/auth-helpers-nextjs` (do not use that). |
| `ai` (Vercel AI SDK) | 6.0.x | LLM orchestration | First-party for Next.js. `generateObject`/`Output.object` + Zod gives schema-validated classification. Defaults to AI Gateway (one key, zero token markup, easy model swap). |
| `@ai-sdk/google` | 3.0.x | Gemini provider (direct) | Optional direct provider if you prefer your own Google key over Gateway. Gemini 2.5 Flash-Lite is the cheap classification workhorse. |
| `zod` | 4.4.x | Runtime validation | Validates upload-parsed rows AND constrains AI output to your category enum. Single source of truth shared by AI schema + form schema. |
| `tailwindcss` | 4.3.x | Styling | Locked-adjacent (shadcn default). v4 uses the `@theme` directive / CSS-first config. Fully supported by current shadcn CLI. |
| shadcn/ui (CLI) | 4.11.x CLI | Component layer | Vendored Radix-based components you own. Full Tailwind v4 + React 19 support. Includes a Recharts-backed `chart` primitive for the dashboards. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pdf-parse` (mehmet-kozan v2 rewrite) | 2.4.x | **PDF text + table extraction** | Credit-card statement PDFs. v2 is a pure-TypeScript rewrite that wraps pdfjs-dist and explicitly targets serverless (Next.js+Vercel, Lambda). Exposes `getText()` AND `getTable()` — the table API is what you want for line-item statements. **Verify the npm dist matches the mehmet-kozan/pdf-parse repo at install time** (see "What NOT to Use"). |
| `unpdf` | 1.6.x | PDF text extraction (edge-safe fallback) | Use if you hit native-binary/worker issues with pdf-parse on Vercel, or want edge-runtime extraction. Zero native deps, serverless-first. Text-only — no table reconstruction, so you'd parse columns yourself. |
| `papaparse` | 5.5.x | CSV parsing | Bank/card CSV exports. Battle-tested, streaming, header mode, robust to messy delimiters/quoting common in BR bank exports. TS types via `@types/papaparse`. |
| `ofx-data-extractor` | 1.5.x | OFX parsing | BR banks export OFX (Money/2003 SGML + newer XML). TS-native, actively maintained (v1.5.0, Mar 2026), `toJson()`/`toNormalized()`/`getTransactionsSummary()` over `STMTTRN`. Best-maintained TS OFX lib found. |
| `@ai-sdk/react` | 3.0.x | Client hooks | Only if you stream classification to the UI (`useObject`). For a confirm-loop you can also just call a Route Handler and render results normally. |
| `decimal.js` | 10.6.x | Arbitrary-precision math | Engine for money math (sum of transactions, % of income, goal progress). Avoids IEEE-754 float drift. Store cents as integers; use Decimal for division/percentages. |
| `dinero.js` | v2 (2.x) | Money objects + formatting | v2 went **stable 2026-03-02** (no longer alpha). Immutable money objects, currency-aware, integer-cents storage, locale formatting. See version note — npm `latest` may still point at v1; pin the v2 release explicitly. If you'd rather not chase dist-tags, `decimal.js` + `Intl.NumberFormat` covers 100% of needs with zero ambiguity. |
| `date-fns` | 4.4.x | Dates / monthly cycles | Tree-shakeable. `startOfMonth`/`endOfMonth`/`eachMonthOfInterval` model the monthly + annual budget cycles cleanly. Pair with `date-fns-tz` 3.2.x to pin everything to `America/Sao_Paulo` (avoid UTC month-boundary bugs). |
| `recharts` | 3.8.x | Charts | What shadcn's `chart` component wraps. Bar (budget adherence), progress/area (savings goals), line (annual trend). **Requires a `react-is` override to match your React 19 version.** |
| `@tanstack/react-table` | 8.21.x | Transaction tables | Headless table for the post-upload review grid (sort/filter/inline category confirm). Pairs with shadcn's table styling. |
| `react-hook-form` | 7.79.x | Forms | Income entries, category/goal config, MEI NF entry. `@hookform/resolvers` + Zod = one schema validates form + DB shape. |
| `sonner` | 2.0.x | Toasts | "Classification saved", "Pattern learned", upload errors. shadcn's recommended toast. |
| `@tanstack/react-query` | 5.101.x | Client data cache | Optional. With Server Components + Server Actions you may not need it; add only if client-side refetch/optimistic UI gets painful. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `supabase` CLI | 2.106.x | Local Postgres, migrations, type generation | `supabase migration new`, `supabase db push`, and `supabase gen types typescript` → commit `database.types.ts`. Add an `npm run gen:types` script and regenerate after every migration so the typed client never drifts. |
| `@types/papaparse` | latest | Types for PapaParse | PapaParse ships JS; needs the DefinitelyTyped package. |
| Vercel project | — | Hosting + AI Gateway | Set `maxDuration` on PDF-parsing Route Handlers (parsing can take seconds). AI Gateway key lives as an env var. |
## Installation
# Core app deps
# Parsing (server-side ingestion)
# Money / dates / charts / tables / forms / toasts
# Optional client cache
# Dev
# UI scaffolding (shadcn vendors components into your repo)
# Tailwind v4 + Recharts/React19: add to package.json "overrides"
#   "react-is": "19.x"  (match your installed React version)
## Deep Dives (the hard parts)
### 1. Statement parsing on Vercel serverless
- **CSV → `papaparse`.** Trivial, fast, no serverless concerns. Handle BR specifics: comma decimal separator (`1.234,56`), `dd/mm/yyyy` dates, latin-1/UTF-8 encoding. Normalize to integer cents at the parse boundary.
- **OFX → `ofx-data-extractor`.** BR banks (Itaú, Nubank, BB, Bradesco, Inter) all export OFX. Most deterministic of the three formats — prefer it when the user has a choice. Map `STMTTRN` → canonical shape; `DTPOSTED` → date, `TRNAMT` → cents, `MEMO`/`NAME` → description.
- **PDF → `pdf-parse` v2 (`getTable()`), `unpdf` as fallback.** This is the genuinely hard one.
- Classic `pdf-parse` v1 and raw `pdfjs-dist` legacy builds drag in canvas/native bindings and worker-resolution issues that break on Vercel/Lambda. Multiple 2026 write-ups document hours lost to this. **Do not use pdf-parse v1 or raw pdfjs-dist for serverless.**
- `pdf-parse` **v2** (the mehmet-kozan rewrite) was built for serverless and adds real **table extraction** (`getText()` + `getTable()`), which is exactly what credit-card line items need. This is the recommended primary.
- `unpdf` is the safest serverless bet for raw text (zero native deps, edge-capable) but is **text-only** — you reconstruct columns from positioned text yourself, which is brittle for tabular statements.
- Card statement PDFs vary wildly by issuer and many are effectively scanned/flattened. Treat PDF as **best-effort**: extract → show the parsed grid → let the user correct before persisting. Do NOT auto-commit PDF-derived rows. If a given issuer's PDF is image-only, text extraction yields nothing — that's an OCR problem out of scope for v1; steer the user to CSV/OFX for that bank.
- Run PDF parsing in a **Node.js runtime Route Handler** (not Edge) and set `export const maxDuration = 60`. Keep the uploaded file in Supabase Storage; parse from a buffer.
### 2. AI-assisted classification
- AI Gateway is the default transport in AI SDK v5/v6: one key, hundreds of models via string IDs (`'google/gemini-2.5-flash-lite'`), **zero token markup**, built-in fallbacks/observability, and BYOK if you want your own Google key. For a solo Vercel app this beats wiring a provider SDK directly — same price, less code, trivial model swaps.
- If you'd rather hold your own Google API key with no Vercel dependency, use `@ai-sdk/google` directly with `google('gemini-2.5-flash-lite')`. Same call site otherwise.
### 3. Supabase patterns (App Router, TS strict)
- **Auth:** `@supabase/ssr` with `createBrowserClient` (client) and `createServerClient` (server) implementing the **`getAll`/`setAll`** cookie interface (the old individual `get/set/remove` shape is deprecated). Add **middleware** to refresh the session (`supabase.auth.getUser()`) on every request — Server Components can't write cookies, so the middleware does the token refresh and propagation.
- **Single-user now, multi-user-ready:** put `user_id uuid references auth.users` on **every** domain table from day one (already a locked decision). Costs nothing now; avoids a painful migration when the spouse is added.
- **RLS (non-negotiable for financial data):** enable RLS on every table and write `using (auth.uid() = user_id)` + matching `with check` policies for select/insert/update/delete. This is what actually isolates data — never rely on app-layer filtering alone. Test policies with the local CLI.
- **Typed client:** `supabase gen types typescript` → `database.types.ts`, pass `Database` generic to `createClient<Database>()`. Regenerate after every migration (npm script). Gives `Row`/`Insert`/`Update` types end-to-end.
- **Storage:** uploaded statements go in a private bucket keyed by `user_id/...`; secure with Storage RLS policies (same `auth.uid()` check on the object path). Parse server-side from the downloaded buffer; never expose the bucket publicly.
- **Migrations:** SQL files under `supabase/migrations/`, `supabase db push` to apply, version-controlled. Keep schema-as-SQL in the repo; do not click-edit schema in the dashboard for anything you want reproducible.
### 4. UI / forms / charts
- **Budget adherence (monthly + annual):** Recharts bar charts (spent vs target per category) + a computed adherence %; color thresholds (under/near/over). Annual = same component over `eachMonthOfInterval`.
- **Savings-goal progress:** shadcn `Progress` for each sinking fund (optional target) + a small history list per reserve.
- **Transaction review grid:** `@tanstack/react-table` + shadcn table styling; inline category confirm triggers the "learn pattern" write.
- **Forms:** `react-hook-form` + Zod resolver, one schema shared with the DB insert shape.
- Remember the `react-is` override for Recharts under React 19.
### 5. Money, dates, i18n
- **Money:** store **integer cents** (`bigint`/`integer` in Postgres) — never floats. Do math with `decimal.js` (sums, % of income, goal progress, division). `dinero.js` v2 (now stable) is a nice typed money-object + formatting layer on top, but is optional; `decimal.js` + `Intl.NumberFormat` is the zero-ambiguity baseline.
- **pt-BR currency formatting:** `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` — built in, no dependency, renders `R$ 1.234,56` correctly. Format only at the display edge; keep cents internally.
- **Dates / BR cycles:** `date-fns` for month/year boundaries; `date-fns-tz` to pin to `America/Sao_Paulo` so a transaction at month-end doesn't slip into the wrong budget period via UTC. Parse BR `dd/mm/yyyy` explicitly at the ingest boundary.
- **MEI specifics:** the R$ 81.000/year ceiling and DASN-SIMEI report are pure domain math over the same integer-cents + monthly-bucket primitives — no extra library needed.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `pdf-parse` v2 (`getTable`) | `unpdf` | If pdf-parse hits native-binary/worker issues on Vercel, or you only need raw text and will parse columns yourself. Edge-runtime safe. |
| `pdf-parse` v2 | `pdfjs-dist` (modern build) directly | Only if you need fine-grained text-position control beyond pdf-parse's table API; more wiring, more serverless footguns. |
| AI SDK + AI Gateway | `@ai-sdk/google` direct provider | If you want to hold your own Google key and avoid any Vercel-Gateway dependency. Identical call site. |
| Gemini 2.5 Flash-Lite | GPT-5-nano | Slightly cheaper input ($0.05); A/B on real descriptors. Reach it by swapping the Gateway model string. |
| `ofx-data-extractor` | `node-ofx-parser` / `ofx-js` | If you hit a parsing edge case on a specific BR bank's OFX dialect; keep as a fallback, but `ofx-data-extractor` is the best-maintained TS option. |
| `decimal.js` (+`dinero.js` v2 optional) | `big.js` | Lighter footprint if you only need basic arithmetic; lacks money/currency conveniences. `currency.js` is an option but less precise for chained division. |
| `date-fns` | Luxon | If you want a richer single-object DateTime+zone API; heavier, less tree-shakeable. Temporal (native) not yet broadly safe to rely on. |
| `recharts` (via shadcn chart) | Tremor / visx / Chart.js | Tremor for faster dashboard scaffolding if you drift from shadcn; visx for fully custom viz. Not needed for these chart types. |
| Server Actions + RSC | `@tanstack/react-query` | Add React Query only if client-side refetch/optimistic UI becomes painful; not required up front. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@supabase/auth-helpers-nextjs` | Deprecated; superseded for App Router | `@supabase/ssr` with `getAll`/`setAll` |
| `pdf-parse` **v1** (classic) | Pulls canvas/native bindings + worker-resolution issues that break on Vercel/Lambda | `pdf-parse` v2 rewrite, or `unpdf` |
| Raw `pdfjs-dist` legacy build in a serverless handler | "module requires Node.js APIs" / worker errors on edge & flaky on Lambda | `unpdf` (bundles a minimal pdf.js, no canvas) or pdf-parse v2 |
| Floating-point `number` for money | IEEE-754 rounding drift corrupts sums/percentages — unacceptable for finance | Integer cents + `decimal.js` |
| Auto-committing PDF-parsed rows | Issuer PDF variance → silent misreads | Parse → show review grid → user confirms → persist |
| App-layer-only data filtering (no RLS) | A query bug or future multi-user mistake leaks financial data | Postgres RLS `auth.uid() = user_id` on every table + Storage |
| Calling the LLM for already-known merchants | Burns money & latency on solved cases | Memory-first (`merchant_patterns`), AI only on cache miss |
| Cookie `get/set/remove` (single-cookie) Supabase SSR shape | Older/deprecated interface | `getAll`/`setAll` batch interface |
| `cookies()` writes from Server Components | Not allowed; session won't refresh | Refresh session in middleware |
## Stack Patterns by Variant
- Steer the user to OFX (then CSV). Deterministic parsing, no table-reconstruction risk. PDF is the last resort.
- Text extraction returns nothing. Out of scope to OCR in v1 — surface a clear message and ask for CSV/OFX from that bank. Don't silently produce empty results.
- Gemini 2.5 Flash-Lite free tier + memory-first classification keeps AI cost near zero. Batch unseen descriptors per upload into one call.
- Zero schema migration needed (every table already `user_id`-scoped + RLS). Only the UI gains an account/sharing surface — exactly the deferred scope in PROJECT.md.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.x | React 19.x | App Router; Server Actions stable. |
| shadcn/ui (CLI 4.x) | Tailwind v4.3.x + React 19 | Full support; init with the v4 `@theme` flow. |
| `recharts` 3.8.x | React 19 | **Requires `react-is` override** in package.json matching your React 19 version. |
| AI SDK `ai` 6.0.x | AI Gateway (v5 & v6) | Gateway is the default transport; string model IDs work out of the box. |
| `zod` 4.4.x | AI SDK 6 `generateObject` | Zod schemas drive structured/enum output. |
| `@supabase/ssr` 0.12.x | Next.js 16 App Router | `getAll`/`setAll` cookie interface; middleware session refresh. |
| `dinero.js` v2 (2.x) | TS strict | Stable since 2026-03-02. **npm `latest` dist-tag may still resolve v1 — pin the v2 version explicitly** and verify the installed major. |
| `pdf-parse` 2.4.x | Vercel Node runtime | Confirm the installed package resolves to the mehmet-kozan v2 repo; set `maxDuration` on the Route Handler. |
## Sources
- Context7 `/websites/ai-sdk_dev` — generateObject/Output enum classification patterns, two-step structured output (HIGH)
- https://vercel.com/docs/ai-gateway — Gateway = default in AI SDK v5/v6, zero markup, BYOK, string model IDs (HIGH)
- https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai — current Gemini model IDs, generateObject + structuredOutputs (HIGH)
- https://ai.google.dev/gemini-api/docs/pricing — Gemini 2.5 Flash-Lite $0.10/$0.40, free tier (HIGH)
- https://github.com/mehmet-kozan/pdf-parse — v2 pure-TS, serverless target, `getText()`/`getTable()` API (HIGH)
- dev.to / chudi.dev / pkgpulse / buildwithmatija (2026) — serverless PDF caveats: avoid pdf-parse v1 / raw pdfjs-dist, unpdf edge-safe (MEDIUM, multiple sources agree)
- https://github.com/Fabiopf02/ofx-data-extractor — TS-native OFX, v1.5.0 (Mar 2026), STMTTRN/normalize API (MEDIUM, single primary source + npm metadata)
- https://supabase.com/docs/guides/auth/server-side/nextjs + /creating-a-client — `@supabase/ssr`, getAll/setAll, middleware refresh, auth-helpers deprecated (HIGH)
- https://supabase.com/docs/reference/cli/.../supabase-gen-types-typescript — typed client workflow (HIGH)
- https://ui.shadcn.com/docs/tailwind-v4 + shadcn issue #6585 — Tailwind v4/React 19 support, recharts react-is override (MEDIUM-HIGH)
- https://www.sarahdayan.com/blog/dinerojs-v2-is-out + GitHub discussion #618 — Dinero v2 stable 2026-03-02 (MEDIUM)
- npm registry (`npm view`) — all version numbers as of 2026-06-16 (HIGH)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
