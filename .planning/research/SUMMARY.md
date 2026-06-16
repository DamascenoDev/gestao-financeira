# Project Research Summary

**Project:** Gestão Financeira Pessoal
**Domain:** Personal finance web app (Brazil) — statement ingestion (PDF/CSV/OFX), AI-assisted merchant→category classification with learned memory, %-of-income budget targets (monthly + annual), reservas/sinking funds, and MEI/DASN-SIMEI tax tracking. Single-user v1, multi-user-ready data model.
**Researched:** 2026-06-16
**Confidence:** HIGH

## Executive Summary

This is a single-user (later two-user) personal finance app for Brazil whose stated moat is **"classificação inteligente com memória + visão de metas"** — upload a fatura, watch it self-classify (learning from every confirmation), and see adherence to %-of-income goals. The stack is locked (Next.js App Router + TypeScript strict + Supabase Auth/Postgres/Storage + Vercel), so all four researchers worked *within* that envelope and converged on a remarkably consistent picture: the generic ledger plumbing (import, editable categories, dashboards) is **table stakes** that the dominant BR apps (Mobills, Organizze) already do; the differentiation — and the engineering effort — belongs in three places: (1) a *learned* merchant→category memory with a human-confirm loop, (2) %-of-income budgets evaluated on two horizons (monthly **and** annual-cumulative), and (3) the reservas + MEI modules that no mass app does well.

