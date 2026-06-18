# Project Research Summary

**Project:** Gestão Financeira Pessoal
**Domain:** BYOK multi-provider AI classification wired into a SHIPPED Next.js 16 + Supabase personal-finance app (v1.4 — CLS-AI)
**Researched:** 2026-06-18
**Confidence:** HIGH

## Executive Summary

This is a **subsequent-milestone (v1.4) integration**, not a greenfield build. The upload→parse→review→confirm→learn pipeline and its memory-first classifier are already live in production (v1.3). Three null seams were intentionally pre-built and ship inert today: `suggestCategory()` (`src/lib/classifier/suggest.ts:27`), the `validateSuggestion` enum wrapper (`:48`), and the `SuggestionSlot` chip (`src/components/suggestion-slot.tsx`). The milestone wires REAL AI into those seams plus adds a BYOK key-storage surface. The research is emphatic: **do not redesign the pipeline — everything is additive.** Memory-first stays in front of AI; AI fires only on cache-miss descriptors, batched into one `generateObject` call per upload; suggestions are chips, never auto-commits; only human confirm writes `merchant_patterns`.

The recommended approach is a **provider-agnostic factory over direct `@ai-sdk/*` packages** (NOT AI Gateway, because the user pastes their own per-provider key) — `createGoogleGenerativeAI` / `createAnthropic` / `createDeepSeek`, each instantiated at request time with a decrypted key. The key is encrypted at rest in **Supabase Vault** (the current, future-proof choice — pgsodium/TCE are deprecated). An app-owned `ai_settings` table (next migration `0033`) carries `user_id` + RLS and stores only the Vault secret UUID + provider + model; decryption happens server-only via a `SECURITY DEFINER` RPC filtered by `auth.uid()`. The key must NEVER reach the client — the form is write-only and the page renders "chave configurada ✓", not the key.

The dominant risks are **security and provider-parity**, not throughput (cost is near-zero by construction). The four critical pitfalls: (1) the BYOK key leaking to the client via `select('*')`, RSC prop serialization, or a `'use client'` import — mitigated by `import 'server-only'` + projecting only `has_key`/`provider`; (2) plaintext-at-rest or a deprecated-crypto footgun — mitigated by Vault; (3) a missing/partial RLS policy on the new settings table — mitigated by all four command policies + `with check`; (4) **DeepSeek silently breaking structured output** — it has no `json_schema` mode, only `json_object`, so the feature works in dev (tested on Gemini) and breaks when the user picks DeepSeek — mitigated by a per-provider structured-output adapter and a flat Zod schema (Claude rejects `$ref`/`name`). A fifth, operationally dangerous item: the folded-in v1.3 debt includes a **destructive prod throwaway-account delete**, and MEMORY warns the dev server points at PROD Supabase — this MUST be an isolated phase with a DB backup and a confirmed throwaway `user_id`.

## Key Findings

### Recommended Stack

The base stack is locked and live (Next.js 16, TS strict, Supabase Auth/Postgres/Storage + RLS, Vercel, `ai` 6.0.x, `@ai-sdk/google` 3.0.x, `zod` 4.4.x). v1.4 adds only **two npm packages** plus a built-in Postgres feature. All three provider packages declare the same AI-SDK-6 zod peer range, so they coexist cleanly. Test-connection and structured output need NO new deps (reuse `ai` + provider + `zod`); key encryption is built-in Vault, not a package. See `STACK.md`.

**Core technologies:**
- `@ai-sdk/anthropic@3.0.85` — Claude provider (`createAnthropic({ apiKey })`, model `claude-haiku-4-5`, bare id, $1/$5) — first-party, BYOK runtime instantiation.
- `@ai-sdk/deepseek@2.0.39` — DeepSeek provider (`createDeepSeek({ apiKey })`) — **major is 2.x, not 3.x**; model `deepseek-chat` → `deepseek-v4-flash` (alias DEPRECATES 2026-07-24; pin via a provider→modelId config map and re-verify at build).
- `@ai-sdk/google@3.0.83` — Gemini provider (already present), model `gemini-2.5-flash-lite` ($0.10/$0.40, free tier) — the cheap default workhorse.
- Supabase Vault (built-in) — `vault.create_secret` / `vault.decrypted_secrets`, authenticated encryption at rest, stable API, key-management owned by Supabase.

