# Phase 15: Classification Wire - Research

**Researched:** 2026-06-18
**Domain:** Batched, memory-first, enum-constrained LLM classification wired into a shipped Next.js 16 / TS-strict / Supabase ingest pipeline, over `@ai-sdk/google` + `@ai-sdk/anthropic` v3 via `LanguageModelV3.doGenerate` (NO `ai` umbrella)
**Confidence:** HIGH (structured-output path verified by reading the INSTALLED provider dist; codebase read directly; model ids cross-checked against live provider catalogs)

## Summary

Phase 15 fills the one inert seam left after Phase 14: it gives `suggestCategory()` a real body and wires a **single batched, deduplicated, memory-miss-only** LLM call into `ingestStatement` that attaches a non-binding `row.suggestion = { categoryId, confidence, source: 'ia' }` to each review row. Everything is additive — the v1.3 ingest→review→confirm→learn pipeline and the memory-first `lookupMemory` front door are untouched; the AI never auto-commits and the upload **never** fails because of it. The phase covers CLSAI-01..06.

The single load-bearing technical question — *how do you get schema-constrained JSON out of BOTH Gemini and Claude without the `ai` umbrella package?* — is **resolved and verified against the installed dist**: `LanguageModelV3CallOptions.responseFormat` accepts `{ type: 'json', schema: JSONSchema7 }`, and **both** installed providers implement it inside `doGenerate`. Google maps it to `responseMimeType: 'application/json'` + `responseSchema` (OpenAPI subset); Anthropic injects a synthetic `json` tool and **converts the tool-call back into a `{ type: 'text', text: JSON.stringify(input) }` content part** — so for both providers the structured payload arrives uniformly as a `text` part in `result.content`. **Recommendation: stay on `doGenerate` (no `ai` umbrella), pass a flat JSON-schema via `responseFormat`, extract the single `text` part, `JSON.parse` it, validate with a flat Zod schema, then post-validate each `categoryId` with the existing `validateSuggestion`.** This keeps the deliberate Phase-14 architecture (`LanguageModelV3` from `@ai-sdk/provider`, no umbrella) and keeps `tests/pii-guard.test.ts`'s "no `ai` umbrella" invariant green.

