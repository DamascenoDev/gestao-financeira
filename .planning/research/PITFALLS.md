# Pitfalls Research

**Domain:** Adding BYOK multi-provider AI classification to a SHIPPED personal-finance app (Next.js 16 App Router + AI SDK 6 + Supabase RLS/Vault + Vercel)
**Researched:** 2026-06-18
**Confidence:** HIGH (key facts verified against Supabase docs, AI SDK docs, Next.js security docs; cross-checked for DeepSeek schema limits)

> Scope note: this is a SUBSEQUENT milestone (v1.4) on a live app. Memory-first classification already works in prod; the `suggestCategory()` seam, `validateSuggestion` enum wrapper and `SuggestionSlot` already exist (additive). The pitfalls below are about what breaks when you wire in (a) the user's own provider key and (b) the multi-provider AI call — plus the v1.3 debt being folded in. Generic "how to use an LLM" advice is omitted.

---

## Critical Pitfalls

### Pitfall 1: The user's API key leaks to the client (bundle, props, or query result)

**What goes wrong:**
The plaintext BYOK key reaches the browser via one of four classic Next.js App Router leak paths: (1) a `select('*')` on the settings table that returns the key column to a Client Component or `useEffect` fetch; (2) a Server Component that reads the key and passes it as a prop to a Client Component — App Router **serializes every prop over the wire**, so the key lands in the HTML/RSC payload; (3) the key (or the provider module that closes over it) imported into a file that also has `'use client'`, pulling it into the bundle; (4) prefixing an env fallback with `NEXT_PUBLIC_`.

**Why it happens:**
The key is just a string column on a row scoped by `user_id`, so the natural typed query (`from('user_settings').select('*')`) "just works" and the developer never notices the key is in the network response. RSC prop serialization is invisible — it looks like normal server code.

**How to avoid:**
- **Never select the encrypted/plaintext key column in any client-reachable query.** The client-facing query returns only `provider` + a computed `has_key boolean` (and optionally a masked tail like `sk-...4f2a`). Decrypt the key **only** inside the classification Route Handler / Server Action that calls the provider, then discard it — never return it.
- Put the decrypt+call code in a module marked `import 'server-only'` so a `'use client'` import errors the build.
- Use the **Data Access Layer pattern**: one server module owns key access; nothing else touches it.
- Optionally `experimental_taintUniqueValue` the decrypted key so React errors if it's ever passed clientward.
- Grep the bundle and network tab during verify: the key string must never appear.

**Warning signs:**
Key (or `sk-`/`AIza` prefix) visible in browser Network tab response, in `__NEXT_DATA__`/RSC payload, or in `.next/static` chunks. A `select('*')` anywhere near the settings table.

**Phase to address:** Settings-UI / key-storage phase (schema + DAL), re-verified in the classification phase.

---

### Pitfall 2: The key is stored plaintext (or "encrypted" with a footgun) at rest

**What goes wrong:**
The key is written to a normal `text` column with no encryption, so anyone with DB/dashboard/backup access (or a future RLS bug, see Pitfall 3) reads it in the clear. Or the developer reaches for `pgcrypto`/`pgsodium` TCE and hits the footgun: **pgsodium and Transparent Column Encryption (TCE) are deprecated and explicitly NOT recommended by Supabase** for new use; rolling your own `pgcrypto` means managing a key that, if stored in the same DB/migration, defeats the purpose.

**Why it happens:**
"It's a personal single-user app" makes plaintext feel acceptable; financial-key sensitivity is underweighted. And pgsodium tutorials still rank in search even though it's being deprecated.

**How to avoid:**
- Use **Supabase Vault** (`vault.create_secret` / read via `vault.decrypted_secrets`). It's the current recommended path; its **API is stable even though its pgsodium internals are being swapped out**, and it uses authenticated encryption on disk. Store the key as a Vault secret; the settings row holds only the Vault secret `id` (a UUID) + `provider` + `has_key`.
- **Do NOT use pgsodium TCE or hand-rolled pgcrypto** for this — deprecated / key-management footgun.
- The Vault decryption view (`vault.decrypted_secrets`) must be reachable **only** from `service_role`/server code, never via the anon/client key.