### Expected Features

The full feature landscape and prioritization are in `FEATURES.md`. Every feature either fills a pre-built seam or sits beside it — none rebuild the pipeline.

**Must have (table stakes / P1):**
- BYOK Settings: provider picker + paste key + encrypted at-rest (Vault, RLS) — the locked decision; AI can't authenticate without it.
- Memory-first dispatch (AI only on unseen) — the cost guardrail.
- One batched, deduped AI call per upload — cost + latency contract.
- Enum-constrained output (live per-user enum) + "none fits"/confidence schema — keeps AI inside the user's categories, avoids confidently-wrong pre-fills.
- SuggestionSlot pre-fill, no auto-commit; confirm persists + learns — the human-in-the-loop core value.
- Graceful degradation (no key / provider error → manual pick) — AI is strictly additive.
- Provenance badge (memória vs IA) — minimal, near-free trust affordance.

**Should have (P2):**
- Test-connection button (also a stated v1.4 target — promote into MVP if cheap).
- Confidence hint + low-confidence-first sorting in the review grid.
- Active-provider indicator / per-upload AI summary.

**Defer (v2+):**
- Provider A/B or auto-fallback; spouse/multi-user BYOK (schema already ready).
- Anti-features to refuse: auto-commit, per-transaction streaming, fine-tuning, multi-model voting, free-text category generation, app-side/Vercel-env key storage.

### Architecture Approach

Integration points were grepped from the live codebase (`ARCHITECTURE.md`). A new `lib/ai/` namespace holds the BYOK boundary (provider-factory, server-only settings decrypt, batched classify); `classifier/suggest.ts` gets its real body; `import.ts` (~line 434) reshapes the ingest loop to collect unique misses → one batched call → attach `row.suggestion`; `confirmImport` is unchanged (only confirm writes memory). Load-bearing invariants: **key never reaches the client**, **only `descriptor_norm` goes to the model** (no PII), **AI suggests / human confirms / only confirm learns**. Every failure mode (no key, bad key, 4xx/5xx/429, malformed output, Vault error) degrades to the existing manual pick inside an inner `try/catch` returning `{}` — the upload never fails because the AI did. Node runtime, `maxDuration` ≥ 60 on the import segment; `@ai-sdk/*` are pure JS (no `serverExternalPackages` change).

**Major components:**
1. `ai_settings` table + Vault + `get_ai_api_key()` SECURITY DEFINER RPC (migration 0033) — encrypted key reference, RLS-scoped.
2. `lib/ai/provider-factory.ts` — `modelFor(provider, model, apiKey)` switch → configured `@ai-sdk` LanguageModel; one place knows provider names.
3. `lib/ai/settings.server.ts` (`import 'server-only'`) + `lib/ai/classify.ts` — server-only decrypt read + batched `generateObject` with the live per-user enum.
4. `suggestCategory()` seam (wire) → `SuggestionSlot` chip in `import-review-table.tsx:771` (feed `row.suggestion`).
5. BYOK Settings surface under `conta/configuracoes-ia/` (mirror the `mei/configuracoes` RSC+form+action triad) + `saveAiSettings` / `testConnection` actions.

### Critical Pitfalls

Full list and pitfall→phase mapping in `PITFALLS.md`.

