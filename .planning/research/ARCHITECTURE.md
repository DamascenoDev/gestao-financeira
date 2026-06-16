# Architecture Research

**Domain:** Personal finance management web app (Brazil) — AI-assisted expense classification, savings goals (reservas/sinking funds), budget targets, MEI tax tracking
**Researched:** 2026-06-16
**Confidence:** HIGH (stack is locked and well-documented; data model + pipeline are standard patterns verified against Supabase/Vercel/Next.js current docs)

> Stack is LOCKED: Next.js (App Router) + TypeScript strict + Supabase (Auth/Postgres/Storage) + Vercel. Everything below is designed *within* it. Nothing here proposes swapping a stack component.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                              │
│  Next.js App Router — React Server Components + Client Components     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Dashboard │ │ Receitas │ │  Upload  │ │ Reservas │ │   MEI     │  │
│  │(metas)   │ │          │ │ + Revisão│ │          │ │  (NFs)    │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
│       │            │            │            │             │         │
│       │  direct upload (signed URL)──────────┼─────────────┼──┐      │
├───────┼────────────┼────────────┼────────────┼─────────────┼──┼──────┤
│       ▼            ▼            ▼            ▼             ▼  │      │
│              NEXT.JS SERVER LAYER (Vercel Functions)        │      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐ │      │
│  │ Server Actions  │  │ Route Handlers   │  │  after()   │ │      │
│  │ (mutations:     │  │ (/api/ingest,    │  │ background │ │      │
│  │  confirm class, │  │  /api/classify)  │  │ parse+class│ │      │
│  │  CRUD receitas, │  │                  │  │            │ │      │
│  │  reservas, NFs) │  │                  │  │            │ │      │
│  └────────┬────────┘  └────────┬─────────┘  └─────┬──────┘ │      │
│           │                    │                  │        │      │
│  ┌────────┴────────────────────┴──────────────────┴──────┐ │      │
│  │  Domain services (lib/): parsers, classifier,         │ │      │
│  │  dedupe/idempotency, aggregation queries              │ │      │
│  └────────┬──────────────────────────────┬───────────────┘ │      │
├───────────┼──────────────────────────────┼─────────────────┼──────┤
│           ▼                              ▼                  ▼      │
│      SUPABASE (user's personal project)                           │
│  ┌──────────┐  ┌────────────────────────┐  ┌──────────────────┐   │
│  │  Auth    │  │  Postgres + RLS        │  │  Storage         │   │
│  │ (JWT,    │  │  (all tables scoped    │  │  (private bucket │   │
│  │ auth.uid)│  │   by user_id)          │  │  'statements')   │   │
│  └──────────┘  └────────────────────────┘  └──────────────────┘   │
├───────────────────────────────────────────────────────────────────┤
│   EXTERNAL: LLM API (Gemini Flash / GPT-4.1-nano) — classify only  │
│             on unknown-merchant fallback                          │
└───────────────────────────────────────────────────────────────────┘
```

**Key architectural decisions baked into this diagram:**

1. **File uploads bypass the Vercel function.** The browser uploads the PDF/CSV/OFX *directly to Supabase Storage* via a signed upload URL. This sidesteps Vercel's hard **4.5MB request-body limit** on functions and avoids burning function time streaming bytes. The function only ever receives the storage *path*, never the file body.
2. **Parsing + classification run as deferred background work** using Next.js `after()` (Next 15.1+) / `waitUntil`, so a slow PDF parse doesn't block the HTTP response and doesn't risk the Hobby-plan 60s timeout on the user-facing request.
3. **RLS is the security boundary, not app code.** Every table and the Storage bucket enforce `user_id = auth.uid()`. The app is "multi-user-ready" the day it ships even though only one human logs in.
4. **The LLM is the expensive, last-resort path.** Memory lookup (a cheap indexed SQL query) runs first; the LLM is only invoked for a merchant string never seen before.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Auth (Supabase)** | Identity, JWT issuance, `auth.uid()` for RLS | `@supabase/ssr` clients in middleware/actions/route handlers |
| **Postgres + RLS** | System of record; every row scoped to `user_id`; enforces isolation | SQL migrations, RLS policies, SQL views for aggregation |
| **Storage (private bucket)** | Holds raw statement files; never public | `statements` bucket, RLS on `storage.objects`, signed URLs |
| **Server Actions** | Authenticated mutations: confirm classification, CRUD receitas/reservas/NFs, edit categories/targets | `'use server'` functions, called from RSC forms |
| **Route Handlers** | Ingestion trigger (`/api/ingest`), classification endpoint (`/api/classify`) — anything needing a request/response or webhook shape | `app/api/.../route.ts` |
| **Background worker (`after`)** | Parse file → normalize → dedupe → classify (memory-first) → persist as `pending` transactions | `after()` callback enqueued from the ingest route |
| **Parsers (lib/)** | Format-specific: OFX, CSV, PDF → normalized `RawTransaction[]` | `ofx-data-extractor`, CSV parser, PDF text extraction |
| **Classifier (lib/)** | Memory match → AI fallback → produce category suggestion + confidence | SQL lookup + LLM client |
| **Aggregation (lib/ + SQL views)** | Monthly/annual budget adherence, reserva balances, MEI annual total | SQL views/RPC for heavy rollups, app code for presentation |

---

## Data Model (Postgres)

All tables carry `user_id uuid not null references auth.users(id)` with an index on `user_id`, and an RLS policy `using (user_id = (select auth.uid()))`. The `(select auth.uid())` wrapper is the documented performance pattern — it lets Postgres evaluate the function once per query instead of per row.

### Core tables

```
auth.users (Supabase-managed)
   │
   ├──< profiles            (1:1 app-side mirror, on_auth_user_created trigger)
   │
   ├──< categories          (BR-default seed, editable per user)
   │       ▲
   │       │ category_id
   │       │
   ├──< budget_targets ─────┘   (per category; pct of income; monthly+annual)
   │
   ├──< income_sources          (recurring: salário, pensão — with cadence)
   ├──< income_entries          (ad-hoc + materialized recurring occurrences)
   │
   ├──< statements              (one uploaded file; storage_path; content_hash; status)
   │       ▲
   │       │ statement_id
   │       │
   ├──< transactions ───────────┘   (normalized line items; category_id; status)
   │       │                          │
   │       │ merchant_normalized      │ when category = "Reserva":
   │       ▼                          ▼
   ├──< merchant_patterns        ├──< reserva_ledger_entries
   │   (the classification          │   (in/out; transaction_id link)
   │    MEMORY: merchant→category)   │
   │                              reservas (buckets, optional target)
   │
   └──< mei_invoices            (NFs emitidas; competência; valor; for DASN-SIMEI)
```

### Key columns (sketch)

**`categories`**
```
id uuid pk, user_id, name text, kind text ('expense'|'reserva'|'system'),
is_archived bool, sort int, created_at
-- 'Reserva' is a category of kind='reserva' that triggers the bucket sub-question
```

**`merchant_patterns`** — the classification memory
```
id uuid pk, user_id,
merchant_normalized text,        -- canonicalized descriptor (uppercased, trimmed, noise-stripped)
category_id uuid fk,
reserva_id uuid fk null,         -- if the learned pattern always maps to a specific reserva
hit_count int default 0,         -- bump on each auto-apply (useful for confidence/UI)
source text ('user'|'ai_confirmed'),
last_used_at, created_at,
unique (user_id, merchant_normalized)   -- one learned mapping per merchant per user
```
> The `unique(user_id, merchant_normalized)` constraint is what makes memory lookup an O(1) indexed point-read and prevents conflicting learned mappings.

**`statements`**
```
id uuid pk, user_id,
storage_path text,               -- path in 'statements' bucket: {user_id}/{uuid}.pdf
original_filename text,
format text ('pdf'|'csv'|'ofx'),
content_hash text,               -- sha256 of file bytes → re-upload detection
period_start date, period_end date,  -- parsed statement coverage (dedupe window)
status text ('uploaded'|'parsing'|'parsed'|'failed'),
tx_count int, created_at,
unique (user_id, content_hash)   -- idempotency: same file twice = same statement row
```

**`transactions`**
```
id uuid pk, user_id, statement_id fk null (null = manual entry),
posted_at date, description_raw text, merchant_normalized text,
amount numeric(14,2),            -- negative = expense, positive = credit/refund
currency text default 'BRL',
category_id uuid fk null,
status text ('pending'|'confirmed'|'ignored'),
classification_source text ('memory'|'ai'|'manual'|null),
ai_confidence numeric null,
dedupe_key text,                 -- hash(user_id, posted_at, amount, description_raw)
unique (user_id, dedupe_key)     -- line-level dedupe across overlapping statements
```

**`reservas`** (buckets / sinking funds)
```
id uuid pk, user_id, name text ('Apê','Carro'),
target_amount numeric null,      -- OPTIONAL target
is_archived bool, created_at
-- current balance is DERIVED from reserva_ledger_entries, not stored
```

**`reserva_ledger_entries`**
```
id uuid pk, user_id, reserva_id fk,
direction text ('in'|'out'),
amount numeric(14,2),            -- always positive; direction gives the sign
transaction_id uuid fk null,     -- links a "Reserva"-classified transaction to this entry
note text, occurred_at date, created_at
```

**`income_sources`** (recurring) + **`income_entries`** (occurrences/ad-hoc)
```
income_sources: id, user_id, label, amount, cadence ('monthly'|'biweekly'|...),
                next_due date, is_active
income_entries: id, user_id, source_id fk null, amount, received_at, note
-- budget % targets are computed against summed income_entries per period
```

**`budget_targets`**
```
id uuid pk, user_id, category_id fk,
pct_of_income numeric,           -- e.g. 0.30 = 30% of period income
scope text ('monthly'|'annual'),
effective_from date,
unique (user_id, category_id, scope, effective_from)
```

**`mei_invoices`** (NFs)
```
id uuid pk, user_id, nf_number text, client_name text,
amount numeric(14,2), service_description text,
issued_at date, competencia text ('YYYY-MM'),
-- annual sum vs R$81.000 limit + DASN-SIMEI report derived by query
```

### How a "Reserva" transaction links to the bucket ledger

This is the one cross-feature relationship worth making explicit:

```
User uploads statement
   → transaction T parsed (e.g. "TRANSF POUPANCA APE  -500,00")
   → classifier suggests category = "Reserva" (kind='reserva')
   → UI asks the sub-question: "Qual reserva?"  → user picks "Apê"
   → on confirm (server action), in ONE transaction:
        a) UPDATE transactions SET category_id=<Reserva>, status='confirmed'
        b) INSERT reserva_ledger_entries (reserva_id=<Apê>, direction='in',
                                          amount=500, transaction_id=T.id)
        c) UPSERT merchant_patterns (merchant_normalized, category=Reserva,
                                     reserva_id=<Apê>)   ← learns the mapping
   → reserva balance(Apê) = Σ(in) − Σ(out)  [derived view]
   → progress bar = balance / target_amount (if target set)
