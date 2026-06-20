# Phase 21: Match wildcard + procedência persistida - Research

**Researched:** 2026-06-20
**Domain:** Deterministic glob matching in TypeScript (ReDoS-safe) + Postgres CHECK constraint widening + server-side provenance re-derivation
**Confidence:** HIGH (all claims verified against the live codebase; no external packages introduced)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wildcard semantics & matching**
- `*` = glob "zero or more characters" (standard semantics).
- ReDoS-safe implementation: escape all regex metacharacters in the literal, replace `*` with `.*`, anchor `^…$`, match linearly against `descriptor_norm`. No catastrophic backtracking (an anchored regex with a single `.*` per segment is linear). A manual two-pointer matcher is an acceptable alternative if preferred, but the escaped anchored regex is the recommended path.
- Opt-in dichotomy: a pattern **with** `*` is evaluated as an **anchored glob** (`^` + escaped literals + `.*` + `$`) — so `UBER*` matches `UBER TRIP 123` (prefix) and `*IFOOD*` ≡ "contains IFOOD". A term **without** `*` stays the current `descriptorNorm.includes(keyword)` substring (v1.5 behavior intact).
- Case/accent: matching stays in `normalizeDescriptor` space (both sides already uppercase + accent-free from Phase 19/parser); no extra case/accent handling.

