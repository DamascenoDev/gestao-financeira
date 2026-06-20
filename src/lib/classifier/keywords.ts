// KW-02/03/04 + KW-09: the deterministic keyword layer between the memory lookup and
// the AI call in the upload pipeline. Mirrors memory.ts's hit/null contract
// (MemoryHit | null), but PURE and SYNCHRONOUS: the rule list is pre-fetched ONCE before
// PASS 1, so matching is an in-memory scan, not a per-row point-read (avoids the WR-02
// N-queries anti-pattern).
//
// Both `descriptorNorm` and every `rule.keyword` are already produced by the SAME
// normalize pipeline — descriptors via normalizeDescriptor (strips `*`), keywords via
// normalizeKeyword (Plan 21-01, PRESERVES `*`). The matcher NEVER re-normalizes either
// side (re-deriving the keyword would re-strip the `*`, the exact landmine; re-deriving
// either drifts the match key from the display key).
//
// KW-09 wildcard: a stored keyword CONTAINING `*` is a glob (anchored `^…$`, `*`→`.*`,
// all other regex metachars escaped — ReDoS-safe linear match); a keyword WITHOUT `*`
// stays the v1.5 `.includes()` substring (bit-identical behavior).

/**
 * The FULL JS regex metacharacter set. Escaping every one of these makes a literal
 * segment inert inside `new RegExp` — a keyword like `a.b(c)` is matched literally, and
 * a stray `\` or `[` can never make `new RegExp` throw or inject regex behavior.
 * Canonical escapeRegExp class (MDN / lodash). `-` only matters inside `[...]`, and
 * literals are never placed in a character class here, so it is intentionally omitted.
 */
const REGEX_META = /[.*+?^${}()|[\]\\]/g

/** Escape every regex metacharacter in a literal glob segment so it matches literally. */
function escapeLiteral(segment: string): string {
  return segment.replace(REGEX_META, '\\$&')
}

/**
 * Compile a glob keyword (only `*` is special) into an anchored, ReDoS-safe RegExp.
 * Splits on `*`, escapes each literal segment, rejoins with `.*`, anchors `^…$`.
 * Linear-time: a single `.*` per segment with no nested quantifiers and no overlapping
 * alternation cannot backtrack catastrophically, even on adversarial input like
 * `'a'.repeat(50000)`. No DOTALL flag — descriptor_norm has no newlines.
 *   "uber*"   → /^uber.*$/    matches "uber trip 123"
 *   "*ifood*" → /^.*ifood.*$/ matches "pedido ifood centro"
 *   "ub*er"   → /^ub.*er$/    interior wildcard, anchored
 */
export function globToRegExp(keyword: string): RegExp {
  const body = keyword.split('*').map(escapeLiteral).join('.*')
  return new RegExp(`^${body}$`)
}

/**
 * One keyword rule: a normalized term, its category, and the category's sort for
 * tie-break. `glob` and `literals` are DERIVED, precomputed fields — build them ONCE per
 * rule via {@link compileRule} (the Plan 04 pre-fetch path). They are optional so the
 * matcher stays defensive: when absent, {@link matchKeyword} derives them on the fly.
 */
export interface KeywordRule {
  categoryId: string
  /** normalize output — MAY contain `*` (keyword side, Plan 21-01). Never re-normalized. */
  keyword: string
  /** categories.sort — a tie-break rung for equal-specificity matches. */
  sort: number
  /** Precomputed: non-null iff the keyword contains `*` AND has ≥1 literal char. */
  glob?: RegExp | null
  /** Precomputed: count of non-`*` chars (=== keyword.length for a substring). */
  literals?: number
}

/** A keyword match resolves to exactly a category (category-only; reserva stays null). */
export interface KeywordMatch {
  categoryId: string
}

/**
 * Build a precompiled KeywordRule, or null for a degenerate/empty keyword. This is the
 * single place where a glob is compiled — call it ONCE per rule at pre-fetch (Plan 04's
 * import.ts), never per match. Returns null for:
 *   - keyword '' (would substring-match everything — mirrors the empty-keyword guard)
 *   - literal-count 0 (`*`, `**` — all-wildcard would match everything; §Pitfall 3
 *     defense-in-depth alongside the Plan 01 cadastro reject).
 */
