# Stack Research

**Domain:** BYOK multi-provider AI classification (short merchant descriptors) for an existing Next.js 16 + AI SDK 6 + Supabase app
**Researched:** 2026-06-18
**Confidence:** HIGH

## Scope note

This is a **subsequent-milestone (v1.4)** stack delta. The base stack is locked and live (Next.js 16, TS strict, Supabase Auth/Postgres/Storage + RLS, Vercel gru1, `ai` 6.0.x, `@ai-sdk/google` 3.0.x, `zod` 4.4.x). The null seam `suggestCategory()` + `validateSuggestion` (Zod enum wrapper) + `SuggestionSlot` UI are **already built**. This document covers ONLY the additions needed to wire real, BYOK, multi-provider AI into that seam.

**Decisions already made (do not re-litigate):** direct `@ai-sdk` provider packages (NOT AI Gateway), because the user pastes their **own per-provider key** into a Settings UI — there is no Vercel Gateway key. Default cripto: Supabase Vault (this research validates it and pins the concrete, RLS-safe pattern).

---

## Recommended Stack

### Core Technologies (new for v1.4)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@ai-sdk/google` | **3.0.83** (already pinned `3.0.x`) | Gemini provider, runtime-instantiated per-key | Already in the stack. `createGoogleGenerativeAI({ apiKey })` accepts a user-supplied key at request time — exactly the BYOK shape. Gemini 2.5 Flash-Lite is the cheap short-text workhorse. |
| `@ai-sdk/anthropic` | **3.0.85** | Claude (Anthropic) provider, runtime-instantiated per-key | First-party AI SDK provider. `createAnthropic({ apiKey })` for BYOK. Cheapest current Claude tier = Haiku 4.5. Same `generateObject` call site as the other providers. |
| `@ai-sdk/deepseek` | **2.0.39** | DeepSeek provider, runtime-instantiated per-key | First-party AI SDK provider. `createDeepSeek({ apiKey })` for BYOK. Cheapest of the three per-token. Note major is `2.x`, not `3.x` — see Version Compatibility. |
| `ai` (Vercel AI SDK) | **6.0.208** (already pinned `6.0.x`) | `generateObject` orchestration over whichever provider the user picked | Already in the stack. One `generateObject` call site; swap only the `model` argument. Zod schema constrains output to the category enum. |
| `zod` | **4.4.x** (already pinned) | Schema for AI output (category enum) + key-format validation in Settings form | Already in the stack and shared by `validateSuggestion`. No new dependency. |
| **Supabase Vault** | built-in (Postgres extension, ships with the project) | Encrypt the user's API key at rest | `vault.create_secret()` writes Authenticated-Encryption ciphertext; `vault.decrypted_secrets` view decrypts on read. Zero new infra, no key-management ops, encrypted in backups/replication. See encryption section. |

All three provider packages declare the **same** AI-SDK-6-compatible zod peer range (`^3.25.76 || ^4.1.8`), so they coexist cleanly with the locked `zod 4.4.x` and `ai 6.0.x`.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | — | — | **No new deps for "test connection" or structured output.** Test-connection = one cheap `generateObject`/`generateText` ping against the user's key using the already-installed provider + `ai`. Structured/enum output already covered by `zod` + `ai`. Key encryption is built-in Vault, not an npm package. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `supabase` CLI (already in stack, 2.106.x) | New migration: `user_provider_keys` table + Vault helper RPCs | `supabase migration new add_byok_keys` → `supabase db push` → regenerate `database.types.ts` (existing `npm run gen:types`). |

## Installation

```bash
# Two new direct providers (Gemini + AI SDK core already present)
npm install @ai-sdk/anthropic@3.0.85 @ai-sdk/deepseek@2.0.39

# Already pinned in CLAUDE.md — confirm present, do NOT re-add at different majors:
#   ai@6.0.x  @ai-sdk/google@3.0.x  zod@4.4.x

# NO new deps for: test-connection (reuse ai + provider), structured output (zod+ai),
# key encryption (Supabase Vault is built-in).
```

