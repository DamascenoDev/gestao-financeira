# Phase 20: Auto-classificação por palavra-chave no upload - Research

**Researched:** 2026-06-19
**Domain:** Deterministic in-memory keyword matching inserted into an existing memory→AI upload classification pipeline (Next.js Server Action, TS strict)
**Confidence:** HIGH (everything grounded in the actual codebase; no external dependency, no new package, no migration)

## Summary

Phase 20 inserts a third deterministic layer — **palavra-chave** — between the existing PASS 1 memory lookup and the single batched AI call in `src/actions/import.ts`. The work is small and almost entirely additive: a new pure matcher (`src/lib/classifier/keywords.ts`), one upfront RLS-scoped fetch of `category_keywords`, a four-line insertion inside the existing PASS 1 loop, three one-token union extensions, two badge branches, and the origin-derivation fix at `page.tsx:204`. No new migration (Phase 19's `0036_category_keywords` table is the source). No PROD push is a gate — fully local/testable.

The single highest-value finding for the planner: **the origin signal that drives the badge does NOT survive the round-trip through `ParsedReviewRow` as a typed field today.** `page.tsx:204` re-derives `origin` purely from `category_id` (`category_id === null ? 'não classificada' : 'memória'`) and ignores the persisted `classification_source`. To make the `'palavra-chave'` badge render, `page.tsx:204` MUST be changed to read `classification_source` (which IS persisted on the parsed row by PASS 1). This is the load-bearing wiring, not the union edits.

The second finding: **`confirmImport` needs ZERO changes for KW-05 to work correctly.** The merchant-pattern learn loop (lines 847–882) gates only on `r.categoryId` — a keyword-classified row already learns `descriptor_norm → category_id` exactly like a memory or manual row. The `classification_source: r.categoryId ? 'memória' : null` line at 791 persists a label on the `transactions` row, but it ALREADY mislabels manually-picked rows as `'memória'` (it does not read the per-row origin at all). It is a coarse persisted approximation, not the review-time provenance. Leave it as-is; do NOT special-case keyword rows there.

**Primary recommendation:** Build `matchKeyword` as a pure function, fetch `category_keywords` (joined to `categories.sort` for the tie-break) once before PASS 1, insert the keyword pass on the memory-miss branch, fix `page.tsx:204` to read `classification_source`, extend the three unions, add the two badge branches with a `Tags` icon. Pin everything with a matcher unit test + an import-pipeline ordering test + a badge test.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Keyword substring matching | Pure lib (`keywords.ts`) | — | In-memory, deterministic, no IO; testable in isolation like `normalize.ts` |
| Fetch user's keywords (RLS) | API/Server Action (`import.ts`) | Database (RLS) | Must run under the RLS-active server client; one fetch, never per-row |
| Pipeline ordering memória→keyword→IA | API/Server Action (`import.ts`) | — | Orchestration lives where memory + AI already orchestrate |
| Provenance persistence on confirm | API/Server Action (`confirmImport`) | Database | No change needed — learn loop is category-gated, origin-agnostic |
| Origin derivation for badge | Frontend Server (`page.tsx` RSC) | — | The RSC maps `ParsedReviewRow` → `ReviewRow`; origin derived here |
| Badge rendering | Browser/Client (`import-review-table.tsx`, `origin-badge.tsx`) | — | Pure presentation of the derived `origin` |

## Standard Stack

No new packages. Everything reuses what is already vendored.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lucide-react` | already vendored | `Tags` (or `Tag`) icon for the OriginBadge keyword variant | Same library as `Brain`/`Pencil`/`Sparkles` already in `origin-badge.tsx` [VERIFIED: codebase grep — `origin-badge.tsx:1`] |
| `vitest` | already configured | matcher + pipeline + badge tests | Existing harness (`import.test.ts`, `import-review-table.test.tsx`) [VERIFIED: codebase] |

**Installation:** none. `lucide-react` is a dependency; `Tags`/`Tag` are icons within it. [CITED: 20-UI-SPEC.md §Registry Safety — "no new runtime dependency"]

## Package Legitimacy Audit

> Not applicable — Phase 20 installs no external packages. The only new import is the `Tags` named export from the already-installed `lucide-react`. No registry, no install, no legitimacy gate.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Project Constraints (from CLAUDE.md)

- **TS estrito, sem JavaScript** — the matcher and all edits are `.ts`/`.tsx`, fully typed; no `any`, narrow unions.
- **Memory-first, ONE AI call per upload (CLSAI-03)** — keyword is a FREE deterministic layer BEFORE the AI; keyword hits MUST be excluded from `missNorms` so the AI batch shrinks.
- **"Nunca confie no modelo"** — N/A for keyword (deterministic, no model). The enum gate (`validateSuggestion`) is the AI path's concern; keyword writes a `category_id` that is, by construction, one of the user's own categories (the fetch is RLS-scoped to the user's `category_keywords` whose `category_id` FKs to the user's own categories).
- **RLS scopes the `category_keywords` fetch** — the upfront fetch runs on the RLS-active server client (`createClient()`), so it only ever returns the caller's rows. No `user_id` filter needed in app code (mirrors the `categories` and `merchant_patterns` reads). [VERIFIED: codebase — `0036_category_keywords.sql` policy `using ((select auth.uid()) = user_id)`]
- **revalidate** — no new path to revalidate this phase (no write outside the existing confirm path).
- **GSD workflow** — all edits via the phase plan.

## Architecture Patterns

### System Architecture Diagram

```
Upload (OFX/CSV/PDF buffer)
        │
        ▼
  parse → normalizeDescriptor → rawRows[] (each has descriptor_norm)
        │
        ▼
  ┌─────────────────── ingestStatement (import.ts) ───────────────────┐
  │                                                                    │
  │  PRE-FETCH (once, RLS-scoped):                                     │
  │    • categoryList  (id, name, kind)        ~line 421-435           │
  │    • keywordRules  (categoryId, keyword, sort)  ◄── NEW            │
  │                                                                    │
  │  PASS 1 loop (per row)  ~line 461-488:                             │
  │    lookupMemory(descriptor_norm)                                   │
  │       │HIT → category_id + source='memória'  ───────────┐         │
  │       │MISS                                              │         │
  │         ▼                                                │         │
  │       matchKeyword(descriptor_norm, keywordRules) ◄─ NEW │         │
  │         │HIT  → category_id + source='palavra-chave' ────┤ (NOT   │
  │         │       (binding pre-fill, NOT added to missNorms)│  missNorm)
  │         │MISS → missNorms.add(descriptor_norm) ───────────┘         │
  │                                                                    │
  │  ONE classifyDescriptors([...missNorms]) ~line 496-512             │
  │       (only true misses reach the AI — keyword rows excluded)      │
  │                                                                    │
  │  PASS 2 attach row.suggestion (non-binding) ~line 517-525          │
  │                                                                    │
  │  persist parsed_rows jsonb on statements (carries classification_source)
  └────────────────────────────────────────────────────────────────────┘
        │
        ▼
  Review RSC (page.tsx) maps ParsedReviewRow → ReviewRow
        origin = derive from classification_source  ◄── FIX line 204
        │
        ▼
  import-review-table.tsx  → ProvenanceBadge + OriginBadge ('palavra-chave')
        │
        ▼ (user overwrites optionally → origin flips to 'manual')
  confirmImport → INSERT transactions + UPSERT merchant_patterns (learns; NO change)
```

### Recommended Project Structure

```
src/lib/classifier/
├── memory.ts        # existing — lookupMemory (the hit/null contract to mirror)
├── suggest.ts       # existing — validateSuggestion (AI enum gate; reference only)
├── keywords.ts      # NEW — matchKeyword (pure, in-memory)
└── keywords.test.ts # NEW — matcher unit tests
```

### Pattern 1: The pure matcher (mirror `lookupMemory`'s hit/null contract)

**What:** A pure function over an in-memory rule list. No Supabase, no async — unlike `lookupMemory` (which is a point-read), the keyword list is pre-fetched once, so matching is synchronous.
**When to use:** Inside PASS 1, on a memory MISS only.

```typescript
// src/lib/classifier/keywords.ts
// [VERIFIED: codebase] mirrors the MemoryHit { categoryId } | null contract of memory.ts,
// but pure/synchronous over a pre-fetched list (no per-row query — KW longest-wins is a
// CPU scan, not a DB call). Both `descriptorNorm` and every `rule.keyword` are already
// normalized by the SAME normalizeDescriptor (Phase 19 stores keyword normalized), so the
// substring test is apples-to-apples.

/** One keyword rule: a normalized term, its category, and the category's sort for tie-break. */
export interface KeywordRule {
  categoryId: string
  keyword: string   // normalizeDescriptor output (Phase 19)
  sort: number      // categories.sort — deterministic tie-break for equal-length matches
}

/** A keyword match resolves to exactly a category (category-only; reserva stays null). */
export interface KeywordMatch {
  categoryId: string
}

/**
 * Longest-keyword-wins substring match (KW-04). Returns the category whose keyword
 * is CONTAINED in descriptorNorm and is the LONGEST such keyword; ties (equal length,
 * different category) break by the lower categories.sort (deterministic). Empty
 * descriptorNorm matches nothing (the normalize '' non-match sentinel).
 */
export function matchKeyword(
  descriptorNorm: string,
  rules: KeywordRule[],
): KeywordMatch | null {
  if (descriptorNorm === '') return null // KW guard: '' matches nothing
  let best: KeywordRule | null = null
  for (const rule of rules) {
    if (rule.keyword === '') continue // defensive: a '' rule would match everything
    if (!descriptorNorm.includes(rule.keyword)) continue
    if (
      best === null ||
      rule.keyword.length > best.keyword.length ||
      (rule.keyword.length === best.keyword.length && rule.sort < best.sort)
    ) {
      best = rule
    }
  }
  return best ? { categoryId: best.categoryId } : null
}
```

[CITED: 20-CONTEXT.md §Algoritmo de match — substring, longest wins, tie by category sort, '' matches nothing, returns `{ categoryId } | null`]

### Pattern 2: The upfront fetch (lowest-complexity path = join `categories.sort`)

**What:** ONE fetch of `category_keywords`, joined to `categories` for the `sort` tie-break.
**When to use:** Immediately after the existing `categoryList` pre-fetch (~line 435), before PASS 1.

**The tie-break needs `categories.sort`.** Two equally-valid fetch shapes:

- **(A — recommended) Join in one query** via PostgREST's embedded resource selector. `category_keywords` FKs `category_id → categories.id`, so:
  ```typescript
  const { data: kwRows } = await supabase
    .from('category_keywords')
    .select('category_id, keyword, categories(sort)')
  const keywordRules: KeywordRule[] = (kwRows ?? []).map((k) => ({
    categoryId: k.category_id,
    keyword: k.keyword,
    sort: k.categories?.sort ?? 0, // FK guarantees a row; ?? 0 satisfies strict null
  }))
  ```
  One round-trip, RLS-scoped on both tables. The generated `Database` type returns the embedded `categories` as an object (single FK).

- **(B — alternative) Reuse the already-fetched categories for sort.** The `categoryList` fetch at line 422 does NOT currently select `sort`. You could add `sort` to that select and build a `Map<categoryId, sort>`, then fetch `category_keywords` with just `select('category_id, keyword')` and look up sort from the map. This avoids the embedded join but touches the existing `categoryList` shape.

**Recommendation: (A).** It is the lowest-complexity path — one self-contained new fetch, zero change to the existing `categoryList` block, and the embedded selector is idiomatic Supabase. Do NOT `select('id')` — you don't need the keyword row id for matching (matching is by `category_id`).

### Pattern 3: The PASS 1 insertion (the exact diff)

**What:** On the memory MISS branch (the `else` at line 474–477), try `matchKeyword`; on a keyword hit, set `category_id` + `source='palavra-chave'` and DO NOT add to `missNorms`; on a keyword miss, fall through to `missNorms.add` exactly as today.

**Precise insertion** — replace lines 474–477 (the current `else { missNorms.add(...) }`):

```typescript
    if (hit) {
      categoryId = hit.category_id
      reservaId = hit.reserva_id
      source = 'memória'
    } else {
      // PALAVRA-CHAVE (KW-02/03/04): memory prevailed first; now try the deterministic
      // keyword layer BEFORE the AI. A hit is a BINDING pre-fill (mirrors memory) — it
      // sets category_id + source and is EXCLUDED from missNorms so the AI batch shrinks.
      const kw = matchKeyword(raw.descriptor_norm, keywordRules)
      if (kw) {
        categoryId = kw.categoryId
        // reservaId stays null — category-only (CONTEXT.md); reserva tagging is manual.
        source = 'palavra-chave'
      } else {
        // TRUE miss — only now collect for the ONE batched classify.
        missNorms.add(raw.descriptor_norm)
      }
    }
```

Everything below (the `rows.push({...})` at 479–487, PASS 2 at 514–525) is untouched: PASS 2 already skips rows where `row.category_id !== null` (line 519), so a keyword-classified row is never overwritten by an AI suggestion — memória > keyword > IA falls out for free. [VERIFIED: codebase — import.ts:519 `if (row.category_id !== null) continue`]

### Pattern 4: The origin-derivation fix (THE load-bearing UI wiring)

**What:** `page.tsx:204` currently derives `origin` from `category_id` alone, hardcoding `'memória'` for ANY classified row. The keyword badge cannot render until this reads `classification_source`.

```typescript
// src/app/(app)/importar/[statementId]/page.tsx ~line 204 — BEFORE:
origin: r.category_id === null ? 'não classificada' : 'memória',

// AFTER — derive from the persisted classification_source (which PASS 1 sets):
origin:
  r.category_id === null
    ? 'não classificada'
    : r.classification_source === 'palavra-chave'
      ? 'palavra-chave'
      : 'memória',
```

**Why this is safe:** A classified parsed row's `classification_source` is set by PASS 1 to exactly `'memória'` or `'palavra-chave'` (manual/IA never apply at ingest — IA is non-binding `suggestion`, manual happens client-side post-load). So the only two classified ingest origins are memória and palavra-chave; the fallback `: 'memória'` correctly handles every non-keyword classified row. [VERIFIED: codebase — import.ts only sets `source` to 'memória' (473) or null (then keyword adds 'palavra-chave'); `ParsedReviewRow.classification_source` IS persisted in `parsed_rows` jsonb at line 543]

### Pattern 5: The three union edits + two badge branches

```typescript
// 1. src/lib/parsers/types.ts:53
export type ClassificationSource = 'memória' | 'palavra-chave' | 'manual' | 'sugerida' | null

// 2. src/components/import-review-table.tsx:218 (ReviewRow.origin)
origin: 'memória' | 'palavra-chave' | 'manual' | 'não classificada'

// 3. src/components/origin-badge.tsx:16 (OriginVariant)
export type OriginVariant = 'memória' | 'palavra-chave' | 'manual' | 'não classificada' | 'sugerida'
```

```typescript
// 4. origin-badge.tsx VARIANT map — add the entry (import Tags from 'lucide-react'):
'palavra-chave': {
  label: 'Palavra-chave',                  // Title Case — mirrors 'Memória'
  className: 'bg-muted text-muted-foreground', // neutral, same as memória (NOT gold)
  Icon: Tags,                               // distinct from Brain (reserved for memória)
},

// 5. import-review-table.tsx ProvenanceBadge (~line 133) — add the branch:
if (row.origin === 'palavra-chave') {
  return (
    <AffordancePill className="bg-secondary text-secondary-foreground">
      palavra-chave
    </AffordancePill>
  ) // lowercase, NO icon — mirrors the 'memória' branch exactly
}
```

The mobile-card OriginBadge at line 814 (`variant={r.category_id === null ? 'não classificada' : r.origin}`) needs NO change — it already passes `r.origin` straight through, so the new `'palavra-chave'` variant appears in both desktop (line 528) and mobile with only the VARIANT-map entry. [VERIFIED: codebase — import-review-table.tsx:814,528]

The overwrite path (`classifyRow`, line 344) already sets `origin: 'manual'` on any pick, so overwriting a keyword row flips it to manual and drops the pill — identical to a memória overwrite. No change. [VERIFIED: codebase — import-review-table.tsx:344]

### Anti-Patterns to Avoid

- **Re-normalizing the keyword or descriptor inside the matcher.** Both are ALREADY normalized by `normalizeDescriptor` (Phase 19 stores the keyword normalized; the parser produces `descriptor_norm`). Re-deriving would drift the key space. [CITED: normalize.ts header — "never re-derive it in a cell, query, or action"]
- **Adding keyword hits to `missNorms`.** That would send them to the AI, defeating the "fewer AI calls" goal (CLSAI-03) and re-classifying an already-resolved row.
- **Special-casing keyword rows in `confirmImport`.** The learn loop is category-gated and origin-agnostic; touching it risks the working memory-learn path.
- **Persisting `classification_source: 'palavra-chave'` on the `transactions` row at line 791.** Out of scope — that column already approximates ('memória' for manual picks too). The badge is review-time provenance, read from the parsed row, not the transaction.
- **A `''` keyword rule.** Guard against it in the matcher (it would `includes`-match everything). Phase 19's `addKeyword` already rejects empty-normalizing input, so this is defensive only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Descriptor normalization | A new lowercasing/accent-strip pass for keyword compare | `normalizeDescriptor` (already applied to both sides) | Drift between match key and display key is the documented anti-pattern; both sides share one derivation |
| Per-row keyword lookup | A `category_keywords` query inside the PASS 1 loop | ONE upfront fetch + in-memory `matchKeyword` | Mirrors the `categoryList`/dedupe batched-fetch pattern; N queries in a loop is the WR-02 anti-pattern |
| Memory-vs-keyword precedence | A separate priority resolver | The existing `if (hit) … else …` structure | Memory naturally prevails because keyword only runs in the `else` |
| Keyword-vs-AI precedence | A post-pass to strip keyword rows from AI results | Just don't add them to `missNorms` | PASS 2's `category_id !== null` gate already protects them too |

**Key insight:** Every precedence rule (KW-03) falls out of WHERE the keyword pass sits in the existing control flow — no new ordering logic is needed.

## Common Pitfalls

### Pitfall 1: The badge never renders despite correct unions
**What goes wrong:** You extend all three unions and add both badge branches, but the keyword pill never appears.
**Why it happens:** `page.tsx:204` re-derives `origin` from `category_id` and hardcodes `'memória'` — the `classification_source` you set in PASS 1 is silently discarded at the RSC boundary.
**How to avoid:** Fix `page.tsx:204` to read `r.classification_source` (Pattern 4). This is the single most likely thing to be missed.
**Warning signs:** Badge tests pass (they construct `ReviewRow` directly with `origin: 'palavra-chave'`) but the live grid shows "memória" on keyword rows.

### Pitfall 2: Keyword rows still hit the AI
**What goes wrong:** AI call count doesn't drop; keyword descriptors appear in the `classifyDescriptors` argument.
**Why it happens:** The keyword hit branch fell through to `missNorms.add` (mis-placed `else`).
**How to avoid:** The keyword-hit branch must NOT reach `missNorms.add`; only the keyword-MISS inner `else` does (Pattern 3). Pin with the pipeline test asserting the keyword descriptor is absent from `classifyDescriptors.mock.calls[0][0]`.

### Pitfall 3: Tie-break is non-deterministic
**What goes wrong:** Two categories have an equal-length matching keyword; the winner flickers between runs / rows.
**Why it happens:** Relying on `category_keywords` fetch order instead of an explicit `sort` tie-break.
**How to avoid:** Carry `categories.sort` into each rule and break ties by `sort` (lower wins), as in `matchKeyword`. Pin with a tie test.

### Pitfall 4: Embedded-join type is null-unsafe under strict TS
**What goes wrong:** `k.categories.sort` errors — `categories` may be typed `… | null`.
**How to avoid:** `k.categories?.sort ?? 0`. The FK guarantees a row at runtime; the `?? 0` satisfies strict null-checks. (sort default is `0` anyway.)

## Code Examples

### Pipeline ordering test (the core Nyquist assertion)

```typescript
// src/actions/import.test.ts — extend the existing ingestStatement describe block.
// The harness mocks Supabase per-table (makeBuilder), lookupMemory via memoryHits,
// and classifyDescriptors as a spy. Add a `keywordRules` fixture + a builder branch.

// In makeBuilder's `.then` thenable (mirror the categories branch ~line 197):
if (from === 'category_keywords') {
  return resolve({ data: keywordRows, error: null }) // [{ category_id, keyword, categories: { sort } }]
}

// Test: memória > palavra-chave > IA, and keyword excluded from the AI batch.
it('ordering memória>keyword>IA: keyword row is pre-filled and EXCLUDED from the AI batch', async () => {
  memoryHits = { 'netflix com': { category_id: 'cat-stream', reserva_id: null } }
  keywordRows = [{ category_id: 'cat-transp', keyword: 'uber', categories: { sort: 1 } }]
  aiSettings = { provider: 'google', model: 'm', apiKey: 'k' }
  // upload has rows: "netflix" (memory), "uber trip" (keyword), "padaria zé" (true miss)
  // → assert uber row: category_id = cat-transp, source 'palavra-chave'
  // → assert classifyDescriptors called once with ONLY ['padaria ze'] (no 'uber trip')
})

// Test: longest-wins end-to-end.
it('longest-wins: "mercado livre" (Marketplace) beats "mercado" (Alimentação)', async () => {
  keywordRows = [
    { category_id: 'cat-alim', keyword: 'mercado', categories: { sort: 0 } },
    { category_id: 'cat-mkt', keyword: 'mercado livre', categories: { sort: 1 } },
  ]
  // descriptor "mercado livre ..." → category_id = cat-mkt
})
```

[VERIFIED: codebase — import.test.ts mock harness: `memoryHits` (314), `classifyDescriptors` spy (280), `.then` table dispatch (184–234)]

### Matcher unit tests

```typescript
// src/lib/classifier/keywords.test.ts — pure, no mocks (mirrors a normalize-style test).
describe('matchKeyword', () => {
  const rules = [
    { categoryId: 'transp', keyword: 'uber', sort: 1 },
    { categoryId: 'alim', keyword: 'mercado', sort: 0 },
    { categoryId: 'mkt', keyword: 'mercado livre', sort: 2 },
  ]
  it('substring match', () => expect(matchKeyword('uber trip', rules)).toEqual({ categoryId: 'transp' }))
  it('longest wins', () => expect(matchKeyword('compra mercado livre sp', rules)).toEqual({ categoryId: 'mkt' }))
  it('no match → null', () => expect(matchKeyword('padaria ze', rules)).toBeNull())
  it("'' matches nothing", () => expect(matchKeyword('', rules)).toBeNull())
  it('equal length tie → lower sort wins', () => {
    const tie = [
      { categoryId: 'a', keyword: 'pão', sort: 2 },
      { categoryId: 'b', keyword: 'pão', sort: 1 },
    ]
    expect(matchKeyword('pão de queijo', tie)).toEqual({ categoryId: 'b' })
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 2-layer pipeline memória→IA | 3-layer memória→palavra-chave→IA | This phase | Deterministic free layer shrinks the AI batch; more rows pre-classified with zero cost |

**Deprecated/outdated:** none relevant. No library churn — this is pure app logic over existing primitives.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The PostgREST embedded selector `categories(sort)` returns a single object (not array) typed by `Database` generics | Pattern 2 | LOW — if it types as an array, use `k.categories?.[0]?.sort ?? 0`. Verify at write-time via the generated `database.types.ts`; trivial fix either way. |
| A2 | A classified parsed row's `classification_source` is only ever 'memória' or 'palavra-chave' at ingest (manual/IA never apply at parse time) | Pattern 4 | LOW — verified: `import.ts` sets `source` to 'memória' or null only; the keyword pass adds 'palavra-chave'. The `: 'memória'` fallback is correct for all classified ingest rows. |

**Two LOW-risk assumptions, both with trivial in-line fallbacks.** No user confirmation needed — all locked decisions in CONTEXT.md are honored.

## Open Questions

None. All five research questions in the brief are answered concretely above:
1. `matchKeyword` signature + algorithm → Pattern 1; fetch shape → Pattern 2 (recommend join `categories(sort)`).
2. Exact `import.ts` diff → Pattern 3 (replace lines 474–477).
3. `confirmImport` (~791) → no change needed; learn loop is category-gated; the 791 label is a pre-existing coarse approximation (already mislabels manual as 'memória'), review-time provenance lives on the parsed row.
4. Three union edits + two badge branches → Pattern 5; the load-bearing extra edit is `page.tsx:204` (Pattern 4).
5. Test strategy → Code Examples + Validation Architecture below.

## Environment Availability

> Skip — no external dependency. Pure local app logic over the existing Supabase schema (migrations `0035`/`0036` already applied locally per CONTEXT.md). No new tool, service, or runtime. No PROD push is a gate.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `vitest.config.*` (existing — `import.test.ts` and `import-review-table.test.tsx` run today) |
| Quick run command | `npx vitest run src/lib/classifier/keywords.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KW-02 | descriptor containing keyword → pre-filled category, source='palavra-chave', no click | unit + integration | `npx vitest run src/lib/classifier/keywords.test.ts` + `src/actions/import.test.ts` | ❌ matcher Wave 0; ✅ import.test.ts exists |
| KW-03 | order memória→keyword→IA; memory prevails; keyword excluded from missNorms | integration | `npx vitest run src/actions/import.test.ts` | ✅ (extend) |
| KW-04 | >1 keyword matches → longest wins; tie → category sort | unit + integration | `npx vitest run src/lib/classifier/keywords.test.ts` | ❌ Wave 0 |
| KW-05 | overwritable in grid; nothing persists till confirm; confirm learns merchant→category as today | integration + component | `npx vitest run src/actions/import.test.ts` (confirm learn) + `src/components/import-review-table.test.tsx` | ✅ both exist (extend) |
| KW-05 (badge) | 'palavra-chave' pill renders in both ProvenanceBadge + OriginBadge | component | `npx vitest run src/components/import-review-table.test.tsx` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/classifier/keywords.test.ts` (matcher) or the touched test file.
- **Per wave merge:** `npx vitest run src/lib/classifier src/actions/import.test.ts src/components/import-review-table.test.tsx`
- **Phase gate:** `npx vitest run` full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/lib/classifier/keywords.test.ts` — covers KW-02/KW-04 matcher (substring, longest, tie, empty)
- [ ] Extend `src/actions/import.test.ts` — add `keywordRows` fixture + a `category_keywords` branch in `makeBuilder.then` (mirror the `categories` branch ~line 197); assert KW-03 ordering + keyword exclusion from the AI batch + longest-wins end-to-end
- [ ] Extend `src/components/import-review-table.test.tsx` — assert the `'palavra-chave'` ProvenanceBadge (lowercase, no icon) and OriginBadge variant (Title Case + `Tags` icon) render

**Env-flaky note (from MEMORY.md):** live Supabase integration tests are env-flaky; ALL Phase 20 tests use the existing in-memory `makeBuilder` mock + pure-function tests — no live Supabase, deterministic. Do NOT add a live-DB test for the keyword fetch.

## Security Domain

> `security_enforcement` not explicitly false — assessed. Phase 20 introduces no new attack surface beyond Phase 19's already-RLS'd table.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth surface; reuses the session-scoped server client |
| V3 Session Management | no | Unchanged |
| V4 Access Control | yes | RLS on `category_keywords` (Phase 19, `0036`): the upfront fetch on the RLS-active server client returns ONLY the caller's rows — no app-layer `user_id` filter relied upon |
| V5 Input Validation | yes | Keyword terms were validated + normalized at write-time (Phase 19 `keywordSchema` + `normalizeDescriptor`); the matcher consumes already-clean data. The matched `category_id` is, by FK, one of the user's own categories |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-user keyword leakage (reading another user's rules) | Information Disclosure | RLS `using (auth.uid() = user_id)` on `category_keywords` (0036); fetch is RLS-scoped [VERIFIED: codebase — 0036 policy] |
| Forged category_id via keyword rule | Tampering / Elevation | The keyword's `category_id` FKs to `categories` under the same user's RLS; Phase 19 `addKeyword` derives `user_id` from `getClaims().sub`, never the client — a keyword can only point at an owned category |
| Learning-poisoning on confirm | Tampering | Unchanged — `confirmImport` re-reads authoritative `descriptor_norm` from the persisted parsed row (WR-01); the client cannot forge what gets learned [VERIFIED: codebase — import.ts:703-719] |

**No new prompt-injection surface:** keyword matching is deterministic and never touches the LLM. If anything, it REDUCES the AI surface by classifying more rows deterministically before the single AI call.

## Sources

### Primary (HIGH confidence — codebase, verified this session)
- `src/actions/import.ts` (PASS 1 ~455-488, AI pass ~496-525, persist ~543, confirmImport learn ~847-882, line 791 source label) — the exact insertion points
- `src/lib/classifier/memory.ts` — the `MemoryHit { categoryId } | null` contract mirrored by `matchKeyword`
- `src/lib/normalize.ts` — single shared `normalizeDescriptor`; both keyword + descriptor_norm derive from it
- `src/actions/category-keywords.ts` + `src/lib/schemas/category-keyword.ts` + `supabase/migrations/0036_category_keywords.sql` — keyword stored normalized, RLS shape, columns (`category_id`, `keyword`)
- `supabase/migrations/0002_categories.sql` — `categories.sort` column exists (line 15) → the tie-break source
- `src/lib/parsers/types.ts:53` (ClassificationSource), `src/components/import-review-table.tsx` (ProvenanceBadge 131, ReviewRow.origin 218, classifyRow 344, OriginBadge call sites 528/814), `src/components/origin-badge.tsx:16` (OriginVariant + VARIANT map)
- `src/app/(app)/importar/[statementId]/page.tsx:204` — the origin-derivation hardcode (the load-bearing fix)
- `src/actions/import.test.ts` — the mock harness (`makeBuilder` `.then` 184-234, `memoryHits` 314, `classifyDescriptors` spy 280)

### Secondary (CITED — phase docs)
- `20-CONTEXT.md` — locked algorithm, ordering, binding, category-only, KW-05 confirm-learn
- `20-UI-SPEC.md` — the two badge surfaces, neutral tokens, casing, `Tags`/`Tag` icon, no-new-dependency

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; only an existing `lucide-react` icon
- Architecture / insertion diff: HIGH — every line number and control-flow gate verified against the live source
- Pitfalls: HIGH — Pitfall 1 (page.tsx:204) and confirmImport no-change both verified by reading the actual code
- Tie-break source (`categories.sort`): HIGH — column confirmed in migration 0002

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable — pure app logic; only churn risk is the embedded-join type shape, A1, trivially handled at write-time)