**Longest-wins specificity with wildcards**
- Specificity metric for tie-break: **count of literal (non-`*`) chars** of the pattern. `UBER*` = 4 literals (beats `UB*`=2, loses to substring `UBER TRIP`=9). Honest proxy for "how much the pattern anchors".
- Literal-count tie: **contiguous substring beats glob** (more restrictive) → then `categories.sort` → then `categoryId` (preserves v1.5's deterministic tie-break chain; no descriptor silently flips category between uploads).
- No cross-fallback: a pattern **with** `*` is glob-only; **without** `*` is substring-only. Clean and opt-in.
- Degenerate patterns (`*`, `**`, wildcard-only with no literal) are **skipped** — they would match everything; mirrors the existing empty-keyword guard in `matchKeyword`.

**Persisted provenance (`palavra-chave`)**
- Migration: a new `0037` that drop+recreates the CHECK on `transactions.classification_source` adding `'palavra-chave'` to the allowed set (`'memória'`,`'manual'`,`'sugerida'`,`null` → + `'palavra-chave'`). Keeps `text` type + CHECK (does NOT convert to a Postgres enum).
- No backfill of old rows marked with the coarse `memória` — cannot reconstruct post-hoc which were really keyword; only NEW confirmations write `'palavra-chave'`. History stays as-is.
- Provenance source on persist: **re-derived server-side** at confirm (re-runs memory→keyword over the authoritative base row), consistent with WR-01 (server is the source of truth; never trusts the source from the client).
- Scope restricted to keyword: memory→`'memória'`, keyword→`'palavra-chave'`. A row with `category_id` present that matches neither memory nor keyword (manual pick / accepted AI suggestion in the grid) keeps today's coarse `'memória'` — **no regression**, no attempt to disambiguate manual/AI in this phase.

### Claude's Discretion
- Exact naming/file of the new migration (`0037_*`), the glob helper name, and exactly where to thread the re-derivation at confirm — at discretion, following repo conventions.

### Deferred Ideas (OUT OF SCOPE)
- **KW-F (pure regex)** in a keyword — out, ReDoS + user-error risk; revisit only if glob wildcard proves insufficient. (Already in Future Requirements.)
- Disambiguating provenance of manual picks / accepted AI suggestions on persist (today coarse `'memória'`) — out of KW-10's scope.
- Historical backfill of coarse `'memória'` rows — discarded (data not reconstructible).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KW-09 | User can use glob wildcard (`*`) in a keyword (`UBER*`, `*IFOOD*`) on top of the current substring match; on conflict the more specific keyword wins ("longest wins" preserved). | §1 (ReDoS-safe glob→regex), §2 (glob-vs-substring branch in `matchKeyword`), §3 (specificity comparator). **CRITICAL** §Pitfall 1: the `*` is destroyed at cadastro time by `normalizeDescriptor` — the cadastro path MUST change or the feature cannot work. |
| KW-10 | The `palavra-chave` provenance is persisted in `transactions.classification_source` (stops writing coarse `memória`), via widening the 0020 CHECK. | §4a (new 0037 migration SQL — note the 0020 CHECK is **anonymous**), §4b (db push + gen:types workflow), §4c (re-derive source at commit-time insert ~829). |
</phase_requirements>

## Summary

This phase is small in surface area (two TS files, one server action, one migration) but contains **one make-or-break landmine** that CONTEXT.md's "keyword is stored normalized" premise actively conflicts with. `normalizeDescriptor` (`src/lib/normalize.ts`) **strips every `*`** at two points (line 48 `.replace(/\*+/g, ' ')` — the card-network noise strip — and line 50 `.replace(/[^a-z0-9 ]/g, ' ')`). The keyword cadastro action `addKeyword` (`src/actions/category-keywords.ts:55`) runs `normalizeDescriptor(parsed.data)` before persisting. **Therefore `UBER*` is currently stored as `uber` — the wildcard is annihilated at write time.** No matter how good the matcher is, the feature is dead unless the cadastro path is changed to preserve `*`. This is the #1 thing the planner must address, and it is NOT mentioned as a task in CONTEXT.md (CONTEXT treats "stored normalized" as still true). Flag loudly.

For the matcher itself, the locked design (escape literals, `*`→`.*`, anchor `^…$`) is correct and ReDoS-safe: an anchored pattern with `.*` runs (no nested quantifiers, no overlapping alternation) is linear-time in V8's regex engine. The glob should be compiled to a `RegExp` **once per rule at pre-fetch** (not per row) since the matcher runs N rows × M rules in-memory. The specificity metric ("count of literal non-`*` chars") composes cleanly onto the existing `length → sort → categoryId` chain — for a substring (no `*`) literal-count == `keyword.length`, so v1.5 behavior is bit-identical, with one new tie-break rung inserted: at equal literal-count, contiguous substring beats glob.

For KW-10, the 0020 CHECK is **anonymous** (`add column … check (…)` with no `constraint <name>`), so the 0037 migration must look up and drop the auto-generated constraint name (or use `ALTER TABLE … DROP CONSTRAINT IF EXISTS <auto_name>`). The `classification_source` column is `text` and the generated `database.types.ts` already types it as `string | null` and the TS union `ClassificationSource` already includes `'palavra-chave'` — so **no type regeneration is functionally required**, but `gen:types` should still be run per CLAUDE.md discipline (it will be a no-op diff; the pre-commit hook rewrites it anyway). The commit-time fix at `import.ts:829` re-derives the source by re-running `lookupMemory` + `matchKeyword` over `r.base.descriptor_norm`.

**Primary recommendation:** Plan in this order — (0) **fix the cadastro path so `*` survives** (new sentinel or a `normalizeKeyword` variant); (1) extend `matchKeyword` with compiled-once glob + literal-count specificity; (2) extend the matcher tests; (3) the 0037 migration dropping the anonymous CHECK; (4) re-derive `classification_source` at the commit insert. Step 0 is the gate — without it, 1–4 are untestable end-to-end.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Glob→regex compile + match | Pure lib (`src/lib/classifier/keywords.ts`) | — | Pure, sync, deterministic, unit-testable without DB/network; mirrors the existing `matchKeyword` contract. |
| Specificity tie-break | Pure lib (`keywords.ts`) | — | Comparator logic belongs with the matcher; must be order-independent (WR-01). |
| Preserve `*` at cadastro | Server Action (`src/actions/category-keywords.ts`) + schema (`src/lib/schemas/category-keyword.ts`) | Pure lib (a keyword-aware normalize) | The destructive normalize lives at the action boundary; `*` must survive into the DB row. |
| Allowed provenance values | Database (migration `0037`) | — | The CHECK is a Postgres-level constraint; the source of truth for the allowed enum set. RLS unchanged. |
| Re-derive provenance at confirm | Server Action (`src/actions/import.ts` commit handler) | Pure lib (`matchKeyword`) + memory (`lookupMemory`) | WR-01: server re-derives from the authoritative base row; never trusts client `source`. |

## Standard Stack

**No new external packages.** This phase is implemented entirely with the existing stack (TypeScript strict, `RegExp` built-in, Supabase migration SQL, Vitest). The locked decision is a hand-rolled glob→regex — see §Don't Hand-Roll for why a glob library (minimatch/picomatch/micromatch) is the wrong tool here.

### Core (already installed — no install step)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (strict) | Glob helper + matcher types | Locked project stack. |
| `RegExp` (V8 built-in) | — | Anchored glob matching | Native, zero-dep; anchored single-`.*`-per-segment patterns are linear-time. |
| `vitest` | (existing) | Pure unit tests for matcher | Existing test harness (`keywords.test.ts`). |
| `supabase` CLI | 2.106.x | New `0037` migration + `gen:types` | Locked workflow; `supabase db push` then `gen:types`. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled escaped anchored regex | `minimatch` / `picomatch` / `micromatch` | Overkill: those parse `?`, `[...]`, `{a,b}`, `**`, path separators — none of which are in scope (only `*`). They expand the attack surface (some have had ReDoS CVEs), add a dependency, and would need configuring to disable everything except `*`. The locked design (one metacharacter) is ~6 lines and trivially auditable. |
| Escaped anchored regex | Manual two-pointer glob matcher | CONTEXT lists this as an acceptable alternative. It is provably linear and avoids the regex engine entirely, but is more code and more test surface for the same result. Regex is the recommended path; two-pointer only if the reviewer distrusts regex linearity. |

**Installation:** None. (No `npm install`.)

## Package Legitimacy Audit

> No external packages are installed in this phase. Audit not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
CADASTRO PATH (must change — Pitfall 1)
  user types "UBER*"  ──▶  addKeyword(categoryId, "UBER*")   [src/actions/category-keywords.ts]
                              │
                              ▼
                       keywordSchema.safeParse  (trim/min1/max60)   [unchanged]
                              │
                              ▼
              ┌──────────────────────────────────────────┐
              │  ★ CHANGE: preserve `*` ★                 │
              │  normalizeDescriptor STRIPS `*` today      │
              │  → use a keyword-aware normalize that      │
              │    keeps `*` (see §Pitfall 1 options)      │
              └──────────────────────────────────────────┘
                              │ stored keyword: "uber*"  (lowercased, accent-free, `*` KEPT)
                              ▼
                       category_keywords table  (DB)


MATCH PATH (upload pipeline)
  statement upload ──▶ parser ──▶ descriptor_norm (per row)   [src/actions/import.ts]
                              │
   pre-fetch ONCE: ──────────┤  category_keywords → KeywordRule[]   (~line 444)
                              │     ★ compile glob→RegExp here, once per rule ★
                              ▼
                       PASS 1 per row:
                         lookupMemory ── HIT ─▶ source='memória'
                              │ MISS
                              ▼
                         matchKeyword(descriptor_norm, rules)   [src/lib/classifier/keywords.ts]
                              │     substring (no `*`)  OR  anchored glob (`*`)
                              │     longest-wins: literal-count → substring>glob → sort → categoryId
                              ├── HIT ─▶ review row source='palavra-chave'  (~line 502)
                              │ MISS
                              ▼
                         collect into AI batch


CONFIRM PATH (KW-10 fix)
  client confirms rows ──▶ commit handler   [src/actions/import.ts ~798-835]
                              │  authoritativeRows[].base.descriptor_norm  (server-trusted, WR-01)
                              ▼
              ┌──────────────────────────────────────────┐
              │  ★ CHANGE line ~829 ★                      │
              │  re-derive source over base.descriptor_norm│
              │   lookupMemory  → 'memória'                │
              │   else matchKeyword → 'palavra-chave'      │
              │   else (manual/AI pick) → coarse 'memória' │
              └──────────────────────────────────────────┘
                              │
                              ▼
                       transactions INSERT  (classification_source persisted)
                              │  ← CHECK now allows 'palavra-chave' (migration 0037)
```

### Recommended Project Structure (touched files only)
```
src/
├── lib/
│   ├── normalize.ts                    # ★ may gain a keyword-aware variant (Pitfall 1)
│   ├── classifier/
│   │   ├── keywords.ts                 # ★ glob compile + literal-count specificity
│   │   └── keywords.test.ts            # ★ +glob/specificity/ReDoS cases
│   └── schemas/category-keyword.ts     # possibly unchanged (length validates raw)
├── actions/
│   ├── category-keywords.ts            # ★ stop stripping `*` at cadastro (Pitfall 1)
│   ├── category-keywords.test.ts       # ★ cadastro preserves `*`
│   ├── import.ts                        # ★ compile glob at pre-fetch; re-derive source at commit (~829)
│   └── import.test.ts                   # ★ end-to-end: glob match + persisted 'palavra-chave'
supabase/migrations/
└── 0037_<name>.sql                      # ★ drop+recreate the anonymous CHECK
```

### Pattern 1: ReDoS-safe glob → anchored RegExp (recommended)
**What:** Translate a glob keyword into an anchored linear-time regex.
**When to use:** Compiled once per `KeywordRule` whose keyword contains `*`.
**Example:**
```typescript
// Escape the FULL JS regex metacharacter set so literal segments are inert.
// Source pattern: MDN "Regular expressions" escaping guidance + the standard
// escapeRegExp shape (lodash/MDN). [CITED: developer.mozilla.org/.../Regular_expressions]
const REGEX_META = /[.*+?^${}()|[\]\\]/g
function escapeLiteral(s: string): string {
  return s.replace(REGEX_META, '\\$&')
}

/**
 * Compile a glob keyword (only `*` is special) into an anchored regex.
 * Splits on `*`, escapes each literal segment, rejoins with `.*`, anchors ^…$.
 * Linear-time: no nested quantifiers, no overlapping alternation → no catastrophic
 * backtracking even on adversarial input (e.g. a long run of one char). The DOTALL
 * flag `s` is irrelevant (descriptor_norm has no newlines) — omit for clarity.
 */
function globToRegExp(keyword: string): RegExp {
  const body = keyword.split('*').map(escapeLiteral).join('.*')
  return new RegExp(`^${body}$`)
}
// "uber*"  → /^uber.*$/        matches "uber trip 123"
// "*ifood*"→ /^.*ifood.*$/      matches "pedido ifood centro"
// "ub*er"  → /^ub.*er$/         (interior wildcard also works, anchored)
```
**Note on the metacharacter set:** the chars that MUST be escaped in a JS regex literal context are `. * + ? ^ $ { } ( ) | [ ] \`. The single class `/[.*+?^${}()|[\]\\]/g` covers all of them (this is the canonical `escapeRegExp` from MDN/lodash). `-` only needs escaping inside `[...]`; since literals are not placed in a character class here, it does not.

### Pattern 2: Glob-vs-substring branch + compile-once (in `matchKeyword`)
**What:** A keyword is glob iff it contains `*`; compile its regex once at pre-fetch, store on the rule, match per row.
**When to use:** The `KeywordRule` gains an optional compiled `glob: RegExp | null` and a `literals: number` (literal char count).
**Example:**
```typescript
// keywords.ts — extend the rule with derived, precomputed fields.
export interface KeywordRule {
  categoryId: string
  keyword: string            // normalized, MAY contain `*` (after the cadastro fix)
  sort: number
  // Derived ONCE (in the pre-fetch map at import.ts ~450, NOT per match):
  glob: RegExp | null        // non-null iff keyword contains `*` and has ≥1 literal
  literals: number           // count of non-`*` chars (== keyword.length for substring)
}

// Build at pre-fetch (import.ts ~450). Degenerate guard mirrors the empty-keyword guard.
function compileRule(categoryId: string, keyword: string, sort: number): KeywordRule | null {
  if (keyword === '') return null
  const hasStar = keyword.includes('*')
  const literals = keyword.replace(/\*/g, '').length
  if (literals === 0) return null            // "*", "**" → would match everything → skip
  return {
    categoryId, keyword, sort,
    glob: hasStar ? globToRegExp(keyword) : null,
    literals,
  }
}

// matchKeyword: substring (no glob) keeps `includes`; glob uses the precompiled regex.
function ruleMatches(descriptorNorm: string, rule: KeywordRule): boolean {
  return rule.glob ? rule.glob.test(descriptorNorm) : descriptorNorm.includes(rule.keyword)
}
```
**Perf note:** the matcher runs N rows × M rules in-memory (no per-row DB query — the WR-02 batched-fetch contract is unchanged). Compiling the regex once per rule at pre-fetch (M compiles total) instead of per match (N×M compiles) matters when an upload has hundreds of rows. `RegExp.prototype.test` is the per-row cost; for anchored linear patterns it is O(len(descriptor)).

### Pattern 3: Specificity comparator (backward-compatible)
**What:** Replace the `keyword.length` rung with `literals`, and insert a "contiguous beats glob" rung at equal literal-count.
**Why backward-compatible:** for a substring (no `*`), `literals === keyword.length`, and `glob === null` so the "substring beats glob" rung never fires between two substrings — v1.5 behavior is bit-identical.
```typescript
// Comparator: is `rule` strictly better than current `best`?
// Order (each rung breaks ties of the previous):
//   1. higher literal-count wins                     (was: keyword.length)
//   2. at equal literals: contiguous substring beats glob  (NEW — more restrictive)
//   3. lower categories.sort wins                     (unchanged)
//   4. lower categoryId wins                          (unchanged, WR-01 stable)
function isBetter(rule: KeywordRule, best: KeywordRule): boolean {
  if (rule.literals !== best.literals) return rule.literals > best.literals
  const ruleSub = rule.glob === null, bestSub = best.glob === null
  if (ruleSub !== bestSub) return ruleSub            // substring beats glob
  if (rule.sort !== best.sort) return rule.sort < best.sort
  return rule.categoryId < best.categoryId
}
```

### Pattern 4: Re-derive provenance at commit (KW-10)
**What:** At the commit insert (`import.ts` ~829), re-run memory then keyword over the server-trusted base descriptor to pick the persisted source.
**Example:**
```typescript
// In the commit handler, BEFORE the inserts loop, pre-fetch keyword rules ONCE
// (mirror the import-pass pre-fetch at ~444) so the per-row re-derivation is in-memory.
// lookupMemory is a per-row point-read (see Pitfall 4 for the perf/RLS note).
for (const r of authoritativeRows) {
  // ...amountCents etc...
  let source: ClassificationSource = null
  if (r.categoryId) {
    const hit = await lookupMemory(supabase, r.base.descriptor_norm)
    if (hit && hit.category_id === r.categoryId) {
      source = 'memória'
    } else {
      const kw = matchKeyword(r.base.descriptor_norm, keywordRules)
      source = kw && kw.categoryId === r.categoryId ? 'palavra-chave' : 'memória'
      // ↑ a classified row that matches neither memory nor keyword (manual / accepted AI)
      //   keeps the coarse 'memória' — NO regression, NOT in KW-10 scope to disambiguate.
    }
  }
  inserts.push({ /* ... */ classification_source: source /* ... */ })
}
```
**Design note (memory category guard):** matching `hit.category_id === r.categoryId` (and likewise for keyword) avoids mislabeling: a user who overrode the memory/keyword suggestion to a *different* category in the grid should not get `'memória'`/`'palavra-chave'` for a category the deterministic layer didn't actually pick. This is stricter than CONTEXT's bare "re-run memory→keyword" but is the honest reading of WR-01 and is at Claude's discretion. The planner should confirm this guard with the user if unsure; the minimum-scope alternative (re-derive without the category-equality guard) is also acceptable and simpler.

### Anti-Patterns to Avoid
- **Compiling the glob regex per match:** N×M `new RegExp` calls per upload. Compile once at pre-fetch.
- **Re-running `normalizeDescriptor` on the keyword or descriptor inside the matcher:** both sides are already normalized; re-normalizing the keyword would re-strip the `*` and kill the glob (the exact landmine). The matcher NEVER normalizes (existing invariant, comment lines 6-9 of keywords.ts).
- **Trusting the client `source`:** WR-01 — re-derive server-side from `base.descriptor_norm`.
- **Converting `classification_source` to a Postgres enum:** CONTEXT locks "keep `text` + CHECK". An enum would change `database.types.ts` and break the no-type-change assumption.
- **Using a glob library for one metacharacter:** see §Don't Hand-Roll.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Regex metacharacter escaping | A partial/ad-hoc escape list | The canonical `/[.*+?^${}()|[\]\\]/g` class (MDN/lodash `escapeRegExp`) | Missing one metachar (e.g. `$`, `(`) lets a malicious/typo keyword inject regex behavior or throw at `new RegExp`. The canonical class is complete and audited. |
| Money/percentage math | (unchanged) | `decimal.js` + integer cents | Not touched this phase, but the existing invariant holds. |

**Key insight:** The *only* thing you hand-roll here is the glob→regex translation (≈6 lines) — and that is deliberate (CONTEXT locks it; a full glob library is a larger attack surface for a single `*`). Everything else (regex engine, escaping pattern, migration tooling) is off-the-shelf.

## Runtime State Inventory

> This phase touches a DB constraint and adds a new keyword capability — not a rename. Inventory included because the CHECK widening is live DB state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `category_keywords.keyword` rows are currently stored normalized WITHOUT `*` (the cadastro path strips it). Existing rows have no `*` — they remain valid substring rules. No `transactions.classification_source` row currently holds `'palavra-chave'` (the CHECK forbade it). | No data migration. New keyword inserts (post cadastro-fix) may contain `*`; new confirms write `'palavra-chave'`. **No backfill** (locked). |
| Live service config | The 0020 anonymous CHECK constraint is **live in PROD** and must be dropped+recreated by the 0037 migration. It is NOT named in the SQL — the migration must target the auto-generated name (e.g. `transactions_classification_source_check`) with `DROP CONSTRAINT IF EXISTS`. | New migration `0037`, `supabase db push` to local then PROD. |
| OS-registered state | None — no schedulers, daemons, or OS registrations involved. | None — verified (no Task Scheduler / pm2 / cron touched). |
| Secrets/env vars | None — no secret or env name references the matcher or provenance. | None — verified. |
| Build artifacts | `src/types/database.types.ts` is generated from the schema. The CHECK change does NOT alter the `text → string \| null` type, so the file is a no-op diff. The pre-commit hook rewrites it regardless (dev-env memory). | Run `npm run gen:types` for discipline; expect zero functional diff. |

**The canonical question (CHECK constraint):** the auto-generated constraint name for an anonymous column CHECK in Postgres follows the `<table>_<column>_check` convention → almost certainly `transactions_classification_source_check`. The migration should `ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_classification_source_check;` then `ADD CONSTRAINT transactions_classification_source_check CHECK (...)` with the widened set. **Verify the live name** during planning with `\d+ public.transactions` (or query `pg_constraint`) before writing the migration — see §Open Questions Q1.

## Common Pitfalls

### Pitfall 1: `normalizeDescriptor` destroys `*` at cadastro — the feature-killer
**What goes wrong:** `addKeyword` (`src/actions/category-keywords.ts:55`) stores `normalizeDescriptor(input)`. `normalizeDescriptor` (`src/lib/normalize.ts`) has TWO steps that delete `*`:
- line 48: `.replace(/\*+/g, ' ')` — strips card-network `*` noise (the whole reason `*` is stripped is that `UBER *TRIP` statements embed a literal `*`).
- line 50: `.replace(/[^a-z0-9 ]/g, ' ')` — strips ALL non-alphanumerics as a catch-all.

So `UBER*` is stored as `uber` and `*IFOOD*` as `ifood` — the `*` is gone, the glob never exists, the matcher only ever sees substrings. **The feature is 100% broken at write time.** CONTEXT.md's "keyword is stored normalized via normalizeDescriptor" (Established Patterns) is the exact assumption that breaks here and was NOT flagged in CONTEXT.
**Why it happens:** `normalizeDescriptor` is built for *descriptors* (where `*` is noise to delete), but is being reused for *keywords* (where `*` is now meaningful syntax). Same function, opposite intent.
**How to avoid (two viable options — Claude's discretion, surface to user):**
- **Option A (recommended): a keyword-aware normalize.** Add `normalizeKeyword(raw)` in `normalize.ts` that does the same NFKD/lowercase/accent/whitespace pipeline but **preserves `*`** (skip the `\*+` strip; change the catch-all to `/[^a-z0-9 *]/g`). `addKeyword` calls `normalizeKeyword` instead of `normalizeDescriptor`. This keeps both sides in the same case/accent space (so the match stays apples-to-apples) while keeping the `*`. The "empty after normalize" guard becomes "empty OR literal-count 0 after normalize".
- **Option B: pre-extract the `*` positions, normalize the literal segments, reassemble.** More complex; only needed if you want each literal segment normalized independently. Option A is simpler and sufficient because `*` never sits *inside* an alphanumeric token that NFKD would change.
**Warning signs:** a test where `addKeyword(cat, 'UBER*')` is followed by reading the row back — assert the stored keyword contains `*`. If it equals `uber`, the cadastro fix is missing. **This assertion is the single highest-value test in the phase.**
**Critical caveat:** because the descriptor side still strips `*` (correctly — `UBER *TRIP` → `uber trip`), the keyword `*` and descriptor `*` are now asymmetric, which is exactly right: the keyword `*` is glob syntax, the descriptor never contains `*`. Do not "fix" the descriptor side.

### Pitfall 2: invalid/throwing `new RegExp`
**What goes wrong:** if escaping is incomplete and a keyword contains an unescaped `(` or `[`, `new RegExp` throws at compile time (pre-fetch), failing the whole upload — or worse, a stray `$`/`.` silently changes match semantics.
**Why it happens:** partial metacharacter escaping.
**How to avoid:** use the complete canonical escape class (Pattern 1). Optionally wrap `globToRegExp` in a try/catch that treats a compile failure as a non-matching rule (defensive), but with full escaping it cannot throw.
**Warning signs:** add a test with a keyword containing every metacharacter (`a.b(c)[d]*`) and assert it compiles and matches the literal string `a.b(c)[d]<anything>`.

### Pitfall 3: degenerate wildcard-only patterns matching everything
**What goes wrong:** `*` or `**` compiles to `/^.*$/`, which matches every descriptor → silently classifies all unknown rows into one category.
**Why it happens:** no literal anchor.
**How to avoid:** the `literals === 0` skip in `compileRule` (Pattern 2), mirroring the existing empty-keyword guard. Better: reject a literal-count-0 keyword at cadastro (`addKeyword`) with a pt-BR message, so the user never stores a useless rule.
**Warning signs:** test `matchKeyword('anything at all', [{keyword:'*', ...}])` → `null`.

### Pitfall 4: re-running `lookupMemory` per row at confirm (perf / RLS)
**What goes wrong:** the commit re-derivation adds a `lookupMemory` point-read per classified row — N point-reads inside the inserts loop, the WR-02 anti-pattern the import path explicitly avoids.
**Why it happens:** `lookupMemory` is a per-descriptor `.maybeSingle()` query.
**How to avoid:** the existing import PASS-1 already does per-row `lookupMemory` (line 486) and the codebase accepts that for the import pass, so a per-row read at confirm is consistent. BUT for a cleaner option, **batch it**: collect the distinct `base.descriptor_norm` of classified rows, do ONE `merchant_patterns.select('descriptor_norm, category_id').in('descriptor_norm', [...])`, build a Map, and look up in-memory in the loop (mirrors the `dupSet`/`recurring` batched pattern already in the commit handler at ~466 and ~789). Keyword rules are already in-memory (pre-fetched once). RLS scopes both reads to the caller automatically — no app-layer `user_id` filter (same as the import path). **Recommend the batched Map** to keep the commit handler's WR-02 discipline; the per-row version is acceptable if the planner prefers minimal change.
**Warning signs:** a confirm with hundreds of rows issuing hundreds of `merchant_patterns` queries.

### Pitfall 5: matcher order-dependence regression
**What goes wrong:** adding rungs to the comparator could make the winner depend on rule fetch order, violating WR-01.
**How to avoid:** keep `categoryId` as the final stable tie-break (Pattern 3). The existing `keywords.test.ts` has an order-independence test (lines 40-48); extend it to cover glob-vs-substring and glob-vs-glob ties.
**Warning signs:** a test that runs the same rules in reverse order returns a different category.

## Code Examples

### Reading back a persisted provenance (verification query shape)
```typescript
// import.test.ts — after a confirm of a glob-classified row, read it back.
const { data } = await supabase
  .from('transactions')
  .select('classification_source, descriptor_norm')
  .eq('descriptor_norm', 'uber trip 123')
  .single()
expect(data?.classification_source).toBe('palavra-chave')  // KW-10 truth
```

### The 0037 migration shape (verify the constraint name first — Q1)
```sql
-- 0037_<name>.sql
-- KW-10: widen transactions.classification_source to allow 'palavra-chave'.
-- The 0020 CHECK was anonymous (add column ... check(...)), so Postgres named it
-- transactions_classification_source_check by convention. Drop + recreate widened.
-- Keeps text + CHECK (NOT a Postgres enum) so database.types.ts is unchanged.
-- NO backfill: historical coarse 'memória' rows stay as-is (not reconstructible).

alter table public.transactions
  drop constraint if exists transactions_classification_source_check;

alter table public.transactions
  add constraint transactions_classification_source_check
  check (classification_source is null
         or classification_source in ('memória','manual','sugerida','palavra-chave'));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Keyword = substring only (`includes`) | Substring OR anchored glob (`*`) | This phase (KW-09) | Opt-in wildcard; substring path unchanged. |
| `classification_source` persisted as coarse `'memória'` for keyword hits | Re-derived `'palavra-chave'` at confirm | This phase (KW-10) | Honest provenance; CHECK widened via 0037. |

**Deprecated/outdated:** none introduced or removed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 0020 anonymous CHECK's live name is `transactions_classification_source_check` (Postgres convention). | §Runtime State, §4 migration | If the live name differs, `DROP CONSTRAINT IF EXISTS` no-ops and the old narrow CHECK survives → inserts of `'palavra-chave'` fail with 23514. **MUST verify live name during planning** (Q1). |
| A2 | The category-equality guard (`hit.category_id === r.categoryId`) is the desired re-derivation semantics. | Pattern 4 | If the user wants the simpler "re-run regardless of which category was picked", the guard mislabels overridden rows. Surface to user. CONTEXT's wording ("re-run memory→keyword over the base row") is ambiguous on this. |
| A3 | A keyword-aware normalize (Option A) that preserves `*` keeps the match apples-to-apples (NFKD/case/accent identical to descriptor side). | §Pitfall 1 | If `normalizeKeyword` diverges from `normalizeDescriptor` in any step other than the `*` strip, keyword and descriptor drift out of the same key space and matches silently fail. Keep the two pipelines identical except the `*` handling, and test cross-consistency. |

## Open Questions (RESOLVED)

1. **What is the live name of the 0020 CHECK constraint?**
   - What we know: it was created anonymously; Postgres auto-names column CHECKs `<table>_<column>_check` → almost certainly `transactions_classification_source_check`.
   - What's unclear: whether any prior migration or PROD edit renamed it.
   - Recommendation: before writing 0037, run `supabase db` locally and inspect (`\d+ public.transactions` or `select conname from pg_constraint where conrelid = 'public.transactions'::regclass and contype='c'`). Use the exact live name in the `DROP CONSTRAINT IF EXISTS`. This is a planning-time verification task, not a guess.
   - **RESOLVED:** carried into execution as a verify-live-name-before-DROP step in Plan 21-03 Task 1 (not guessed in the migration).

2. **Should `addKeyword` reject literal-count-0 keywords (`*`, `**`) at cadastro, or only skip them at match time?**
   - What we know: the matcher will skip them (Pitfall 3). Rejecting at cadastro is friendlier (no useless stored rule) and mirrors the existing empty-after-normalize error.
   - Recommendation: reject at cadastro with a pt-BR message AND keep the match-time skip as defense-in-depth.
   - **RESOLVED:** both — reject at cadastro (Plan 21-01 Task 2) + keep the match-time skip as defense-in-depth (Plan 21-02 `compileRule`).

3. **(A2) Category-equality guard for provenance re-derivation?**
   - **RESOLVED:** guard ON — label `'palavra-chave'`/`'memória'` only when the re-derived category equals the persisted `r.categoryId`; an overridden pick stays coarse `'memória'` (no false provenance). Wired in Plan 21-04 Task 2; matches CONTEXT Area-3 Q4.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `supabase` CLI | 0037 migration + db push + gen:types | Assumed ✓ (used through 0036) | 2.106.x (CLAUDE.md) | none — required for the migration |
| Local Supabase (Docker) | `gen:types --local`, test the live CHECK | Assumed ✓ (dev-env memory notes local stack) | — | Verify constraint name against PROD if local drifts |
| Vitest | Pure matcher + action tests | ✓ (existing harness) | existing | none |

**Missing dependencies with no fallback:** none identified (all are part of the established workflow).
**Note:** dev-env memory — the dev server points at PROD Supabase, and the pre-commit hook rewrites `database.types.ts`. Run migrations against local first, then PROD push; expect the gen:types diff to be empty.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | (existing vitest config — `keywords.test.ts`, `import.test.ts`, `category-keywords.test.ts` already run) |
| Quick run command | `npx vitest run src/lib/classifier/keywords.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KW-09 | `UBER*` matches `uber trip 123` (prefix glob) | unit | `npx vitest run src/lib/classifier/keywords.test.ts` | ✅ extend |
| KW-09 | `*ifood*` matches `pedido ifood centro` (contains glob) | unit | same | ✅ extend |
| KW-09 | substring (no `*`) unchanged — `mercado` still matches | unit | same | ✅ exists, must not regress |
| KW-09 | multi-category specificity: more literals wins; substring beats glob at equal literals | unit | same | ✅ extend |
| KW-09 | degenerate `*` / `**` / literal-count-0 → skipped (matches nothing) | unit | same | ✅ extend |
| KW-09 | ReDoS adversarial input (long `aaaa…` against `*a*a*`) stays fast (bounded time) | unit | same | ✅ extend (assert completes; anchored single-`.*`-per-segment is linear) |
| KW-09 | order-independence preserved with glob+substring mix | unit | same | ✅ extend (mirror lines 40-48) |
| KW-09 | metachar-laden keyword (`a.b(c)*`) compiles and matches literally | unit | same | ✅ add |
| **KW-09 (cadastro gate)** | `addKeyword(cat,'UBER*')` stores a keyword that STILL contains `*` | unit/integration | `npx vitest run src/actions/category-keywords.test.ts` | ✅ extend — **highest-value test** |
| KW-10 | a keyword-classified confirmed row reads back `classification_source='palavra-chave'` | integration | `npx vitest run src/actions/import.test.ts` | ✅ extend |
| KW-10 | a memory-classified row reads back `'memória'` (unchanged) | integration | same | ✅ extend |
| KW-10 | a manual/AI pick (no memory/keyword match) keeps coarse `'memória'` (no regression) | integration | same | ✅ extend |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/classifier/keywords.test.ts` (matcher) or the touched test file.
- **Per wave merge:** `npx vitest run` (full suite).
- **Phase gate:** full suite green before `/gsd-verify-work`; plus a live PROD smoke (upload a statement with a `UBER*` keyword, confirm, verify the badge persists) — Supabase integration tests are env-flaky (dev-env memory), so the live confirm is the trustworthy KW-10 check.

### Wave 0 Gaps
- None — all three test files exist and the framework is configured. Work is extension, not bootstrap.
- Caveat (dev-env memory): Supabase integration tests are env-flaky. The KW-10 persistence assertion may need a live/local-DB run rather than a mocked client; plan for a real DB round-trip in `import.test.ts` or a manual verify step.

## Security Domain

> `security_enforcement` not disabled in config → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unchanged; existing Supabase auth. |
| V3 Session Management | no | Unchanged. |
| V4 Access Control | yes | RLS on `category_keywords` (0036) and `transactions` (existing) scopes all reads/writes to `auth.uid() = user_id`. The matcher and re-derivation run under the RLS-active client — no app-layer user filter; verified the import path relies on RLS (comment lines 441-443). The 0037 migration changes a CHECK only — RLS policies untouched. |
| V5 Input Validation | yes | `keywordSchema` (trim/min1/max60) at the cadastro boundary; **add a literal-count-0 reject** so a `*`-only keyword cannot be stored. The glob→regex uses full metacharacter escaping so a user keyword cannot inject regex behavior. |
| V6 Cryptography | no | None touched. |

### Known Threat Patterns for {TypeScript glob matcher + Postgres CHECK}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| ReDoS via crafted keyword | Denial of Service | Anchored single-`.*`-per-segment regex (no nested quantifiers) is linear; full literal escaping; reject literal-count-0. The keyword is the user's OWN (single-user, RLS-scoped) so the attacker == the victim — DoS surface is self-inflicted only, but linearity is still required for correctness/perf. |
| Regex injection via unescaped keyword | Tampering | Complete `escapeRegExp` metacharacter class (Pattern 1) — a keyword like `.*` is treated as the literals `.` `*`-glob, never as a free regex. |
| Constraint bypass writing an invalid `classification_source` | Tampering | The CHECK (post-0037) is the DB-level gate; re-derivation only ever produces values in the allowed set. |
| Wrong/stale CHECK name → silent narrow CHECK survives | Tampering | Verify live constraint name before 0037 (Q1); test an insert of `'palavra-chave'` succeeds post-migration. |

## Sources

### Primary (HIGH confidence)
- Codebase: `src/lib/normalize.ts` (lines 48, 50 — the `*`-stripping landmine), `src/lib/classifier/keywords.ts` (matcher contract + tie-break), `src/lib/classifier/keywords.test.ts` (existing test shape + order-independence test), `src/actions/category-keywords.ts:55` (cadastro runs normalizeDescriptor), `src/actions/import.ts` (~444 pre-fetch, ~486 lookupMemory, ~498-502 review-time source, ~798-835 commit insert, ~829 the KW-10 bug), `supabase/migrations/0020_transactions_import.sql` (anonymous CHECK, lines 25-27), `supabase/migrations/0036_category_keywords.sql` (style template), `src/lib/parsers/types.ts:55-60` (`ClassificationSource` union already includes `'palavra-chave'`), `src/types/database.types.ts:663` (`classification_source: string | null` — CHECK won't change types), `src/lib/classifier/memory.ts` (`lookupMemory` signature), `package.json` (gen:types script; no glob lib installed). [VERIFIED: codebase grep + read]
- `.planning/REQUIREMENTS.md` — KW-09, KW-10, KW-F (deferred), Out-of-Scope (pure regex). [VERIFIED: read]

### Secondary (MEDIUM confidence)
- MDN "Regular expressions" / lodash `escapeRegExp` — the canonical metacharacter escape class `/[.*+?^${}()|[\]\\]/g`. [CITED: developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions]
- Postgres column-CHECK auto-naming convention `<table>_<column>_check`. [ASSUMED — verify live, Q1]

### Tertiary (LOW confidence)
- none.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all built on verified existing stack.
- Architecture: HIGH — every code location read and confirmed; the cadastro landmine verified in source (the decisive risk).
- Pitfalls: HIGH — Pitfall 1 (the `*`-strip) is verified by reading the exact lines; it is the one finding that, if missed, sinks the phase.
- Migration: MEDIUM — SQL shape is standard, but the live constraint name MUST be verified before writing 0037 (Q1).

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable domain; revisit only if normalize.ts or the migration sequence changes)