---

## Runtime BYOK instantiation pattern (per provider)

The whole point of "direct provider, not Gateway": instantiate the provider **at request time** with the decrypted user key, never from an env var. All three follow the identical `create*({ apiKey })` shape and feed one `generateObject` call.

```ts
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { z } from "zod";

// categoryEnum + the suggestion schema are the SAME zod source already used by validateSuggestion
const SuggestionSchema = z.object({
  category: categoryEnum,           // constrains output to your category set
  confidence: z.number().min(0).max(1),
});

function modelFor(provider: "gemini" | "claude" | "deepseek", apiKey: string) {
  switch (provider) {
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })("gemini-2.5-flash-lite");
    case "claude":
      return createAnthropic({ apiKey })("claude-haiku-4-5");
    case "deepseek":
      return createDeepSeek({ apiKey })("deepseek-chat"); // see model-id note below
  }
}

// In a Node.js-runtime Route Handler / Server Action (key never touches the client):
const { object } = await generateObject({
  model: modelFor(provider, decryptedApiKey),
  schema: SuggestionSchema,
  prompt: `Classify this merchant descriptor into one category: "${descriptor}"`,
});
```

- **Run in a Node.js runtime** (not Edge) Route Handler / Server Action — same place PDF parsing already runs. The decrypted key stays server-side, consistent with the existing "API keys off the client" rule.
- **Memory-first is unchanged:** only call this on a cache miss (unseen merchant). Batch all unseen descriptors from one upload into a single call.
- **`test connection`** = call the same `modelFor(...)` with a 1-token prompt (or `generateText` with `maxTokens: 1`) and surface success/`AI_APICallError` to the Settings UI. No extra library.

## Verified model IDs + pricing (as of 2026-06-18)

| Provider | Model id string | Input $/1M | Output $/1M | Notes |
|----------|-----------------|-----------|------------|-------|
| Gemini | `gemini-2.5-flash-lite` | **$0.10** | **$0.40** | Cheapest current Gemini; 1M context; has a free tier. Verified on Google AI pricing. |
| Claude | `claude-haiku-4-5` | **$1.00** | **$5.00** | Cheapest current Claude tier (Haiku 4.5). 200K context. Use the bare id — **no date suffix**. Verified against the Anthropic model catalog. |
| DeepSeek | `deepseek-chat` (alias) → `deepseek-v4-flash` | **$0.14** (cache-miss) | **$0.28** | `deepseek-chat` still works as a non-thinking alias for V4-Flash, but is **scheduled for deprecation 2026/07/24 15:59 UTC**. Cache-hit input is $0.0028/1M. |

**Pricing ordering for the user:** DeepSeek ≈ Gemini (both ~$0.1–0.28/1M) ≪ Claude Haiku ($1/$5). For pure short-text merchant classification, all three are effectively free at personal volume (memory-first means the LLM is hit only on genuinely new merchants).

**DeepSeek model-id action item for the roadmap:** ship with `deepseek-chat` for compatibility, but treat `deepseek-v4-flash` as the forward-stable id. Best handled as a small per-provider config map (display name → model id) so the v4-flash switch on 2026/07/24 is a one-line config change, not a code change. Re-verify the exact id at build time.

## Key encryption at rest — recommended: Supabase Vault (RLS-safe pattern)

**Comparison (single-user personal app, low-ops, RLS-compatible):**

| Option | Verdict | Why |
|--------|---------|-----|
| **Supabase Vault** (`vault.create_secret` / `vault.decrypted_secrets`) | ✅ **RECOMMENDED** | Built into the project (zero new infra). Authenticated Encryption at rest; ciphertext stays encrypted in backups + replication. Decrypt happens on-the-fly via a view, never stored. The key-management is Supabase's, not yours — exactly the "simple, low-ops" target. Internal impl is migrating **off** pgsodium but the `vault.*` interface/API is explicitly staying stable. |
| **pgcrypto** (`pgp_sym_encrypt`) | ⚠️ Avoid | Makes **you** own the symmetric key (where to store it? Vercel env → same problem as app-layer) and the crypto choices. More moving parts than Vault for no benefit here. |
| **App-layer (Node `crypto` + key in Vercel env)** | ⚠️ Avoid | Workable but you hand-roll AES-GCM, IV handling, and key rotation, and the master key lives in a Vercel env var (single point of compromise, manual rotation). Vault does all of this for you. |
| Supabase **Server Key Management / Transparent Column Encryption (TCE)** | ❌ Do NOT use | Supabase explicitly does **not** recommend these on its platform — high operational complexity + misconfiguration risk. (TCE = old pgsodium path, deprecated.) |