```

Saídas (spending the saved money) are `direction='out'` ledger entries — can be created standalone (no transaction) or linked to a transaction. **Reserva balance is always derived, never a stored mutable counter** — this avoids drift bugs (a classic finance-app pitfall).

---

## Statement Ingestion Pipeline

### Where each step runs

```
[1] UPLOAD (client → Storage, direct)
    Client requests a signed upload URL (server action: createSignedUploadUrl
    for path {user_id}/{uuid}.{ext}). Browser PUTs the file straight to
    Supabase Storage. The Vercel function never touches the bytes.
    → WHY: dodges Vercel's 4.5MB function payload limit; cheaper; faster.

         │ (browser holds storage_path + sha256 it computed client-side, OR
         │  hash is recomputed server-side after download — see idempotency)
         ▼
[2] REGISTER + TRIGGER  (Route Handler: POST /api/ingest)   [server]
    Body = { storage_path, original_filename, format, content_hash }.
    INSERT statements (... status='uploaded') — the unique(user_id, content_hash)
    constraint makes a re-upload a no-op (ON CONFLICT DO NOTHING → return existing).
    Respond 202 immediately, then schedule parse via after()/waitUntil.

         ▼
[3] PARSE  (after() background callback)   [server, Vercel function]
    Download file from Storage (service role or user-scoped client).
    Dispatch by format:
      .ofx → ofx-data-extractor
      .csv → CSV parser (bank-specific column mapping)
      .pdf → text extraction (+ BR-bank-aware parsing; banksheet covers
             Nubank/Itaú/Bradesco/Inter as a reference/option)
    Produce RawTransaction[] → normalize (merchant canonicalization, sign,
    BRL amount parsing "1.234,56"). status='parsing' → 'parsed'/'failed'.

         ▼
