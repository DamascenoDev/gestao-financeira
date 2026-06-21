# Phase 14: Key Storage + BYOK Settings - Research

**Researched:** 2026-06-18
**Domain:** BYOK API-key storage (Supabase Vault + RLS) + Settings UI + provider test-connection on Next.js 16 App Router / TS strict / Supabase
**Confidence:** HIGH (codebase conventions read directly; Vault/AI-SDK patterns cross-checked against v1.4 research + npm registry + Supabase docs)

## Summary

Phase 14 delivers the **root of the v1.4 dependency chain**: a Settings surface where the user picks an AI provider (Gemini or Claude), pastes their own API key, the key is encrypted at-rest in **Supabase Vault** (only a `key_secret_id` UUID lives in an app table), scoped by `user_id` + RLS, **never returned to the client**, testable via a cheap ping, and removable/rotatable. It does NOT wire real classification (`suggestCategory()` stays `return null` — that's Phase 15). It only stands up the secure key substrate + the Settings UI + `testConnection` + a minimal `lib/ai/provider-factory.ts` that Phase 15 reuses.

The work is **almost entirely a mirror of existing patterns** already proven in this codebase: the `mei/configuracoes` page + `MeiSettingsForm` + `actions/mei.ts` grammar (`'use server'` + Zod `safeParse` boundary → `{ error } | { ok: true }` + `getClaims()` owner + `revalidatePath`), the `0025_mei.sql` migration template (4 RLS policies + `with check`, idempotent, heavily commented), the `admin.ts` `import 'server-only'` discipline (for the decrypt DAL), and the `delete-account-form.tsx` AlertDialog danger-zone (for "Remover chave"). The genuinely new mechanics are three: (1) the **Vault migration SQL** (enable `supabase_vault`, `vault.create_secret`, a `SECURITY DEFINER` `get_ai_api_key()` RPC filtered by `auth.uid()`), (2) **runtime BYOK provider instantiation** (`createGoogleGenerativeAI({apiKey})` / `createAnthropic({apiKey})` + a 1-token `generateText` ping with friendly pt-BR error mapping), and (3) the **write-only-key invariant** verification (no `sk-…`/`AIza…` in any client-reachable payload).

**Primary recommendation:** Clone the `mei/configuracoes` triad verbatim for the UI/action shape; use the migration-0033 SQL given below (Vault + `SECURITY DEFINER` RPC filtered by `auth.uid()`); decrypt only inside a `import 'server-only'` module via the RPC; install `@ai-sdk/google@3.0.83` + `@ai-sdk/anthropic@3.0.85` (both first-party Vercel, already locked in CLAUDE.md) — NOT `@ai-sdk/deepseek` (deferred). Gate the install behind a one-time human-verify checkpoint per the legitimacy seam's `too-new` flag (false positive — these republish daily).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rota, Navegação & UX da página**
- Rota: novo subroute `/conta/configuracoes-ia` (o segmento `conta` já existe; espelha o padrão `mei/configuracoes`).
- Navegação: link/card "Configurações de IA" dentro de `/conta` — **sem** novo item de sidebar.
- Layout: RSC lê a linha `ai_settings` (RLS-scoped, pode ser null no first-run) → seed de um client `AiSettingsForm` (provider Select + input de chave + botão "testar conexão" + status), **1 card**, espelhando `MeiSettingsForm` + `mei/configuracoes/page.tsx`.
- First-run (sem chave): Gemini pré-selecionado, input de chave vazio com placeholder, badge "Nenhuma chave configurada" → após salvar vira "Chave configurada ✓" (a chave NUNCA é ecoada de volta — form write-only).

**Modelo de dados & ciclo de vida da chave**
- Tabela `ai_settings`: `user_id` PK/FK → `auth.users`, `provider` text CHECK in ('gemini','claude'), `model` text, `key_secret_id` uuid (referência ao secret do Vault), `created_at`/`updated_at`. RLS + **4 políticas** `using (auth.uid() = user_id)` + `with check`.
- Cardinalidade: **1 linha por usuário = 1 provedor ativo**. Trocar de provedor = UPDATE na mesma linha; a chave do provedor anterior é rotacionada (secret antigo do Vault apagado) ao gravar a nova.
- Cripto: chave no **Supabase Vault** (`vault.create_secret`); a tabela guarda só o `key_secret_id`. Decrypt server-only via RPC `SECURITY DEFINER` `get_ai_api_key()` filtrado por `auth.uid()`. O client recebe SÓ `has_key` (boolean derivado) + `provider` — nunca o `key_secret_id` nem a chave.
- Model: default barato hard-coded por provedor (`gemini-2.5-flash-lite` / `claude-haiku-4-5`) gravado na coluna `model`; **sem picker de model na UI** (CLSAI-F2 deferida).

**Testar conexão & wiring de provedor**
- O "testar conexão" faz um `generateText` mínimo (~1 token, prompt "ping"); sucesso → ok; erro → mensagem amigável mapeada (chave inválida / sem créditos / rede). Catch total → nunca vaza stack/segredo.
- Salvar **não** exige teste verde: salvar persiste a chave; testar é afordância separada/opcional.
- Pacotes/factory NESTA fase: instalar `@ai-sdk/google` + `@ai-sdk/anthropic` + criar `lib/ai/provider-factory.ts` MÍNIMO (`modelFor(provider, model, apiKey)`) reusado na Phase 15. `@ai-sdk/deepseek` NÃO entra.
- Onde roda o teste: Server Action `testConnection` (Node runtime), lê a chave decifrada server-only via o RPC, nunca a expõe ao client; retorna `{ ok: true } | { error }`. `saveAiSettings` segue o mesmo grammar.

### Claude's Discretion
- Nomes exatos de colunas/constraints, estrutura interna do `AiSettingsForm`, textos de erro/UI, e a forma exata do RPC de rotação do secret — seguindo as convenções existentes (actions `{ok}|{error}`, schemas em `lib/schemas/`, migration comentada + idempotente).
- `react-hook-form` + Zod resolver vs form simples com manual-state + `useTransition` — fica a critério, espelhando `MeiSettingsForm` (que usa manual-state + `useTransition`, NÃO react-hook-form).

### Deferred Ideas (OUT OF SCOPE)
- DeepSeek como 3º provedor (CLSAI-F1 — Future): gap `json_object` + churn `deepseek-chat`→`deepseek-v4-flash`.
- Picker de model por provedor na UI (CLSAI-F2 — Future).
- A chamada de IA real de classificação (Phase 15) e as afordâncias da review grid (Phase 16).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BYOK-01 | Escolher provedor (Gemini ou Claude) numa tela de Settings de IA | `provider` enum coluna + Select na UI; route `/conta/configuracoes-ia` (Standard Stack, UI mirror) |
| BYOK-02 | Colar/atualizar a própria chave; gravada **criptografada at-rest** (Vault) e nunca exibida de volta (write-only) | Migration 0033 SQL (`vault.create_secret`); write-only form invariant (Pitfall 1/5, Code Examples §Save path) |
| BYOK-03 | **Testar a conexão** (ping barato valida chave + provedor) | `testConnection` Server Action + 1-token `generateText` + error mapping (Code Examples §Test connection) |
| BYOK-04 | Chave escopada por `user_id` + RLS, **nunca alcança o client** — só `has_key` + `provider`; decrypt server-only | RLS 4 policies + `SECURITY DEFINER` RPC + `import 'server-only'` decrypt DAL (Pattern 1/2, Pitfalls 1–3) |
| BYOK-05 | Remover/trocar a chave; sem chave o app volta ao estado pré-IA sem quebrar | `removeAiKey` action (delete Vault secret + row) + AlertDialog danger-zone; `suggestCategory()` already null-tolerant (Code Examples §Remove path) |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Provider/model/key-ref persistence | Database (Postgres `ai_settings` + RLS) | — | Per-user config row; isolation is structural via RLS, not app-layer |
| Key encryption at rest | Database (Supabase Vault) | — | Vault holds ciphertext + the encryption key out of the DB; app stores only the UUID |
| Key decryption | API/Backend (Server Action via `SECURITY DEFINER` RPC) | Database (the RPC is the trust boundary) | Plaintext must exist ONLY inside a `server-only` module; the RPC filters by `auth.uid()` |
| Provider instantiation + test ping | API/Backend (Server Action, Node runtime) | — | Key + provider SDK are server-only; Node (not Edge) — consistent with the existing pdf-parse action |
| Settings form + status badge + test result | Frontend Server (RSC seed) + Client (`'use client'` form) | — | RSC reads `provider` + derived `has_key`; client form is write-only for the key |
| Provider/model registry (display names, default ids) | Browser/Client-safe module | — | The form needs display labels; this must NOT be the same module that decrypts |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/google` | 3.0.83 | Gemini provider, runtime-instantiated per-key | `createGoogleGenerativeAI({ apiKey })` is the BYOK shape; already locked in CLAUDE.md. `[VERIFIED: npm registry]` (latest = 3.0.83, published 2026-06-16) |
| `@ai-sdk/anthropic` | 3.0.85 | Claude provider, runtime-instantiated per-key | `createAnthropic({ apiKey })` for BYOK; first-party Vercel. `[VERIFIED: npm registry]` (latest = 3.0.85, peer `zod ^3.25.76 || ^4.1.8`) |
| `ai` (Vercel AI SDK) | 6.0.208 | `generateText` for the test-ping | Already present (locked `6.0.x`). `[VERIFIED: npm registry]` |
| `zod` | 4.4.3 | Form/key-shape + provider/model enum validation | Already present; shared by `validateSuggestion`. No new dep. `[VERIFIED: package.json]` |
| **Supabase Vault** | built-in extension | Encrypt the API key at rest | `vault.create_secret` / `vault.decrypted_secrets`; zero new infra, key kept out of the DB. `[CITED: supabase.com/docs/guides/database/vault]` |
| `@supabase/ssr` | 0.12.x | RLS cookie client (RSC + action) | Already present; the RLS client calls `get_ai_api_key()` RPC. `[VERIFIED: package.json]` |
| `@supabase/supabase-js` | 2.108.x | Typed client + `admin.ts` service-role client | Already present. `[VERIFIED: package.json]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | Test-connection reuses `ai` + provider package. Encryption is built-in Vault. Forms reuse existing shadcn primitives (all vendored). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Vault | pgcrypto / app-layer Node crypto | You own the master key (ends up in a Vercel env var = single point of compromise + manual rotation). Vault does key-management for you. `[ASSUMED]` from v1.4 STACK.md — **avoid** per CLAUDE.md "What NOT to Use" |
| `SECURITY DEFINER` RPC under RLS cookie client | Route decrypt via `createAdminClient()` (service-role) | Both valid. RPC filtered by `auth.uid()` lets the plain RLS client decrypt safely without service-role; admin-client variant passes uid explicitly. **Recommend the RPC** — it keeps the trust boundary in SQL and avoids exposing `vault.decrypted_secrets` to the authenticated role. (See Pattern 2.) |
| manual-state + `useTransition` form | react-hook-form + Zod resolver | `MeiSettingsForm` (the mirror target) uses **manual-state + useTransition** — match it for consistency. RHF is overkill for 2 fields. |

**Installation:**
```bash
# Two first-party AI SDK providers (Gemini already in CLAUDE.md stack; install both here
# because test-connection must validate both providers). DeepSeek is DEFERRED — do NOT install.
npm install @ai-sdk/google@3.0.83 @ai-sdk/anthropic@3.0.85
# `ai` 6.0.x and `zod` 4.4.x already present — confirm, do NOT re-add at different majors.
```

**Version verification (run at install time):**
```bash
npm view @ai-sdk/google version       # expect 3.0.x (3.0.83 as of 2026-06-18)
npm view @ai-sdk/anthropic version    # expect 3.0.x (3.0.85 as of 2026-06-18)
npm view ai version                   # expect 6.0.x (6.0.208 present)
# After running `npm run build`, confirm the bundle has no key material (see Pitfall 1 verify).
```

## Package Legitimacy Audit

> Run before installing. Verdicts below from `gsd-tools query package-legitimacy check --ecosystem npm` (2026-06-18).

| Package | Registry | Age (published) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----------------|-----------|-------------|---------|-------------|
| `@ai-sdk/google` | npm | 2026-06-16 (latest republish) | 5.38M/wk | github.com/vercel/ai | SUS (`too-new`) | Approved — **false positive** (see note) |
| `@ai-sdk/anthropic` | npm | 2026-06-16 (latest republish) | 7.22M/wk | github.com/vercel/ai | SUS (`too-new`) | Approved — **false positive** (see note) |

**Note on the `too-new` flag (false positive):** The `vercel/ai` monorepo publishes new patch versions of every `@ai-sdk/*` package nearly daily, so the *latest version's publish date* is always 1–2 days old even though the packages are years-old, first-party Vercel libraries with 5M+/7M+ weekly downloads, a verified `github.com/vercel/ai` repo, no `postinstall` scripts, and an explicit lock in this project's CLAUDE.md stack table. The `too-new` signal keys off the latest patch's age, not the package's age. **Neither is hallucinated or slopsquatted.**

**Planner action:** Because the legitimacy seam returned `SUS`, insert ONE `checkpoint:human-verify` task before the `npm install` (per protocol) — the user confirms the two package names + versions, then proceeds. After install, run `npm run build` + `npx tsc --noEmit` clean as the gate.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `@ai-sdk/google`, `@ai-sdk/anthropic` — planner adds a single pre-install `checkpoint:human-verify`.

## Architecture Patterns

### System Architecture Diagram

```
CLIENT ('use client')                         SERVER ('use server', Node runtime)
┌─────────────────────────┐
│ AiSettingsForm          │  provider+model+
│  - Select provider      │  PASTED key (write-only, one-way up)
│  - Input key (password) │ ───────────────────────►  ┌──────────────────────────────┐
│  - Salvar / Testar      │                           │ actions/ai-settings.ts        │
│  - Remover (AlertDialog)│ ◄─────────────────────── │  saveAiSettings(fd)           │
└─────────────────────────┘  { ok } | { error }       │  testConnection()             │
        ▲                     (NEVER the key)          │  removeAiKey()                │
        │ has_key + provider                           └───────┬──────────────────────┘
┌───────┴─────────────────┐                                    │
│ configuracoes-ia/page   │  RSC reads ai_settings             │ (write: create/rotate secret)
│  (RSC, RLS client)      │  → provider + (key_secret_id!=null)│ (read:  decrypt via RPC)
│  projects has_key ONLY  │                                    ▼
└─────────────────────────┘                  ┌─────────────────────────────────────────┐
                                             │ lib/ai/settings.server.ts  ('server-only')│
                                             │  getDecryptedAiSettings() → {provider,    │
                                             │    model, apiKey}  via get_ai_api_key() RPC│
                                             └───────┬─────────────────────┬─────────────┘
                                                     │ apiKey              │ RPC call
                                                     ▼                     ▼
                                  ┌────────────────────────────┐  POSTGRES (Supabase, RLS)
                                  │ lib/ai/provider-factory.ts │  ┌──────────────────────────┐
                                  │  modelFor(provider,model,  │  │ ai_settings (NEW 0033)    │
                                  │    apiKey) → LanguageModel │  │  user_id PK, provider,    │
                                  └───────────┬────────────────┘  │  model, key_secret_id     │
                                              │                    │  + RLS (4 policies)       │
                                              ▼                    └──────────┬───────────────┘
                                  ┌────────────────────────────┐              │ key_secret_id
                                  │ generateText (1-token ping) │             ▼
                                  └───────────┬────────────────┘  ┌──────────────────────────┐
                                              │                   │ vault.secrets (encrypted) │
                                              ▼                   │ + get_ai_api_key() RPC    │
                                            LLM (Gemini/Claude)   │   SECURITY DEFINER,        │
                                                                  │   filter auth.uid()       │
                                                                  └──────────────────────────┘
```

Trace BYOK-02/03/04: user pastes key → `saveAiSettings` → `vault.create_secret` → row stores `key_secret_id` only → `testConnection` → `getDecryptedAiSettings` (RPC, server-only) → `modelFor` → 1-token ping → `{ ok } | { error }` back to client (key never returns).

### Recommended Project Structure
```
src/
├── app/(app)/conta/
│   ├── page.tsx                       # MODIFY: add a Card linking to configuracoes-ia
│   └── configuracoes-ia/
│       └── page.tsx                   # NEW (RSC) — mirrors mei/configuracoes/page.tsx
├── components/
│   └── ai-settings-form.tsx           # NEW ('use client') — mirrors mei-settings-form.tsx
├── actions/
│   └── ai-settings.ts                 # NEW — saveAiSettings, testConnection, removeAiKey
├── lib/
│   ├── ai/
│   │   ├── settings.ts                # NEW (client-safe) — provider/model registry + types
│   │   ├── settings.server.ts         # NEW ('server-only') — getDecryptedAiSettings via RPC
│   │   ├── provider-factory.ts        # NEW — modelFor(provider, model, apiKey)
│   │   └── provider-factory.test.ts   # NEW — each provider maps; unknown throws
│   └── schemas/
│       └── ai-settings.ts             # NEW — Zod: provider enum, model, apiKey shape
supabase/migrations/
└── 0033_ai_settings.sql               # NEW — table + RLS(4) + Vault enable + get_ai_api_key RPC
src/types/database.types.ts            # REGENERATE after 0033 (npm run gen:types)
```

### Pattern 1: Encrypt-at-rest via Vault + write-only app table
**What:** On save, the pasted key goes into `vault.create_secret`; `ai_settings` stores only the returned `key_secret_id` UUID + `provider` + `model`. The client-facing read projects ONLY `provider` + derived `has_key`.
**When to use:** `saveAiSettings` (write) and the RSC read.
**Why:** Vault keeps the encryption key out of the DB (safe in backups) — strictly better than pgcrypto-with-a-DB-key. `[CITED: supabase.com/docs/guides/database/vault]`

### Pattern 2: Server-only decrypt via `SECURITY DEFINER` RPC filtered by `auth.uid()`
**What:** `vault.decrypted_secrets` is service-role-only by default. A `SECURITY DEFINER` function `get_ai_api_key()` reads it, but filters by `auth.uid()` via the app-owned `ai_settings` row — so the plain RLS cookie client can call it and can ONLY ever get its own key.
**When to use:** `getDecryptedAiSettings()` inside `lib/ai/settings.server.ts` (`import 'server-only'`).
**Why:** Never grant the `authenticated` role direct access to `vault.decrypted_secrets` (that leaks every secret). The function is the trust boundary. `[CITED: supabase.com/docs/guides/database/vault]` + `[ASSUMED]` (v1.4 ARCHITECTURE/STACK research — the per-user RLS-safe Vault pattern).

### Pattern 3: Runtime BYOK provider instantiation (per-call apiKey, NOT AI Gateway)
**What:** `createGoogleGenerativeAI({ apiKey })(model)` / `createAnthropic({ apiKey })(model)` instantiate the provider at request time with the decrypted user key — never from an env var.
**When to use:** `provider-factory.ts` `modelFor(...)`, called by `testConnection` (this phase) and `suggestCategory` (Phase 15).
**Why:** BYOK means the key is the user's own, pasted into the app — a per-call `apiKey`, not a Vercel-dashboard env. `[CITED: ai-sdk.dev/docs/ai-sdk-core/provider-management]`

### Anti-Patterns to Avoid
- **Reading the key back into the form** (pre-filling the input or rendering masked dots of the *stored* key): pulls plaintext into the client bundle/DOM. Show "Chave configurada ✓"; input is write-only — submitting replaces, leaving blank keeps the existing secret.
- **`select('*')` on `ai_settings` from a client-reachable query**: returns `key_secret_id` (and risks leaking the decrypt path). Project only `provider` + a computed `has_key`.
- **Decrypting under the plain RLS client by selecting `vault.decrypted_secrets` directly**: that view is service-role-only — go through the `SECURITY DEFINER` RPC.
- **AI Gateway / a single shared Vercel key**: defeats BYOK. Direct `@ai-sdk/*` with a per-call `apiKey`.
- **Edge runtime for the test-connection action**: decrypt + provider SDK want Node. Use Node runtime (the existing pdf-parse action already does).
- **Picker de model na UI** or installing `@ai-sdk/deepseek**: out of scope (deferred).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key encryption at rest | AES-GCM + IV handling + a master key in a Vercel env var | Supabase Vault (`vault.create_secret`) | Vault owns key-management + rotation; your env-var master key is a single point of compromise |
| Per-user secret isolation | App-layer "where user_id =" filtering on a plaintext key column | RLS on `ai_settings` + a `SECURITY DEFINER` RPC filtered by `auth.uid()` | Isolation must be structural (RLS), not assumed — every other table in this app proves it this way |
| Provider HTTP calls / auth headers | `fetch` to Gemini/Anthropic REST endpoints | `@ai-sdk/google` / `@ai-sdk/anthropic` + `generateText` | The SDK handles auth, retries, error typing; the test-ping is one call |
| Settings form scaffolding | A bespoke form/validation/toast stack | Clone `mei-settings-form.tsx` (manual-state + `useTransition` + sonner + Field/FieldGroup) | The exact pattern already exists and is consistent with the rest of the app |
| Migration RLS boilerplate | Ad-hoc policies | Clone the `0025_mei.sql` 4-policy + `with check` + grants + index template | Forgetting `enable row level security` or a `with check` is a silent leak (Pitfall 3) |
| Destructive "Remover chave" confirm | A bare confirm() | Clone `delete-account-form.tsx` AlertDialog (initial focus Cancelar) | The danger-zone grammar is established |

**Key insight:** Every hard part of this phase already has a proven in-repo analog. The ONLY net-new code is the Vault SQL (Pattern 1/2) and the runtime provider instantiation + error mapping (Pattern 3). Everything else is a faithful clone.

## Runtime State Inventory

> This is a **greenfield, additive** phase — it creates new tables/files, renames nothing, migrates no existing data. Inventory included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `ai_settings` + the Vault secret are NEW; first-run row is null. No existing key to migrate. | None |
| Live service config | Supabase local CLI: `supabase_vault` extension. `supabase/config.toml` has `[db.vault]` **commented out** (`# [db.vault]`). The `vault` schema may still exist by default in the Supabase stack, but **verify `vault.create_secret` exists in the LOCAL stack before depending on it** (see Open Question 1). | Verify locally; uncomment/enable `[db.vault]` in config.toml + `supabase db reset` if absent |
| OS-registered state | None. | None |
| Secrets/env vars | Existing `SUPABASE_SECRET_KEY` (service-role) — needed ONLY if the decrypt routes via `createAdminClient()` instead of the RPC. No new env var introduced (the BYOK key lives in Vault, not env). | None (unless admin-client decrypt variant chosen) |
| Build artifacts | `src/types/database.types.ts` — stale after 0033 until `npm run gen:types` runs (pre-commit hook regenerates; user runs `supabase db push` manually — dev server points at PROD, per MEMORY). | Run `gen:types` after the migration |

## Common Pitfalls

### Pitfall 1: The user's API key leaks to the client
**What goes wrong:** A `select('*')` on `ai_settings` returns key material to a Client Component; or a Server Component passes the decrypted key as a prop (App Router serializes every prop into the RSC payload); or the decrypt module gets imported (transitively) into a `'use client'` file.
**Why it happens:** The natural typed query "just works" and the key in the network response is invisible. RSC prop serialization looks like normal server code.
**How to avoid:** Project ONLY `provider` + `has_key` in any client-reachable query. Put decrypt in `import 'server-only'` (`settings.server.ts`) so a client import fails the build. Never pass anything key-related as a prop. The form is write-only.
**Warning signs:** `sk-`/`AIza` visible in the Network tab, `__NEXT_DATA__`/RSC payload, or `.next/static` chunks. A `select('*')` near `ai_settings`.

### Pitfall 2: Plaintext-at-rest or a pgsodium/pgcrypto footgun
**What goes wrong:** Key written to a `text` column (readable in DB/backups), or built on pgsodium/TCE (deprecated, Supabase recommends against new use).
**How to avoid:** Vault only; `ai_settings` holds the secret UUID + provider + model. No pgsodium/TCE/pgcrypto. `vault.decrypted_secrets` reachable only via the `SECURITY DEFINER` RPC (or service-role).
**Warning signs:** A column literally holding `sk-...`. A migration that enables `pgsodium`. The decrypt view granted to `authenticated`.

### Pitfall 3: RLS gap on the new `ai_settings` table
**What goes wrong:** RLS not enabled, or only a SELECT policy written, or wrong filter column — on the one table holding the most sensitive reference.
**How to avoid:** `enable row level security` + all 4 command policies (use `for all` like `0025_mei.sql`) with `using` AND `with check` on `(select auth.uid()) = user_id`. Test cross-user locally (deliberately — MEMORY notes Supabase tests are env-flaky). Remember Vault's own view is NOT per-user RLS-scoped — the RPC must filter by `auth.uid()`.
**Warning signs:** Missing `enable row level security`; 1–2 policies where 4 (or one `for all`) are needed.

### Pitfall 4: Stale secret on provider switch (rotation leak)
**What goes wrong:** User switches Gemini→Claude (or rotates the key); the OLD Vault secret is left behind, orphaned but still decryptable, multiplying the at-rest attack surface.
**How to avoid:** On rotate/switch, after `vault.create_secret` for the new key + updating `key_secret_id`, **delete the old secret** (`vault` has a delete path / `update_secret`). Do it in the same `SECURITY DEFINER` write RPC (or action) so it's atomic. The CONTEXT decision says "o secret antigo do Vault apagado ao gravar a nova."
**Warning signs:** `vault.secrets` row count grows with every key change for a single user.

### Pitfall 5: `testConnection` / save error leaks a stack or the key
**What goes wrong:** A provider 401/429/network error bubbles its raw message (which can echo the key or internal detail) to the UI.
**How to avoid:** Total `try/catch` in `testConnection`; map `AI_APICallError`/status to the three friendly pt-BR messages (invalid / no-credits / network); never `console.log` the decrypted key or raw headers; default branch → generic "Não foi possível testar agora."
**Warning signs:** A raw provider error string or `sk-`/`AIza` in a toast or server log.

## Code Examples

Verified patterns grounded in this codebase + v1.4 research.

### Migration 0033 — table + RLS(4) + Vault + decrypt RPC
```sql
-- 0033_ai_settings.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY (BYOK-01..05): the root of the v1.4 AI chain. One row per user holding the
-- chosen provider + cheap model + a REFERENCE (key_secret_id) to a Supabase Vault
-- secret — NEVER the plaintext key. RLS (4 policies, 0025_mei shape) isolates the
-- row per user; the key itself is encrypted at rest by Vault. Decrypt happens ONLY
-- via the SECURITY DEFINER get_ai_api_key() RPC, filtered by auth.uid(), so the plain
-- RLS client can read its OWN key and never another user's. (Pitfalls 1–3.)
--
-- ACTION REQUIRED AFTER MERGE: run `supabase db push` (LOCAL + PROD) then
-- `npm run gen:types`. Verify `supabase_vault` is enabled in the LOCAL stack first
-- (config.toml [db.vault]) — vault.create_secret must exist before depending on it.
-- ─────────────────────────────────────────────────────────────────────────────

-- Vault ships as the `supabase_vault` extension; idempotent enable.
create extension if not exists supabase_vault with schema vault;

-- ai_settings: one provider config per user. key_secret_id → vault.secrets.id (UUID),
-- never the key. provider constrained to the two launch providers (deepseek deferred).
create table if not exists public.ai_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  provider       text not null check (provider in ('gemini','claude')),
  model          text not null,
  key_secret_id  uuid not null,          -- → vault.secrets.id (NOT the key)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS (non-negotiable, uniform 0025_mei shape: ENABLE + grants + for-all policy).
alter table public.ai_settings enable row level security;
grant select, insert, update, delete on public.ai_settings to authenticated, service_role;

drop policy if exists "own ai_settings" on public.ai_settings;
create policy "own ai_settings" on public.ai_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Read path: SECURITY DEFINER, returns the CALLER'S OWN key only. Joins ai_settings
-- (filtered by auth.uid()) → vault.decrypted_secrets. search_path='' hardens it.
create or replace function public.get_ai_api_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  k   text;
begin
  select key_secret_id into sid
    from public.ai_settings
   where user_id = (select auth.uid());
  if sid is null then
    return null;
  end if;
  select decrypted_secret into k
    from vault.decrypted_secrets
   where id = sid;
  return k;
end;
$$;
revoke all on function public.get_ai_api_key() from public, anon;
grant execute on function public.get_ai_api_key() to authenticated;

-- Write path: SECURITY DEFINER that (a) creates a new Vault secret, (b) deletes the
-- caller's OLD secret if rotating, (c) upserts ai_settings. Plaintext arrives via the
-- Server Action and is handed straight to Vault — never persisted in an app column.
-- (Pitfall 4: old secret deleted on rotation.)
create or replace function public.save_ai_api_key(
  p_provider text,
  p_model    text,
  p_key      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := (select auth.uid());
  old_sid uuid;
  new_sid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_provider not in ('gemini','claude') then
    raise exception 'invalid provider';
  end if;

  select key_secret_id into old_sid from public.ai_settings where user_id = uid;

  new_sid := vault.create_secret(p_key, 'ai_key:' || uid::text || ':' || p_provider);

  insert into public.ai_settings (user_id, provider, model, key_secret_id, updated_at)
  values (uid, p_provider, p_model, new_sid, now())
  on conflict (user_id) do update
    set provider = excluded.provider,
        model    = excluded.model,
        key_secret_id = excluded.key_secret_id,
        updated_at = now();

  if old_sid is not null then
    delete from vault.secrets where id = old_sid;   -- rotate: drop the old ciphertext
  end if;
end;
$$;
revoke all on function public.save_ai_api_key(text, text, text) from public, anon;
grant execute on function public.save_ai_api_key(text, text, text) to authenticated;

-- Remove path: delete the row + the Vault secret (BYOK-05). app returns to pre-IA.
create or replace function public.remove_ai_api_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  sid uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select key_secret_id into sid from public.ai_settings where user_id = uid;
  delete from public.ai_settings where user_id = uid;
  if sid is not null then
    delete from vault.secrets where id = sid;
  end if;
end;
$$;
revoke all on function public.remove_ai_api_key() from public, anon;
grant execute on function public.remove_ai_api_key() to authenticated;
```
> Note: `vault.create_secret(secret, name)` and the `vault.decrypted_secrets` view are the documented Vault API `[CITED: supabase.com/docs/guides/database/vault]`. The exact arity of `vault.create_secret` (it also accepts an optional `description`/`key_id`) and the precise delete mechanism (`delete from vault.secrets` vs a helper) should be **confirmed against the installed local Vault version** during the migration task — flagged as Open Question 1. `[ASSUMED]` for the rotation-delete specifics.

### provider-factory.ts (minimal — Phase 15 reuses)
```typescript
// src/lib/ai/provider-factory.ts
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'

export type AiProvider = 'gemini' | 'claude'

/** Map stored (provider, model, apiKey) → a per-call configured @ai-sdk model.
 *  BYOK: the apiKey is the user's own, passed per call — never from env. */
export function modelFor(
  provider: AiProvider,
  model: string,
  apiKey: string,
): LanguageModel {
  switch (provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })(model)
    case 'claude':
      return createAnthropic({ apiKey })(model)
    default: {
      const _exhaustive: never = provider
      throw new Error(`unknown AI provider: ${String(_exhaustive)}`)
    }
  }
}
```
`[CITED: ai-sdk.dev/docs/ai-sdk-core/provider-management]` for `createX({ apiKey })(model)`.

### settings.ts (client-safe registry) + settings.server.ts (decrypt DAL)
```typescript
// src/lib/ai/settings.ts  (CLIENT-SAFE — no 'server-only', no key access)
export const AI_PROVIDERS = ['gemini', 'claude'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: 'Gemini (Google)',
  claude: 'Claude (Anthropic)',
}
/** Cheap default model per provider (hard-coded; no UI picker — CLSAI-F2 deferred). */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  gemini: 'gemini-2.5-flash-lite',
  claude: 'claude-haiku-4-5',
}
```
```typescript
// src/lib/ai/settings.server.ts  ('server-only' — the ONLY module that sees plaintext)
import 'server-only'
import { createClient } from '@/lib/supabase/server'

/** Returns the caller's decrypted key + provider/model, or null if no key set.
 *  Used by testConnection (this phase) and suggestCategory (Phase 15). */
export async function getDecryptedAiSettings(): Promise<
  { provider: 'gemini' | 'claude'; model: string; apiKey: string } | null
> {
  const supabase = await createClient()
  const [{ data: row }, { data: key }] = await Promise.all([
    supabase.from('ai_settings').select('provider, model').maybeSingle(),
    supabase.rpc('get_ai_api_key'),
  ])
  if (!row || !key) return null
  return { provider: row.provider as 'gemini' | 'claude', model: row.model, apiKey: key }
}
```

### actions/ai-settings.ts — save / test / remove (mirrors actions/mei.ts grammar)
```typescript
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDecryptedAiSettings } from '@/lib/ai/settings.server'
import { modelFor } from '@/lib/ai/provider-factory'
import { DEFAULT_MODEL } from '@/lib/ai/settings'
import { aiSettingsSchema } from '@/lib/schemas/ai-settings'
import { generateText } from 'ai'

export type ActionResult = { error: string } | { ok: true }
const AI_PATH = '/conta/configuracoes-ia'

export async function saveAiSettings(formData: FormData): Promise<ActionResult> {
  const parsed = aiSettingsSchema.safeParse({
    provider: formData.get('provider'),
    apiKey: formData.get('apiKey'),
  })
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { provider, apiKey } = parsed.data
  const { error } = await supabase.rpc('save_ai_api_key', {
    p_provider: provider,
    p_model: DEFAULT_MODEL[provider],
    p_key: apiKey,
  })
  if (error) return { error: 'Não foi possível salvar. Tente novamente.' }

  revalidatePath(AI_PATH)
  return { ok: true }
}

export async function testConnection(): Promise<ActionResult> {
  try {
    const settings = await getDecryptedAiSettings()
    if (!settings) return { error: 'Nenhuma chave configurada.' }
    await generateText({
      model: modelFor(settings.provider, settings.model, settings.apiKey),
      prompt: 'ping',
      // keep it ~1 token; the SDK option name for the cap is verified at build (Open Q3)
    })
    return { ok: true }
  } catch (e: unknown) {
    return { error: mapProviderError(e) } // friendly pt-BR; never the raw error/key
  }
}

export async function removeAiKey(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }
  const { error } = await supabase.rpc('remove_ai_api_key')
  if (error) return { error: 'Não foi possível remover a chave. Tente novamente.' }
  revalidatePath(AI_PATH)
  return { ok: true }
}
```
> `mapProviderError`: inspect the AI SDK error. `AI_APICallError` exposes a `statusCode`; map 401/403 → "Chave inválida…", 429 → "Sem créditos ou cota esgotada…", anything else / network → "Não foi possível testar agora.". Use `APICallError.isInstance(e)` from `ai` to type-narrow. `[CITED: ai-sdk.dev/docs/reference/ai-sdk-errors]` (verify the exact import/guard name at build — Open Question 3).

### RSC page (mirrors mei/configuracoes/page.tsx) — projects has_key ONLY
```typescript
// src/app/(app)/conta/configuracoes-ia/page.tsx
import { AiSettingsForm } from '@/components/ai-settings-form'
import { createClient } from '@/lib/supabase/server'

export default async function ConfiguracoesIaPage() {
  const supabase = await createClient()
  // Project provider + a DERIVED has_key — NEVER key_secret_id, NEVER the key.
  const { data } = await supabase
    .from('ai_settings')
    .select('provider, key_secret_id')
    .maybeSingle()

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Configurações de IA</h1>
      <p className="text-sm text-muted-foreground">
        Configure seu provedor de IA e a sua própria chave para a classificação
        automática de gastos.
      </p>
      <AiSettingsForm
        provider={(data?.provider as 'gemini' | 'claude') ?? 'gemini'}
        hasKey={!!data?.key_secret_id}
      />
    </section>
  )
}
```
> The RSC selects `key_secret_id` ONLY to compute `hasKey={!!...}` and does NOT pass it down — it passes the boolean. Even cleaner: a `count`/exists query. Either way, no key material crosses to the client.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pgsodium / Transparent Column Encryption | Supabase Vault (`vault.*`) | pgsodium pending-deprecation (2025–2026) | Use Vault; Vault's API is stable even as its internals move off pgsodium |
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` (getAll/setAll) | already adopted in this repo | No change — already on `@supabase/ssr` |
| AI Gateway / shared key | Direct `@ai-sdk/*` per-call `apiKey` (BYOK) | v1.4 decision | The whole point of this phase |
| `claude-haiku-4-5-<date>` model id | bare `claude-haiku-4-5` alias | current Anthropic catalog | Use the bare alias — no date suffix `[ASSUMED]` (verify at build, Open Q2) |

**Deprecated/outdated:**
- pgsodium / TCE: do not use. `[CITED: supabase.com/docs/guides/database/extensions/pgsodium]`
- `@ai-sdk/deepseek`: not deprecated, just **deferred** (CLSAI-F1) — do not install this phase.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vault.create_secret(secret, name)` arity + `delete from vault.secrets` is the rotation/delete path | Code Examples (migration) | Rotation/remove RPC fails at `db push`; fix by matching the installed Vault version's API (Open Q1) |
| A2 | `supabase_vault` is enable-able / present in the LOCAL CLI stack (config.toml `[db.vault]` is commented) | Runtime State Inventory, Open Q1 | Local dev can't test save/decrypt until the extension is enabled + `db reset` |
| A3 | Model ids `gemini-2.5-flash-lite` / `claude-haiku-4-5` (bare alias) are current/valid | settings.ts, State of the Art | A bad id → test-connection 404; one-line config fix. Verify at build (Open Q2) |
| A4 | AI SDK v6 `generateText` token-cap option name + `APICallError.isInstance` guard | actions, Open Q3 | Test-ping costs slightly more than 1 token, or error-narrowing needs the right guard; verify against installed `ai@6.0.208` |
| A5 | `createGoogleGenerativeAI`/`createAnthropic` accept `{ apiKey }` and return `(model) => LanguageModel` in v3.0.x | provider-factory | Import/call shape differs → factory rewrite; cross-checked against AI SDK docs, LOW risk |

## Open Questions

1. **Exact Vault SQL surface in the installed local stack.**
   - What we know: `vault.create_secret` + `vault.decrypted_secrets` are the documented API; `config.toml` has `[db.vault]` commented out.
   - What's unclear: whether the local CLI stack already exposes `vault.*` by default, and the exact arity of `create_secret` + the supported secret-delete/update call.
   - Recommendation: First migration task verifies `select vault.create_secret('x','y')` works locally; if not, enable `[db.vault]` in config.toml + `supabase db reset`. Confirm the delete path (`delete from vault.secrets where id = ...` vs `vault.delete_secret`).

2. **Current model ids.** Confirm `gemini-2.5-flash-lite` and `claude-haiku-4-5` (bare alias, no date) against the live provider catalogs at build time — both are cheap-tier ids from v1.4 STACK research (2026-06-18, same day), so low churn risk, but a test-connection call validates them for free.

3. **AI SDK v6 specifics:** the option to cap the test-ping to ~1 token (e.g. `maxOutputTokens`/`maxTokens` — name changed across SDK majors) and the error guard (`APICallError.isInstance` vs `AI_APICallError`) for `mapProviderError`. Verify against the installed `ai@6.0.208` types when writing `testConnection`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | migration 0033 + `gen:types` | ✓ | 2.106.x (in stack) | — |
| `supabase_vault` extension (local) | save/decrypt key path | ⚠ unverified | — | Enable `[db.vault]` in config.toml + `db reset`; or test against PROD (dev server already points at PROD) |
| `@ai-sdk/google` | provider factory + test ping | ✗ (to install) | 3.0.83 | — (blocking — must install) |
| `@ai-sdk/anthropic` | provider factory + test ping | ✗ (to install) | 3.0.85 | — (blocking — must install) |
| `ai` | `generateText` ping | ✓ | 6.0.208 | — |
| Provider API keys (Gemini/Claude) | runtime test-connection | user-supplied (BYOK) | — | No-key state is a first-class UI state; test is optional |

**Missing dependencies with no fallback:** `@ai-sdk/google`, `@ai-sdk/anthropic` (install step — gated behind the legitimacy checkpoint).
**Missing dependencies with fallback:** `supabase_vault` local availability (enable in config.toml, or verify against PROD — but PROD is the live financial DB, so prefer local enable).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest.config.ts` present; `npm test` = `vitest run`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/ai` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BYOK-01 | provider enum constrains to gemini/claude | unit | `npx vitest run src/lib/schemas/ai-settings.test.ts` | ❌ Wave 0 |
| BYOK-02 | save round-trips through Vault; row stores only `key_secret_id` | integration (DB) | manual/CLI SQL test (Supabase tests env-flaky — run deliberately) | ❌ Wave 0 |
| BYOK-03 | `testConnection` maps 401/429/network → friendly pt-BR; never leaks | unit | `npx vitest run src/actions/ai-settings.test.ts` (mock provider error) | ❌ Wave 0 |
| BYOK-04 | `provider-factory` maps each provider; unknown throws; key never on client | unit + manual | `npx vitest run src/lib/ai/provider-factory.test.ts` + Network/bundle grep | ❌ Wave 0 |
| BYOK-04 | cross-user `ai_settings` isolation (RLS) | integration (DB) | local two-user SQL select returns 0 foreign rows | ❌ Wave 0 |
| BYOK-05 | remove deletes row + Vault secret; `suggestCategory` still returns null safely | unit + manual | existing `suggest.test.ts` (unchanged) + manual remove walkthrough | ✅ (suggest.test.ts) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/ai src/lib/schemas` (fast unit subset)
- **Per wave merge:** `npm test` + `npx tsc --noEmit` + `npm run build`
- **Phase gate:** full suite green + the write-only-key invariant manually verified (no `sk-`/`AIza` in Network tab, RSC payload, or `.next/static`) before `/gsd-verify-work`

### Observable behaviors / edges to sample (Nyquist)
- no-key (first run): form renders, Gemini preselected, badge "Nenhuma chave configurada", suggestCategory null-safe
- valid key saved: badge flips to "Chave configurada ✓", input clears, key NOT echoed
- invalid key → testConnection: "Chave inválida…" inline, no stack/secret
- provider 429 → testConnection: "Sem créditos ou cota esgotada…"
- network error → testConnection: "Não foi possível testar agora."
- cross-user isolation: user B cannot read user A's `ai_settings` row or key
- key-never-on-client: bundle/Network/RSC payload grep clean
- remove: badge back to no-key, app returns to pre-IA pick without breaking

### Wave 0 Gaps
- [ ] `src/lib/ai/provider-factory.test.ts` — each provider maps; unknown throws (BYOK-04)
- [ ] `src/lib/schemas/ai-settings.test.ts` — provider enum + apiKey shape (BYOK-01/02)
- [ ] `src/actions/ai-settings.test.ts` — `mapProviderError` 401/429/network → friendly pt-BR, no leak (BYOK-03)
- [ ] DB/RLS check (manual CLI SQL, deliberate — Supabase integration tests are env-flaky per MEMORY): cross-user `ai_settings` isolation + "row holds only key_secret_id" (BYOK-04)
- [ ] Manual verify checklist: write-only-key invariant (no `sk-`/`AIza` anywhere client-reachable)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | `getClaims()` owner check in every action; RLS via `auth.uid()` |
| V3 Session Management | no (handled by existing `@supabase/ssr` middleware) | — |
| V4 Access Control | yes | RLS 4 policies on `ai_settings`; `SECURITY DEFINER` RPC filtered by `auth.uid()`; IDOR-safe (the RPC reads only the caller's row) |
| V5 Input Validation | yes | Zod `safeParse` boundary on `provider`/`apiKey`; provider CHECK constraint in SQL |
| V6 Cryptography | yes | **Supabase Vault** (authenticated encryption at rest) — never hand-roll; no pgsodium/TCE |
| V7 Error Handling & Logging | yes | Total `try/catch`; never log the decrypted key or raw provider error; friendly mapped messages |
| V8 Data Protection | yes | Key never reaches client; `import 'server-only'` decrypt DAL; project only `provider`+`has_key` |

### Known Threat Patterns for {Next.js 16 App Router + Supabase Vault/RLS + AI SDK}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Key leaks to client via `select('*')` / RSC prop serialization / `'use client'` import | Information Disclosure | Project `has_key`+`provider` only; `server-only` decrypt DAL; never pass key as prop |
| Plaintext-at-rest / DB-stored master key | Information Disclosure | Vault (key out of DB); no pgcrypto/pgsodium |
| Cross-user key read (RLS gap on new table) | Elevation of Privilege | RLS 4 policies + `with check`; RPC filters `auth.uid()`; tested cross-user locally |
| `vault.decrypted_secrets` granted to `authenticated` | Information Disclosure | Never grant directly — go through `SECURITY DEFINER` RPC only |
| Orphaned old secret on rotation | Information Disclosure | Delete old `vault.secrets` row in the same write/remove RPC (Pitfall 4) |
| Provider error / stack leaking the key in a toast or log | Information Disclosure | Total catch; mapped pt-BR messages; redact; never log decrypted key |
| Prompt-injection in test path | Tampering | N/A this phase (test prompt is a fixed "ping"); enum gate is Phase 15's concern |

## Sources

### Primary (HIGH confidence)
- Codebase read directly (2026-06-18): `src/actions/mei.ts`, `src/app/(app)/mei/configuracoes/page.tsx`, `src/components/mei-settings-form.tsx`, `src/lib/supabase/admin.ts`, `src/lib/schemas/mei.ts`, `src/app/(app)/conta/page.tsx`, `src/components/delete-account-form.tsx`, `src/lib/classifier/suggest.ts`, `supabase/migrations/0025_mei.sql` + `0032_*.sql`, `next.config.ts`, `package.json`, `supabase/config.toml`, `vitest.config.ts`
- `npm view` (2026-06-18): `@ai-sdk/google@3.0.83`, `@ai-sdk/anthropic@3.0.85` (peer `zod ^3.25.76 || ^4.1.8`), `ai@6.0.208`; no postinstall scripts; repo `github.com/vercel/ai`
- `.planning/research/ARCHITECTURE.md`, `STACK.md`, `PITFALLS.md` (v1.4 integration research) — Vault RLS-safe pattern, provider versions/model ids, leak vectors
- [Supabase Vault docs](https://supabase.com/docs/guides/database/vault) — `vault.create_secret`, `vault.decrypted_secrets`, key-out-of-DB

### Secondary (MEDIUM confidence)
- [AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management) — `createX({ apiKey })` runtime instantiation
- [AI SDK error reference](https://ai-sdk.dev/docs/reference/ai-sdk-errors) — `APICallError`/`isInstance` for error mapping
- [pgsodium pending deprecation](https://supabase.com/docs/guides/database/extensions/pgsodium) — steer to Vault

### Tertiary (LOW confidence)
- Exact `vault.create_secret` arity + secret-delete mechanism — `[ASSUMED]`, verify against installed local Vault (Open Q1)
- Current model ids + AI SDK v6 token-cap option name — `[ASSUMED]`, verify at build (Open Q2/Q3)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm; all locked in CLAUDE.md
- Architecture / migration SQL: HIGH for the table/RLS shape (cloned from 0025), MEDIUM for the exact Vault API arity (Open Q1)
- UI/action patterns: HIGH — direct clone of proven in-repo analogs
- Pitfalls / security: HIGH — cross-checked against v1.4 PITFALLS.md + Supabase/Next.js security docs
- Model ids + AI SDK v6 call specifics: MEDIUM — verify at build (Open Q2/Q3)

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (AI SDK packages republish daily — re-verify versions if planning slips; `deepseek-chat` alias deprecation 2026-07-24 is out of scope this phase)
