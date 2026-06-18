# Architecture Research

**Domain:** BYOK AI classification wired into an existing Next.js 16 + Supabase personal-finance app (v1.4 — CLS-AI)
**Researched:** 2026-06-18
**Confidence:** HIGH (integration points read directly from the codebase; provider/Vault patterns cross-checked against official docs)

> Scope: this is a SUBSEQUENT-milestone integration. The upload→parse→review→confirm→learn pipeline ALREADY exists and is in production. We are filling three pre-built null seams — `suggestCategory()`, `validateSuggestion`, `SuggestionSlot` — and adding a BYOK key-storage surface. **Do not re-design the pipeline.** Everything below is additive.

---

## Discovered Integration Points (REAL paths)

These were grepped from the live codebase, not assumed:

| Symbol / surface | Real path | Role in v1.4 |
|------------------|-----------|--------------|
| `suggestCategory()` (null seam) | `src/lib/classifier/suggest.ts:27` | **THE wire point.** Gets its real BYOK implementation. Signature already async, PII-safe. |
| `validateSuggestion()` (enum wrapper) | `src/lib/classifier/suggest.ts:48` | Already correct. Constrains LLM output to owned category ids. Reused as-is. |
| `SuggestionSlot` (UI affordance) | `src/components/suggestion-slot.tsx` | Already renders a chip on non-null suggestion. Just needs a non-null suggestion fed to it. |
| Seam test (security contract) | `src/lib/classifier/suggest.test.ts` | Pins the enum contract; extend, don't replace. |
| Memory store (cache-hit layer) | `src/lib/classifier/memory.ts` (`lookupMemory`) | Unchanged. Memory-first gate stays in front of AI. |
| Pipeline call site (ingest) | `src/actions/import.ts:434` (inside `ingestStatement`) | Where `suggestCategory()` is currently invoked and ignored. Becomes the batched-AI call site. |
| Confirm + learn | `src/actions/import.ts:553` (`confirmImport`) | Unchanged. Human-confirm still the ONLY thing that writes `merchant_patterns`. |
| Review grid (renders slot) | `src/components/import-review-table.tsx:771` | `<SuggestionSlot />` currently always inert. Feed it `row.suggestion`. |
| Categories fetch (the live enum) | `src/actions/import.ts:392` | Already pre-fetches `categories(id, name)` — this IS the enum source for `validateSuggestion`. |
| RLS server client | `src/lib/supabase/server.ts` (`createClient`) | RLS-active, cookie/JWT. Used for everything user-scoped. |
| Service-role client | `src/lib/supabase/admin.ts` (`createAdminClient`) | `import 'server-only'`, DELETE-only today. **Candidate for the Vault decrypt RPC caller.** |
| Settings precedent (RSC + form + action) | `src/app/(app)/mei/configuracoes/page.tsx` + `src/components/mei-settings-form.tsx` + `src/actions/mei.ts` | Copy this shape for the BYOK Settings surface. |
| Account/settings nav home | `src/app/(app)/conta/page.tsx` | Natural place to hang the AI-settings link/section. |
| Next config (serverExternal) | `next.config.ts` (`serverExternalPackages: ["pdf-parse"]`) | AI SDK packages do NOT need this (pure JS) — no change expected. |
| Migration head | `supabase/migrations/0032_statements_format_pdf.sql` | **Next migration = `0033_ai_settings.sql`.** |
| Types codegen | `package.json` `gen:types` script | Run after the 0033 migration so `ai_settings` is typed. |

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  CLIENT (browser, 'use client')                                       │
│  ┌────────────────────┐         ┌────────────────────────────────┐    │
│  │ AiSettingsForm     │         │ ImportReviewTable              │    │
│  │ (provider+model+   │         │  └ SuggestionSlot (chip)       │    │
│  │  PASTE key, test)  │         │     onApply → set category     │    │
│  └─────────┬──────────┘         └───────────┬────────────────────┘    │
│            │ key string (one-way, write-only)│ row.suggestion (read)   │
├────────────┼────────────────────────────────┼─────────────────────────┤
│  SERVER (Server Actions / 'use server', Node runtime)                  │
│  ┌─────────▼──────────┐         ┌───────────▼────────────────────┐    │
│  │ saveAiSettings     │         │ ingestStatement (import.ts)     │    │
│  │ testConnection     │         │  ├ lookupMemory  (cache HIT)    │    │
│  └─────────┬──────────┘         │  └ suggestCategory (cache MISS) │    │
│            │                    └───────────┬────────────────────┘    │
│  ┌─────────▼───────────────┐    ┌───────────▼────────────────────┐    │
│  │ ai/settings.server.ts   │    │ classifier/suggest.ts (SEAM)    │    │
│  │  getDecryptedAiSettings │◄───┤  build z.enum(owned cat ids)    │    │
│  │  (Vault decrypt RPC)    │    │  → providerFactory(settings)    │    │
│  └─────────┬───────────────┘    │  → generateObject (BATCH)       │    │
│            │                    │  → validateSuggestion (enum)    │    │
│  ┌─────────▼───────────────┐    └───────────┬────────────────────┘    │
│  │ ai/provider-factory.ts  │                │ provider-agnostic model │
│  │  google|anthropic|deepseek               ▼                         │
│  └─────────────────────────┘    ┌────────────────────────────────┐    │
│                                 │ @ai-sdk/* model (per-call key)  │────┼──► LLM
├─────────────────────────────────┴────────────────────────────────┴────┤
│  POSTGRES (Supabase, RLS on every table)                               │
│  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐    │
│  │ categories   │  │ merchant_patterns│  │ ai_settings (NEW, 0033) │   │
│  │ (live enum)  │  │ (memory, learned)│  │ provider|model|key_id   │   │
│  └──────────────┘  └──────────────────┘  └──────────┬─────────────┘    │
│                                          ┌───────────▼──────────────┐   │
│                                          │ vault.secrets (encrypted)│   │
│                                          │ + SECURITY DEFINER RPC   │   │
│                                          └──────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `ai_settings` table (NEW) | Holds chosen provider + model + a Vault secret REFERENCE per user. Never the plaintext key. | Postgres table, RLS `auth.uid() = user_id`, `key_secret_id uuid` → `vault.secrets.id`. |
| Vault + decrypt RPC (NEW) | Encrypt key at rest; decrypt server-side only via a `security definer` function callable by service_role. | `vault.create_secret` on write; `get_ai_api_key()` RPC reading `vault.decrypted_secrets`. |
| `ai/settings.server.ts` (NEW) | Server-only read that returns `{ provider, model, apiKey }` for the caller. Calls the decrypt RPC. | `import 'server-only'`; uses admin client for the Vault RPC. |
| `ai/provider-factory.ts` (NEW) | Maps `(provider, model, apiKey)` → a configured `@ai-sdk` `LanguageModel`. Provider-agnostic boundary. | `switch` over `createGoogleGenerativeAI / createAnthropic / createDeepSeek`. |
| `suggestCategory()` (WIRE) | Memory-miss → build live enum, call model once, validate. Returns `string \| null`. | Real body replaces the `return null` at `suggest.ts:34`. |
| `validateSuggestion()` (REUSE) | Constrain model output to an owned category id. Already correct. | No change. |
| `SuggestionSlot` (REUSE) | Render "Aplicar sugestão: {cat}" chip when a suggestion exists. Already correct. | Feed it `row.suggestion`. |
| `saveAiSettings` / `testConnection` (NEW actions) | Persist provider/model + Vault-encrypt the pasted key; ping provider with a trivial call. | New `src/actions/ai-settings.ts`. |

---

## Recommended Project Structure

```
src/
├── lib/
│   ├── ai/                          # NEW — the BYOK AI boundary
│   │   ├── provider-factory.ts      # (provider, model, apiKey) → @ai-sdk LanguageModel
│   │   ├── provider-factory.test.ts # asserts each provider id maps; rejects unknown
│   │   ├── settings.server.ts       # 'server-only' getDecryptedAiSettings(admin/RPC)
│   │   ├── settings.ts              # pure types + provider/model registry (client-safe)
│   │   └── classify.ts              # batched generateObject call + result→Map shaping
│   └── classifier/
│       ├── suggest.ts               # WIRE the real body (was return null)
│       ├── suggest.test.ts          # extend: enum contract + null-on-no-key/error
│       └── memory.ts                # UNCHANGED (cache-hit gate stays in front)
├── actions/
│   ├── ai-settings.ts               # NEW — saveAiSettings, testConnection
│   └── import.ts                    # MODIFY ~line 434: batch unseen → suggestCategory
├── components/
│   ├── ai-settings-form.tsx         # NEW — provider select + model + paste key + test btn
│   ├── suggestion-slot.tsx          # UNCHANGED (already renders chip)
│   └── import-review-table.tsx      # MODIFY line 771: pass row.suggestion to slot
├── app/(app)/
│   └── conta/configuracoes-ia/      # NEW — RSC settings surface (mirrors mei/configuracoes)
│       └── page.tsx
├── lib/schemas/
│   └── ai-settings.ts               # NEW — Zod: provider enum, model, apiKey shape
└── types/database.types.ts          # REGENERATE after 0033 (gen:types)

supabase/migrations/
└── 0033_ai_settings.sql             # NEW — table + RLS + Vault enable + decrypt RPC
```

### Structure Rationale

- **`lib/ai/` (new namespace):** keeps the provider/factory/decrypt concerns out of `classifier/`, which stays focused on the memory + seam contract. The seam (`suggest.ts`) imports `ai/provider-factory` and `ai/settings.server` — a clean one-directional dependency.
- **`settings.server.ts` carries `import 'server-only'`:** mirrors the existing `admin.ts` discipline. The decrypted key must never be importable from a `'use client'` module — the build fails loudly if it is, exactly like the service-role client today.
- **`settings.ts` (client-safe) vs `settings.server.ts`:** the provider/model REGISTRY (display names, default model ids) is needed by the form (client); the DECRYPT is server-only. Splitting prevents the key path from leaking into the client bundle.
- **Settings page under `conta/`:** the LGPD/account surface (`src/app/(app)/conta/`) is the natural home; reuse the `mei/configuracoes` RSC+form+action triad verbatim.

---

## Architectural Patterns

### Pattern 1: Provider-agnostic factory (BYOK)

**What:** A single function maps stored `(provider, model, apiKey)` to a configured `@ai-sdk` `LanguageModel`. Callers never know which provider they got.
**When to use:** Every AI call goes through it — there is exactly one place that knows provider names.
**Trade-offs:** One `switch` to maintain when adding a provider; in exchange the seam and the classify call stay provider-clean. Direct `@ai-sdk/*` packages (NOT AI Gateway) because BYOK means the key is the user's own, pasted into the app — a per-call `apiKey`, not a Vercel-dashboard env.

**Example:**
```typescript
// src/lib/ai/provider-factory.ts
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createDeepSeek } from '@ai-sdk/deepseek'
import type { LanguageModel } from 'ai'

export function modelFor(provider: string, model: string, apiKey: string): LanguageModel {
  switch (provider) {
    case 'google':    return createGoogleGenerativeAI({ apiKey })(model)
    case 'anthropic': return createAnthropic({ apiKey })(model)
    case 'deepseek':  return createDeepSeek({ apiKey })(model)
    default: throw new Error(`unknown AI provider: ${provider}`)
  }
}
```
> Note: `createProviderRegistry` is the AI SDK's built-in multi-provider helper, but it expects keys at construction time, not per-user-per-call. A tiny hand-rolled `switch` keyed by the user's stored settings is simpler for BYOK and avoids re-building a registry per request. Confirm the exact `createDeepSeek` import path / package availability in STACK research.

### Pattern 2: Live-enum structured output (categories are user-editable)

**What:** The enum that constrains the LLM is built from the user's CURRENT categories at call time, not a hard-coded list. The same id list is reused by `validateSuggestion` as a second gate.
**When to use:** Every classification call — the user can add/rename/remove categories at any time.
**Trade-offs:** Slightly larger prompt (the category list) but guarantees the model can only ever name a category the user owns. `generateObject` with a `z.enum` schema makes the constraint structural at decode time; `validateSuggestion` is the belt-and-suspenders second pass (defends against a provider that ignores the schema or a future streaming path).

**Example:**
```typescript
// inside suggestCategory(), src/lib/classifier/suggest.ts (the live wire)
const ids = categories.map((c) => c.id)
if (ids.length === 0) return null
const { object } = await generateObject({
  model,                                   // from modelFor(...)
  schema: z.object({ categoryId: z.enum(ids as [string, ...string[]]) }),
  prompt: buildPrompt(descriptorNorm, categories),  // descriptorNorm ONLY — no PII
})
return validateSuggestion(object.categoryId, categories)  // second enum gate
```

### Pattern 3: Memory-first gate, batched AI on miss (cost guardrail)

**What:** `lookupMemory` runs first for every row (zero AI). Only the rows that MISS are collected, de-duplicated by `descriptor_norm`, and sent to the model in ONE `generateObject` call per upload. Suggestions are mapped back to rows.
**When to use:** The `ingestStatement` loop (`import.ts:416–448`). Today the loop awaits `suggestCategory` per-row and ignores it; v1.4 changes this to: collect misses → one batch call → attach `row.suggestion`.
**Trade-offs:** Batching cuts cost/latency dramatically (one call vs N) and is the explicit "guardrails custo/erro" requirement. The model returns suggestions only — NOTHING is persisted. Persistence + learning still happen exclusively in `confirmImport` on human confirm.

**Example (loop reshape, conceptual):**
```typescript
// import.ts — after memory pass, collect unique unseen descriptors
const unseen = [...new Set(rows.filter(r => r.category_id === null)
                              .map(r => r.descriptor_norm))]
const suggestions = await suggestBatch(unseen, categoryList)  // ONE call, may be {}
for (const r of rows) {
  if (r.category_id === null && suggestions[r.descriptor_norm]) {
    r.suggestion = suggestions[r.descriptor_norm]   // chip in the grid; not applied
  }
}
```

### Pattern 4: Encrypt-at-rest via Vault + server-only decrypt RPC

**What:** On save, the pasted key goes into Supabase Vault (`vault.create_secret`); `ai_settings` stores only the returned secret id + provider + model. On read, a `security definer` RPC reads `vault.decrypted_secrets` and returns the plaintext to the SERVER ONLY.
**When to use:** `saveAiSettings` (write) and `getDecryptedAiSettings` (read, called from the seam).
**Trade-offs:** Vault keeps the encryption key out of the DB entirely (safe in backups) — strictly better than pgcrypto-with-a-DB-stored-key or app-layer crypto with an env secret. The cost: `vault.decrypted_secrets` is service-role-only by default, so the decrypt path must go through a `security definer` function (or the admin client) — it cannot run under the plain RLS cookie client. The function MUST internally filter by the caller's uid so it can never return another user's key.

**Example (migration sketch):**
```sql
-- 0033_ai_settings.sql
create table public.ai_settings (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  provider      text not null check (provider in ('google','anthropic','deepseek')),
  model         text not null,
  key_secret_id uuid not null,           -- → vault.secrets.id (NOT the key)
  updated_at    timestamptz not null default now()
);
alter table public.ai_settings enable row level security;
grant select, insert, update, delete on public.ai_settings to authenticated, service_role;
create policy "own ai_settings" on public.ai_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- decrypt RPC: security definer, returns the caller's own key only
create or replace function public.get_ai_api_key()
returns text language plpgsql security definer set search_path = '' as $$
  declare sid uuid; k text;
  begin
    select key_secret_id into sid from public.ai_settings where user_id = auth.uid();
    if sid is null then return null; end if;
    select decrypted_secret into k from vault.decrypted_secrets where id = sid;
    return k;
  end; $$;
revoke all on function public.get_ai_api_key() from public, anon;
grant execute on function public.get_ai_api_key() to authenticated;
```
> Decrypt option chosen: **Supabase Vault** (per PROJECT.md decision). The `security definer` RPC filtered by `auth.uid()` lets the RLS cookie client call it safely WITHOUT the service-role client — the function is the trust boundary. (If you prefer to keep all Vault access off the authenticated role, route the RPC through `createAdminClient()` instead and pass the uid explicitly.) NOTE: local Supabase CLI must have the `supabase_vault` extension enabled for `vault.create_secret` to exist in dev — verify before depending on it.

---

## Data Flow

### Classification flow (the core)

```
Upload (signed URL → Storage)                      [unchanged]
    ↓
ingestStatement (import.ts, 'use server', Node)    [MODIFY]
    ↓
download → decode → parse → dedupe                 [unchanged]
    ↓
for each row: lookupMemory(descriptor_norm)        [unchanged — cache HIT auto-classifies]
    ↓ (misses only)
collect unique unseen descriptors  ───────────────► getDecryptedAiSettings()   [NEW]
                                                        ↓ Vault decrypt RPC (server-only)
                                                     modelFor(provider,model,key) [NEW]
                                                        ↓
                                                     generateObject (BATCH, enum) [NEW]
                                                        ↓
                                                     validateSuggestion per result
    ↓ attach row.suggestion (NOT applied)
persist parsed_rows on statement (jsonb)            [unchanged shape + suggestion field]
    ↓
review grid renders SuggestionSlot chip            [MODIFY: feed row.suggestion]
    ↓ user clicks "Aplicar sugestão" OR picks manually   [human-in-the-loop]
confirmImport (import.ts)                           [unchanged]
    ↓
persist transactions + LEARN merchant_patterns     [unchanged — only confirm writes memory]
```

### Settings / key flow

```
AiSettingsForm (paste key, choose provider+model)
    ↓ saveAiSettings (server action)               [NEW]
vault.create_secret(key) → secret_id
    ↓ upsert ai_settings(user_id, provider, model, key_secret_id)   [RLS-scoped]
testConnection (server action)                      [NEW]
    ↓ getDecryptedAiSettings → modelFor → trivial generateObject ping
    ↓ ok | { error } (never echoes the key back)
```

### Key invariants (load-bearing)

1. **Key never reaches the client.** The form is WRITE-ONLY for the key: it posts the pasted string up, and never reads it back (the page renders "chave configurada ✓", not the key). `settings.server.ts` carries `import 'server-only'`. The decrypt RPC returns plaintext only inside a Server Action.
2. **descriptor_norm ONLY to the model.** The seam already documents this (`suggest.ts:23`). No amount, no raw descriptor, no user id in the prompt — preserves SEC-03.
3. **AI suggests, human confirms, only confirm learns.** `merchant_patterns` is written ONLY in `confirmImport`. An AI suggestion is a chip, never an auto-commit (matches the existing "no memory poisoning" discipline).

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single user (v1.4 reality) | None. One batched call per upload; memory absorbs everything after first confirm. Cost is near-zero by construction. |
| Family (deferred) | `ai_settings` is already `user_id`-keyed + RLS — a second user just gets their own row + Vault secret. Zero migration. |
| Many uploads/day | The memory-first gate means AI calls decay toward zero as patterns accumulate. Batch size is bounded by `MAX_PARSED_ROWS` (already enforced upstream). |

### Scaling priorities

1. **First "bottleneck" is cost, not throughput** — solved by memory-first + batch-per-upload + cheap models (Gemini Flash-Lite / Haiku / DeepSeek). No infra change.
2. **Provider rate limits** — degrade to manual pick (see Fallbacks); never block the upload.

---

## Failure / Fallback Architecture

Every failure mode degrades to **manual pick** — the existing v1.3 behavior — without breaking the upload flow. The seam returns `null`; the grid shows the inert slot + the "Classificar" select that already works today.

| Failure | Where caught | Degradation |
|---------|--------------|-------------|
| No key set / no `ai_settings` row | `getDecryptedAiSettings` returns null → seam returns null early | Manual pick. No call attempted. (This is literally v1.3 behavior.) |
| Provider 4xx (bad/expired key, quota) | `try/catch` around `generateObject` in the batch helper | Whole batch → no suggestions; rows stay unclassified. Log server-side. Optionally surface a one-time "IA indisponível" toast. |
| Provider 5xx / network / timeout | same `try/catch`; set `maxDuration` on the action | Manual pick. Upload + parse already succeeded — AI is strictly additive. |
| Rate limit (429) | same catch (no retry storm in v1) | Manual pick this upload; memory + next upload unaffected. |
| Malformed AI output (non-enum, junk, injection) | `z.enum` decode in `generateObject` AND `validateSuggestion` second gate | That row → null suggestion; other rows unaffected. Injection can at worst yield a non-enum value → rejected. |
| Empty category list | guard at top of seam (`ids.length === 0`) | null. No call. |
| Vault decrypt RPC error | `getDecryptedAiSettings` catch → null | Manual pick; log. |

**Architectural rule:** the AI batch call lives INSIDE the existing `try/catch` discipline of `ingestStatement` (which already converts any parser throw to a friendly `{ error }`), but a *suggestion* failure must NOT produce `{ error }` — it must produce *no suggestions* and let the (successful) parse continue to the review grid. Wrap the batch call in its own inner `try/catch` that returns `{}` on any failure, so the upload never fails because the AI did.

### Runtime placement

- **Keep the AI call in the existing Server Action** (`ingestStatement`, `'use server'`, Node runtime). It is NOT Edge — Node is required (consistent with `serverExternalPackages` for pdf-parse and with reading cookies/RLS).
- **Set `export const maxDuration`** on the route segment hosting these actions (the `import` actions run under the `/importar` segment). The PDF path already needs a long `maxDuration`; the AI call adds seconds — confirm the segment's `maxDuration` (≥ 60) covers parse + one batched LLM call.
- The `@ai-sdk/*` packages are pure JS — they do NOT need adding to `serverExternalPackages`. No `next.config.ts` change expected.

---

## Anti-Patterns

### Anti-Pattern 1: AI Gateway / shared key
**What people do:** Wire `generateObject` against a single Vercel-dashboard key.
**Why it's wrong:** This milestone's explicit decision is BYOK — the key is the user's own, pasted in the app, encrypted per-user. A dashboard key defeats the feature.
**Do this instead:** Direct `@ai-sdk/*` providers with a per-call `apiKey` from the user's Vault secret (Pattern 1).

### Anti-Pattern 2: Decrypting the key under the RLS cookie client
**What people do:** `select decrypted_secret from vault.decrypted_secrets` with the normal server client.
**Why it's wrong:** `vault.decrypted_secrets` is service-role-only; the authenticated role can't read it, and granting it broadly leaks every secret.
**Do this instead:** A `security definer` RPC filtered by `auth.uid()` (Pattern 4), or route via `createAdminClient()`. The function is the trust boundary.

### Anti-Pattern 3: Auto-applying the AI suggestion
**What people do:** Set `category_id` from the model and learn it.
**Why it's wrong:** Breaks the no-poisoning invariant; the whole pipeline is built so ONLY `confirmImport` writes `merchant_patterns`.
**Do this instead:** Attach `row.suggestion`; render the chip; let the human click. Learning stays in confirm.

### Anti-Pattern 4: Per-row AI calls
**What people do:** Call the model inside the row loop (the current seam shape invites this).
**Why it's wrong:** N calls per upload = N× cost/latency.
**Do this instead:** Collect unique misses, ONE batched `generateObject`, map back by `descriptor_norm` (Pattern 3).

### Anti-Pattern 5: Reading the key back into the form
**What people do:** Pre-fill the API-key input with the stored value for "edit".
**Why it's wrong:** Pulls plaintext into the client bundle/DOM — violates the never-on-client invariant.
**Do this instead:** Show "chave configurada ✓"; the input is write-only — submitting replaces, leaving blank keeps the existing secret.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google / Anthropic / DeepSeek LLM | `@ai-sdk/*` provider with per-call `apiKey`, `generateObject` + `z.enum` | BYOK; suggested defaults Gemini 2.5 Flash-Lite / Claude Haiku / DeepSeek-chat. Verify current model ids + package availability in STACK research. |
| Supabase Vault | `vault.create_secret` (write) + `security definer` RPC over `vault.decrypted_secrets` (read) | Encryption key kept out of the DB; service-role/SECURITY-DEFINER read only. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `import.ts` ↔ `classifier/suggest.ts` | direct async call (already wired, returns null today) | Signature is stable; only the body changes. Batch helper may live in `ai/classify.ts` and be called from `import.ts` or the seam. |
| `suggest.ts` ↔ `ai/provider-factory.ts` | direct import | One-directional; the seam knows nothing about provider internals. |
| `suggest.ts`/actions ↔ `ai/settings.server.ts` | direct import (`server-only`) | The ONLY module that touches decrypted keys. |
| `ai-settings-form.tsx` ↔ `ai-settings.ts` actions | Server Action call | Write-only for the key; reads provider/model + "is set" status. |
| Review grid ↔ `SuggestionSlot` | prop `row.suggestion` | Component unchanged; just non-null data now. |

---

## Dependency-Ordered Build Sequence

Strict order — each step's output is the next step's input. This is the seam-respecting "encryption/storage BEFORE AI call BEFORE UI" ordering the quality gate requires.

1. **Migration `0033_ai_settings.sql` + Vault + decrypt RPC** — table, RLS, `vault` enable, `get_ai_api_key()` security-definer. Then `npm run gen:types`. *(Storage + encryption first — nothing downstream works without it.)*
2. **`lib/ai/settings.server.ts` + `lib/schemas/ai-settings.ts`** — `getDecryptedAiSettings()` (server-only) and the Zod provider/model/key schema. Unit-test the decrypt read against a seeded secret.
3. **`lib/ai/provider-factory.ts` (+ test)** — `modelFor(provider, model, apiKey)`. Test: each provider id maps; unknown throws.
4. **Wire `suggestCategory()` in `classifier/suggest.ts` + batch helper `ai/classify.ts`** — live enum + `generateObject` + `validateSuggestion`; inner `try/catch` → null/`{}` on any failure. Extend `suggest.test.ts` (enum contract + null-on-no-key + null-on-error + injection rejected).
5. **Modify `import.ts` ingest loop** — collect unique misses, one batched call, attach `row.suggestion`; persist suggestion in `parsed_rows`. Confirm `maxDuration` on the segment.
6. **UI suggestion affordance** — feed `row.suggestion` to `<SuggestionSlot />` in `import-review-table.tsx:771`; `onApply` sets the category (origem `sugerida`).
7. **Settings surface** — `conta/configuracoes-ia/page.tsx` (RSC) + `ai-settings-form.tsx` + `actions/ai-settings.ts` (`saveAiSettings`, `testConnection`). Mirror `mei/configuracoes`. `testConnection` lives here as a Server Action.
8. **v1.3 debt cleanup** — redeploy G-07/G-08, MEI (12-06) + LGPD (12-07) walkthroughs, Nyquist VALIDATION.md (Phases 12+13). Independent of 1–7; schedule last or in parallel.

> Why this order: the seam (4) cannot be wired without the decrypt read (2) and factory (3), which cannot exist without the table/Vault (1). The grid (6) needs suggestions flowing from (5). The settings UI (7) is what *produces* a key for (1)'s storage — but its action depends on the decrypt/save plumbing, so it lands after the read path is proven. (7 can begin in parallel once 1–2 exist, since the form only needs the schema + save/test actions.)

---

## Sources

- Codebase (read directly, 2026-06-18): `src/lib/classifier/suggest.ts`, `memory.ts`, `src/actions/import.ts`, `src/components/suggestion-slot.tsx`, `import-review-table.tsx`, `src/lib/supabase/{server,admin}.ts`, `supabase/migrations/0021,0032`, `src/app/(app)/mei/configuracoes/page.tsx`, `next.config.ts`, `package.json` (HIGH — primary)
- `.planning/PROJECT.md` — v1.4 milestone goal, BYOK decision, Vault decision, debt list (HIGH)
- [Supabase Vault docs](https://supabase.com/docs/guides/database/vault) — `vault.create_secret`, `vault.decrypted_secrets`, key-out-of-DB (HIGH)
- WebSearch: Vault `decrypted_secrets` is service-role-only by default; `security definer` RPC is the per-user access pattern (MEDIUM — multiple sources agree: Supabase docs, makerkit, supabase discussions)
- [AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management) + [generateObject](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-object) — structured output with `z.enum`, direct providers vs Gateway, `createProviderRegistry` (HIGH)

---
*Architecture research for: BYOK AI classification integration (v1.4 CLS-AI)*
*Researched: 2026-06-18*
