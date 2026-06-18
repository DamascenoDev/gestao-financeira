# Feature Research

**Domain:** AI-assisted transaction classification (BYOK multi-provider) for a single-user personal-finance app — milestone v1.4 "IA de Classificação"
**Researched:** 2026-06-18
**Confidence:** MEDIUM (AI-SDK enum/structured-output patterns MEDIUM-verified; provider pricing HIGH for Claude/Gemini, near-term LOW for DeepSeek model-id churn; UX norms LOW/convergent)

## Scope note

This research covers ONLY the new AI-classification feature as the user experiences it. The memory-first layer, ingest→review→confirm→learn pipeline, `@tanstack/react-table` review grid, and the additive seams (`suggestCategory()` null seam, `validateSuggestion` Zod-enum wrapper, `SuggestionSlot` UI) are **already built and shipped (v1.3)**. Every feature below either fills one of those seams or sits beside them — none rebuild the pipeline.

The classification flow, end-to-end, is:

```
upload statement → server parse → per-descriptor:
   memory hit?  ── YES ──► auto-classify (zero AI, current v1.3 behavior)
        │
        └── NO (unseen) ─► collect into batch
batch of unseen descriptors ── ONE AI call per upload ──► {category, confidence}[]
   → pre-fill SuggestionSlot in the review grid (NOT committed)
   → user confirms or overrides inline
   → ON CONFIRM ONLY: persist transaction category + write merchant_pattern (learn)
   → next upload: that descriptor is now a memory hit (no AI)
```

## Feature Landscape

### Table Stakes (Users Expect These)

Features without which the v1.4 milestone goal ("ligar IA no seam, memory-first, confirmação humana, BYOK") is not met.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Memory-first dispatch: AI fires only on cache-miss descriptors | Core cost guardrail; known merchants already auto-classify in v1.3 | LOW | Pure routing logic inside the existing `suggestCategory()` seam — partition parsed rows into `memoryHit[]` vs `unseen[]` before any AI call. Depends on existing `merchant_patterns` lookup. Testable: "Given an upload where every descriptor is already a saved pattern, no AI request is made." |
| Batch all unseen descriptors into ONE AI call per upload | Cost + latency; per-transaction calls burn money/time on a solved-shape problem | MEDIUM | Dedupe unseen descriptors (same merchant string appearing 5× = 1 entry), send the deduped list in a single `generateObject` call, map results back to all matching rows. Testable: "An upload with 12 unseen descriptors (3 duplicated) produces exactly 1 AI request carrying 9 distinct descriptors." |
| Enum-constrained output (only existing category names) | AI must never invent a category outside the user's editable category set | MEDIUM | `generateObject` with a Zod `z.enum(userCategories)` (or enum mode). `validateSuggestion` seam already wraps this. The enum is built **per-user at call time** from their current categories — not hardcoded. Testable: "AI output not in the user's category list is rejected and the row falls back to unclassified." |
| "AI unsure / none fits" handling | Short BR descriptors are often ambiguous; a forced wrong guess is worse than none | MEDIUM | Include a sentinel (`null` / "Sem sugestão") in the schema + a `confidence` field; below a threshold, leave the `SuggestionSlot` empty so the user picks manually. Avoids confidently-wrong pre-fills. Testable: "A descriptor the model returns low confidence for shows no pre-filled category, only the manual picker." |
| Suggestion pre-fills the review grid, never auto-commits | Locked decision; financial data demands human confirmation before it's truth | LOW | AI result populates `SuggestionSlot` as a *proposal*. The transaction is NOT written with that category until the user confirms. Mirrors the existing PDF "parse → review → confirm" contract. Testable: "After an upload, suggested rows exist in the review grid but querying transactions shows nothing persisted until confirm." |
| Confirm → persist + learn the pattern | The learning loop is the product's core value | LOW | On confirm (whether accepting the AI suggestion or overriding it), write the category AND upsert the `merchant_pattern` so the next upload is a memory hit. Already the v1.3 confirm behavior — AI just changes what's *pre-filled*, not what confirm does. Testable: "After confirming an AI-suggested row, re-uploading the same descriptor classifies via memory with no AI call." |
| BYOK Settings: pick provider + paste key, encrypted at-rest | No app-owned key; user holds their own Gemini/Claude/DeepSeek key, scoped + private | HIGH | Settings UI with provider picker + key field; key encrypted at-rest (Supabase Vault per PROJECT.md), `user_id`-scoped + RLS. Direct `@ai-sdk/*` provider packages (not AI Gateway — locked decision). Testable: "User saves a Gemini key; it is not readable in plaintext from the DB; another user_id cannot read it." |
| Graceful degradation: no key / provider error → manual pick still works | The app must function without AI; AI is additive, not load-bearing | MEDIUM | If no key configured, or the provider call throws/times out/rate-limits, skip AI silently and present the normal manual-pick review grid (exact v1.3 experience). Surface a non-blocking toast (`sonner`), never a hard failure. Testable: "With no key set, an upload with unseen descriptors still reaches a usable review grid; with a deliberately invalid key, the upload still completes via manual pick." |
| Suggestion provenance: memory-matched vs AI-suggested | User needs to know whether a category is a confirmed pattern or a guess to scrutinize | LOW | Badge/icon in the row: "memória" (confirmed pattern, high trust) vs "IA" (suggestion, review me). Cheap, high trust-value. Testable: "A memory-hit row and an AI-suggested row are visually distinguishable in the grid." |