**Warning signs:**
A `text`/`varchar` column literally named `api_key` holding `sk-...`. Any migration that enables `pgsodium` or creates a `pgsodium`-backed encrypted column. The decrypt view exposed to `authenticated` role.

**Phase to address:** Key-storage phase (Vault wiring + migration).

---

### Pitfall 3: RLS gap on the new settings/Vault-mapping table

**What goes wrong:**
The new `user_settings` (or `ai_provider_config`) table is added but RLS is **not enabled**, or only a `SELECT` policy is written and `INSERT/UPDATE/DELETE` are left open, or the policy filters on the wrong column. Because every other table in this app already has `auth.uid() = user_id` RLS (verified live), a missing policy on the *new* table is the easy thing to forget — and it's the one table holding the most sensitive value (the key mapping).

**Why it happens:**
RLS is per-table and per-command. Adding a table is routine; remembering all four command policies + `with check` is not. Single-user-today masks the gap because there's only one row.

**How to avoid:**
- Enable RLS on the new table in the same migration that creates it; write **all four** policies (`select/insert/update/delete`) with `using (auth.uid() = user_id)` **and** matching `with check (auth.uid() = user_id)` on insert/update.
- Test policies with the local Supabase CLI before pushing (this app's MEMORY notes Supabase tests are env-flaky — run them deliberately, not in the flaky integration path).
- Vault's own decrypted view is **not** RLS-scoped per user — so the server must additionally filter the Vault `secret_id` by the caller's `user_id` row. Don't assume Vault gives you per-user isolation; it doesn't.

**Warning signs:**
`alter table ... enable row level security` missing for the new table. Only 1–2 policies where 4 are needed. A cross-user `select` returning rows in a local two-user test.

**Phase to address:** Key-storage phase (migration), audited in the secure/verify pass.

---

### Pitfall 4: DeepSeek silently breaks structured output (multi-provider schema trap)

**What goes wrong:**
The classification call uses AI SDK `generateObject`/`Output.object` with a Zod schema (strict JSON-schema enforcement). This works on Gemini and Claude but **DeepSeek does not support `json_schema` enforcement — only `json_object` mode**. With a forced schema, DeepSeek returns `"This response_format type is unavailable now"` or unconstrained JSON, surfacing as `AI_NoObjectGeneratedError`. The feature appears to work in dev (tested on Gemini) and breaks only when the user picks DeepSeek.

**Why it happens:**
Each provider implements structured output differently: Gemini uses `response_schema`, Claude uses tool-use/`output_config.format` (always strict, no `name`, no recursive `$ref`), DeepSeek only has `json_object`. The AI SDK abstracts the *call* but not these capability gaps. The dev tests one provider and assumes parity.

**How to avoid:**
- Treat structured output as a **per-provider capability**, not a given. For DeepSeek, use `json_object` mode + put the category enum + JSON shape in the **prompt**, then validate the returned JSON with the **same Zod schema** server-side (`validateSuggestion` already exists). Reject/repair on failure.
- Keep the Zod schema flat — no recursion / `$ref` (Claude can't do recursive schemas; keep it `{ merchant, category, confidence }`).
- Wrap every call in `NoObjectGeneratedError.isInstance(error)` handling → fall back to manual pick (Pitfall 8), never crash the review grid.
- A/B the three providers on real BR descriptors before locking defaults.

**Warning signs:**
Classification works for one provider, throws `AI_NoObjectGeneratedError` for another. DeepSeek returning prose instead of JSON. Schema with nested objects/`$ref`.

**Phase to address:** Classification-wire phase (the `suggestCategory()` implementation), with a per-provider adapter.

---

### Pitfall 5: AI returns a category NOT in the user's enum (hallucination + category drift)

**What goes wrong:**
The model invents a category ("Restaurantes" when the enum has "Alimentação"), or returns a category the user **deleted/renamed between calls** (this app lets categories be added/removed/renamed — live feature). The suggestion then can't be saved as a pattern, or worse, gets coerced into the wrong bucket and pollutes the goal-adherence math.

**Why it happens:**
The enum is dynamic per-user and editable. If the enum is hard-coded in the prompt/schema once, it drifts from the live category list. Models also "helpfully" generalize to a category that doesn't exist.

**How to avoid:**
- **Fetch the user's current categories fresh at call time** and inject them as the constrained enum (in the Zod schema for Gemini/Claude, in the prompt for DeepSeek). Never cache the enum across uploads.
- `validateSuggestion` (already built) must **reject** any value outside the live enum → that row degrades to manual pick, not a silent wrong category.
- Include an explicit `"uncategorized"`/null escape hatch so the model isn't forced to hallucinate when nothing fits.
- Never let an unvalidated AI category reach the goal/adherence computation.

**Warning signs:**
A saved pattern whose category string doesn't match any current category id. Adherence numbers shifting after an AI upload. Validation rejections spiking after the user edits categories.

**Phase to address:** Classification-wire phase (enum-fresh fetch + validate).

---

### Pitfall 6: Calling the LLM for already-known merchants (cost/latency regression)

**What goes wrong:**
The AI is called for every transaction in an upload, including merchants the memory already knows — burning tokens, latency, and free-tier rate limit on solved cases. This regresses the core value (memory-first) that's already proven in prod.

**Why it happens:**
It's simpler to "classify the whole batch with AI" than to diff against the memory first. The seam makes it easy to call AI from everywhere.

**How to avoid:**
- **Memory-first is mandatory:** run `merchant_patterns` match first; collect ONLY the unseen descriptors; send those — **batched into a single call per upload** — to the provider. (This is the documented design; the pitfall is forgetting it during wiring.)
- Cap batch size (e.g. N descriptors per call); if an upload has more unseen merchants than the cap, chunk — don't send an unbounded array.
- Set `maxRetries` low (1–2). Retries multiply cost; an unrecoverable schema failure should fall back to manual, not retry-storm.
- Don't stream — classification is a one-shot structured result, not a chat; streaming adds complexity with no UX gain here.
- De-dupe descriptors within the batch (the same merchant can appear N times in one statement).

**Warning signs:**
Token usage proportional to total rows instead of *unique unseen* rows. AI latency on uploads of all-known merchants. Free-tier 429s. Multiple AI calls per upload.

**Phase to address:** Classification-wire phase (the memory-diff + batch logic).

---

### Pitfall 7: Auto-committing AI guesses (forbidden — breaks the trust model)

**What goes wrong:**
An AI suggestion is written straight into `merchant_patterns` (or applied to the transaction) without the human confirming it. This violates the project's non-negotiable "confirmation before it becomes a pattern" rule and silently teaches the system wrong merchant→category mappings that then auto-classify all future faturas.

**Why it happens:**
High-confidence suggestions feel safe to auto-apply; skipping the confirm step is less UI work. The memory layer's auto-classify (correct for *confirmed* patterns) gets accidentally extended to *AI-suggested* ones.

**How to avoid:**
- AI output populates `SuggestionSlot` in the review grid as a **suggestion only**; the write-to-memory ("learn pattern") fires **only** on explicit user confirmation — same gate the manual pick already uses. Reuse the existing confirm path; do not add a new auto-write.
- The pattern-learning write must be unreachable from the AI path except via the confirm action.

**Warning signs:**
A `merchant_patterns` row created with no corresponding confirm event. Categories appearing on transactions the user never reviewed. Auto-classify acting on a never-confirmed merchant.

**Phase to address:** Classification-wire phase / review-grid integration.

---

### Pitfall 8: No graceful fallback when key is missing/invalid/over-quota → app looks broken

**What goes wrong:**
With no key set, an invalid key, a provider 401/429, or a refusal, the classification call throws and the **review grid (a proven, working feature) appears broken** — the user can't even do the manual pick that worked before AI existed.

**Why it happens:**
AI is wired as a hard dependency of the review flow instead of an optional enhancement layered on top of the still-working memory+manual path.

**How to avoid:**
- AI is **strictly additive**: memory match → (if key present & call succeeds) AI suggestion → **else manual pick**. Any of {no key, invalid key, provider error, refusal, schema failure} degrades to the existing manual flow with a non-blocking toast ("IA indisponível — selecione manualmente"), never an error page.
- Distinguish "no key configured" (expected, silent) from "key configured but failed" (surface a Settings hint).
- The review grid must render and be fully usable with the AI provider down.

**Warning signs:**
Review grid errors/blank when no key is set. A provider 429 taking down the whole upload. No manual-pick path when AI fails.

**Phase to address:** Classification-wire phase (fallback chain) + Settings phase (no-key state).

---

### Pitfall 9: Destructive prod verification of the folded-in v1.3 debt

**What goes wrong:**
The v1.3 debt includes hands-on prod walkthroughs (MEI 12-06, LGPD 12-07) that involve **real downloads and a throwaway-account DESTRUCTIVE account-delete on the live Supabase/Vercel app**. Done carelessly, a destructive delete hits the wrong (real personal) account, or the LGPD/delete path cascades and removes data it shouldn't, on the production DB that holds real financial data — with no staging copy.

**Why it happens:**
Single-user personal app = no separate staging; "throwaway account" and "my real account" live in the same prod DB. Mixing this destructive verification into the same milestone as feature work increases the chance of doing it tired/context-switched. MEMORY also notes the dev server points at PROD Supabase — a local "test" can hit prod data.

**How to avoid:**
- Run destructive prod verification against an **explicitly created throwaway account**, confirm its `user_id` before any delete, and verify RLS scopes the cascade to that `user_id` only. Snapshot/backup the prod DB first (this app's MEMORY explicitly warns: **NEVER run `gsd phases.clear` here** — same destructive-on-prod hazard class).
- **Sequence the debt and feature work as separate phases**, not interleaved — finish/redeploy the cosmetic G-07/G-08 fixes and the walkthroughs as their own clearly-bounded phase so destructive steps aren't entangled with new-code churn.
- Treat the throwaway-delete as a deliberate, double-confirmed step, not an automated one.

**Warning signs:**
A delete script that takes no explicit account id. No DB backup before the walkthrough. The destructive step scheduled in the same plan as feature commits. Running against the dev server (which points at prod).

**Phase to address:** A dedicated v1.3-debt phase, kept separate from the AI feature phases.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store key in plaintext `text` column | No Vault wiring | Key readable in DB/backups; financial-grade leak | **Never** — use Vault from day one |
| `select('*')` on settings table | One query for everything | Key in client payload (Pitfall 1) | **Never** — always project `has_key`/`provider` only |
| Hard-code category enum in prompt once | Simpler prompt build | Drifts from live editable categories → hallucinated/stale categories | **Never** — fetch fresh per call |
| Single provider adapter assuming schema parity | Ships faster | DeepSeek breaks at runtime (Pitfall 4) | Only if DeepSeek is dropped from scope; otherwise per-provider adapter |
| Interleave v1.3 destructive debt with AI feature commits | One milestone, fewer phases | Destructive prod step done mid-churn → wrong-account risk | **Never** — separate phase |
| Skip "test connection" key validation | Less Settings code | User saves a bad key, discovers it only at upload time | Acceptable for a first cut **only** if no-key fallback (Pitfall 8) is solid |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase Vault | Using pgsodium/TCE or pgcrypto (deprecated/footgun) | Vault `create_secret`; settings row holds Vault secret id only; decrypt view server-only |
| Supabase RLS (new table) | Enabling RLS but writing only SELECT policy | All four command policies + `with check`; test cross-user locally |
| AI SDK + Gemini | Assuming JSON schema = OpenAPI subset | Some Zod constructs unsupported by Gemini's OpenAPI schema; keep schema simple, toggle `structuredOutputs` if needed |
| AI SDK + Claude | Sending a `name` on schema wrapper or recursive `$ref` | Claude rejects both; flat schema, tool-use/strict mode only |
| AI SDK + DeepSeek | Forcing `json_schema` | Use `json_object` + enum-in-prompt + server-side Zod validate |
| AI SDK errors | Letting `NoObjectGeneratedError` bubble to UI | `NoObjectGeneratedError.isInstance()` → fall back to manual pick |
| `@ai-sdk/*` direct packages | One provider's SDK breaks the Vercel build / pulls a bad dep | Pin versions; verify `npm run build` after adding EACH provider package separately; lazy/dynamic-import per chosen provider so one bad SDK doesn't block all |
| Vercel Route Handler | Edge runtime for the AI call | Node runtime + set `maxDuration`; key decryption needs server, not edge |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| AI call per transaction (not per unseen batch) | Token cost ∝ total rows | Memory-diff first; one batched call per upload | Any multi-row statement |
| Unbounded batch array to provider | Timeout / context overflow / 429 | Cap + chunk unseen descriptors; de-dupe | Large statement with many new merchants |
| Retry storm on schema failure | Cost multiplies, latency spikes | `maxRetries` 1–2; unrecoverable → manual fallback | First DeepSeek/schema mismatch in prod |
| Streaming a one-shot classification | Extra wiring, no benefit | Use `generateObject`, not streaming | Always — avoid streaming here |
| Free-tier rate limit per provider | 429s mid-upload | Memory-first shrinks call volume; graceful 429→manual | Bursty uploads on Gemini/DeepSeek free tier |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Key column selectable by client | Key exfiltration via network/RSC payload | Expose only `has_key` + `provider`; decrypt server-only |
| Key passed as prop to Client Component | RSC serializes it into client payload | Pass nothing key-related to client; `server-only` + taint |
| Logging the key / full provider request | Key in Vercel logs / observability | Redact; never `console.log` the decrypted key or raw headers |
| pgsodium TCE / plaintext at rest | Readable in DB/backups | Supabase Vault (authenticated encryption) |
| Missing/partial RLS on settings table | Cross-user key access if multi-user ever lands | All four RLS policies + `with check`, tested |
| Vault decrypt view exposed to `authenticated` | Any logged-in user reads any secret | Restrict decrypt to service_role; filter secret id by `user_id` row |
| Destructive prod account-delete on wrong id | Real financial data loss | Backup first; confirm throwaway `user_id`; double-confirm |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Auto-committing AI guesses | Wrong patterns silently learned, pollute future faturas + goals | Suggestion only; learn on explicit confirm |
| No visual distinction AI-suggested vs confirmed | User can't tell what to trust; over-trusts AI | Distinct `SuggestionSlot` styling (e.g. "sugerido pela IA" badge) until confirmed |
| App appears broken when no/invalid key | User thinks the working app regressed | Silent fallback to manual pick + non-blocking toast |
| No "test connection" feedback | User unsure key works until first upload fails | Settings "testar conexão" validates per-provider before saving |
| Masking failure: showing full key in Settings | Shoulder-surf / screenshot leak | Show masked tail only (`...4f2a`), never the full key after save |

## "Looks Done But Isn't" Checklist

- [ ] **Key storage:** Often missing Vault wiring — verify the key is in Vault, the settings row holds only a secret id, and `select('*')` returns no key material.
- [ ] **Client query:** Often still selects the key — verify the Network tab/RSC payload never contains `sk-`/`AIza`/Vault plaintext.
- [ ] **RLS on settings table:** Often only SELECT policy — verify all four commands + `with check`, tested cross-user locally.
- [ ] **DeepSeek path:** Often only Gemini tested — verify a real DeepSeek classification round-trips via `json_object` + Zod validate.
- [ ] **Enum freshness:** Often cached — verify deleting/renaming a category between uploads doesn't yield a stale/hallucinated category.
- [ ] **No-key fallback:** Often untested — verify the review grid is fully usable with no key set and with an invalid key.
- [ ] **No auto-commit:** Verify no `merchant_patterns` row is written without an explicit confirm.
- [ ] **Memory-first:** Verify an all-known-merchant upload makes ZERO AI calls.
- [ ] **Build per provider:** Verify `npm run build` + `tsc --noEmit` clean after each `@ai-sdk/*` package added.
- [ ] **v1.3 debt:** Verify destructive prod walkthrough ran on a confirmed throwaway account with a backup taken first; VALIDATION.md filled for Phases 12 + 13.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Key leaked to client (already shipped) | HIGH | Rotate/revoke the leaked provider key immediately; fix the query/prop/import; re-verify payload; treat as a breach |
| Key stored plaintext | MEDIUM | Migrate existing key into Vault; drop the plaintext column; rotate the key |
| RLS gap on settings table | MEDIUM (LOW today, single-user) | Add missing policies in a migration; audit for any cross-user reads (none yet, single-user) |
| DeepSeek schema break in prod | LOW | Route DeepSeek through `json_object` adapter; until then fallback-to-manual already covers it |
| Hallucinated/stale category saved | LOW | `validateSuggestion` rejects pre-save; clean any bad `merchant_patterns` row + re-confirm |
| Auto-committed wrong patterns | MEDIUM | Identify patterns with no confirm event; delete; re-confirm manually |
| Destructive prod delete hit wrong account | HIGH | Restore from the pre-walkthrough DB backup (hence: always back up first) |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Key leaks to client | Settings/key-storage phase | Network tab + RSC payload + bundle grep show no key |
| 2. Plaintext / pgsodium at rest | Key-storage phase (Vault migration) | Key lives in Vault; settings row has only secret id |
| 3. RLS gap on settings table | Key-storage phase (migration) | Four policies + `with check`, cross-user local test |
| 4. DeepSeek structured-output break | Classification-wire phase (per-provider adapter) | DeepSeek round-trip via `json_object` + Zod passes |
| 5. Category enum hallucination/drift | Classification-wire phase | Edit categories between uploads → no stale/invalid category |
| 6. LLM call for known merchants | Classification-wire phase (memory-diff + batch) | All-known upload = 0 AI calls; cost ∝ unique-unseen |
| 7. Auto-committing AI guesses | Review-grid integration phase | No pattern row without explicit confirm |
| 8. No graceful no-key/error fallback | Settings + classification phases | Grid usable with no/invalid key; provider 429 degrades to manual |
| 9. Destructive prod debt verification | Dedicated v1.3-debt phase (separate) | Throwaway `user_id` confirmed + DB backup before delete |

## Sources

- [pgsodium (pending deprecation): Encryption Features | Supabase Docs](https://supabase.com/docs/guides/database/extensions/pgsodium) — pgsodium/TCE deprecated, not recommended (HIGH)
- [Vault | Supabase Docs](https://supabase.com/docs/guides/database/vault) — Vault is current recommendation, authenticated encryption, stable API even as internals move off pgsodium (HIGH)
- [pgsodium / TCE not recommended · supabase Discussion #27109](https://github.com/orgs/supabase/discussions/27109) — confirms TCE deprecation, steer to Vault (HIGH)
- [Structured Outputs Across LLM Providers — Requesty](https://www.requesty.ai/blog/structured-outputs-across-llm-providers-the-compatibility-mess) — DeepSeek lacks `json_schema` ("response_format type unavailable"), Claude no `name`/no recursive `$ref`/always strict, Gemini OpenAPI-subset schema (MEDIUM-HIGH, single detailed source + corroborated by provider docs)
- [AI SDK Providers: Anthropic](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) — Claude structured output via tool-use (HIGH)
- [AI SDK Providers: Google Generative AI](https://ai-sdk.dev/v5/providers/ai-sdk-providers/google-generative-ai) — `structuredOutputs` toggle, OpenAPI schema caveat (HIGH)
- [AI SDK Errors: AI_NoObjectGeneratedError](https://ai-sdk.dev/docs/reference/ai-sdk-errors/ai-no-object-generated-error) — `isInstance()`, access to text/response/usage for fallback (HIGH)
- [How to Think About Security in Next.js Server Components & Actions](https://nextjs.org/blog/security-nextjs-server-components-actions) — prop serialization to client, taint APIs, DAL pattern (HIGH)
- [Next.js Data Security guide](https://nextjs.org/docs/app/guides/data-security) — `server-only`, minimal props, return only what UI needs (HIGH)
- [NEXT_PUBLIC_ turns API keys into public data — PreBreach](https://www.prebreach.dev/blog/vercel-exposed-api-keys-next-public) — env-var leak vector (MEDIUM)
- Project files: PROJECT.md (memory-first, human-in-loop, RLS, v1.3 debt incl. destructive LGPD walkthrough), CLAUDE.md (What NOT to Use, Vault default, integer-cents, `maxDuration`), MEMORY (NEVER `gsd phases.clear`; dev server points at PROD Supabase; pdf-parse serverExternalPackages) (HIGH — authoritative for this project)

---
*Pitfalls research for: BYOK multi-provider AI classification on Next.js 16 + Supabase Vault/RLS + Vercel, with v1.3 debt cleanup*
*Researched: 2026-06-18*
