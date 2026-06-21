# Phase 18: AI classifica compras corretamente - Research

**Researched:** 2026-06-19
**Domain:** Extending an already-shipped (v1.4) batched LLM classification path — prompt design + defense-in-depth code gate + a data-only Postgres migration
**Confidence:** HIGH (all findings grounded in the actual source files read this session)

## Summary

This is a small, surgical phase that EXTENDS the v1.4 AI classification layer — it does **not**
redesign it. Two deliverables: (CLSAI-09) make `classifyDescriptors` *kind-aware* — thread each
category's `kind` (`consumo`/`alocacao`) into the prompt and add a hard anti-allocation rule to
the `SYSTEM_PROMPT`, then add a belt-and-suspenders **code gate** that nullifies any suggestion
whose chosen category has `kind !== 'consumo'`; and (MKT-01) confirm migration `0035` (the default
"Marketplace" category) is applied in PROD via `supabase db push`.

The change is mechanically tiny but touches a TS-strict signature (`{ id, name }` →
`{ id, name, kind }`) that propagates to **every** call site and **every** test fixture. The bulk
of the work is updating those call sites + fixtures so the project still compiles, and adding the
two new assertions (prompt contains kind + hard rule; an `alocacao` suggestion for a spending
descriptor is nulled by the code gate).