### Differentiators (Competitive Advantage)

Not required to ship, but raise the quality of the confirm-loop. Each is small because the pipeline already exists.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Confidence hint on AI suggestions | Lets the user triage — eyeball low-confidence rows, trust high ones | LOW | Render the `confidence` from the AI object as a subtle cue (dot/percentage). Requires confidence in the schema (already needed for "none fits"). |
| Sort/flag low-confidence rows to the top of the review grid | Directs attention where overrides are most likely | LOW | `@tanstack/react-table` already does sorting; add a confidence column + default sort. Pure client-side. |
| "Test connection" button in BYOK Settings | Confirms the pasted key works before the user relies on it mid-upload | LOW-MEDIUM | One tiny throwaway classification/ping per provider; green/red result. Listed as a v1.4 target feature in PROJECT.md. |
| Active-provider indicator | At a glance, which provider/model is doing the classifying | LOW | Read current config, show "Classificando com: Gemini 2.5 Flash-Lite". |
| Per-upload AI summary ("8 novos classificados pela IA, 3 sem sugestão") | Closes the loop; user sees what AI did vs what needs them | LOW | Derived from the batch result counts; one toast or banner. |
| Bulk-accept high-confidence suggestions | Speeds the common case where AI nailed most rows | MEDIUM | "Aceitar todas acima de X%" — still a single explicit human action (not auto-commit), then persist+learn each. Keep behind an explicit click to preserve the confirmation contract. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-commit AI suggestions (skip confirmation) | "It's usually right, save me clicks" | Violates the locked human-in-the-loop decision; a silent misclassification corrupts goal-adherence math and is hard to notice/undo. Provider variance makes silent errors inevitable. | Pre-fill + one-click confirm; optional bulk-accept-above-threshold as an explicit action. |
| Per-transaction live streaming of classifications | Feels modern / real-time | Multiplies calls and latency for a single-user batch job; defeats the one-call-per-upload cost guardrail; `useObject` streaming UX is overkill for a confirm grid. | One batched `generateObject` per upload; render results when they arrive. |
| Fine-tuning a model on the user's history | "Make it learn *me*" | Cost, ops burden, and a moving target for a solo dev; the `merchant_patterns` memory already IS the personalization layer and is deterministic + free. | Memory-first patterns; AI only for genuinely new descriptors. |
| Multi-model voting / ensemble | "Higher accuracy" | 2-3× the cost/latency for marginal gain on short merchant strings; conflict resolution adds complexity; single-user app doesn't need it. | One provider per the user's BYOK choice; confidence + human confirm catches errors. |
| AI re-classifying already-memorized merchants | "Maybe the category changed" | Burns money/latency re-solving solved cases; user already owns the pattern and can edit it directly. | Memory always wins; user edits a pattern manually if a merchant's category should change. |
| Free-text category generation by the AI | "Let AI propose new categories" | Breaks enum constraint → unbounded category sprawl, breaks goal math which is keyed to the fixed category set. | Constrain to the user's existing categories; category management stays a manual, deliberate user action. |
| Storing the BYOK key app-side / in Vercel env | "Simpler than encrypting per-user" | It's the user's personal key in a multi-user-ready schema; an app-owned key defeats BYOK and would leak across the future spouse account. | Per-`user_id` encrypted key in Supabase Vault + RLS (locked decision). |
| OCR / per-bank PDF parsing in this milestone | "Some PDFs fail" | Out of scope for v1.4; orthogonal to classification; explicitly a deferred candidate in PROJECT.md. | Steer failing banks to OFX/CSV; revisit only if a real bank fails `getText`. |

