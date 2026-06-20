// Pure unit tests for matchKeyword (KW-02/KW-04 + KW-09 wildcard). No mocks — mirrors a
// normalize-style test: deterministic substring match, longest/most-specific wins, sort
// tie-break, '' non-match guard, the defensive empty-keyword rule guard, AND the glob
// wildcard layer (anchored, ReDoS-safe, literal-count specificity, metachar escaping).

import { describe, expect, it } from 'vitest'

import {
  compileRule,
  globToRegExp,
  matchKeyword,
  type KeywordRule,
} from './keywords'

describe('matchKeyword', () => {
  const rules: KeywordRule[] = [
    { categoryId: 'transp', keyword: 'uber', sort: 1 },
    { categoryId: 'alim', keyword: 'mercado', sort: 0 },
    { categoryId: 'mkt', keyword: 'mercado livre', sort: 2 },
  ]

  it('substring match → returns the matching category (KW-02)', () => {
    expect(matchKeyword('uber trip', rules)).toEqual({ categoryId: 'transp' })
  })

  it('longest keyword wins (KW-04)', () => {
    expect(matchKeyword('compra mercado livre sp', rules)).toEqual({ categoryId: 'mkt' })
  })

  it('no substring match → null', () => {
    expect(matchKeyword('padaria ze', rules)).toBeNull()
  })

  it("'' descriptor matches nothing (normalize non-match sentinel)", () => {
    expect(matchKeyword('', rules)).toBeNull()
  })

  it('equal-length tie → lower categories.sort wins (KW-04)', () => {
    const tie: KeywordRule[] = [
      { categoryId: 'a', keyword: 'pao', sort: 2 },
      { categoryId: 'b', keyword: 'pao', sort: 1 },
    ]
    expect(matchKeyword('pao de queijo', tie)).toEqual({ categoryId: 'b' })
  })

  it('WR-01: same keyword + same sort on two categories → deterministic by categoryId, order-independent', () => {
    const collision: KeywordRule[] = [
      { categoryId: 'zzz', keyword: 'uber', sort: 0 },
      { categoryId: 'aaa', keyword: 'uber', sort: 0 },
    ]
    // Lower categoryId wins regardless of input order — no silent flip between uploads.
    expect(matchKeyword('uber trip', collision)).toEqual({ categoryId: 'aaa' })
    expect(matchKeyword('uber trip', [...collision].reverse())).toEqual({ categoryId: 'aaa' })
  })

  it("defensive: a rule with keyword '' never matches (would includes-match everything)", () => {
    const withEmpty: KeywordRule[] = [{ categoryId: 'wild', keyword: '', sort: 0 }]
    expect(matchKeyword('qualquer descritor', withEmpty)).toBeNull()
  })

  // ── KW-09: glob wildcard ─────────────────────────────────────────────────────

  it('KW-09: prefix glob `UBER*` (normalized `uber*`) matches `uber trip 123`', () => {
    const r: KeywordRule[] = [compileRule('transp', 'uber*', 1)!]
    expect(matchKeyword('uber trip 123', r)).toEqual({ categoryId: 'transp' })
  })

  it('KW-09: contains glob `*ifood*` matches `pedido ifood centro`', () => {
    const r: KeywordRule[] = [compileRule('alim', '*ifood*', 0)!]
    expect(matchKeyword('pedido ifood centro', r)).toEqual({ categoryId: 'alim' })
  })

  it('KW-09: interior glob `ub*er` matches `ub xyz er` (anchored interior)', () => {
    const r: KeywordRule[] = [compileRule('transp', 'ub*er', 0)!]
    expect(matchKeyword('ub xyz er', r)).toEqual({ categoryId: 'transp' })
    // anchored: a trailing tail after `er` must NOT match (`$` anchor).
    expect(matchKeyword('ub xyz er trip', r)).toBeNull()
  })

  it('KW-09: substring without `*` is unchanged — `mercado` still matches `compra mercado livre sp`', () => {
    const r: KeywordRule[] = [compileRule('alim', 'mercado', 0)!]
    expect(matchKeyword('compra mercado livre sp', r)).toEqual({ categoryId: 'alim' })
  })

  it('KW-09 specificity: `UBER*` (4 literals) beats `UB*` (2 literals)', () => {
    const r: KeywordRule[] = [
      compileRule('shallow', 'ub*', 0)!,
      compileRule('deep', 'uber*', 0)!,
    ]
    expect(matchKeyword('uber trip', r)).toEqual({ categoryId: 'deep' })
    expect(matchKeyword('uber trip', [...r].reverse())).toEqual({ categoryId: 'deep' })
  })

  it('KW-09 specificity: substring `uber trip` (9 literals) beats glob `uber*` (4 literals)', () => {
    const r: KeywordRule[] = [
      compileRule('glob', 'uber*', 0)!,
      compileRule('sub', 'uber trip', 0)!,
    ]
    expect(matchKeyword('uber trip 123', r)).toEqual({ categoryId: 'sub' })
    expect(matchKeyword('uber trip 123', [...r].reverse())).toEqual({ categoryId: 'sub' })
  })

  it('KW-09 tie-break: equal literal-count → contiguous substring beats glob', () => {
    // substring `abcd` (4 literals) vs glob `a*bcd` (4 literals) — both match `abcd`.
    const r: KeywordRule[] = [
      compileRule('glob', 'a*bcd', 0)!,
      compileRule('sub', 'abcd', 0)!,
    ]
    expect(matchKeyword('abcd', r)).toEqual({ categoryId: 'sub' })
    expect(matchKeyword('abcd', [...r].reverse())).toEqual({ categoryId: 'sub' })
  })

  it('KW-09 degenerate: an all-`*` rule matches nothing (compileRule returns null)', () => {
    expect(compileRule('x', '*', 0)).toBeNull()
    expect(compileRule('x', '**', 0)).toBeNull()
    // even if an unfiltered raw rule sneaks through, the matcher skips literal-count 0.
    const raw: KeywordRule[] = [{ categoryId: 'wild', keyword: '*', sort: 0 }]
    expect(matchKeyword('qualquer coisa', raw)).toBeNull()
    const raw2: KeywordRule[] = [{ categoryId: 'wild', keyword: '**', sort: 0 }]
    expect(matchKeyword('qualquer coisa', raw2)).toBeNull()
  })

  it('KW-09 metachar: keyword `a.b(c)*` compiles without throw and matches literally', () => {
    const compiled = compileRule('lit', 'a.b(c)*', 0)
    expect(compiled).not.toBeNull()
    const r: KeywordRule[] = [compiled!]
    expect(matchKeyword('a.b(c) qualquer', r)).toEqual({ categoryId: 'lit' })
    // the `.` is a literal dot (escaped), so `aXb(c)` must NOT match.
    expect(matchKeyword('axb(c) qualquer', r)).toBeNull()
  })

  it('KW-09 ReDoS: adversarial input stays linear and completes', () => {
    const r: KeywordRule[] = [compileRule('cat', '*a*a*a*', 0)!]
    const adversarial = 'a'.repeat(50000)
    const start = Date.now()
    const result = matchKeyword(adversarial, r)
    const elapsed = Date.now() - start
    // anchored single-`.*`-per-segment is linear — completes well under a generous bound.
    expect(elapsed).toBeLessThan(1000)
    expect(result).toEqual({ categoryId: 'cat' })
  })

  it('KW-09 order-independence: glob+substring mix returns the SAME category reversed (WR-01)', () => {
    const mix: KeywordRule[] = [
      compileRule('glob', 'uber*', 0)!,
      compileRule('sub', 'uber trip', 0)!,
      compileRule('alim', '*ifood*', 0)!,
    ]
    const forward = matchKeyword('uber trip 123', mix)
    const reversed = matchKeyword('uber trip 123', [...mix].reverse())
    expect(forward).toEqual({ categoryId: 'sub' })
    expect(reversed).toEqual(forward)
  })
})

describe('globToRegExp', () => {
  it('prefix glob → anchored regex', () => {
    expect(globToRegExp('uber*').source).toBe('^uber.*$')
  })

  it('contains glob → anchored regex with leading/trailing `.*`', () => {
    expect(globToRegExp('*ifood*').source).toBe('^.*ifood.*$')
  })

  it('escapes regex metacharacters in literal segments', () => {
    // `.` `(` `)` are literals; only `*` becomes `.*`.
    expect(globToRegExp('a.b(c)*').source).toBe('^a\\.b\\(c\\).*$')
  })
})
