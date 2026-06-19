// Pure unit tests for matchKeyword (KW-02/KW-04). No mocks — mirrors a normalize-style
// test: deterministic substring match, longest-wins, sort tie-break, '' non-match guard,
// and the defensive empty-keyword rule guard.

import { describe, expect, it } from 'vitest'

import { matchKeyword, type KeywordRule } from './keywords'

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
})
