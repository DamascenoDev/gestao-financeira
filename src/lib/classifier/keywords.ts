// KW-02/03/04: the deterministic keyword layer between the memory lookup and the AI
// call in the upload pipeline. Mirrors memory.ts's hit/null contract (MemoryHit | null),
// but PURE and SYNCHRONOUS: the rule list is pre-fetched ONCE before PASS 1, so matching
// is an in-memory scan, not a per-row point-read (avoids the WR-02 N-queries anti-pattern).
//
// Both `descriptorNorm` and every `rule.keyword` are already produced by the SAME
// normalizeDescriptor (Phase 19 stores the keyword normalized; the parser emits
// descriptor_norm), so the substring test is apples-to-apples — the matcher NEVER
// re-normalizes either side (re-deriving would drift the match key from the display key).

/** One keyword rule: a normalized term, its category, and the category's sort for tie-break. */
export interface KeywordRule {
  categoryId: string
  /** normalizeDescriptor output (Phase 19) — never re-normalized here. */
  keyword: string
  /** categories.sort — the deterministic tie-break for equal-length matches. */
  sort: number
}

/** A keyword match resolves to exactly a category (category-only; reserva stays null). */
export interface KeywordMatch {
  categoryId: string
}

/**
 * Longest-keyword-wins substring match (KW-04). Returns the category whose keyword is
 * CONTAINED in descriptorNorm and is the LONGEST such keyword; an equal-length tie
 * (different category) breaks by the lower categories.sort (deterministic). An empty
 * descriptorNorm matches nothing (the normalize '' non-match sentinel), and a rule with
 * an empty keyword is skipped (it would substring-match everything).
 */
export function matchKeyword(
  descriptorNorm: string,
  rules: KeywordRule[],
): KeywordMatch | null {
  if (descriptorNorm === '') return null // KW guard: '' matches nothing
  let best: KeywordRule | null = null
  for (const rule of rules) {
    if (rule.keyword === '') continue // defensive: a '' rule would includes-match everything
    if (!descriptorNorm.includes(rule.keyword)) continue
    if (
      best === null ||
      rule.keyword.length > best.keyword.length ||
      (rule.keyword.length === best.keyword.length && rule.sort < best.sort) ||
      // WR-01: final stable tie-break. The DB allows the SAME keyword on two
      // categories (unique is per-category) and `categories.sort` is not unique
      // (defaults to 0), so length+sort can tie. Break on categoryId so the winner
      // is deterministic regardless of fetch/row order — a descriptor never silently
      // flips category between uploads.
      (rule.keyword.length === best.keyword.length &&
        rule.sort === best.sort &&
        rule.categoryId < best.categoryId)
    ) {
      best = rule
    }
  }
  return best ? { categoryId: best.categoryId } : null
}