1. **BYOK key leaks to the client** (via `select('*')`, RSC prop serialization, or a `'use client'` import) — never select the key column in client-reachable queries; expose only `has_key` + `provider`; decrypt only inside the Server Action; `import 'server-only'`; grep bundle + Network tab during verify.
2. **Plaintext / deprecated-crypto at rest** — use Supabase Vault; the settings row holds only the Vault secret UUID; decrypt view server-only. Do NOT use pgsodium/TCE/hand-rolled pgcrypto.
3. **RLS gap on the new settings table** — enable RLS in the same migration; write all four command policies + `with check`; test cross-user locally (Vault's own view is not per-user RLS-scoped — the app row enforces isolation).
4. **DeepSeek silently breaks structured output** (no `json_schema`, only `json_object`) — per-provider adapter: DeepSeek uses `json_object` + enum-in-prompt + server-side Zod validate; keep the schema flat (Claude rejects `$ref`/`name`); handle `NoObjectGeneratedError` → manual fallback.
5. **Destructive prod verification of v1.3 debt** — isolate in its own phase; back up the prod DB first; confirm the throwaway `user_id`; double-confirm the delete; never run via the dev server (it points at PROD).

## Implications for Roadmap

Based on combined research, the strict dependency order is **encryption/storage → AI call → UI**, with the v1.3 debt kept entirely separate. Suggested phase clustering (phases continue from 14):

### Phase 1: Key Storage + BYOK Settings (Vault migration, RLS, test-connection)
**Rationale:** Nothing downstream can authenticate or decrypt without this; it is the root of the dependency chain. It is also where the three most sensitive pitfalls (1, 2, 3) are prevented.
**Delivers:** Migration `0033_ai_settings.sql` (table + RLS all-four policies + `with check` + Vault enable + `get_ai_api_key()` SECURITY DEFINER RPC); regenerated `database.types.ts`; `lib/ai/settings.server.ts` (server-only decrypt) + `lib/schemas/ai-settings.ts`; the `conta/configuracoes-ia/` RSC + write-only key form + `saveAiSettings`/`testConnection` actions.
**Addresses:** BYOK Settings (P1), test-connection (P2, promote if cheap).
**Avoids:** Pitfalls 1 (key leak), 2 (plaintext at rest), 3 (RLS gap).
**Uses:** Supabase Vault, `@ai-sdk/*` for the test ping.

### Phase 2: Classification Wire (provider factory + per-provider adapter + memory-first batch)
**Rationale:** The seam cannot be wired without the decrypt read and the factory from Phase 1. This is the milestone's core value.
**Delivers:** `lib/ai/provider-factory.ts` (+test); batched `lib/ai/classify.ts`; the real `suggestCategory()` body (live per-user enum + `generateObject` + `validateSuggestion` + inner `try/catch`→`{}`); reshaped `import.ts` ingest loop (collect unique misses → one batched call → attach `row.suggestion`); `maxDuration` confirmed.
**Implements:** provider-agnostic factory, live-enum structured output, memory-first batched call, graceful fallback.
**Avoids:** Pitfalls 4 (DeepSeek adapter), 5 (enum freshness/hallucination), 6 (LLM for known merchants), 8 (graceful fallback).

### Phase 3: Review-Grid Suggestion Affordances
**Rationale:** Needs suggestions flowing from Phase 2; pure UI on top of a proven pipeline.
**Delivers:** Feed `row.suggestion` to `<SuggestionSlot />` (`import-review-table.tsx:771`); provenance badge (memória vs IA) as P1; confidence hint + low-confidence-first sort as P2.
**Avoids:** Pitfall 7 (auto-commit — chip only; learning stays in `confirmImport`).

### Phase 4: v1.3 Debt Cleanup (ISOLATED)
**Rationale:** Independent of 1–3 and intentionally kept apart from feature commits because it contains a DESTRUCTIVE prod step.
**Delivers:** Redeploy G-07/G-08; hands-on prod walkthroughs MEI (12-06) + LGPD (12-07, incl. throwaway-account delete); Nyquist `VALIDATION.md` for Phases 12 + 13.
**Avoids:** Pitfall 9 — DB backup first, confirmed throwaway `user_id`, RLS-scoped cascade, double-confirmed delete, never via the dev server.

### Phase Ordering Rationale
- **Strict dependency chain:** storage/encryption (1) → factory + seam wire (2) → grid (3). The seam (2) imports the decrypt read and factory (1); the grid (3) renders suggestions produced by (2). The settings form can begin in parallel once the schema + save/test actions exist, but lands after the decrypt path is proven.
- **Batch + enum + "none fits" are one cohesive unit** (all properties of the single `generateObject` call sharing one Zod schema) — plan them together in Phase 2, not as separate phases.
- **Debt is isolated** because mixing a destructive prod delete into feature churn is a Pitfall-9 wrong-account hazard; the throwaway-delete must be a deliberate, double-confirmed step.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Classification Wire):** the DeepSeek `json_object` vs `json_schema` per-provider adapter and the Claude flat-schema constraint are subtle and provider-version-sensitive; A/B the three providers on real BR descriptors and re-verify the DeepSeek model id at build (alias deprecates 2026-07-24). Use `/gsd-plan-phase --research-phase` here.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Key Storage):** Vault + RLS + SECURITY DEFINER RPC patterns are well-documented and pinned in STACK/ARCHITECTURE; mirror the existing `mei/configuracoes` triad.
- **Phase 3 (Review Grid):** `@tanstack/react-table` + `SuggestionSlot` already exist; feeding a prop and adding a badge is established.
- **Phase 4 (v1.3 Debt):** no new patterns — operational care, not research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Exact versions + zod peer ranges from `npm view`; Vault, Gemini/Claude pricing, AI SDK patterns from official docs. DeepSeek model-id is the only near-term churn (pinned via config map). |
| Features | MEDIUM | AI-SDK enum/structured-output patterns MEDIUM-verified; Claude/Gemini pricing HIGH; DeepSeek model-id LOW (churn); UX norms LOW/convergent. Scope is well-bounded by pre-built seams. |
| Architecture | HIGH | Integration points read directly from the live codebase; Vault + provider patterns cross-checked against official docs. |
| Pitfalls | HIGH | Verified against Supabase, AI SDK, and Next.js security docs; DeepSeek schema limit cross-checked; project MEMORY/PROJECT.md authoritative for the debt hazards. |