export function compileRule(
  categoryId: string,
  keyword: string,
  sort: number,
): KeywordRule | null {
  if (keyword === '') return null
  const hasStar = keyword.includes('*')
  const literals = keyword.replace(/\*/g, '').length
  if (literals === 0) return null // "*", "**" → would match everything → skip
  return {
    categoryId,
    keyword,
    sort,
    glob: hasStar ? globToRegExp(keyword) : null,
    literals,
  }
}

/** Resolve the (possibly absent) derived `glob` field for a rule defensively. */
function ruleGlob(rule: KeywordRule): RegExp | null {
  if (rule.glob !== undefined) return rule.glob
  // Not precompiled (e.g. a raw inline rule): derive once here. A `*`-only keyword has
  // no literal, so it must NOT compile to a match-everything glob — treat as substring
  // (its `.includes('*')` on a normalized descriptor is false → matches nothing).
  if (!rule.keyword.includes('*')) return null
  if (rule.keyword.replace(/\*/g, '').length === 0) return null
  return globToRegExp(rule.keyword)
}

/** Resolve the (possibly absent) derived `literals` count for a rule defensively. */
function ruleLiterals(rule: KeywordRule): number {
  if (rule.literals !== undefined) return rule.literals
  return rule.keyword.replace(/\*/g, '').length
}

/**
 * Most-specific-keyword-wins match (KW-04 + KW-09). A rule matches when its glob regex
 * tests true (keyword contains `*`) OR its keyword is CONTAINED in descriptorNorm
 * (substring, no `*` — v1.5 path). Among matches the most SPECIFIC wins, by this chain
 * (each rung breaks ties of the previous):
 *   1. higher literal-count (non-`*` chars) wins — for a substring this is keyword.length,
 *      so v1.5 longest-wins is bit-identical;
 *   2. at equal literal-count, a contiguous substring (glob === null) beats a glob (more
 *      restrictive);
 *   3. lower categories.sort wins;
 *   4. lower categoryId wins (WR-01: stable, order-independent — a descriptor never
 *      silently flips category between uploads).
 * An empty descriptorNorm matches nothing (the normalize '' non-match sentinel); a rule
 * with literal-count 0 (empty or all-`*`) is skipped (it would match everything).
 */
export function matchKeyword(
  descriptorNorm: string,
  rules: KeywordRule[],
): KeywordMatch | null {
  if (descriptorNorm === '') return null // KW guard: '' matches nothing
  let best: KeywordRule | null = null
  let bestGlob: RegExp | null = null
  let bestLiterals = 0
  for (const rule of rules) {
    if (rule.keyword === '') continue // defensive: a '' rule would includes-match everything
    const literals = ruleLiterals(rule)
    if (literals === 0) continue // defensive: "*"/"**" → would match everything → skip
    const glob = ruleGlob(rule)
    const matches = glob ? glob.test(descriptorNorm) : descriptorNorm.includes(rule.keyword)
    if (!matches) continue
    if (
      best === null ||
      // rung 1: more literal characters → more specific.
      literals > bestLiterals ||
      // rung 2 (NEW): at equal literals, a contiguous substring beats a glob.
      (literals === bestLiterals && glob === null && bestGlob !== null) ||
      // rung 3: lower categories.sort wins.
      (literals === bestLiterals &&
        (glob === null) === (bestGlob === null) &&
        rule.sort < best.sort) ||
      // rung 4 (WR-01): final stable tie-break on categoryId — deterministic regardless
      // of fetch/row order, so a descriptor never silently flips category between uploads.
      (literals === bestLiterals &&
        (glob === null) === (bestGlob === null) &&
        rule.sort === best.sort &&
        rule.categoryId < best.categoryId)
    ) {
      best = rule
      bestGlob = glob
      bestLiterals = literals
    }
  }
  return best ? { categoryId: best.categoryId } : null
}