**pgsodium status (verified):** pgsodium is **pending deprecation**; Supabase recommends **no new pgsodium/TCE usage**. **Vault is unaffected** — it is the recommended secret store going forward; only its internals move off pgsodium, the `vault.create_secret` / `vault.decrypted_secrets` surface is unchanged. So building on Vault is the future-proof choice.

**Critical RLS detail — how to make Vault per-user + RLS-safe.** Vault secrets live in `vault.secrets` and are **not** themselves `user_id`-scoped or RLS-protected per row; access is gated by SQL privileges on the `vault` schema/view. So **do not** try to put RLS on `vault.decrypted_secrets` directly. Instead use the indirection pattern that fits this app's "every table has `user_id` + RLS" rule:

1. App-owned table `user_provider_keys ( user_id uuid references auth.users, provider text, secret_id uuid /* the Vault UUID */, created_at, ... )` — **RLS `auth.uid() = user_id`** on select/insert/update/delete, like every other domain table. It stores **only the Vault secret UUID**, never the plaintext key.
2. Write path: a `SECURITY DEFINER` RPC that (a) checks `auth.uid()`, (b) calls `vault.create_secret(plaintext)`, (c) inserts the returned UUID into `user_provider_keys` for that user. The plaintext key arrives over the Server Action / Route Handler, is handed straight to Vault, and is never persisted in app tables.
3. Read path (server-only, on cache-miss classification): a `SECURITY DEFINER` RPC that verifies the row belongs to `auth.uid()`, then joins to `vault.decrypted_secrets` to return the plaintext **only inside the trusted server function**. Never expose `vault.decrypted_secrets` to the `anon`/`authenticated` roles directly, and never return the plaintext to the client — only the classification result goes back.

This keeps the user-facing isolation in RLS (where the rest of the app already proves it) while delegating the actual encryption to Vault. Net new schema = one table + two `SECURITY DEFINER` RPCs in one migration.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Direct `@ai-sdk/*` providers (BYOK per-key) | Vercel AI Gateway | **Not applicable here** — Gateway uses one Vercel-issued key, which defeats "user pastes their own per-provider key." Explicitly excluded by the milestone decision. |
| Supabase Vault | pgcrypto / app-layer Node crypto | Only if you ever leave Supabase, or need a customer-managed master key for a compliance mandate. Not the case for a single-user personal app. |
| `deepseek-chat` (alias) now | `deepseek-v4-flash` (stable id) | Switch the config map to `deepseek-v4-flash` before/at the 2026/07/24 deprecation; alias keeps working until then. |
| Claude Haiku 4.5 | Gemini Flash-Lite / DeepSeek | If the user wants the cheapest run, steer to Gemini/DeepSeek (10–50× cheaper than Haiku for this task). Haiku is the "I already have an Anthropic key" path. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Vercel **AI Gateway** for this feature | One shared Vercel key; cannot hold the user's own per-provider key | Direct `@ai-sdk/*` providers, instantiated at request time with `createX({ apiKey })` |
| `@ai-sdk/deepseek@3.x` | Does not exist at AI-SDK-6 time; deepseek provider's current major is **2.x** | `@ai-sdk/deepseek@2.0.39` (peer `ai`/`zod` ranges match SDK 6) |
| Date-suffixed Claude model id (e.g. `claude-haiku-4-5-20251001` in app code) | Brittle; the bare alias is the supported call string | `claude-haiku-4-5` (bare alias) |
| Storing the API key in an app table (even "encrypted" by hand) | Reinvents key management; master key ends up in an env var | Vault secret UUID in `user_provider_keys` + plaintext only inside a `SECURITY DEFINER` RPC |
| RLS policy directly on `vault.decrypted_secrets` | Vault secrets aren't per-row RLS-scoped; you'd fight the schema | App-owned `user_provider_keys` table carries the `user_id` + RLS; it references the Vault UUID |
| pgsodium / Transparent Column Encryption | Pending deprecation; Supabase recommends against new usage | Supabase Vault (`vault.*` API is staying) |
| Reading the user key in an **Edge** runtime handler | Decrypted secret + provider SDK want Node; Edge complicates it | Node.js-runtime Route Handler / Server Action (same place PDF parsing runs) |