## Feature Dependencies

```
BYOK Settings (key + provider, encrypted)
    └──required by──► AI classification call (suggestCategory seam)
                          └──requires──► Memory-first dispatch (partition hit/unseen)
                          └──requires──► Batch dedupe (one call per upload)
                          └──requires──► Enum-constrained output (validateSuggestion)
                                             └──requires──► "none fits" sentinel + confidence
                          └──produces──► SuggestionSlot pre-fill (review grid)
                                             └──then──► Confirm → persist + learn pattern
                                             └──enhanced by──► provenance badge, confidence hint,
                                                                low-confidence sort, bulk-accept

Graceful degradation ──wraps──► the entire AI call (no key / error → manual pick path)
"Test connection" ──enhances──► BYOK Settings
```

### Dependency Notes

- **AI call requires BYOK Settings:** no key → no provider → AI path is skipped entirely (degradation path). Settings must ship in or before the phase that wires the AI call.
- **Batch + enum + "none fits" are one cohesive unit:** they're all properties of the single `generateObject` call. Plan them together, not as separate phases — the schema (`{category: enum|sentinel, confidence: number}`) is shared by all three and by the `validateSuggestion` seam.
- **SuggestionSlot pre-fill depends on the AI result shape:** provenance badge + confidence hint need `confidence` and a source tag in the result the UI receives.
- **Confirm → persist + learn is unchanged from v1.3** — the AI feature only changes what is *pre-filled* in the slot, not what confirm does. This is the lowest-risk dependency: the learning loop already works.
- **Graceful degradation wraps everything:** every AI-touching path (no key, invalid key, timeout, rate-limit, malformed output) must fall back to the existing manual review grid. This is a cross-cutting requirement, not a single feature.

## MVP Definition

### Launch With (v1.4 core — CLS-AI + BYOK)

- [ ] **BYOK Settings: provider picker + paste key + encrypted at-rest (Vault, RLS)** — without it the AI path can't authenticate; the locked BYOK decision.
- [ ] **Memory-first dispatch (AI only on unseen)** — the cost guardrail; without it AI fires on solved cases.
- [ ] **One batched AI call per upload (deduped unseen descriptors)** — cost + latency contract.
- [ ] **Enum-constrained output + "none fits"/confidence schema** — keeps AI inside the user's categories and avoids confidently-wrong pre-fills.
- [ ] **SuggestionSlot pre-fill, no auto-commit; confirm persists + learns** — the human-in-the-loop core value.
- [ ] **Graceful degradation (no key / provider error → manual pick)** — the app must still work; AI is additive.
- [ ] **Provenance badge (memória vs IA)** — minimal trust affordance; nearly free.

### Add After Validation (v1.x)

- [ ] **Test-connection button** — add once the basic save+use flow is proven (also a stated v1.4 target; promote into MVP if cheap).
- [ ] **Confidence hint + low-confidence-first sorting** — trigger: user reports trouble spotting which rows to review.
- [ ] **Active-provider indicator + per-upload AI summary** — trigger: more than one provider in regular use, or user asks "what did the AI do?".
- [ ] **Bulk-accept above threshold** — trigger: uploads routinely produce many high-confidence suggestions and per-row confirm feels tedious.

