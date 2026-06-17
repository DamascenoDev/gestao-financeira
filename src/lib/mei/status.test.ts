// 5-W0-03 + 5-W0-07 (MEI-02 / MEI-05): the tiered-status mapper (adherence.ts twin) and
// the 80% alert flag, pinned at the exact basis-point/band edges. The mapper NEVER
// recomputes the limit — it consumes the view's ratio_bp + gross vs band_ceiling. The
// 20% band distinguishes vermelho-banda (gross ≤ ceiling → migrate next year) from
// vermelho-fora (gross > ceiling → desenquadramento retroativo).

import { describe, it, expect } from 'vitest'

import { meiStatus, isNearLimit } from './status'

describe('meiStatus (tiered status at the exact bp/band edges)', () => {
  it('< 80% → verde', () => {
    expect(meiStatus(7999, 5_000_000, 9_720_000)).toBe('verde')
  })

  it('exactly 80% (8000 bp), gross < band → ambar', () => {
    expect(meiStatus(8000, 6_480_000, 9_720_000)).toBe('ambar')
  })

  it('99.99% (9999 bp) → ambar', () => {
    expect(meiStatus(9999, 8_099_000, 9_720_000)).toBe('ambar')
  })

  it('exactly 100% (10000 bp), gross === applicable limit → ambar (at limit is still within, LR-01)', () => {
    // The fiscal ceiling is a value the MEI may REACH; desenquadramento triggers
    // only when gross *exceeds* the limit. Exactly-at-limit stays âmbar.
    expect(meiStatus(10000, 8_100_000, 9_720_000)).toBe('ambar')
  })

  it('just over 100% (10001 bp), within the band (gross ≤ ceiling) → vermelho-banda', () => {
    expect(meiStatus(10001, 8_100_810, 9_720_000)).toBe('vermelho-banda')
  })

  it('over 100% but within the band (gross ≤ ceiling) → vermelho-banda', () => {
    expect(meiStatus(11000, 8_910_000, 9_720_000)).toBe('vermelho-banda')
  })

  it('over the band (gross > ceiling) → vermelho-fora', () => {
    expect(meiStatus(12500, 10_125_000, 9_720_000)).toBe('vermelho-fora')
  })

  it('null ratio (pre-opening, no applicable limit) → verde', () => {
    expect(meiStatus(null, 0, 0)).toBe('verde')
  })

  it('accepts bigint gross/band (BigInt comparison, no float)', () => {
    expect(meiStatus(11000, 9_720_000n, 9_720_000n)).toBe('vermelho-banda')
    expect(meiStatus(12500, 10_125_000n, 9_720_000n)).toBe('vermelho-fora')
  })
})

describe('isNearLimit (80% alert edge, MEI-05)', () => {
  it('7999 bp → not yet', () => {
    expect(isNearLimit(7999)).toBe(false)
  })

  it('exactly 8000 bp → fires', () => {
    expect(isNearLimit(8000)).toBe(true)
  })

  it('null (pre-opening) → false', () => {
    expect(isNearLimit(null)).toBe(false)
  })
})