## Stack Patterns by Variant

**If the user has not configured any key (or the key errors):**
- `suggestCategory()` returns null → UI falls back to the existing manual pick (memory still learns from it).
- Because the seam is already null-tolerant and additive, "no key / provider error" is a graceful no-op, not a failure. No new dependency required for this path.

**If the user picks DeepSeek after 2026/07/24:**
- The config map must resolve `deepseek` → `deepseek-v4-flash` (the `deepseek-chat` alias retires). One-line config change; no code/dep change.

**If classifying a whole uploaded invoice:**
- Collect all unseen merchant descriptors, send them in **one** `generateObject` call (array schema) to minimize latency/cost — not one call per row.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `ai@6.0.208` | `@ai-sdk/google@3.0.83`, `@ai-sdk/anthropic@3.0.85`, `@ai-sdk/deepseek@2.0.39` | All three providers declare `ai` SDK 6-era peers; coexist in one app. |
| `@ai-sdk/anthropic@3.0.85` | `zod ^3.25.76 \|\| ^4.1.8` | Satisfied by locked `zod 4.4.x`. |
| `@ai-sdk/deepseek@2.0.39` | `zod ^3.25.76 \|\| ^4.1.8` | Provider major is **2.x** (not 3.x) — pin explicitly. |
| `@ai-sdk/google@3.0.83` | `zod ^3.25.76 \|\| ^4.1.8` | Already present; same enum/`generateObject` path. |
| Supabase Vault | Supabase project (Postgres) | `vault.create_secret` / `vault.decrypted_secrets` stable; internals migrating off pgsodium but API unchanged. |
| `gemini-2.5-flash-lite` / `claude-haiku-4-5` / `deepseek-chat` | `generateObject` enum output | Each supports structured/JSON output; Zod enum constrains the category. |

## Sources

- `npm view @ai-sdk/anthropic@3.0.85`, `@ai-sdk/deepseek@2.0.39`, `@ai-sdk/google@3.0.83`, `ai@6.0.208`, `zod@4.4.3` — exact versions + zod peer ranges, 2026-06-18 (HIGH)
- Anthropic `claude-api` skill model catalog — `claude-haiku-4-5` bare id, $1/$5 per 1M, 200K context, no date suffix (HIGH)
- https://ai.google.dev/gemini-api/docs/pricing + pricepertoken/devtk — `gemini-2.5-flash-lite` $0.10/$0.40 per 1M, free tier, 1M context (HIGH)
- https://api-docs.deepseek.com/quick_start/pricing — `deepseek-chat`→V4-Flash alias, $0.14/$0.28 cache-miss, **alias deprecates 2026/07/24 15:59 UTC**, base_url `https://api.deepseek.com` (HIGH)
- https://supabase.com/docs/guides/database/vault — `vault.create_secret`, `vault.decrypted_secrets`, Authenticated Encryption at rest, protect the view via SQL privileges (HIGH)
- https://supabase.com/docs/guides/database/extensions/pgsodium + supabase discussion #27109 — pgsodium pending deprecation; **Vault unaffected, recommended going forward**; TCE/Server Key Management not recommended on platform (HIGH)

---
*Stack research for: BYOK multi-provider AI classification (v1.4 milestone delta)*
*Researched: 2026-06-18*