[4] DEDUPE  [server, same callback]
    For each normalized tx, compute dedupe_key = hash(user_id, posted_at,
    amount, description_raw). INSERT ... ON CONFLICT (user_id, dedupe_key)
    DO NOTHING. Overlapping statements (same tx appearing in two PDFs) collapse.

         ▼
[5] CLASSIFY — memory first  [server]
    For each new tx: point-lookup merchant_patterns by (user_id,
    merchant_normalized). HIT → set category + classification_source='memory',
    bump hit_count. Status stays 'pending' (still shown for review) but
    pre-filled. NO LLM CALL.
    MISS → collect into a batch for [6].

         ▼
[6] CLASSIFY — AI fallback  [server, calls LLM]   ← the only paid step
    Batch all unknown merchants into ONE LLM call (see AI section).
    Set category suggestion + classification_source='ai' + ai_confidence.
    Status='pending'.

         ▼
[7] HUMAN CONFIRM  (Server Action, from the Revisão UI)   [server]
    User reviews pending tx, accepts/overrides categories. On confirm:
      - UPDATE transactions → status='confirmed'
      - For AI-suggested or corrected merchants: UPSERT merchant_patterns
        (source='ai_confirmed' or 'user') → MEMORY GROWS
      - If category is a Reserva → write reserva_ledger_entries (sub-question)
    Next upload with the same merchant skips the LLM entirely.