**Overall confidence:** HIGH

### Gaps to Address
- **DeepSeek model-id transition (2026-07-24):** `deepseek-chat` alias deprecates → `deepseek-v4-flash`. Handle via a provider→modelId config map; re-verify the exact id at build time. (Phase 2 planning.)
- **DeepSeek structured-output round-trip:** must be proven end-to-end (`json_object` + Zod) before defaults lock — easy to ship Gemini-only and miss this. (Phase 2 verify.)
- **Local Supabase Vault extension:** `supabase_vault` must be enabled in dev for `vault.create_secret` to exist — verify before depending on it. (Phase 1 planning.)
- **`maxDuration` on the import segment:** confirm ≥ 60 covers parse + one batched LLM call. (Phase 2.)
- **Dev-server-points-at-PROD hazard:** load-bearing for Phase 4; ensure no destructive step runs through the dev server, and back up first.

## Sources

### Primary (HIGH confidence)
- Live codebase (grepped 2026-06-18): `src/lib/classifier/{suggest,memory}.ts`, `src/actions/import.ts`, `src/components/{suggestion-slot,import-review-table}.tsx`, `src/lib/supabase/{server,admin}.ts`, migrations 0021/0032, `mei/configuracoes`, `next.config.ts`, `package.json`.
- `npm view @ai-sdk/{anthropic,deepseek,google}` + `ai` + `zod` — exact versions + peer ranges.
- Supabase Vault docs — `vault.create_secret` / `vault.decrypted_secrets`, authenticated encryption, stable API.
- Supabase pgsodium/TCE deprecation docs + discussion #27109 — Vault is the recommended path.
- AI SDK docs (generateObject, provider management) + Anthropic/Google provider pages.
- Next.js security docs (Server Components/Actions, Data Security) — RSC prop serialization, `server-only`, taint, DAL.
- Anthropic `claude-api` skill — `claude-haiku-4-5` id, $1/$5, 200K context.
- Google AI pricing — `gemini-2.5-flash-lite` $0.10/$0.40, free tier.
- `.planning/PROJECT.md` — v1.4 goal, BYOK + Vault decisions, v1.3 debt list.

### Secondary (MEDIUM confidence)
- Requesty "Structured Outputs Across LLM Providers" — DeepSeek lacks `json_schema`; Claude no `name`/no recursive `$ref`; Gemini OpenAPI-subset.
- Vault `decrypted_secrets` service-role-only + SECURITY DEFINER per-user pattern (multiple sources agree).
- 2026 serverless/PFM write-ups — human-in-the-loop categorization UX norms.

### Tertiary (LOW confidence)
- DeepSeek pricing/model-id transition (`deepseek-chat` → `deepseek-v4-flash`, deprecation 2026-07-24) — single-vendor docs, near-term churn; pin/verify at build.

---
*Research completed: 2026-06-18*
*Ready for roadmap: yes*