The recommended approach is a **two-layer classifier** (cheap indexed memory lookup first, a cheap short-text LLM only on memory-miss via the Vercel AI SDK + AI Gateway, output constrained to an allowed-category enum, pattern persisted **only on human confirm**) fed by an **ingestion pipeline** built around two hard infrastructure facts: the browser uploads files **directly to Supabase Storage via a signed URL** (dodging Vercel's 4.5 MB function-body limit), and parsing runs as **deferred background work** (`after()`/`waitUntil`) so a slow PDF parse never blocks the response. CSV/OFX are the reliable **primary** ingestion path (deterministic, no AI); per-bank PDF is a fragile, best-effort **fallback** (pure-JS parser, manual-correction grid, deferrable to v1.x). Everything is scoped by `user_id` with Postgres RLS and a private per-user Storage bucket from day one.

The dominant risk is twofold. **Correctness/security foundations** must be right before anything lands: money as **integer centavos** (never float; Postgres `bigint`), **RLS on every table** (a misconfigured policy leaks the spouse's data silently — empty result, not error), service-role key kept server-only, and **idempotent dedup** so re-uploads don't double-count. **Domain modeling** has two load-bearing open decisions: how reserva contributions are treated in budget math (the #1 modeling pitfall — must be a *transfer/saving* excluded from spend adherence, not an expense) and which income denominator the budget % uses (recommended: net *received* income, with monthly and annual computed off the same ledger). The mitigation strategy that all four researchers endorse: **build the manual ledger loop first** (income → categories → transactions → budget dashboard → reservas) to prove the core value on hand-entered data, then bolt on the highest-risk upload + AI pipeline onto a proven foundation rather than as a big-bang dependency.

## Key Findings

### Recommended Stack

Stack is locked; STACK.md fills in the libraries *within* it with HIGH confidence on core/parsing/AI (a few MEDIUM flags on PDF and dist-tags). The shape: `@supabase/ssr` for cookie-based auth (the old `auth-helpers-nextjs` is deprecated — do not use), the Vercel AI SDK (`ai`) with `generateObject` + a Zod **enum** to constrain classification output, format-specific parsers behind one normalizer (CSV/OFX deterministic, PDF best-effort), shadcn/ui + Tailwind v4 + Recharts for the dashboards, and **integer-cents money math** with `decimal.js` + `Intl.NumberFormat('pt-BR')` at the display edge only.

**Core technologies:**
- `@supabase/ssr` (0.12.x) + `@supabase/supabase-js` (2.x) — auth/DB/Storage with `getAll`/`setAll` cookies + middleware session refresh; typed client via `supabase gen types`
- `ai` (Vercel AI SDK 6.x) + AI Gateway — LLM orchestration; one key, zero token markup, model swap by string ID (`google/gemini-2.5-flash-lite` default, GPT-5-nano an A/B alternative)
- `zod` (4.x) — single source of truth: validates parsed rows AND constrains AI output to the user's category enum
- `pdf-parse` v2 (mehmet-kozan rewrite, `getTable()`) primary / `unpdf` edge-safe fallback — pure-JS, serverless-targeted PDF extraction (avoid pdf-parse v1 / raw pdfjs-dist — native-binary footguns on Vercel)
- `papaparse` + `ofx-data-extractor` — deterministic CSV/OFX parsing (the reliable primary ingestion path)
- `decimal.js` + `Intl.NumberFormat('pt-BR')` (+ optional `dinero.js` v2) — exact money math over integer cents
- `date-fns` + `date-fns-tz` pinned to `America/Sao_Paulo` — monthly/annual cycle boundaries without UTC month-edge bugs

### Expected Features

FEATURES.md (HIGH on table stakes + BR tax facts) frames it sharply: importing + categories + basic dashboards are the *price of entry*, not the moat. Build those cheaply; spend effort on the three differentiators.

**Must have (table stakes):**
- Income tracking — recurring fixed (salário, pensão) + ad-hoc; store *expected* vs *received* (the budget denominator)
- OFX + CSV import with **duplicate detection** + multi-account/source model (the reliable path)
- Transaction list + edit; editable BR-default categories (ship a sensible seed, soft-delete)
- Manual review/confirm surface for classified transactions (the product's main screen)
- Monthly spend-by-category dashboard; pt-BR locale/currency/date everywhere; per-user RLS isolation

**Should have (competitive — this is the moat):**
- Learned merchant→category memory + suggest→confirm→auto-apply loop (auto-apply high-confidence, queue low-confidence) + bulk re-classification
- Budget targets as **% of income, monthly AND annual-cumulative** + adherence dashboard (both horizons, progress bars, over-budget flags)
- Reservas (sinking funds): named buckets, optional target+progress, contribution-via-"Reserva"-category with "qual reserva?" sub-prompt, withdrawals, per-bucket history
- MEI module: NF register + R$81k running tracker + DASN-SIMEI report (record-and-report, not e-file)
- In-app threshold alerts (budget % and MEI limit — cheap, prevents desenquadramento harm)

**Defer (v1.x / v2+):**
- Per-bank PDF import (high-risk; add one bank at a time, or v1 for the primary card only if no OFX) — strongest deferral candidate
- Recurring-expense detection, CSV/MEI-report export, transfers-between-accounts as a first-class type (v1.x)
- Shared/family UI for the spouse (data model ready; UI deferred), email/digest alerts, Open Finance aggregation, IRPF/broader tax, investments, native mobile, multi-currency (all explicitly out of scope)

### Architecture Approach

ARCHITECTURE.md (HIGH) lays out a Next.js App Router app over the user's personal Supabase, with four decisions baked in: file uploads **bypass the Vercel function** (browser → Storage signed URL, sidestepping the 4.5 MB limit); parse + classify run as **deferred background work** (`after()`); **RLS is the security boundary**, not app code (every table + the Storage bucket enforce `user_id = auth.uid()`); and the **LLM is the last-resort path** (memory lookup first). Aggregation (budget adherence, reserva balances, MEI totals) lives in **SQL views/RPC** so it inherits RLS and avoids over-fetching. **Reserva balances are always DERIVED** (Σ in − Σ out from a ledger), never a stored mutable counter.

**Major components:**
1. **Supabase Auth + RLS Postgres + private Storage bucket** — identity, system-of-record (every row `user_id`-scoped), raw statements in `{user_id}/...` folders
2. **Ingestion pipeline** — signed-URL direct upload → `/api/ingest` registers + triggers `after()` parse → format parsers → normalize (BRL amounts, merchant canonicalization) → two-layer idempotent dedup (file `content_hash` + per-tx `dedupe_key`)
3. **Two-layer classifier (`lib/classifier`)** — memory point-read on `merchant_patterns` (free, always first) → batched LLM call for unknowns only → write-back to memory **only on human confirm**
4. **Aggregation layer (SQL views/RPC + app presentation)** — `v_spend_by_category_period`, `v_reserva_balance`, `v_mei_year_total`; monthly + annual adherence computed off the **same ledger**
5. **Server Actions** — all authenticated mutations (confirm classification, CRUD income/reservas/NFs, the "qual reserva?" sub-question that writes the reserva ledger entry + learns the pattern in one transaction)

### Critical Pitfalls

Top items from PITFALLS.md (HIGH); each maps cleanly to a phase and has a verification check in the "Looks Done But Isn't" list.

1. **Float money** — store **integer centavos** (`bigint`); parse `"1.234,56"` → `Math.round(value*100)` once at ingest; format only at the display edge. Never `double precision`/`real`/Postgres `money`. (P0 — non-negotiable, near-impossible to retrofit.)
2. **RLS leak / service-role exposure** — `ENABLE ROW LEVEL SECURITY` + `(select auth.uid()) = user_id` (`WITH CHECK` on insert), `TO authenticated`; test all four verbs as a *second* user even though v1 is single-user; service-role key `import 'server-only'`, never `NEXT_PUBLIC_`. A denied query returns `[]`, not an error — silent leak risk. (P0.)
3. **Public/unscoped Storage + duplicate imports** — private bucket, `{user_id}/` path RLS, signed URLs only; idempotent dedup via file `content_hash` + per-tx `dedupe_key` UNIQUE with `ON CONFLICT DO NOTHING`; show "X new, Y duplicates" preview. (P1.)
4. **AI cost / prompt injection / memory correctness** — memory-first so known merchants never reach the LLM; batch + dedupe unknowns into one call; delimit untrusted descriptors as *data*, validate output against the allowed-category enum, human-confirm before learning; store category **point-in-time on the row** (don't rewrite history), key rules by stable `category_id` not name. (P2.)
5. **Domain modeling — budget % denominator, reserva double-counting, MEI edges** — pin the denominator (net *received* income, monthly + annual off the same ledger, clamp near-zero); reserva contributions are **transfers/saving excluded from spend adherence**, balance derived, guard against negative withdrawals; MEI uses the *applicable* limit (R$6.750 × active months first year, R$81k full year, +20% tolerance band), gross *receita bruta*, comércio/serviços split + employee flag, framed as informational not tax advice (LGPD: minimal data to LLM, export/delete path). (P3/P4/P5.)

## Implications for Roadmap

All four researchers independently produced the same backbone: **foundation → manual ledger loop → upload+AI pipeline → MEI → hardening.** The sequencing insight is load-bearing — the upload+AI machinery is the highest-risk, highest-novelty part, and everything it produces (`pending` transactions) is consumed by machinery you can stand up cheaply with manual entry first. Build the manual loop first so the core value is demonstrable early and AI lands on a proven foundation.

### Phase 1: Foundation (auth, RLS, money, schema)
**Rationale:** Nothing works without identity + the isolation boundary, and the money type + multi-tenant schema are impossible-to-retrofit decisions. This is where the project's two most catastrophic pitfalls live.
**Delivers:** Supabase project + `@supabase/ssr` clients + middleware refresh; all tables (`user_id`-scoped, integer-cents `bigint`) with indexes + RLS policies + `WITH CHECK`; private `statements` bucket with path-scoped RLS; BR-default category seed; typed client via `gen types`; empty SQL views scaffolded; `user_id` scoping designed for LGPD export/delete later.
**Addresses:** Per-user isolation, editable BR categories (seed), integer-cents money foundation.
**Avoids:** Pitfall 1 (float), 2 (RLS leak), 3 (service-role leak), 4 (public bucket — bucket created private now).

### Phase 2: Manual ledger loop (income → categories → transactions → budget dashboard → reservas)
**Rationale:** Proves the entire "classified spend vs metas" core value on hand-entered data, de-risking the hardest pieces (budget %, reserva accounting) **before** the upload pipeline exists. Budget % needs income first (the denominator); reservas need transactions + categories. This is steps 2–5 of the architecture build order collapsed into one value-delivering phase (may split during roadmapping).
**Delivers:** income_sources + income_entries CRUD (expected vs received); manual transaction CRUD + category editing; budget_targets + monthly/annual adherence SQL views + dashboard; reservas + reserva_ledger_entries + "qual reserva?" + derived-balance progress bars.
**Uses:** Recharts/shadcn charts, `date-fns-tz` (America/Sao_Paulo cycles), `decimal.js`, SQL views for aggregation.
**Implements:** Aggregation layer; reserva derived-balance pattern; the adherence dashboard ("visão de metas").
**Avoids:** Pitfall 10 (budget % denominator — pin it here), 11 (reserva double-counting/negative balance — resolve the accounting rule here).

### Phase 3: Upload + AI ingestion pipeline (the highest-risk phase)
**Rationale:** Highest novelty and risk; deliberately built last among the core loop so it feeds machinery already proven by Phase 2. Memory layer must precede AI so the LLM only fills genuine gaps.
**Delivers:** signed-URL direct upload → `/api/ingest` + `after()` parse → OFX/CSV parsers (primary) + PDF (best-effort fallback) → normalize + two-layer dedup → `merchant_patterns` memory lookup → batched LLM fallback (enum-constrained) → revisão/confirm UI that learns patterns on confirm + bulk re-classify.
**Uses:** `papaparse`, `ofx-data-extractor`, `pdf-parse` v2 / `unpdf`, Vercel AI SDK + AI Gateway + Zod enum, Supabase signed upload URLs.
**Implements:** Ingestion pipeline + two-layer classifier components.
**Avoids:** Pitfall 4 (public bucket / payload limit — direct upload), 5 (dedup), 6 (PDF native deps on Vercel), 7 (prompt injection), 8 (AI cost), 9 (memory correctness/history).

### Phase 4: MEI module
**Rationale:** Fully independent of the classification core value (separate NF register + tracker + report) — can slot anywhere after Phase 1, parked here because it doesn't touch the moat. Explicit v1 goal.
**Delivers:** mei_invoices register (with activity-type split + employee flag captured from day one), running annual total vs the *applicable* limit with tiered alerts (green/amber/red), DASN-SIMEI report view (total + comércio/serviços split + employee flag), informational disclaimer.
**Avoids:** Pitfall 12 (proportional first-year cap + 20% band), 13 (DASN comércio/serviços split), 14 (tax-advice framing).

### Phase 5: Hardening (LGPD export/delete, isolation tests, security audit)
**Rationale:** Financial + sensitive data with a second data subject (spouse) coming; the safety net that turns "looks done" into "is done."
**Delivers:** two-user RLS isolation test (all four verbs), service-role-key bundle grep/CI check, signed-URL-only verification, LGPD export-all + delete-account paths, LLM data-minimization audit (no PII/amounts to provider), in-app threshold alerts polish.
**Avoids:** Re-verifies Pitfalls 2, 3, 4; closes Pitfall 14 (LGPD).

### Phase Ordering Rationale

- **Dependencies discovered:** budget % requires income (denominator); classification memory requires merchant normalization; AI requires the memory layer (fires only on cache-miss); reservas require categories + transactions. These force foundation → income → manual loop → ingestion → AI.
- **Architecture grouping:** the manual loop (Phase 2) and the ingestion pipeline (Phase 3) both produce/consume `transactions` rows — building the consumer (dashboard, reservas) first lets the producer (upload+AI) land on a working target. MEI shares almost no surface, so it parallelizes.
- **Pitfall avoidance:** the two impossible-to-retrofit pitfalls (float money, RLS) are front-loaded into Phase 1; the two highest-novelty risk clusters (ingestion, AI) are isolated in Phase 3 where they can fail without blocking core-value delivery; the domain-modeling decisions (denominator, reserva accounting) are forced to be resolved in Phase 2 before the dashboard depends on them.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (upload + AI):** PDF parsing is the most fragile step — BR bank/card layouts vary wildly; needs a parser-strategy spike against **real sample statements per bank** (reference: `banksheet` for BR PDFs, `ofx-data-extractor` for OFX). Also confirm final AI provider/pricing + structured-output behavior at build time (A/B Gemini 2.5 Flash-Lite vs GPT-5-nano on real descriptors).
- **Phase 4 (MEI/DASN):** verify the exact DASN-SIMEI form fields + 2026 proportional/tolerance figures against the current Receita manual at build time (tax rules drift).

Phases with standard patterns (skip research-phase):
- **Phase 1 (foundation):** Supabase SSR auth + RLS + typed-client workflow are well-documented and verified HIGH.
- **Phase 2 (manual loop):** CRUD + SQL-view aggregation + shadcn/Recharts dashboards are established patterns; the only novel work is the *decisions* (denominator, reserva accounting), not the implementation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack + AI SDK + parsing verified via official docs/Context7; MEDIUM only on PDF (issuer variance, inherent not a library defect) and a couple of npm dist-tags (`dinero.js` v2, `pdf-parse` v2). |
| Features | HIGH | Table stakes + BR tax facts from official Receita/gov.br + established BR apps; MEDIUM on classification-memory UX (verified vs YNAB/Monarch/QuickBooks) and PDF feasibility (vs existing BR OSS parsers). |
| Architecture | HIGH | Stack locked + data model/pipeline are standard patterns verified against current Supabase/Vercel/Next.js docs (RLS perf form, signed upload URLs, `after()`, 4.5 MB limit). |
| Pitfalls | HIGH | Vercel limits + Supabase RLS from official docs; MEI/DASN from multiple BR sources; money/PDF/AI from official docs + credible technical sources. |

**Overall confidence:** HIGH

### Gaps to Address

- **Reserva accounting decision (OPEN, #1 modeling pitfall):** is a "Reserva" contribution a transfer/saving *excluded* from spend-adherence (recommended), and does it reduce "available to budget" income? Pick one canonical rule and apply it to both monthly + annual views. **Resolve in Phase 2 requirements before the dashboard depends on it.**
- **Real sample statements per bank (OPEN):** PDF parsing feasibility and per-bank CSV column mapping can only be validated against the user's actual Nubank/Itaú/Inter/etc. exports. Collect samples before Phase 3; this also informs whether per-bank PDF defers to v1.x.
- **Final AI provider A/B (OPEN):** Gemini 2.5 Flash-Lite (free tier, pragmatic default) vs GPT-5-nano (slightly cheaper input) — A/B on real BR descriptors via the AI Gateway string swap during Phase 3. Architecturally cost is dominated by call *volume* (memory-first), not model choice.
- **Budget % denominator (recommendation, confirm in Phase 2):** net *received* income for the period, monthly + annual off the same ledger, with near-zero-income clamping. Document it before building adherence.
- **MEI activity type:** user is likely services-only, but model the comércio/serviços split + employee flag from day one anyway — cheap now, painful re-tag later.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/ai-sdk_dev` + https://vercel.com/docs/ai-gateway + https://ai-sdk.dev/providers/.../google-generative-ai — `generateObject`/enum classification, AI Gateway default transport, current Gemini model IDs
- https://supabase.com/docs/guides/auth/server-side/nextjs + /storage/security/access-control + RLS performance docs — `@supabase/ssr` getAll/setAll, middleware refresh, `(select auth.uid())`, private bucket + `{user_id}/` Storage RLS, signed URLs
- https://vercel.com/docs/functions/limitations + https://nextjs.org/docs/app/api-reference/functions/after — 4.5 MB body / 250 MB bundle / duration limits, deferred background work
- https://ai.google.dev/gemini-api/docs/pricing — Gemini 2.5 Flash-Lite pricing + free tier
- gov.br / Receita Federal DASN-SIMEI manual — R$81k limit, comércio/serviços split, employee flag, May 31 deadline
- https://www.crunchydata.com/blog/working-with-money-in-postgres — integer-cents/numeric, `money` type deprecated

### Secondary (MEDIUM confidence)
- https://github.com/mehmet-kozan/pdf-parse (v2 serverless, getTable) + https://github.com/Fabiopf02/ofx-data-extractor (TS OFX) + https://github.com/tio-ze-rj/banksheet (BR bank PDF reference)
- dev.to / chudi.dev / buildwithmatija — serverless PDF caveats (`unpdf` edge-safe, avoid pdf-parse v1 / raw pdfjs-dist)
- Monarch / YNAB / QuickBooks / ExpenseSorted writeups — suggest→confirm→auto-apply, bulk recategorize, ML accuracy (70–80% cold → ~95% after ~50 corrections)
- Mobills / my-best / TechTudo — BR app feature baselines (OFX/CSV/PDF import, editable categories)
- InfinitePay / InfoMoney / MaisMEI / Nubank — MEI proportional first-year cap (R$6.750 × meses), +20% tolerance band, desenquadramento
- LLM prompt-injection mitigation (arxiv 2508.19287, evidentlyai) + CVE-2025-48757 (Supabase RLS exposure)

### Tertiary (LOW confidence)
- Exact LLM pricing figures (Gemini Flash $0.075–0.15/1M, GPT-nano $0.10/$0.40) — verify at build time; LLM pricing moves
- `dinero.js` v2 / `pdf-parse` v2 npm dist-tags — pin explicitly and verify installed major at install time

---
*Research completed: 2026-06-16*
*Ready for roadmap: yes*