```

### Idempotency & dedupe — two layers

| Layer | Mechanism | Protects against |
|-------|-----------|------------------|
| **File level** | `unique(user_id, content_hash)` on `statements` | Re-uploading the exact same file |
| **Transaction level** | `unique(user_id, dedupe_key)` on `transactions` | Same transaction across overlapping/edited statements (different file bytes, same line) |

Both use `INSERT ... ON CONFLICT DO NOTHING`, so the pipeline is safe to re-run (re-trigger parse after a transient failure) without creating duplicates — important because `after()`/serverless can occasionally retry.

---

## AI Classification Integration

**Provider recommendation:** a cheap short-text model — **Gemini 1.5/2.5 Flash** ($0.075–0.15 / 1M input tokens) or **GPT-4.1-nano** ($0.10/$0.40). For classifying a 1–4 word merchant string into ~15 categories, any of these is more than capable; pick on cost + the SDK you prefer. At personal-use volume this is effectively free (cents/month). Confidence: HIGH on capability, MEDIUM on exact prices (verify at build time — LLM pricing moves).

**Where the work splits:**

```
merchant memory lookup  → SQL (indexed, free)     → runs ALWAYS, first
AI call                 → LLM API (paid)          → runs ONLY on memory miss
write-back of pattern   → SQL upsert on confirm   → runs on human confirm
```

**Request shape (batched — one call per statement's unknown merchants):**
```jsonc
// system: "Classify each Brazilian merchant descriptor into one of these
//          categories. Return JSON. If unsure, use 'Outros' with low confidence."
{
  "categories": ["Mercado","Restaurante","Transporte","Saúde","Reserva", ...],
  "merchants": ["UBER *TRIP", "DROGARIA SP", "ASSAI ATACADIST"]
}
```
**Response shape:**
```jsonc
{
  "results": [
    { "merchant": "UBER *TRIP",       "category": "Transporte",  "confidence": 0.97 },
    { "merchant": "DROGARIA SP",      "category": "Saúde",       "confidence": 0.93 },
    { "merchant": "ASSAI ATACADIST",  "category": "Mercado",     "confidence": 0.95 }
  ]
}
```

**Cost-minimizing rules (all enforced in `lib/classifier`):**
1. Memory miss is the *only* trigger — a known merchant never reaches the LLM.
2. **Batch** all unknown merchants from a statement into one request (not one call per tx).
3. **De-duplicate** merchant strings within the batch before sending.
4. Send only the category *names* + merchant strings — no PII, no amounts needed.
5. Use JSON-mode / structured output to avoid retry-on-parse-failure.
6. The model output is a *suggestion*; nothing is learned until the human confirms — so a wrong AI guess costs one call, never poisons the memory.

**Write-back:** confirmation is the *only* path that writes `merchant_patterns`. This means the memory only ever contains human-validated mappings, and the AI's role shrinks monotonically over time as the pattern table fills up.

---

## Budget + Reserva Computation

**Principle: aggregation lives in SQL (views / RPC), presentation lives in app code.**
Money math (sums over a period, balance = in − out) is exactly what Postgres is good at, and doing it in SQL keeps it inside the RLS boundary automatically.

| Metric | Where computed | How |
|--------|----------------|-----|
| Period income | SQL view `v_income_by_period` | `SUM(income_entries.amount)` grouped by month/year |
| Category spend | SQL view `v_spend_by_category_period` | `SUM(transactions.amount)` where confirmed, grouped by category + month/year |
| **Monthly adherence** | SQL view, joined to `budget_targets(scope='monthly')` | `spend / (pct_of_income × month_income)` → % of target |
| **Annual adherence** | SQL view, `budget_targets(scope='annual')` | same, over rolling/calendar year |
| **Reserva balance** | SQL view `v_reserva_balance` | `SUM(in) − SUM(out)` per reserva |
| Reserva progress | App code | `balance / target_amount` (target optional → null-safe) |
| **MEI annual total** | SQL view `v_mei_year_total` | `SUM(mei_invoices.amount)` per year → compare to R$81.000 |

**Why SQL views over app-code aggregation:**
- Adherence and balances are read on every dashboard load — pushing the rollup into Postgres avoids N+1 fetches and over-fetching raw rows into the function.
- Views inherit RLS from their base tables, so the isolation guarantee is free.
- For anything heavier or parameterized (rolling 12-month window), use a `SECURITY INVOKER` Postgres function (RPC) called via `supabase.rpc()` — still RLS-respecting.

> Anti-pattern to avoid: fetching all transactions into the Next.js function and summing in JS. It over-fetches, breaks RLS clarity, and gets slow as history grows.

---

## Auth + RLS Boundaries

**Auth flow (Next.js App Router + `@supabase/ssr`):**
- Middleware refreshes the session cookie on each request (Server Components can't write cookies — middleware does it).
- Separate Supabase clients for: middleware, Server Components (read), Server Actions / Route Handlers (read+write). All use the **anon key** so RLS is enforced. The **service-role key is never shipped to the client** and is used only server-side for the one operation that legitimately needs it (e.g. downloading a file in the background worker, if not using a user-scoped client).
- v1 is single-user, but auth is real auth — adding the spouse later is "create a second login," zero schema migration.

**RLS pattern (every table):**
```sql
alter table transactions enable row level security;
create policy "own rows" on transactions
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create index on transactions (user_id);   -- 100x perf on RLS filters
```
- `(select auth.uid())` (wrapped) is the documented performance form.
- The `with check` half prevents inserting/updating rows into someone else's `user_id`.

**Storage access control (the `statements` private bucket):**
- Bucket is **private** (no public URLs ever — these are financial documents).
- RLS on `storage.objects` keyed to a per-user folder:
  ```sql
  create policy "own files" on storage.objects
    for all using (
      bucket_id = 'statements'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  ```
  → files live at `{user_id}/{uuid}.pdf`; a user can only touch their own folder.
- Read access is via short-lived **signed URLs** generated server-side, never public links.
- Upload is via **signed upload URL** (needs only `insert` on `storage.objects`) → direct browser→Storage, bypassing the function payload limit.

---

## Recommended Project Structure

```
src/
├── app/
│   ├── (auth)/                 # login routes
│   ├── (app)/
│   │   ├── dashboard/          # metas + adherence (reads SQL views)
│   │   ├── receitas/           # income sources + entries
│   │   ├── upload/             # upload + revisão (confirm) flow
│   │   ├── reservas/           # buckets + ledger + progress
│   │   └── mei/                # NFs + R$81k limite + DASN report
│   └── api/
│       ├── ingest/route.ts     # register statement + trigger after() parse
│       └── classify/route.ts   # (optional) re-classify endpoint
├── lib/
│   ├── supabase/               # ssr clients: server, middleware, action
│   ├── parsers/                # ofx.ts, csv.ts, pdf.ts → RawTransaction[]
│   ├── normalize.ts            # merchant canonicalization, BRL amount parsing
│   ├── dedupe.ts               # content_hash + dedupe_key
│   ├── classifier/             # memory-lookup.ts, ai.ts, batch.ts
│   └── aggregation/            # typed wrappers over SQL views / rpc
├── actions/                    # 'use server' mutations (confirm, CRUD)
├── db/
│   ├── migrations/             # SQL: tables, indexes, RLS, views
│   └── seed/                   # BR default categories
└── types/                      # shared TS types (strict)
```

**Rationale:**
- `lib/parsers` + `lib/classifier` are pure, testable, format-agnostic — the riskiest logic is isolated and unit-testable without Supabase.
- `actions/` holds all writes (confirm, CRUD) so the RLS-mutating surface is in one place.
- `db/` keeps schema + RLS + views as versioned migrations — the data model is the contract.

---

## Build Order (Dependency Ordering for Roadmap)

Each item depends on those above it. This *is* the suggested phase backbone.

```
0. Foundation
   Supabase project + Auth + middleware/ssr clients + RLS scaffold.
   → Nothing works without identity + the isolation boundary.

1. Data model + categories
   All tables, indexes, RLS policies, BR-default category seed, SQL views (empty).
   → Everything downstream writes into these tables.

2. Income (receitas)
   income_sources + income_entries CRUD.
   → Budget % targets are meaningless without an income denominator.

3. Manual transactions + categories editing
   transactions CRUD by hand + edit/add/remove categories.
   → Lets the whole classification/budget loop be validated BEFORE building
     the upload pipeline. De-risks the hardest part early.

4. Budget targets + adherence dashboard
   budget_targets + the monthly/annual adherence SQL views + dashboard.
   → Delivers the "view of metas" core value on manually-entered data.

5. Reservas
   reservas + reserva_ledger_entries + the "qual reserva?" sub-question +
   progress bars (derived balance).
   → Independent of upload; only needs transactions + categories.

6. Storage + ingestion (upload → parse → normalize → dedupe)
   Private bucket + signed upload URLs + /api/ingest + after() parse +
   OFX/CSV/PDF parsers + idempotency/dedupe. Produces 'pending' transactions
   with NO classification yet.
   → Now feeds the loop built in 3–5 automatically.

7. Classification — memory layer
   merchant_patterns + memory lookup in the pipeline + write-back on confirm.
   → Must exist before AI so AI only fills genuine gaps. The "learning" core value.

8. Classification — AI fallback
   LLM batch call for unknown merchants + confidence + revisão UI.
   → Last because it's only valuable once memory + confirm flow exist.

9. MEI
   mei_invoices + R$81k limite tracking + DASN-SIMEI report view.
   → Fully independent feature; can slot anywhere after step 1, parked last
     because it doesn't touch the classification core value.
```

**Critical sequencing insight for the roadmap:** build the *manual* classification + budget loop (steps 2–5) **before** the upload/AI pipeline (steps 6–8). The upload+AI machinery is the highest-risk, highest-novelty part; everything it produces (`pending` transactions) is consumed by machinery you can stand up cheaply with manual entry first. This means the core value ("see classified spend vs metas") is demonstrable early, and the AI step lands on a proven foundation rather than being a big-bang dependency.

**Phases likely to need deeper per-phase research:**
- **Step 6 (PDF parsing):** BR bank/card PDF layouts vary wildly; this is the most fragile step. Flag for a parser-strategy spike (per-format reference: `banksheet` for BR PDFs, `ofx-data-extractor` for OFX).
- **Step 8 (AI):** confirm final provider/pricing + structured-output behavior at build time.

---

## Anti-Patterns (domain-specific)

### Anti-Pattern 1: Storing reserva/account balance as a mutable column
**What people do:** keep `reservas.balance` and increment/decrement it on each entry.
**Why it's wrong:** drifts out of sync on partial failures, retries, or concurrent writes — and in a finance app a wrong balance destroys trust.
**Do this instead:** balance is always `SUM(in) − SUM(out)` from the ledger (derived view). The ledger is the truth.

### Anti-Pattern 2: Calling the LLM per transaction
**What people do:** one API call for every line on a statement.
**Why it's wrong:** 50× the cost and latency; memory-known merchants shouldn't reach the LLM at all.
**Do this instead:** memory lookup first; batch the remaining unknown merchants into a single de-duplicated call.

### Anti-Pattern 3: Streaming the file upload through the Vercel function
**What people do:** POST the PDF to a route handler that forwards it to Storage.
**Why it's wrong:** hits Vercel's 4.5MB body limit, wastes function time/cost, risks timeout.
**Do this instead:** signed upload URL → browser uploads direct to Storage; function gets only the path.

### Anti-Pattern 4: Learning patterns from AI output without human confirm
**What people do:** auto-save the AI's guess as a merchant pattern.
**Why it's wrong:** one wrong guess silently mis-classifies that merchant forever.
**Do this instead:** AI output is a *suggestion*; `merchant_patterns` is written only on human confirm.

### Anti-Pattern 5: Aggregating in app code by fetching all rows
**What people do:** `select *` transactions into the function and sum in JS.
**Why it's wrong:** over-fetches, slows as history grows, scatters money logic outside RLS.
**Do this instead:** SQL views / RPC for sums and adherence; app code only presents.

---

## Scaling Considerations

This is a **personal app** (1–2 users). Scaling is essentially a non-issue; the honest guidance is *don't optimize for scale*.

| Scale | Adjustments |
|-------|-------------|
| 1–2 users (target) | Everything above as-is. Supabase free/low tier is ample. |
| Hypothetical 100s | Same architecture; ensure `user_id` indexes exist (already specified); maybe materialize the heaviest views. |
| Beyond | Out of scope by project decision (no public SaaS). |

**The only real "scale" concern is per-user history growth**, mitigated by: indexes on `(user_id)` and `(user_id, posted_at)`, and SQL-side aggregation rather than fetching all rows. First thing that would get slow without those is the dashboard's category rollup — already addressed by views + indexes.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Supabase Auth | `@supabase/ssr`, middleware cookie refresh | anon key client-side; never service-role |
| Supabase Storage | signed upload URL (write), signed URL (read) | private bucket, per-user folder RLS |
| Supabase Postgres | RLS-enforced queries + views + RPC | all aggregation here |
| LLM API (Gemini Flash / GPT-4.1-nano) | server-side HTTPS, batched, JSON-mode | only on memory miss; no PII sent |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Client ↔ Storage | direct (signed URL) | bypasses function payload limit |
| Client ↔ Server Actions | RSC form actions | all mutations + confirm flow |
| Ingest route ↔ Parser | `after()` background callback | non-blocking, retry-safe via dedupe |
| Classifier ↔ Memory | SQL point-read | always first, free |
| Classifier ↔ LLM | batched HTTPS call | fallback only |
| App ↔ Aggregation | SQL views / `rpc()` | RLS inherited |

---

## Sources

- [Setting up Server-Side Auth for Next.js — Supabase Docs](https://supabase.com/docs/guides/auth/server-side/nextjs) — HIGH
- [RLS Performance and Best Practices — Supabase Docs](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) — HIGH (`(select auth.uid())`, index on `user_id`, with-check)
- [Storage Access Control — Supabase Docs](https://supabase.com/docs/guides/storage/security/access-control) — HIGH (private buckets, signed URLs, `storage.foldername(name)[1] = auth.uid()`)
- [Supabase Storage signed upload URLs discussion](https://github.com/orgs/supabase/discussions/20366) — MEDIUM (direct client upload, insert-only RLS)
- [Configuring Maximum Duration for Vercel Functions — Vercel Docs](https://vercel.com/docs/functions/configuring-functions/duration) — HIGH (60s Hobby / 300s Pro / Fluid up to 800s)
- [Vercel Functions timing out — Vercel KB](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) — HIGH (4.5MB payload limit, background work)
- [Functions: after — Next.js Docs](https://nextjs.org/docs/app/api-reference/functions/after) — HIGH (deferred background work, 15.1+)
- [waitUntil for Vercel Functions — Vercel Changelog](https://vercel.com/changelog/waituntil-is-now-available-for-vercel-functions) — HIGH
- [ofx-data-extractor — GitHub](https://github.com/Fabiopf02/ofx-data-extractor) — MEDIUM (TS OFX parser)
- [banksheet — BR bank/card statement parser, GitHub](https://github.com/tio-ze-rj/banksheet) — MEDIUM (Nubank/Itaú/Bradesco/Inter PDF, reference)
- [LLM API Pricing Comparison 2026 — CloudZero](https://www.cloudzero.com/blog/llm-api-pricing-comparison/) and [pecollective](https://pecollective.com/blog/llm-pricing-comparison-2026/) — MEDIUM (Gemini Flash $0.075–0.15/1M, GPT-4.1-nano $0.10/$0.40 — verify at build time)

---
*Architecture research for: personal finance web app (Brazil) with AI-assisted classification, reservas, budget metas, MEI*
*Researched: 2026-06-16*