### Future Consideration (v2+)

- [ ] **Provider A/B or auto-fallback between configured providers** — defer until cost/quality differences actually bite; adds config complexity.
- [ ] **Spouse/multi-user BYOK (each account its own key)** — schema is ready; defer the UI until the shared-account milestone.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| BYOK Settings (key + provider, encrypted) | HIGH | HIGH | P1 |
| Memory-first dispatch (AI on unseen only) | HIGH | LOW | P1 |
| One batched AI call per upload | HIGH | MEDIUM | P1 |
| Enum-constrained output + "none fits"/confidence | HIGH | MEDIUM | P1 |
| SuggestionSlot pre-fill, confirm persists + learns | HIGH | LOW | P1 |
| Graceful degradation (no key / error → manual) | HIGH | MEDIUM | P1 |
| Provenance badge (memória vs IA) | MEDIUM | LOW | P1 |
| Test-connection button | MEDIUM | LOW-MEDIUM | P2 |
| Confidence hint + low-confidence-first sort | MEDIUM | LOW | P2 |
| Active-provider indicator / AI summary | LOW | LOW | P2 |
| Bulk-accept above threshold | MEDIUM | MEDIUM | P2 |
| Provider auto-fallback / A/B | LOW | MEDIUM | P3 |

**Priority key:** P1 = must have for the v1.4 milestone · P2 = should have, add when possible · P3 = future.

## Competitor / Norm Feature Analysis

| Feature | Typical PFM apps (Mint/YNAB-style) | This app's approach |
|---------|--------------------------------------|---------------------|
| Categorization | Server-side rules + ML, mostly auto-applied | Memory patterns (deterministic) first; AI only for genuinely new merchants |
| Human confirmation | Often auto-categorized, user corrects after the fact | Confirm-before-persist; nothing AI-suggested is truth until the user accepts |
| Model ownership | Vendor-hosted model, opaque | BYOK — user's own Gemini/Claude/DeepSeek key, encrypted per-user |
| Learning | Global model + per-user overrides | Per-user `merchant_patterns` learned on each confirm |
| Provider lock-in | Single vendor | Swappable provider via direct `@ai-sdk/*` packages |

## Provider note (for requirements, not a feature)

All three target providers classify short BR merchant descriptors well; the choice is cost/free-tier and which key the user holds — not accuracy. Current IDs/prices for the requirements doc:

- **Gemini 2.5 Flash-Lite** — ~$0.10/$0.40 per M tokens, has a free tier (HIGH, CLAUDE.md source). The cheap default workhorse.
- **Claude Haiku 4.5** — id `claude-haiku-4-5`, $1.00/$5.00 per M tokens, 200K context (HIGH, Claude API skill).
- **DeepSeek** — `deepseek-chat` deprecates 2026-07-24, now routes to `deepseek-v4-flash` (~$0.14 cache-miss in / $0.28 out per M) (LOW — model-id churn; pin/verify the id at build time).

With memory-first + one batched call per upload, real AI spend stays near zero regardless of provider.

## Sources

- CLAUDE.md "AI-assisted classification" deep dive — generateObject/Output enum classification, AI SDK direct providers, memory-first cost model (HIGH, Context7 `/websites/ai-sdk_dev` + Gemini pricing docs)
- PROJECT.md v1.4 milestone — locked decisions: memory-first, confirm-before-learn, BYOK direct `@ai-sdk`, Supabase Vault key encryption, never auto-commit
- Vercel AI SDK docs (generateObject enum mode + Zod object schema, schema validation/throw, .describe() steering) — ai-sdk.dev / Vercel Academy text-classification (MEDIUM, verified)
- Claude API skill (`claude-api`) — Haiku 4.5 id and $1/$5 pricing, 200K context (HIGH)
- Web search — DeepSeek pricing/model-id transition deepseek-chat→deepseek-v4-flash, deprecation 2026-07-24 (LOW, single-vendor docs, near-term churn); PFM human-in-the-loop categorization UX norms (LOW, convergent)

---
*Feature research for: AI-assisted transaction classification with BYOK (v1.4)*
*Researched: 2026-06-18*