**Primary recommendation:** New `src/lib/ai/classify.ts` → `classifyDescriptors(descriptors, categories, aiSettings)` builds ONE `doGenerate` call with a FLAT schema `{ results: [{ descriptor, categoryId: string|null, confidence: number }] }`, where `categoryId` is a **free string in-schema** (NOT a UUID enum — Gemini's OpenAPI subset + Claude both choke on a 50-UUID enum) and is gated to owned ids by `validateSuggestion` post-hoc. The category list goes in the **prompt** as `id: name` lines (not the schema). Wrap the whole call in an inner `try/catch` → returns `Map<descriptorNorm, {categoryId,confidence}>` or an empty Map. In `import.ts`, after the memory hit/miss loop, collect the **unique miss `descriptor_norm` set**, make exactly one call (zero if the set is empty), and map results back to rows by `descriptor_norm` (M rows ≥ N unique). Add `maxDuration = 60` to the import segment (currently the page has `30`, the action has **none**).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Arquitetura da chamada batched**
- New `src/lib/ai/classify.ts` with `classifyDescriptors(descriptors: string[], categories: {id,name}[], aiSettings)` → **ONE** structured-output call over **unique miss** descriptors → returns `Map<descriptorNorm, { categoryId: string | null, confidence: number }>`.
- The `suggestCategory()` seam (`src/lib/classifier/suggest.ts`) stays as a PII-safe 1-item wrapper delegating to `classify` (preserves the contract + `suggest.test.ts`); `import.ts`'s hot path uses the **batch** directly.
- **Flat** output schema (Claude-safe, no `$ref`/`name`): `{ results: [{ descriptor: string, categoryId: string | null, confidence: number }] }`. `categoryId` validated by `validateSuggestion` against owned ids → `null` if the model invents a non-owned id.
- Wire in `src/actions/import.ts`: after computing memory hits/misses, collect the **unique miss** `descriptor_norm` → 1 call → attach `row.suggestion` per row. **NEVER** set `row.category_id` (no auto-apply).

**Memory-first + batch + enum**
- AI runs **only** for `descriptor_norm` that MISSED in `lookupMemory`, **deduplicated**. **Zero** call if no miss (verifiable memory-first — cost ∝ unique-unseen, not ∝ total rows).
- The category enum is built from `categoryList` already fetched in `import.ts` (~:392) **at call time** (fresh — a category rename/edit between uploads never produces a stale/invented category).
- "Nothing fits" → `categoryId: null` → empty `row.suggestion` (slot stays empty, no guess).
- `row.suggestion` shape: `{ categoryId, confidence, source: 'ia' }`, attached to `ParsedReviewRow` (new optional field, persisted in the jsonb `parsed_rows`). Phase 16 displays; the user applies it on the grid. `confidence` (0-1) produced NOW, consumed in Phase 16.

**Segurança / fallback / PII / testes**
- Provider + key come from `getDecryptedAiSettings()` (server-only, Phase 14). If it returns `null` (no key) OR any error (401/invalid key, 429/quota, 5xx, `NoObjectGeneratedError`, malformed JSON) → an **inner** `try/catch` → empty suggestions, **upload proceeds normally**, non-blocking note in summary/toast. Upload + review grid stay fully usable.
- PII: sends **ONLY** `descriptor_norm` (never amount/date/raw/`descriptor` cru). The prompt lists categories as `id: name` + the list of normalized descriptors. (SEC-03 — the seam contract.)
- `tests/pii-guard.test.ts`: **update** assertions (b)/(c) — from "suggestCategory returns null / classifier makes no fetch" to the new invariant: the AI call carries **only** `descriptor_norm`, never amount/raw/PII. Keep a guard asserting the sent payload contains no amount/raw/date. Allowed providers stay Gemini+Claude (no DeepSeek).
- `merchant_patterns` is still written **ONLY** in `confirmImport` on human confirm — the v1.3 confirm/learn loop stays intact (NO auto-commit). `suggestCategory`/`classify` never write.
- Confirm `maxDuration ≥ 60` on the import route/segment (parse + 1 batched AI call).

### Claude's Discretion
- Exact function/column names, the exact prompt format, the type of the `suggestion` field on `ParsedReviewRow`, and how the `Map` maps back to rows — at discretion, following existing conventions.
- Models: use Phase 14's per-provider `DEFAULT_MODEL` (`gemini-2.5-flash-lite` / `claude-haiku-4-5`); re-verify model-ids at build (research flag).
- `generateObject` (AI SDK umbrella) vs direct `doGenerate` — at discretion. Phase 14 avoided the `ai` umbrella and used `LanguageModelV3.doGenerate`; replicate/evaluate per what gives clean structured-output for Gemini+Claude.
  - **Research recommendation (this doc): stay on `doGenerate`.** See Architecture Patterns → Pattern 1. The umbrella is not needed and re-adding it breaks a pinned test invariant.

### Deferred Ideas (OUT OF SCOPE)
- Review-grid affordances (provenance badge memory vs IA, confidence hint, low-confidence-first sort) — Phase 16 (CLSAI-07/08). This phase only PRODUCES `row.suggestion` + `confidence`.
- DeepSeek as a 3rd provider — Future (CLSAI-F1).
- Provider A/B / auto-fallback — Future (CLSAI-F3).
- PROD push of 0033 (Phase 14) — deferred human item; Phase 15 build/test runs on LOCAL (which already has `ai_settings` + RPCs).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLSAI-01 | For a new descriptor (memory miss), the system auto-suggests a category via AI, pre-filled in the review grid's SuggestionSlot | `classifyDescriptors` → `row.suggestion`; Pattern 1 (doGenerate structured), Pattern 4 (import.ts wiring), Code Examples §classify.ts / §import loop. (Slot rendering is Phase 16; this phase only attaches `row.suggestion`.) |
| CLSAI-02 | AI runs **only on cache-miss** — a descriptor already known to memory does NOT trigger an AI call (memory-first) | Memory-first preserved: `lookupMemory` hit path unchanged; only MISS `descriptor_norm` are collected. Pattern 4; Validation edge "0-call-when-all-hits" |
| CLSAI-03 | Unseen descriptors of an upload are **deduped and grouped into a single AI call per upload** | Unique `Set<descriptor_norm>` → one `doGenerate`. Pattern 4; Pitfall 1 (one-call invariant); Validation edge "1-call-N-unique" |
| CLSAI-04 | Suggestion **restricted to the user's current categories** (live enum, read at call time); "nothing fits" → empty slot | Fresh `categoryList` (~:392) into the prompt; `validateSuggestion` post-gate → `null`. Pattern 2/3; Pitfall 2 (enum drift); Validation edge "enum-drift→null" |
| CLSAI-05 | **No suggestion is auto-committed** — only becomes a saved pattern on user confirm; v1.3 confirm/learn loop intact | `row.category_id` never set; `merchant_patterns` write stays only in `confirmImport`. Pattern 4; Pitfall 3; Validation edge "no-auto-commit" |
| CLSAI-06 | No key / provider error / rate-limit / malformed output **degrades gracefully** to manual pick — upload never fails because of AI | Inner `try/catch` → empty Map; non-blocking summary note. Pattern 5; Pitfall 4; Validation edges "fallback-no-key" / "fallback-error" |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Memory hit/miss decision | API/Backend (`lookupMemory`, RLS read) | Database (`merchant_patterns` + RLS) | Already lives here; unchanged. The miss SET is what the AI consumes |
| Unique-miss collection + result→row map-back | API/Backend (`import.ts` ingest loop, Node runtime) | — | Pure server logic over the already-fetched rows; no new tier |
| Batched LLM call + schema-constrained JSON | API/Backend (`classify.ts`, server-only via decrypt DAL) | LLM (Gemini/Claude over `doGenerate`) | Key + provider SDK are server-only; the call is one-shot structured, not streamed |
| Enum gate (owned-id validation) | API/Backend (`validateSuggestion`) | — | Security boundary (SEC-03) — must run server-side after the model returns |
| Suggestion persistence (`row.suggestion` in jsonb) | Database (`statements.parsed_rows` jsonb, additive) | — | Read back by the review RSC without re-parse; same store as the rest of the row |
| Suggestion DISPLAY (slot/badge/sort) | Frontend (review grid) | — | **Phase 16, out of scope here** — this phase only produces the data |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@ai-sdk/google` | 3.0.83 (installed) | Gemini provider; `responseFormat: json` → `responseMimeType` + `responseSchema` | Already installed (Phase 14). `createGoogleGenerativeAI({apiKey})(model).doGenerate(...)`. `[VERIFIED: node_modules/@ai-sdk/google/package.json + dist read]` |
| `@ai-sdk/anthropic` | 3.0.85 (installed) | Claude provider; `responseFormat: json` → synthetic `json` tool → text part | Already installed (Phase 14). `createAnthropic({apiKey})(model).doGenerate(...)`. `[VERIFIED: node_modules/@ai-sdk/anthropic/package.json + dist read]` |
| `@ai-sdk/provider` | 3.0.10 (installed) | `LanguageModelV3`, `APICallError`, the `responseFormat`/`LanguageModelV3Prompt` types | Already a (transitive) dep used directly by `provider-factory.ts` + `map-provider-error.ts`. `[VERIFIED: node_modules/@ai-sdk/provider/package.json]` |
| `zod` | 4.4.x (installed) | Flat output schema validation + JSON-schema source for `responseFormat` | Already present; `validateSuggestion` already uses `z.enum`. No new dep. `[VERIFIED: package.json]` |

**No new packages.** The phase ships entirely on what Phase 14 already installed.

> **`ai` umbrella: do NOT add.** It is **not** installed (confirmed: `cat node_modules/ai/package.json` → absent), Phase 14 deliberately avoided it, and `tests/pii-guard.test.ts:39` asserts `aiDeps === ['@ai-sdk/anthropic', '@ai-sdk/google']` — adding `ai` turns that test RED. `generateObject` is unnecessary because `doGenerate` + `responseFormat: { type:'json', schema }` already gives schema-constrained JSON on both providers (verified below). `[VERIFIED: dist read]`

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | The whole call path is `provider-factory.modelFor()` (exists) + `doGenerate` + `JSON.parse` + Zod + `validateSuggestion` (exists). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `doGenerate` + `responseFormat` (no umbrella) | Add `ai` + `generateObject(model, schema)` | `generateObject` would normalize provider quirks + parse + throw `NoObjectGeneratedError` for you — but it's a **new dep that breaks the pinned `pii-guard` invariant** and reverses Phase 14's deliberate choice. Both providers already surface the JSON as a `text` part via `doGenerate`, so the umbrella buys ~15 lines of parsing, not capability. **Stay on `doGenerate`.** |
| `categoryId` as a free string + post-hoc `validateSuggestion` | `categoryId` as a `z.enum([...50 UUIDs])` in the schema | The in-schema enum is the trap: Gemini's OpenAPI subset + Claude's flat-schema constraint both handle a large UUID enum poorly, and the enum would be baked into the JSON-schema sent to the model. **Free string in-schema, enum-gate after** is the verified-safe shape (matches `validateSuggestion`'s existing design + PITFALLS Pitfall 5). |
| One batched call | Per-descriptor calls | Per-descriptor multiplies cost/latency ∝ rows and regresses the memory-first guarantee. CONTEXT locks "ONE call". |
| Categories in the **prompt** (`id: name`) | Categories in the **schema** (enum) | Prompt-list keeps the schema flat + provider-portable and lets the model return `null` for "nothing fits". Schema-enum would also need re-injection per upload anyway (fresh enum). Prompt is simpler and portable. |

**Installation:**
```bash
# NOTHING to install. Phase 14 already added @ai-sdk/google + @ai-sdk/anthropic.
# Confirm they're present and the ai umbrella is still ABSENT (pii-guard invariant):
node -e "const p=require('./package.json');const d={...p.dependencies,...p.devDependencies};console.log(Object.keys(d).filter(k=>k==='ai'||k.startsWith('@ai-sdk')).sort())"
# expect: [ '@ai-sdk/anthropic', '@ai-sdk/google' ]   (NO 'ai')
```

**Version verification (run at build):**
```bash
cat node_modules/@ai-sdk/google/package.json    | grep '"version"'   # expect 3.0.x
cat node_modules/@ai-sdk/anthropic/package.json | grep '"version"'   # expect 3.0.x
cat node_modules/@ai-sdk/provider/package.json  | grep '"version"'   # expect 3.0.x
# Model ids validate for free on the first real classify (or a Phase-14 test-connection).
```

## Package Legitimacy Audit

> Phase 15 installs **zero** new packages — all AI deps were vetted + installed in Phase 14. Audit included for completeness; no new legitimacy gate is required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@ai-sdk/google` | npm | already installed (Phase 14) | 5.38M/wk | github.com/vercel/ai | OK (vetted P14) | No action — already present |
| `@ai-sdk/anthropic` | npm | already installed (Phase 14) | 7.22M/wk | github.com/vercel/ai | OK (vetted P14) | No action — already present |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none (no new installs). The planner does **not** need a `checkpoint:human-verify` install task this phase.

## Architecture Patterns

### System Architecture Diagram

```
ingestStatement (src/actions/import.ts — 'use server', NODE runtime, maxDuration=60)
│
├─ download + parse → rawRows[]  (UNCHANGED)
├─ fetch categoryList (id,name) once  (~:392, UNCHANGED — this is the live enum)
├─ batch dedupe-key duplicate check  (UNCHANGED)
│
├─ PASS 1 — per row: memory lookup (UNCHANGED front door)
│     lookupMemory(supabase, descriptor_norm)
│       ├─ HIT  → category_id + reserva_id + source='memória'   (NO AI, ever)
│       └─ MISS → record descriptor_norm into a Set<string> missNorms
│                 (row stays category_id=null, source=null)
│
├─ COLLECT  uniqueMisses = [...missNorms]      // deduped; M rows ≥ N unique
│
├─ IF uniqueMisses.length === 0  → skip AI entirely (memory-first, 0 calls)  ◄── CLSAI-02
│  ELSE:
│     getDecryptedAiSettings()   ('server-only' DAL, Phase 14)
│        └─ null (no key) → skip; mark summary.iaIndisponivel (silent/expected)  ◄── CLSAI-06
│     classifyDescriptors(uniqueMisses, categoryList, aiSettings)   ◄── ONE call (CLSAI-03)
│        ├─ modelFor(provider, model, apiKey)  → LanguageModelV3   (provider-factory, exists)
│        ├─ doGenerate({ prompt:[system, user(text)], responseFormat:{type:'json',schema}, maxOutputTokens })
│        │     PII: prompt carries ONLY descriptor_norm + "id: name" lines   ◄── SEC-03
│        ├─ extract the single text part → JSON.parse → Zod flat-schema parse
│        ├─ per result: validateSuggestion(categoryId, categoryList) → owned id | null  ◄── CLSAI-04
│        └─ try/catch (any error/malformed) → return EMPTY Map; mark iaIndisponivel  ◄── CLSAI-06
│     → Map<descriptorNorm, { categoryId|null, confidence }>
│
├─ PASS 2 — map results back: for each MISS row,
│     suggestion = map.get(row.descriptor_norm)
│     row.suggestion = suggestion ? { ...suggestion, source:'ia' } : undefined
│     row.category_id stays NULL  ◄── CLSAI-05 (NO auto-commit)
│
├─ persist parsed_rows (jsonb, now carrying optional row.suggestion)  (additive)
└─ return { rows, summary(+ optional iaIndisponivel note) }

confirmImport (UNCHANGED) — the ONLY writer of merchant_patterns, on human confirm.
```

A reader can trace CLSAI-02/03/04/05/06 from input to output by following the arrows: memory gates the AI (02), the unique Set forces one call (03), the prompt-enum + `validateSuggestion` constrain output (04), `row.category_id` never gets set (05), and every failure path returns an empty Map without throwing (06).

### Recommended Project Structure
```
src/lib/ai/
├── classify.ts          # NEW — classifyDescriptors(): ONE doGenerate call, flat schema, enum-gate, try/catch→{}
├── classify.test.ts     # NEW — schema parse, validateSuggestion gate, fallback→empty, payload-only-descriptorNorm
├── provider-factory.ts  # EXISTS (modelFor) — reused as-is
├── settings.server.ts   # EXISTS (getDecryptedAiSettings) — reused as-is
├── settings.ts          # EXISTS (DEFAULT_MODEL) — reused as-is
└── map-provider-error.ts# EXISTS — optional reuse for the iaIndisponivel note copy
src/lib/classifier/
└── suggest.ts           # EDIT — suggestCategory() delegates to classify (1-item wrapper), keeps PII-safe contract
src/lib/parsers/
└── types.ts             # EDIT — extend ParsedReviewRow with suggestion?: { categoryId, confidence, source:'ia' }
src/actions/
└── import.ts            # EDIT — reshape the ingest loop (PASS1 memory / COLLECT / ONE call / PASS2 map-back);
                         #        add `export const maxDuration = 60` (segment-level); summary iaIndisponivel note
tests/
└── pii-guard.test.ts    # EDIT — assertions (b)/(c) → "payload carries only descriptorNorm, no amount/raw/PII"
src/app/(app)/importar/
└── page.tsx             # MAYBE EDIT — currently `export const maxDuration = 30`; raise to 60 OR set on the action
```

### Pattern 1: Schema-constrained JSON via `doGenerate` (no `ai` umbrella) — VERIFIED on both providers

**What:** Call `model.doGenerate({ prompt, responseFormat: { type: 'json', schema }, maxOutputTokens })`. Both installed providers honor `responseFormat: { type: 'json', schema }` and surface the JSON as a **`text` content part**:
- **Google** (`@ai-sdk/google@3.0.83`, `dist/index.mjs:1578-1582`): sets `responseMimeType: 'application/json'` and `responseSchema = convertJSONSchemaToOpenAPISchema(schema)` (when `googleOptions.structuredOutputs` defaults true). Result is plain JSON text.
- **Anthropic** (`@ai-sdk/anthropic@3.0.85`, `dist/index.mjs:3452-3456, 3920-3925`): builds a synthetic `jsonResponseTool` named `json` with `inputSchema = schema`, forces it, and on response **converts the tool-call into `{ type: 'text', text: JSON.stringify(part.input) }`**. **Requires `schema != null`** (`:3389-3393` warns/needs a schema) — always pass one.

**When to use:** `classify.ts`'s single batched call.

**Why:** Keeps the deliberate Phase-14 architecture (direct `LanguageModelV3`, no umbrella), keeps `pii-guard` green, and is provider-portable because the extraction is uniform (one `text` part → `JSON.parse`).

**Build-accurate call shape (`doGenerate` prompt is the INTERNAL `LanguageModelV3Prompt`, not the user-facing prompt):**
```typescript
// Source: node_modules/@ai-sdk/provider/dist/index.d.ts (LanguageModelV3CallOptions, LanguageModelV3Message)
const result = await model.doGenerate({
  prompt: [
    { role: 'system', content: SYSTEM_PROMPT },                    // string content for system
    { role: 'user', content: [{ type: 'text', text: userText }] }, // user content is an array of parts
  ],
  responseFormat: { type: 'json', schema: FLAT_JSON_SCHEMA }, // JSONSchema7 — schema REQUIRED for Anthropic
  maxOutputTokens: 1500,        // bound cost; one object per unique descriptor is small
  temperature: 0,               // deterministic classification
  // maxRetries is NOT a doGenerate option — retry policy is umbrella-level; we don't retry (fallback instead)
})
// Extract the structured JSON (uniform across both providers):
const textPart = result.content.find((c) => c.type === 'text')
const json = JSON.parse(textPart?.text ?? '')   // throws on malformed → caught by the inner try/catch
```

> Note on the result type: `result.content` is `Array<LanguageModelV3Content>` where the text variant is `{ type: 'text'; text: string }`. Anthropic's json-tool output is re-emitted as exactly this text variant (`:3924-3925`), so a single `.find(c => c.type === 'text')` works for both. `[VERIFIED: dist read of both providers]`

### Pattern 2: Flat output schema — `categoryId` as free string, enum-gated AFTER

**What:** The JSON schema is intentionally flat and provider-portable: a `results` array of `{ descriptor, categoryId: string|null, confidence: number }`. `categoryId` is a **plain string** (nullable) in the schema — NOT a `z.enum` of UUIDs. The owned-id constraint is applied **after** the model returns, by the existing `validateSuggestion(candidate, categories)`.

**When to use:** `classify.ts` schema + the per-result gate.

**Why:** A 50-UUID enum embedded in the JSON-schema is the multi-provider trap (PITFALLS Pitfall 4/5 + STACK: Gemini OpenAPI subset, Claude flat-only). A free string keeps the schema flat (`$ref`-free, `name`-free — Claude-safe) and `validateSuggestion` already exists as the SEC-03 gate. Cleaner, verified, and matches `suggest.ts`'s documented design.

```typescript
// src/lib/ai/classify.ts (schema)
import { z } from 'zod'
const classifyResultSchema = z.object({
  results: z.array(
    z.object({
      descriptor: z.string(),
      categoryId: z.string().nullable(),  // free string; enum-gate is validateSuggestion, NOT here
      confidence: z.number().min(0).max(1),
    }),
  ),
})
// Convert to JSONSchema7 for responseFormat.schema (zod v4 → JSON schema; flat, no $ref/recursion).
```

### Pattern 3: Categories in the PROMPT (fresh per call), null escape hatch

**What:** The user's live `categoryList` (already fetched at `import.ts:392`) is rendered into the **user prompt** as `id: name` lines at call time, with an explicit instruction to return `categoryId: null` when nothing fits. The enum is NOT cached and NOT in the schema.

**When to use:** `classify.ts` prompt builder.

**Why:** Fresh-per-call defeats enum drift (a category renamed/deleted between uploads — PITFALLS Pitfall 5). Prompt-listing keeps the schema flat and portable; the null escape hatch prevents forced hallucination.

```typescript
const SYSTEM_PROMPT = [
  'Você classifica descritores de transações financeiras brasileiras em categorias.',
  'Receberá uma lista de categorias (id: nome) e uma lista de descritores normalizados.',
  'Para cada descritor, escolha o id da categoria que melhor se encaixa.',
  'Se NENHUMA categoria se encaixar com confiança, retorne categoryId: null para esse descritor.',
  'confidence é um número de 0 a 1 indicando sua certeza. Responda APENAS o JSON do schema.',
].join(' ')

function buildUserText(descriptors: string[], categories: { id: string; name: string }[]): string {
  const catLines = categories.map((c) => `${c.id}: ${c.name}`).join('\n')
  const descLines = descriptors.map((d) => `- ${d}`).join('\n')  // descriptor_norm ONLY — no PII
  return `Categorias:\n${catLines}\n\nDescritores:\n${descLines}`
}
```

### Pattern 4: import.ts loop reshape — PASS1 memory / COLLECT / ONE call / PASS2 map-back

**What:** Split the existing single per-row loop into two passes around one batched call.
- **PASS 1** keeps the current `lookupMemory` per-row logic exactly; on a MISS it records `raw.descriptor_norm` into a `Set<string>` instead of calling the seam per-row. (Remove the per-row `await suggestCategory(...)` from the hot path.)
- **COLLECT** materializes `uniqueMisses = [...missNorms]`. If empty → no AI.
- **ONE call** to `classifyDescriptors(uniqueMisses, categoryList, aiSettings)` → `Map`.
- **PASS 2** attaches `row.suggestion` to each miss row by `descriptor_norm` (M rows can share one descriptor → same suggestion). **Never** set `row.category_id`.

**Where the try/catch wraps:** inside `classifyDescriptors` (returns an empty Map on any failure) AND a thin guard in `import.ts` around `getDecryptedAiSettings()` (null → skip). The ingest action itself must never throw from the AI path.

**Why:** This is the literal encoding of CLSAI-02/03/05/06.

```typescript
// src/actions/import.ts — replacing the current single loop (lines ~415-448)
const missNorms = new Set<string>()
const rows: ParsedReviewRow[] = []
for (let i = 0; i < rawRows.length; i += 1) {
  const raw = rawRows[i]!
  const key = keysByRaw[i]!
  const hit = await lookupMemory(supabase, raw.descriptor_norm)  // UNCHANGED memory-first front door
  let categoryId: string | null = null
  let reservaId: string | null = null
  let source: ParsedReviewRow['classification_source'] = null
  if (hit) {
    categoryId = hit.category_id
    reservaId = hit.reserva_id
    source = 'memória'
  } else {
    missNorms.add(raw.descriptor_norm)  // collect; DO NOT call AI per row
  }
  rows.push({
    ...raw, dedupe_key: key, category_id: categoryId, reserva_id: reservaId,
    classification_source: source, is_recurring: false, duplicate: dupSet.has(key),
  })
}

// ONE batched call over unique misses (zero calls if no miss → CLSAI-02/03)
let iaIndisponivel = false
if (missNorms.size > 0) {
  const aiSettings = await getDecryptedAiSettings()   // server-only DAL (Phase 14)
  if (!aiSettings) {
    iaIndisponivel = true   // no key — expected, silent
  } else {
    const suggestions = await classifyDescriptors([...missNorms], categoryList, aiSettings)
    if (suggestions.size === 0) iaIndisponivel = true   // empty Map = no-key-handled-above OR an error caught inside
    for (const row of rows) {
      if (row.category_id !== null) continue            // memory hit — never overwrite (CLSAI-05)
      const s = suggestions.get(row.descriptor_norm)
      if (s && s.categoryId !== null) {
        row.suggestion = { categoryId: s.categoryId, confidence: s.confidence, source: 'ia' }
      }
      // NB: row.category_id stays NULL — suggestion is a hint only (CLSAI-05, no auto-commit)
    }
  }
}
```

> `iaIndisponivel` distinction: keep it **non-blocking** and additive on the summary (e.g. an optional `iaIndisponivel?: boolean` on `IngestSummary`, surfaced as a toast in the review UI in Phase 16). A `false` (no-key) and a `true` (configured-but-failed) can both set it; if you want the Phase-8 "configured but failed → Settings hint" nicety, distinguish them — but that's a UI affordance, optional this phase.

### Pattern 5: Inner try/catch → empty Map (the never-fail boundary)

**What:** `classifyDescriptors` wraps the entire decrypt-less call+parse+validate in one `try/catch`. ANY throw (`doGenerate` 401/429/5xx, `JSON.parse` malformed, Zod parse failure, `NoObjectGeneratedError`-equivalent) → log server-side → `return new Map()`. No retries.

**When to use:** the body of `classify.ts`.

**Why:** CLSAI-06 — the upload must never fail because of AI. An empty Map flows through PASS 2 as "no suggestions", and the review grid + manual pick are fully usable.

```typescript
export async function classifyDescriptors(
  descriptors: string[],
  categories: { id: string; name: string }[],
  aiSettings: { provider: AiProvider; model: string; apiKey: string },
): Promise<Map<string, { categoryId: string | null; confidence: number }>> {
  const out = new Map<string, { categoryId: string | null; confidence: number }>()
  if (descriptors.length === 0 || categories.length === 0) return out
  try {
    const model = modelFor(aiSettings.provider, aiSettings.model, aiSettings.apiKey)
    const result = await model.doGenerate({
      prompt: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [{ type: 'text', text: buildUserText(descriptors, categories) }] },
      ],
      responseFormat: { type: 'json', schema: JSON_SCHEMA },  // schema REQUIRED (Anthropic)
      maxOutputTokens: 1500,
      temperature: 0,
    })
    const textPart = result.content.find((c) => c.type === 'text')
    const parsed = classifyResultSchema.parse(JSON.parse(textPart?.text ?? ''))
    for (const r of parsed.results) {
      out.set(r.descriptor, {
        categoryId: validateSuggestion(r.categoryId, categories),  // owned-id gate → null if invented
        confidence: r.confidence,
      })
    }
  } catch (err) {
    console.error('[classifyDescriptors] AI classification failed (degrading to manual):', err)
    return new Map()   // CLSAI-06: never throw; empty = manual pick
  }
  return out
}
```

### Pattern 6: `suggestCategory` becomes a 1-item PII-safe wrapper

**What:** Keep `suggestCategory(descriptorNorm, categories)` as the documented seam but delegate to `classifyDescriptors([descriptorNorm], categories, aiSettings)` and unwrap the single result. It must fetch `getDecryptedAiSettings()` itself (the wrapper has no aiSettings param) and return `null` when there's no key or no suggestion — preserving its `Promise<string|null>` contract and `suggest.test.ts`.

**Why:** CONTEXT locks "the seam stays as a PII-safe 1-item wrapper". The hot path uses the batch directly; the wrapper exists for contract/test stability and any 1-item caller.

```typescript
// src/lib/classifier/suggest.ts (suggestCategory body)
export async function suggestCategory(
  descriptorNorm: string,
  categories: { id: string; name: string }[],
): Promise<string | null> {
  const aiSettings = await getDecryptedAiSettings()  // server-only; null = no key
  if (!aiSettings) return null
  const map = await classifyDescriptors([descriptorNorm], categories, aiSettings)
  return map.get(descriptorNorm)?.categoryId ?? null
}
// validateSuggestion stays exactly as-is (still the SEC-03 gate, now called inside classify).
```

> **`suggest.test.ts` caveat:** the existing test asserts `suggestCategory('padaria sao joao', CATEGORIES)` returns `null` and makes **no fetch**. Once `suggestCategory` calls `getDecryptedAiSettings()`, in the test environment that returns `null` (no Supabase session / no key) → still `null`, still no provider fetch. **Verify this holds**; if the Supabase client throws in the unit env, mock `getDecryptedAiSettings` → `null` in the test. This is a real planning item — see Open Questions.

### Anti-Patterns to Avoid
- **Adding the `ai` umbrella** for `generateObject` — unnecessary (doGenerate does it) and breaks `pii-guard.test.ts:39`.
- **Embedding a UUID enum in the JSON-schema** — Gemini OpenAPI-subset + Claude flat-schema trap; gate with `validateSuggestion` instead.
- **Calling AI per row** (or per descriptor inside the loop) — regresses memory-first; collect the unique Set, one call.
- **Setting `row.category_id` from a suggestion** — that's auto-commit (CLSAI-05 violation). Only `row.suggestion`.
- **Sending anything but `descriptor_norm`** (amount/date/raw/`descriptor_raw`) to the model — SEC-03 / LGPD breach; the `pii-guard` test must catch it.
- **Re-throwing from the AI path** — the upload must survive any provider failure (CLSAI-06). Inner try/catch → empty Map.
- **Omitting `responseFormat.schema`** — Anthropic warns/won't enforce JSON without it (`:3389-3393`).
- **Retrying on schema failure** — no `maxRetries`; an unrecoverable parse → empty Map → manual.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Provider instantiation per BYOK key | `fetch` to Gemini/Anthropic REST | `modelFor()` (exists) → `doGenerate` | Phase 14 already built + tested the factory; reuse it |
| Owned-id constraint on AI output | Ad-hoc `categories.some(c=>c.id===x)` | `validateSuggestion()` (exists) | It's the pinned SEC-03 gate (z.enum over owned ids); already tested |
| Provider-specific JSON extraction | A switch on provider to read tool-calls vs text | `result.content.find(c=>c.type==='text')` | Both providers re-emit the structured JSON as ONE text part (verified) — uniform |
| Error→friendly-message mapping | New copy | `mapProviderError()` (exists) for the optional iaIndisponivel note | Already maps 401/429/network → pt-BR constants |
| Decrypting the key | New decrypt path | `getDecryptedAiSettings()` (exists, server-only) | The single plaintext-key module; reuse, never duplicate |

**Key insight:** Phase 15 is almost pure wiring — every hard piece (factory, decrypt DAL, enum gate, error mapping) already exists from Phase 14. The only genuinely new code is `classify.ts` (the batched `doGenerate` + flat schema + parse + map) and the two-pass reshape of the `import.ts` loop.

## Runtime State Inventory

> Additive, code-only phase: no rename, no data migration, no new table. Inventory included per protocol.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `statements.parsed_rows` jsonb gains an optional `suggestion` per row. **Additive** — old rows simply lack the field; the review RSC reads it back with `?.`. No migration. | None (jsonb is schemaless; `ParsedReviewRow` type extends with `suggestion?`) |
| Live service config | `ai_settings` row + Vault secret (Phase 14) — **read** by `getDecryptedAiSettings()`. Exists on LOCAL (0033 pushed local; PROD push is the deferred human item). | None — Phase 15 only reads what Phase 14 created. Tests run on LOCAL |
| OS-registered state | None | None |
| Secrets/env vars | None new. The BYOK key lives in Vault (Phase 14), read server-only. No env var added. | None |
| Build artifacts | `src/types/database.types.ts` already regenerated after 0033 (Phase 14). No new migration this phase. | None — verify `gen:types` reflects `ai_settings` + RPCs (Phase 14 left it current) |

**Nothing found in:** OS-registered state, new secrets/env vars, build artifacts — verified by reading `import.ts`, `settings.server.ts`, and `next.config.ts`.

## Common Pitfalls

### Pitfall 1: AI called per row instead of once over the unique miss set
**What goes wrong:** The reshape leaves a per-row `await suggestCategory(...)` (or calls `classify` inside the loop), making N calls and token cost ∝ rows — regressing the memory-first guarantee.
**Why it happens:** The current code already has `await suggestCategory(...)` in the else-branch; a naive wire just swaps its body.
**How to avoid:** Two passes. PASS 1 only collects `descriptor_norm` into a `Set`; the single call happens AFTER the loop. Assert in a test that an upload with M rows / N unique misses makes exactly ONE `doGenerate` (spy on the model).
**Warning signs:** `doGenerate` call count > 1 per upload; token usage scaling with row count; the test "1-call-N-unique" red.

### Pitfall 2: Enum drift — stale or hallucinated category id
**What goes wrong:** The model returns a category id the user renamed/deleted, or invents one; it gets attached and later pollutes goal math.
**Why it happens:** Enum cached across uploads, or `categoryId` trusted without the gate.
**How to avoid:** Build the `id: name` list fresh from `import.ts:392`'s `categoryList` each call; run every returned `categoryId` through `validateSuggestion` → `null` if not owned. The schema's free-string `categoryId` MUST be gated, never trusted.
**Warning signs:** A `row.suggestion.categoryId` not in `categoryList`; the "enum-drift→null" test red.

### Pitfall 3: Suggestion auto-applied to `category_id`
**What goes wrong:** PASS 2 sets `row.category_id = suggestion.categoryId`, silently auto-classifying — and `confirmImport` would then learn it as a pattern with no human confirm.
**Why it happens:** It's tempting to "pre-fill" the actual field instead of a separate `suggestion` slot.
**How to avoid:** Only ever set `row.suggestion`. `row.category_id` stays whatever memory set (null for misses). Assert in a test that after classification every miss row has `category_id === null` even when a suggestion is present.
**Warning signs:** A miss row with non-null `category_id` post-classify; `merchant_patterns` rows appearing without a confirm; the "no-auto-commit" test red.

### Pitfall 4: An AI failure throws and breaks the upload
**What goes wrong:** A 429 / malformed JSON / Zod error escapes `classify.ts` and the whole `ingestStatement` returns `{ error }` — the review grid (a proven feature) appears broken.
**Why it happens:** Forgetting the inner try/catch, or letting `JSON.parse` throw outside it.
**How to avoid:** The entire call+parse+validate is inside one `try/catch` that returns an empty Map. No retries. `import.ts` treats an empty Map as "no suggestions" and proceeds.
**Warning signs:** An upload erroring when the key is invalid/over-quota; the "fallback-error" or "fallback-no-key" test red.

### Pitfall 5: PII leaks into the prompt
**What goes wrong:** The prompt builder accidentally includes `descriptor_raw`, `amount_cents`, or `occurred_on` — SEC-03 / LGPD regression.
**Why it happens:** Copy-pasting the whole `raw` row into the prompt instead of just `descriptor_norm`.
**How to avoid:** `buildUserText` takes a `string[]` of `descriptor_norm` ONLY. The `pii-guard.test.ts` (updated b/c) asserts the sent payload contains no amount/raw/date. Spy on `doGenerate` and inspect `options.prompt`.
**Warning signs:** Numbers/dates in the prompt text; the updated `pii-guard` payload assertion red.

### Pitfall 6: `maxDuration` not on the right segment
**What goes wrong:** Parse + one LLM call exceeds the default function timeout (10s on some Vercel plans) and the upload 504s.
**Why it happens:** `maxDuration = 30` is on `importar/page.tsx` (the RSC page), NOT on the Server Action that runs the work. Route-segment config on a page doesn't necessarily bound the action invocation.
**How to avoid:** Set `export const maxDuration = 60` where the work runs. Confirm whether the action inherits the page's segment config or needs its own (see Open Questions) — safest is to raise the page to 60 AND verify the action path. CONTEXT locks ≥ 60.
**Warning signs:** 504 on an upload with several new merchants; AI latency + parse summing past the limit.

## Code Examples

(Concrete skeletons are inline in Architecture Patterns 1-6 above — `classify.ts` schema/prompt/call/fallback, the `import.ts` two-pass reshape, and the `suggestCategory` wrapper. They are grounded in the installed `@ai-sdk/provider@3.0.10` types and the `@ai-sdk/{google,anthropic}` dist behavior read this session.)

### Extending ParsedReviewRow (additive)
```typescript
// src/lib/parsers/types.ts
export interface ParsedReviewRow extends RawTransaction {
  dedupe_key: string
  category_id: string | null
  reserva_id: string | null
  classification_source: ClassificationSource
  is_recurring: boolean
  duplicate?: boolean
  /** Phase 15 (CLSAI-01): non-binding AI hint for a memory-miss row. NEVER applied to
   *  category_id (no auto-commit). Phase 16 renders it; the user applies it on the grid. */
  suggestion?: { categoryId: string | null; confidence: number; source: 'ia' }
}
```

### Updated pii-guard assertions (b)/(c) — payload-only-descriptorNorm
```typescript
// tests/pii-guard.test.ts — replace the "suggestCategory returns null" + "no fetch" assertions
// with: spy doGenerate, assert the prompt carries ONLY descriptor_norm (no amount/raw/date).
it('classify sends ONLY descriptor_norm to the model — no amount/raw/PII', async () => {
  const doGenerate = vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ results: [] }) }],
    finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1 },
  })
  // stub modelFor → { doGenerate } (or mock provider-factory)
  await classifyDescriptors(['padaria sao joao'], CATEGORIES, FAKE_SETTINGS)
  const sent = JSON.stringify(doGenerate.mock.calls[0]?.[0]?.prompt)
  expect(sent).toContain('padaria sao joao')   // the descriptor_norm IS sent
  expect(sent).not.toMatch(/R\$|\d{2}\/\d{2}\/\d{4}|amount|occurred_on|descriptor_raw/) // no PII
})
// Keep the "AI deps === ['@ai-sdk/anthropic','@ai-sdk/google']" invariant (still green — no `ai` added).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `suggestCategory()` returns null (inert seam) | Real batched `doGenerate` body, memory-miss-only | Phase 15 (now) | The milestone's core value goes live |
| Structured output requires `generateObject` (umbrella) | `doGenerate` + `responseFormat: { type:'json', schema }` on both providers | `@ai-sdk` v3 (installed) | No umbrella needed; flat schema portable across Gemini+Claude `[VERIFIED: dist]` |
| `gemini-2.5-flash-lite` / `claude-haiku-4-5` (P14 assumed) | Same ids — Gemini 2.5 Flash-Lite is GA stable; Claude Haiku 4.5 id `claude-haiku-4-5` | confirmed 2026-06-18 | Validate for free on first real classify `[CITED: developers.googleblog.com / anthropic skills models.md]` |

**Deprecated/outdated:**
- DeepSeek path (`json_object`-only, model-id churn) — **deferred** (CLSAI-F1), not this phase. The flat-schema + prompt-enum design here is already DeepSeek-ready for later.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `gemini-2.5-flash-lite` + `claude-haiku-4-5` are valid current ids | State of the Art / DEFAULT_MODEL | A bad id → first classify 404 → caught by try/catch → empty Map (graceful). One-line fix. LOW |
| A2 | Anthropic's `responseFormat:{type:'json',schema}` json-tool re-emits as a single `text` part requiring no Anthropic "structured outputs beta" header | Pattern 1 | If the installed version needs a beta header, the call may fail → empty Map (graceful). Verify by a real Claude classify at build. MEDIUM (dist shows tool-mode, not the native beta — should be fine) |
| A3 | Setting `maxDuration` on `importar/page.tsx` (or the action) bounds the `ingestStatement` invocation on Vercel | Pitfall 6 / Open Q | If the action needs its own segment file, planning must place it correctly. LOW (build/test on LOCAL has no timeout; matters at deploy) |
| A4 | `suggestCategory` calling `getDecryptedAiSettings()` still returns null + no fetch in the `suggest.test.ts`/`pii-guard` unit env | Pattern 6 | If the Supabase server client throws in unit env, the existing tests break → must mock the DAL → null. MEDIUM — plan a mock |
| A5 | zod v4 → JSONSchema7 for `responseFormat.schema` produces a flat, `$ref`-free schema Claude accepts | Pattern 2 | A `$ref`-emitting conversion would break Claude's flat-only constraint → empty Map. Verify the generated schema is inlined; if not, hand-write the JSONSchema7 literal. MEDIUM |

## Open Questions

1. **`maxDuration` placement for the Server Action.**
   - Known: `importar/page.tsx` has `export const maxDuration = 30`; `import.ts` (the action) has none.
   - Unclear: whether the action invocation inherits the page segment's `maxDuration` on Vercel, or needs its own route-segment config. (Build/test on LOCAL is unaffected — this is a deploy concern.)
   - Recommendation: raise the page to `60` AND verify the action path; CONTEXT locks ≥ 60. A planning task should confirm against Vercel's segment-config docs.

2. **zod→JSONSchema7 shape for `responseFormat.schema`.**
   - Known: both providers want a `JSONSchema7`; the schema must be flat ($ref-free, name-free) for Claude.
   - Unclear: whether the project's zod-v4 → JSON-schema conversion inlines everything or emits `$ref`/`$defs`.
   - Recommendation: generate it, inspect for `$ref`/`$defs`; if present, either pass a `target`/inline option or hand-write the literal JSONSchema7 (it's tiny: an object with a `results` array of 3-field objects).

3. **`suggest.test.ts` / `pii-guard.test.ts` env behavior once `suggestCategory` reads the DAL.**
   - Known: today both pass because `suggestCategory` is a pure `return null`.
   - Unclear: whether `getDecryptedAiSettings()` (Supabase server client) throws or returns null in the vitest env.
   - Recommendation: mock `getDecryptedAiSettings` → `null` (and/or `modelFor`) in those tests so the PII + null-on-no-key invariants hold deterministically without a live Supabase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@ai-sdk/google` | `classify.ts` Gemini path | ✓ | 3.0.83 | — |
| `@ai-sdk/anthropic` | `classify.ts` Claude path | ✓ | 3.0.85 | — |
| `@ai-sdk/provider` | `LanguageModelV3` types + `doGenerate` | ✓ | 3.0.10 | — |
| `zod` | flat schema + validate | ✓ | 4.4.x | — |
| `ai_settings` row + Vault + RPCs (Phase 14 / 0033) | `getDecryptedAiSettings()` | ✓ (LOCAL) | 0033 pushed local | PROD push is the deferred human item; tests run on LOCAL |
| A real BYOK key (Gemini/Claude) | a live end-to-end classify | user-supplied | — | No-key path is first-class (empty Map → manual). Unit tests mock the provider; no key needed for the suite |

**Missing dependencies with no fallback:** none — Phase 15 installs nothing.
**Missing dependencies with fallback:** a live provider key for a real end-to-end smoke (optional; the no-key path is the designed graceful state and the unit tests mock `doGenerate`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest.config.ts`; `npm test` = `vitest run`; ~797 tests) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run src/lib/ai src/lib/classifier tests/pii-guard.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLSAI-02 | all-hits upload → ZERO `doGenerate` calls | unit (spy) | `npx vitest run src/lib/ai/classify.test.ts` | ❌ Wave 0 |
| CLSAI-03 | M rows / N unique misses → exactly ONE `doGenerate`, prompt carries N descriptors | unit (spy) | `npx vitest run src/lib/ai/classify.test.ts` | ❌ Wave 0 |
| CLSAI-04 | model returns a non-owned id → `validateSuggestion` → `categoryId: null` (enum drift) | unit | `npx vitest run src/lib/ai/classify.test.ts` | ❌ Wave 0 |
| CLSAI-04 | model returns null for "nothing fits" → no suggestion attached | unit | `npx vitest run src/lib/ai/classify.test.ts` | ❌ Wave 0 |
| CLSAI-05 | after classify, every miss row has `category_id === null` even with a suggestion present | unit | `npx vitest run src/actions` (or a focused ingest unit) | ❌ Wave 0 |
| CLSAI-06 | no key → empty Map, upload proceeds; iaIndisponivel set | unit | `npx vitest run src/lib/ai/classify.test.ts` | ❌ Wave 0 |
| CLSAI-06 | provider 401/429/5xx + malformed JSON → caught → empty Map, no throw | unit | `npx vitest run src/lib/ai/classify.test.ts` | ❌ Wave 0 |
| SEC-03 | sent prompt carries ONLY descriptor_norm (no amount/raw/date); `ai` umbrella absent | unit | `npx vitest run tests/pii-guard.test.ts` | ✅ (edit b/c) |
| CLSAI-01 | seam wrapper `suggestCategory` returns an owned id on a hit / null on no-key | unit | `npx vitest run src/lib/classifier/suggest.test.ts` | ✅ (verify/mock DAL) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/ai src/lib/classifier tests/pii-guard.test.ts` (fast subset)
- **Per wave merge:** `npm test` + `npx tsc --noEmit` + `npm run build`
- **Phase gate:** full suite green + the seven observable edges (below) asserted before `/gsd-verify-work`

### Observable behaviors / edges to sample (Nyquist)
- **0-call-when-all-hits:** an upload where every descriptor is a memory hit → `doGenerate` called 0 times (CLSAI-02)
- **1-call-N-unique:** M rows sharing N unique miss descriptors → exactly 1 `doGenerate`, prompt lists N descriptors (CLSAI-03)
- **enum-drift→null:** model returns an id not in `categoryList` → `validateSuggestion` → `null`, no bad suggestion attached (CLSAI-04)
- **fallback-no-key:** `getDecryptedAiSettings()` null → no call, empty suggestions, upload OK, iaIndisponivel (CLSAI-06)
- **fallback-error:** `doGenerate` throws (401/429/5xx) OR returns malformed JSON → caught → empty Map, upload OK (CLSAI-06)
- **no-auto-commit:** post-classify, miss rows keep `category_id === null`; `merchant_patterns` untouched until confirm (CLSAI-05)
- **PII payload:** the prompt sent to `doGenerate` contains only descriptor_norm — no amount/raw/date (SEC-03)

### Wave 0 Gaps
- [ ] `src/lib/ai/classify.test.ts` — covers CLSAI-02/03/04/06 + SEC-03 payload (spy on `modelFor`/`doGenerate`; fake settings)
- [ ] `tests/pii-guard.test.ts` — rewrite assertions (b)/(c) to the payload-only-descriptorNorm invariant (keep the no-`ai`-umbrella check)
- [ ] `src/lib/classifier/suggest.test.ts` — mock `getDecryptedAiSettings` → null so the seam's no-key→null + no-fetch invariant stays deterministic
- [ ] An ingest-level unit (or focused test of the PASS-2 map-back) — proves miss rows keep `category_id===null` with a suggestion present (CLSAI-05) and the 0/1-call counts (CLSAI-02/03)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `validateSuggestion` gates AI output to OWNED category ids; `lookupMemory`/`categoryList` read under RLS (`auth.uid()`); confirm still re-derives ownership |
| V5 Input Validation | yes | Flat Zod schema parses the model's JSON; `JSON.parse`+`safeParse` reject malformed output → empty Map |
| V7 Error Handling & Logging | yes | Inner `try/catch` → empty Map; log server-side WITHOUT the key/raw provider body; upload never 500s |
| V8 Data Protection (LGPD/SEC-03) | yes | ONLY `descriptor_norm` egresses; no amount/date/raw; `pii-guard` test enforces; key stays in the server-only decrypt DAL |
| V6 Cryptography | indirect | Key decryption is Phase-14 Vault (reused read-only); Phase 15 adds no crypto |

### Known Threat Patterns for {Next.js 16 action + @ai-sdk doGenerate + Supabase RLS}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| PII (amount/raw/date) egresses to the LLM | Information Disclosure | Prompt carries only `descriptor_norm`; `pii-guard` payload assertion; `buildUserText` takes `string[]` only |
| Prompt-injection descriptor coaxes a non-owned/invented category | Tampering | `validateSuggestion` z.enum over owned ids → `null`; injection can at worst yield a rejected value |
| Stale/renamed category (enum drift) attached to a row | Tampering | Fresh `categoryList` per call (prompt-listed); gate post-hoc; never cache the enum |
| AI guess auto-applied → silently learned as a pattern | Tampering / Repudiation | `row.category_id` never set from a suggestion; `merchant_patterns` write stays only in `confirmImport` (human confirm) |
| Provider error leaks key/stack into a log or response | Information Disclosure | Log a generic message (no key/raw body); friendly `mapProviderError` for any surfaced note |
| Provider failure takes down the upload (DoS-by-dependency) | Denial of Service | Inner try/catch → empty Map; no retries; upload + manual pick fully usable |

## Sources

### Primary (HIGH confidence)
- **Installed package dist read directly (2026-06-18):** `node_modules/@ai-sdk/provider@3.0.10/dist/index.d.ts` (`LanguageModelV3CallOptions.responseFormat`, `LanguageModelV3Prompt`/`Message`, `LanguageModelV3GenerateResult.content`); `node_modules/@ai-sdk/google@3.0.83/dist/index.mjs:1578-1582` (`responseMimeType`/`responseSchema`); `node_modules/@ai-sdk/anthropic@3.0.85/dist/index.mjs:3389-3393, 3452-3456, 3920-3925` (json-tool injection + text re-emit, schema-required)
- **Codebase read directly (2026-06-18):** `src/actions/import.ts` (ingest loop ~:392/:415-448, `confirmImport` learn path), `src/lib/classifier/{suggest,memory}.ts`, `src/lib/ai/{provider-factory,settings.server,settings,map-provider-error}.ts`, `src/lib/parsers/types.ts`, `tests/pii-guard.test.ts`, `next.config.ts`, `src/app/(app)/importar/page.tsx` (`maxDuration=30`), `src/lib/schemas/import.ts`
- `.planning/phases/14-key-storage-byok-settings/14-RESEARCH.md` — provider versions, factory shape, decrypt DAL, model ids
- `.planning/research/{SUMMARY,PITFALLS}.md` (v1.4) — DeepSeek excluded, Claude flat-schema/no-$ref, provider structured-output differences, memory-first + fallback invariants

### Secondary (MEDIUM confidence)
- [Gemini 2.5 Flash-Lite is now stable and GA — Google Developers Blog](https://developers.googleblog.com/en/gemini-25-flash-lite-is-now-stable-and-generally-available/) — `gemini-2.5-flash-lite` GA, $0.10/$0.40, structured output supported
- [anthropics/skills claude-api models.md](https://github.com/anthropics/skills/blob/main/skills/claude-api/shared/models.md) — `claude-haiku-4-5` id
- [Structured output | Gemini — Firebase AI Logic](https://firebase.google.com/docs/ai-logic/generate-structured-output) — Gemini response_schema / JSON mode

### Tertiary (LOW confidence)
- Exact need for an Anthropic "structured outputs beta" header at the installed version — `[ASSUMED]` not needed (dist uses tool-mode, not the native beta); verify with a real Claude classify (A2)
- `maxDuration` action-vs-page segment inheritance on Vercel — `[ASSUMED]`, verify at planning (Open Q1)

## Metadata

**Confidence breakdown:**
- Structured-output path (no umbrella, both providers): HIGH — read from the installed dist, not docs/memory
- Stack / no-new-deps: HIGH — `ai` umbrella confirmed absent; all deps present at verified versions
- import.ts reshape + invariants: HIGH — loop read directly; the two-pass design is a faithful encoding of the locked CONTEXT
- Model ids: MEDIUM-HIGH — cross-checked against live catalogs; validate free on first call
- maxDuration placement + zod→JSONSchema7 shape + test-env DAL behavior: MEDIUM — flagged as Open Questions for planning

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (`@ai-sdk/*` republish frequently — re-check `responseFormat` behavior if versions bump a minor; DeepSeek `deepseek-chat` deprecation 2026-07-24 is out of scope this phase)