**Primary recommendation:** Widen the `categories` param type to `{ id, name, kind: CategoryKind }`
across `classify.ts` + `suggest.ts`, inline-tag the kind in `buildUserText`, add 3–4 PT-BR lines
to `SYSTEM_PROMPT`, insert a kind gate right after `validateSuggestion` inside the result loop, fix
the `import.ts` select to `'id, name, kind'`, update the 4 test fixtures, add 2 new tests, and have
the **user** run `supabase db push` (Claude only verifies with `supabase migration list`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Kind-aware prompt construction | API/Backend (`src/lib/ai/classify.ts`, server-only) | — | LLM call runs server-side; API key never on client. Pure server module. |
| Anti-allocation code gate | API/Backend (`classify.ts` result loop) | — | "Never trust the model" — runs in same server module as `validateSuggestion`. |
| Category `kind` threading | API/Backend (`import.ts` Server Action → `classify.ts`/`suggest.ts`) | — | `categoryList` is fetched server-side from Supabase; flows down as a function arg. |
| "Marketplace present in account" | Database/Storage (migration `0035`) | — | Pure data + trigger redef; no schema change → no `database.types.ts` regen. |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Prompt kind format:** inline tag per category line — `id: nome (consumo)` / `(alocação)`.
  Minimal change in `buildUserText`; keeps a single category list.
- **Anti-allocation rule strength:** HARD rule in `SYSTEM_PROMPT` — "NUNCA atribua uma categoria
  de alocação a um gasto; se a melhor opção for de alocação, retorne `categoryId: null`". Matches
  the existing null-when-nothing-fits contract.
- **Kind glossary:** one line anchoring semantics — "consumo = compra/gasto; alocação = mover
  dinheiro para investimento ou reserva". Do not rely on the label alone.
- **Defense in depth — code gate:** YES. Inside `classifyDescriptors`, right after
  `validateSuggestion`, any chosen category whose `kind !== 'consumo'` → `null`. An invoice
  descriptor is always a spend, so an allocation pick is wrong by definition.
- **Kind threading:** `classifyDescriptors` and `suggestDescriptor`/`suggestCategory` now receive
  categories as `{ id, name, kind }`; `import.ts` swaps `select('id, name')` for
  `select('id, name, kind')`. No second lookup.
- **MKT-01 ownership:** the USER runs `supabase db push` (PROD mutation = owner's action). Claude
  verifies first with `supabase migration list`. MKT-01 is **human-verify** (PROD was wiped →
  re-signup). Migration `0035` is data + trigger only → `database.types.ts` unchanged.
- **TS strict, no JS. No schema change in this phase.**

### Claude's Discretion
- Test coverage: extend `classify.test.ts` (the `CATEGORIES` fixture gains `kind`; asserts: prompt
  includes kind + rule; an `alocacao` suggestion for a spend → `null`). Follow the existing
  describe patterns (CLSAI-03/04/06, SEC-03).
- Exact system-prompt + glossary text (PT-BR, concise).
- Updating any other call sites of `suggestCategory`/`validateSuggestion` that the `kind` threading
  requires to keep TS strict compiling.

### Deferred Ideas (OUT OF SCOPE)
- Keyword rules per category (registration + auto-classification on upload) — Phases 19 & 20.
- Kind gate for descriptors that are NOT spends (e.g. credits/estornos) — out of scope; the
  current path classifies invoice line-items (spends).
- Replacing/abandoning the AI; regex match; PDF OCR. No schema change.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLSAI-09 | The AI classification prompt is *kind-aware* — each category sent with its `kind`, and the model is instructed NOT to assign allocation categories (e.g. Investimentos, Reserva) to spends. Fixes "AliExpress/Mercado Livre → Investimentos". | Prompt diff (buildUserText inline tag + SYSTEM_PROMPT hard rule + glossary) and the post-`validateSuggestion` code gate — both detailed below in Code Examples. Provable by unit test (prompt-content assertion + gate-nulls-allocation assertion). |
| MKT-01 | Default "Marketplace" category (migration `0035`) applied in PROD via `supabase db push` and present in the account — gives the AI a sensible shopping bucket. | Migration already in repo (`0035_categories_marketplace.sql`), data+trigger only. Verification commands below; human-verify because PROD was wiped (re-signup gets it from re-seeded `handle_new_user`; the idempotent backfill covers any pre-existing account). |

## Standard Stack

No new packages. This phase uses only what is already installed and wired in v1.4.

### Core (already installed — no install step)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | 4.x | The `validateSuggestion` enum gate + `classifyResultSchema`. | Already the runtime-validation boundary. The new kind gate is a plain JS comparison, not zod. |
| `@ai-sdk/google` / `@ai-sdk/anthropic` | 3.x | BYOK provider `doGenerate` (`LanguageModelV3`). | Untouched — prompt change only, no SDK-surface change. |
| `vitest` | 4.x | Test runner (`npm test` → `vitest run`). | Existing test infra; new assertions slot into existing describes. |
| `supabase` CLI | 2.103.0 `[VERIFIED: supabase --version]` | `migration list` (verify) + `db push` (user-run apply). | Existing migration workflow. |

### Supporting
None. The `kind` type already exists: `CategoryKind = 'consumo' | 'alocacao'` from
`@/lib/schemas/category` `[VERIFIED: src/lib/schemas/category.ts]`. Import and reuse it for the
widened param type — do **not** define a local string union (DRY + single source of truth).

**Installation:** none. `npm test` and the supabase CLI are already present.

## Package Legitimacy Audit

Not applicable — this phase installs **zero** external packages. All code reuses already-installed
dependencies. No `npm install` step belongs in the plan.

## Architecture Patterns

### System Architecture Diagram (the existing v1.4 path this phase extends)

```
Upload (OFX/CSV/PDF)
        │
        ▼
ingestStatement (src/actions/import.ts, Server Action)
        │
        ├─ fetch categories  ── select('id, name')  ──►  CHANGE TO  select('id, name, kind')
        │                                                 categoryList: { id, name, kind }[]
        │
        ├─ PASS 1: per-row lookupMemory  ──HIT──►  auto-classify (zero AI calls)
        │                                ──MISS─►  collect descriptor_norm into missNorms set
        │
        ▼ (only if missNorms.size > 0 AND a BYOK key exists)
classifyDescriptors(missNorms[], categoryList, aiSettings)   ◄── single batched call (CLSAI-03)
        │
        ├─ buildUserText(descriptors, categories)  ──►  prompt now tags each cat: `id: nome (consumo)`
        ├─ SYSTEM_PROMPT  ──►  + glossary line + HARD anti-allocation rule
        ├─ model.doGenerate({ responseFormat: json schema, temperature: 0 })
        │
        ▼ result loop, per returned { descriptor, categoryId, confidence }:
        ├─ categoryId = validateSuggestion(categoryId, categories)   ◄── enum gate (CLSAI-04, existing)
        ├─ NEW: if chosen category.kind !== 'consumo' → categoryId = null   ◄── KIND GATE (CLSAI-09)
        └─ out.set(descriptor, { categoryId, confidence })
        │
        ▼
PASS 2: suggestions attached as NON-BINDING row.suggestion (no auto-commit)
```

`suggestCategory` (single-descriptor delegate in `suggest.ts`) calls the same
`classifyDescriptors`, so the kind gate protects that path automatically — no separate gate needed
there `[VERIFIED: src/lib/classifier/suggest.ts lines 43–44]`.

### Pattern 1: Reuse the existing "never trust the model" gate point
**What:** The phase's code gate must live at the *exact same place* as the existing enum gate — the
per-result loop inside `classifyDescriptors`, immediately after `validateSuggestion`.
**When to use:** Always — keeps both gates in one auditable spot and means `suggestCategory` (which
delegates to the batch) inherits the protection for free.
**Why:** A second lookup or a gate in `import.ts` would (a) require a `categoryId → kind` map at the
caller and (b) miss the single-descriptor `suggestCategory` path. Gating inside the batch covers
both callers from one location.

### Pattern 2: Widen the param type using the canonical `CategoryKind`
Import the existing type rather than re-declaring a string union:
```ts
import type { CategoryKind } from '@/lib/schemas/category'
// param type becomes: { id: string; name: string; kind: CategoryKind }[]
```

### Anti-Patterns to Avoid
- **Adding `kind` only to the prompt and skipping the code gate.** CONTEXT.md locks defense in
  depth — the model is 503-prone (`gemini-2.5-flash-lite`) and prompt-only is not enough. Both.
- **Gating in `import.ts` instead of `classifyDescriptors`.** Misses the `suggestCategory` path and
  needs a redundant id→kind map.
- **Putting the kind into the JSON output schema or sending it as a separate field.** Keep the flat
  portable schema unchanged; kind is *input context* (a prompt tag), not model *output*.
- **Re-declaring a local `'consumo' | 'alocacao'` union.** Import `CategoryKind`.
- **Auto-running `supabase db push` against PROD.** Claude verifies only; the user pushes.
- **Regenerating `database.types.ts`.** `0035` changes data + a function body, not schema —
  regen would be a no-op churn and `gen:types` is `--local` anyway.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Map chosen `categoryId` back to its `kind` | A separate id→kind lookup or a second query | The `categories` array already in scope inside the loop — `categories.find(c => c.id === gatedId)?.kind` | The array is the param; no extra fetch. |
| Enum-validate the suggested id | New validation | Existing `validateSuggestion` (unchanged) | Already the load-bearing enum gate; run kind gate on its OUTPUT. |
| The "kind" string union | New const/enum | `CategoryKind` from `@/lib/schemas/category` | Single source of truth, already DB-aligned. |
| Seed/backfill "Marketplace" | New migration | `0035_categories_marketplace.sql` (already in repo) | Done; re-seed trigger + idempotent backfill. |

**Key insight:** The only genuinely new logic is one `if` statement (the kind gate). Everything else
is a type-signature widening that ripples through call sites and fixtures.

## Runtime State Inventory

> This phase includes a PROD data migration (MKT-01) and a type-signature change, so the runtime
> state question is real.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | PROD `public.categories` rows — pre-existing accounts need the "Marketplace" row. PROD was **wiped 2026-06-19** (test account deleted) → there are currently **no accounts**, so the backfill (part 2 of `0035`) matches zero rows and the re-seeded `handle_new_user` (part 1) supplies Marketplace to the next signup. | User runs `supabase db push`; then human-verify via re-signup. |
| Live service config | None — no n8n/Datadog/external service references the renamed/added data. Marketplace is internal app data only. | None — verified: phase touches only Supabase + app code. |
| OS-registered state | None. No Task Scheduler / pm2 / launchd registration involves this phase. | None. |
| Secrets/env vars | None changed. BYOK Gemini/Claude key is read at runtime via `getDecryptedAiSettings`; **after the wipe the user must re-enter the BYOK key** to exercise live classification — but no secret *name* changes. | None (code); user re-enters BYOK key to test live. |
| Build artifacts / installed packages | `database.types.ts` — **NOT** affected (`0035` is data + trigger redef, no schema change). No regen. No compiled artifacts carry stale state. | None — explicitly confirmed no `gen:types` needed. |

**The canonical question — after every file is updated, what runtime state still holds the old
shape?** PROD `categories` data: the next signup gets Marketplace from the re-seeded trigger; the
idempotent backfill covers any account that exists before push (currently zero, post-wipe). No
code path reads a hard-coded category list, so widening the in-memory `{id,name}` shape to
`{id,name,kind}` has no persisted-state implications.

## Common Pitfalls

### Pitfall 1: TS strict break from the unchanged test/call-site fixtures
**What goes wrong:** Widening `classifyDescriptors`/`suggestCategory`/`validateSuggestion`(if
touched) param to require `kind` makes every existing `{ id, name }` fixture a type error, breaking
`next build` / `tsc`.
**Why it happens:** Four files declare `{ id, name }` category fixtures or mock signatures:
`classify.test.ts`, `suggest.test.ts`, `tests/pii-guard.test.ts`, `import.test.ts` (the
`classifyDescriptors` mock's param type) `[VERIFIED: grep across repo]`.
**How to avoid:** In the SAME change, add `kind` to all four fixtures/mock signatures. List below.
**Warning signs:** `Property 'kind' is missing in type '{ id: string; name: string; }'`.

### Pitfall 2: Gating in the wrong place misses `suggestCategory`
**What goes wrong:** If the kind gate lives in `import.ts`, the single-descriptor `suggestCategory`
path (used elsewhere) returns an ungated allocation id.
**How to avoid:** Gate inside `classifyDescriptors` result loop. `suggestCategory` delegates to it.
**Warning signs:** A test that calls `suggestCategory` with an allocation pick still returns the id.

### Pitfall 3: Accidentally adding `kind` to the OUTPUT schema
**What goes wrong:** Touching `JSON_SCHEMA` / `classifyResultSchema` to carry kind breaks the flat
portable contract (Gemini OpenAPI subset / Claude flat-only) and is unnecessary.
**How to avoid:** kind is INPUT only — a string appended in `buildUserText`. Leave both schemas as-is.

### Pitfall 4: Does `validateSuggestion` need `kind`?
**Answer: NO.** `validateSuggestion` only enum-checks the id against owned ids. Its signature can
stay `{ id, name }` — but to avoid a second param-type variant and keep all fixtures uniform, you
MAY widen it to accept `{ id, name, kind }` too (a wider input is harmless; it ignores `kind`).
Recommendation: widen the shared inline type everywhere to `{ id, name, kind }` for consistency so
there is exactly one category shape in the AI/classifier layer. `suggest.test.ts` pins
`validateSuggestion` directly with a `{ id, name }` fixture, so that fixture must gain `kind`
regardless of whether the signature is widened (a narrower fixture against a wider param still
errors). `[VERIFIED: src/lib/classifier/suggest.test.ts lines 20–23, 50–74]`

## Code Examples

### Exact minimal diff: `buildUserText` (inline kind tag)
```ts
// src/lib/ai/classify.ts — buildUserText
// BEFORE: const catLines = categories.map((c) => `${c.id}: ${c.name}`).join('\n')
function buildUserText(
  descriptors: string[],
  categories: { id: string; name: string; kind: CategoryKind }[],
): string {
  const catLines = categories
    .map((c) => `${c.id}: ${c.name} (${c.kind === 'consumo' ? 'consumo' : 'alocação'})`)
    .join('\n')
  const descLines = descriptors.map((d) => `- ${d}`).join('\n')
  return `Categorias:\n${catLines}\n\nDescritores:\n${descLines}`
}
```
Note: the DB enum value is `alocacao` (ASCII, no accent) `[VERIFIED: category.ts line 10]`. The
prompt tag uses `alocação` (PT-BR with accent) for the model's benefit; the code gate compares
against the ASCII enum (`!== 'consumo'`), so accents never leak into the comparison.

### Exact `SYSTEM_PROMPT` additions (hard rule + glossary)
```ts
const SYSTEM_PROMPT = [
  'Você classifica descritores de transações financeiras brasileiras em categorias.',
  'Receberá uma lista de categorias (id: nome (tipo)) e uma lista de descritores normalizados.',
  // NEW — glossary (one line):
  'O tipo é consumo ou alocação: consumo = compra/gasto; alocação = mover dinheiro para investimento ou reserva.',
  'Para cada descritor, escolha o id da categoria que melhor se encaixa.',
  // NEW — HARD anti-allocation rule:
  'Todo descritor é um GASTO. NUNCA atribua uma categoria de alocação a um gasto; se a melhor opção for de alocação, retorne categoryId: null para esse descritor.',
  'Se NENHUMA categoria se encaixar com confiança, retorne categoryId: null para esse descritor.',
  'confidence é um número de 0 a 1 indicando sua certeza. Responda APENAS o JSON do schema.',
].join(' ')
```

### Exact code gate (inside `classifyDescriptors` result loop)
```ts
// src/lib/ai/classify.ts — replace the existing loop body
for (const r of parsed.results) {
  const gatedId = validateSuggestion(r.categoryId, categories) // existing enum gate (CLSAI-04)
  // NEW kind gate (CLSAI-09): an invoice descriptor is always a spend; an allocation
  // category is wrong by definition → null. categories is already in scope (the param).
  const kind = categories.find((c) => c.id === gatedId)?.kind
  const categoryId = kind === 'consumo' ? gatedId : null
  out.set(r.descriptor, { categoryId, confidence: r.confidence })
}
```
`gatedId` is either `null` (then `find` is undefined → `categoryId = null`, correct) or an owned id
(then `kind` is defined). Only `kind === 'consumo'` passes; both `'alocacao'` and `undefined` → null.

### Signature changes (TS strict — every site)
```ts
// src/lib/ai/classify.ts
export async function classifyDescriptors(
  descriptors: string[],
  categories: { id: string; name: string; kind: CategoryKind }[],   // ← + kind
  aiSettings: { provider: AiProvider; model: string; apiKey: string },
): Promise<Map<string, { categoryId: string | null; confidence: number }>>

// src/lib/classifier/suggest.ts — suggestCategory param widened to match
export async function suggestCategory(
  descriptorNorm: string,
  categories: { id: string; name: string; kind: CategoryKind }[],   // ← + kind
): Promise<string | null>
// validateSuggestion: widen to { id, name, kind } too (ignores kind) for one uniform shape,
// OR leave as { id, name } — either compiles. Recommend widening for consistency.
```

### `import.ts` select change (the only caller-side change)
```ts
// src/actions/import.ts ~line 423
// BEFORE: .select('id, name')
.select('id, name, kind')
// categoryList already flows to classifyDescriptors at ~line 491 — no other change.
```
`kind` is a real, non-null column on `public.categories` (DB check-constrained to
`'consumo'|'alocacao'`), so the typed Supabase row will carry it and `categoryList` becomes the
`{ id, name, kind }[]` shape automatically. `[VERIFIED: category.ts; 0035 inserts kind on every row]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt sends only `id: nome` | `id: nome (tipo)` + hard anti-allocation rule | This phase (v1.5 P18) | Model stops mapping marketplace spends to Investimentos/Reserva. |
| Single enum gate (`validateSuggestion`) | Enum gate + kind gate | This phase | Code-level guarantee no allocation category is ever suggested for a spend. |
| No "Marketplace" bucket | Default "Marketplace" (`consumo`, sort 9) | Migration `0035` (in repo) | Gives the enum a sensible shopping target. |

**Deprecated/outdated:** nothing removed. No package or API deprecation involved.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The typed Supabase client will surface `kind` as non-nullable on the `categories` row after the `select('id, name, kind')` change (so `categoryList` types as `{id,name,kind}[]` without a cast). | Code Examples / import.ts | If `database.types.ts` types `kind` as nullable/optional, a small `.map`/narrowing or `?? 'consumo'` may be needed before passing to `classifyDescriptors`. Low risk — verify by reading `src/types/database.types.ts` for the `categories` row `kind` column during planning. |
| A2 | There are no OTHER runtime call sites of `suggestCategory` beyond `suggestion-slot.tsx`'s rendering and `suggest.test.ts`; the grep-found `ai-settings.ts` references are comments only. | Pitfall 1 / call-site list | If a hidden caller passes `{id,name}`, it would fail to compile — but that's exactly the safety net (the build catches it). Low risk. |

**If this table is empty:** it is not — confirm A1 by reading the generated `categories` row type
during planning; A2 is self-correcting via the compiler.

## Open Questions

1. **Is `kind` nullable in the generated `categories` row type?**
   - What we know: the DB column is NOT NULL + check-constrained; `0035` inserts a kind on every row.
   - What's unclear: whether `src/types/database.types.ts` reflects it as `string` (non-null) or
     `string | null`.
   - Recommendation: planner adds a 1-line read of `database.types.ts` to confirm; if nullable,
     narrow with a `CategoryKind` cast/guard when building `categoryList` (the values are always one
     of the two enum members in practice).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `supabase` CLI | MKT-01 verify (`migration list`) + user apply (`db push`) | ✓ | 2.103.0 `[VERIFIED]` | — |
| `vitest` | CLSAI-09 unit tests | ✓ | 4.x (`npm test`) `[VERIFIED: package.json]` | — |
| Linked Supabase PROD project | MKT-01 `db push` | unknown (user's env) | — | User runs push from their linked env; Claude never pushes. |
| BYOK Gemini/Claude key | LIVE classification verify (not required for unit tests) | ✗ post-wipe | — | Unit tests mock the provider; live verify needs user to re-enter key after re-signup. |

**Missing dependencies with no fallback:** none for the code/test work.
**Missing dependencies with fallback:** BYOK key (mocked in tests; user re-enters for live human-verify).

## Validation Architecture

> nyquist_validation = true `[VERIFIED: .planning/config.json]` → section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x |
| Config file | `vitest.config.ts` (+ `vitest.setup.ts`) `[VERIFIED]` |
| Quick run command | `npx vitest run src/lib/ai/classify.test.ts` |
| Full suite command | `npm test` (→ `vitest run`) |
| Typecheck (TS strict gate) | `npx tsc --noEmit` (no dedicated script; `next build` also typechecks) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLSAI-09 | Prompt sent to model contains each category's kind tag (`(consumo)`/`(alocação)`) | unit | `npx vitest run src/lib/ai/classify.test.ts -t "kind"` | ✅ extend `classify.test.ts` |
| CLSAI-09 | SYSTEM_PROMPT contains the hard anti-allocation rule (assert on the sent system message) | unit | `npx vitest run src/lib/ai/classify.test.ts -t "kind"` | ✅ extend `classify.test.ts` |
| CLSAI-09 | A returned `categoryId` whose owned category has `kind='alocacao'` is nulled (gate), confidence preserved | unit | `npx vitest run src/lib/ai/classify.test.ts -t "kind gate"` | ✅ extend `classify.test.ts` |
| CLSAI-09 | An owned `kind='consumo'` id passes straight through (no regression) | unit | existing CLSAI-04 happy-path test (fixture gains kind) | ✅ existing |
| CLSAI-09 (compile) | All call sites + fixtures still typecheck with the widened shape | typecheck | `npx tsc --noEmit` | ✅ |
| MKT-01 | Migration `0035` applied in PROD; "Marketplace" visible in account | manual / human-verify | `supabase migration list` (verify) → user `supabase db push` → re-signup + see "Marketplace" | N/A — human-verify (PROD wiped) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/ai/classify.test.ts && npx tsc --noEmit`
- **Per wave merge:** `npm test` (full suite — catches the fixture ripple in `suggest.test.ts`,
  `import.test.ts`, `tests/pii-guard.test.ts`)
- **Phase gate:** full suite green + `tsc --noEmit` clean before `/gsd-verify-work`. MKT-01 closed
  via human-verify checkpoint (not automatable post-wipe).

### Test fixture changes required (TS strict ripple — all four)
1. `src/lib/ai/classify.test.ts` — `CATEGORIES` fixture (lines 24–29): add `kind: 'consumo'` to
   Mercado + Transporte; **add a third fixture entry** with `kind: 'alocacao'` (e.g. an
   `INVESTIMENTOS_ID`) so the new gate test has an allocation id to feed the model.
2. `src/lib/classifier/suggest.test.ts` — `CATEGORIES` fixture (lines 20–23): add `kind` (pins
   `validateSuggestion`; fixture must match the widened shape).
3. `tests/pii-guard.test.ts` — `CATEGORIES` fixture (lines 21–24): add `kind`.
4. `src/actions/import.test.ts` — the `classifyDescriptors` mock signature (lines 281–295) and its
   `_categories: { id, name }[]` type: widen to `{ id, name, kind }[]`. (The mock body ignores
   categories, so only the type annotation changes.)

### New tests to add (Claude's-discretion coverage, follow existing describe style)
- `describe('classifyDescriptors — kind-aware prompt (CLSAI-09)')`:
  - asserts the user message contains `(consumo)` and `(alocação)` for the respective fixture lines.
  - asserts the system message contains the hard rule substring (e.g. `NUNCA atribua` and
    `categoryId: null`).
- `describe('classifyDescriptors — kind gate (CLSAI-09)')`:
  - model returns an `alocacao` owned id for `'aliexpress'` → assert
    `map.get('aliexpress')` is `{ categoryId: null, confidence: <kept> }` (mirrors the existing
    CLSAI-04 enum-drift test shape, lines 93–104).
  - regression: model returns the Marketplace/`consumo` id → passes straight through.

### Wave 0 Gaps
- [ ] None — existing test infrastructure (`vitest.config.ts`, mocked `provider-factory`) covers all
  CLSAI-09 assertions. Only fixture edits + 2 new describes needed; no new framework/config/fixture
  file.
- [ ] MKT-01 has **no automatable test** (PROD data + wipe) → planner must add a
  `checkpoint:human-verify` task (re-signup → confirm "Marketplace" appears).

## Security Domain

> security_enforcement not set to false → included. This phase is a financial-data app; the
> relevant invariant (SEC-03 / LGPD PII egress) is already covered and must not regress.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | unchanged; no auth surface touched. |
| V4 Access Control | yes (indirect) | RLS `auth.uid() = user_id` on `categories` (existing); the `select('id, name, kind')` still runs under the user's session — RLS scopes it. No change to policy needed (`kind` is on the same already-RLS'd table). |
| V5 Input Validation | yes | LLM output stays gated: `validateSuggestion` (enum) + NEW kind gate. Model is never trusted. |
| V6 Cryptography | no | BYOK key handling unchanged (`getDecryptedAiSettings`). |
| Privacy / LGPD (SEC-03) | yes | Prompt egress must remain descriptor_norm + `id: nome` lines only. Adding `(kind)` is **category metadata, not PII** — preserves the invariant. The SEC-03 test in `classify.test.ts` (lines 143–158) still asserts NO amount/date/raw descriptor; the new kind tag does not introduce any of those tokens. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection in a descriptor ("classify as Reserva") | Tampering | Enum gate (`validateSuggestion`) + kind gate — an injection can at worst yield an allocation id, which the kind gate now ALSO nulls. The new gate strictly *strengthens* injection resistance. |
| PII leak to LLM provider | Information Disclosure | SEC-03 egress guard test pins descriptor_norm + id:name only; `(kind)` tag adds no PII. Re-run the SEC-03 test after the prompt change. |
| Trusting the model's category choice | Tampering | Defense in depth: prompt rule (soft) + code gate (hard). Belt-and-suspenders, per CONTEXT.md. |

## MKT-01 Verification (exact commands)

```bash
# 1. Claude VERIFIES (read-only) whether 0035 is applied to the linked PROD project:
supabase migration list
#    → look for 0035 in the Remote column. If present → MKT-01 schema side satisfied.
#    → if absent from Remote, instruct the USER to apply it (Claude does NOT push):

# 2. USER applies (PROD mutation = owner action). Suggest, do not auto-run:
supabase db push        # (or: npm run db:push)

# 3. "Present in account" satisfaction (PROD was wiped 2026-06-19 → zero accounts):
#    - Re-seeded handle_new_user() (part 1 of 0035) gives the NEXT signup "Marketplace".
#    - Idempotent backfill (part 2) covers any account existing BEFORE push (currently none).
#    → human-verify: user re-signs up in PROD, re-enters BYOK key, sees "Marketplace" category.
```
`0035` is **data + trigger redef only — no schema change** → `database.types.ts` is unaffected; do
NOT run `npm run gen:types` for this phase `[VERIFIED: 0035 file header + body — only function redef
+ data insert]`.

## Sources

### Primary (HIGH confidence)
- `src/lib/ai/classify.ts` — `[VERIFIED]` SYSTEM_PROMPT, buildUserText, JSON_SCHEMA flat, result loop, signature.
- `src/lib/classifier/suggest.ts` — `[VERIFIED]` suggestCategory delegates to classifyDescriptors; validateSuggestion enum gate.
- `src/lib/ai/classify.test.ts` — `[VERIFIED]` CATEGORIES fixture, describe patterns, SEC-03 egress assertions.
- `src/lib/classifier/suggest.test.ts` — `[VERIFIED]` CATEGORIES fixture + validateSuggestion pinning.
- `tests/pii-guard.test.ts` — `[VERIFIED]` CATEGORIES fixture, doGenerate spy.
- `src/actions/import.test.ts` — `[VERIFIED]` classifyDescriptors mock signature (lines 280–296).
- `src/actions/import.ts` — `[VERIFIED]` `.select('id, name')` at line 423, classifyDescriptors call at 491.
- `src/lib/schemas/category.ts` — `[VERIFIED]` CATEGORY_KINDS = ['consumo','alocacao'], CategoryKind type.
- `supabase/migrations/0035_categories_marketplace.sql` — `[VERIFIED]` data + trigger only, Marketplace sort 9 consumo + idempotent backfill.
- `package.json` / `.planning/config.json` / `supabase --version` — `[VERIFIED]` scripts, nyquist=true, CLI 2.103.0.

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — `[CITED]` CLSAI-09 + MKT-01 exact text.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all reuse verified against installed deps.
- Architecture/diff shape: HIGH — every edit point read from the actual source this session.
- Test strategy: HIGH — fixtures and describe patterns read directly; ripple call sites grepped.
- MKT-01 verification: HIGH — migration body read; PROD-wipe context from project memory.

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable — local source-grounded; only `database.types.ts` `kind`
nullability needs a quick confirm at plan time, per A1).
