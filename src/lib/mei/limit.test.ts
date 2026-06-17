// 5-W0-02 (MEI-02): the applicable-limit oracle, the SAME formula the v_mei_year_summary
// view uses, so the integration test can assert SQL↔TS parity at the data level. The
// danger is entirely in the edges (Pitfalls 12-14): proportional opening year (opening
// month counts FULL), full year thereafter, 0 before opening, and the band recomputed
// proportionally (NOT the full-year 97.200 in the start year).

import { describe, it, expect } from 'vitest'

import { applicableLimitCents, bandCeilingCents } from './limit'

describe('applicableLimitCents (proportional opening year, full thereafter)', () => {
  it('July open → 6 active months → R$40.500', () => {
    expect(applicableLimitCents(2026, '2026-07-01')).toBe(4_050_000)
  })

  it('March open → 10 active months (opening month full) → R$67.500', () => {
    expect(applicableLimitCents(2026, '2026-03-15')).toBe(6_750_000)
  })

  it('year after opening → full R$81.000', () => {
    expect(applicableLimitCents(2027, '2026-03-15')).toBe(8_100_000)
  })

  it('year before opening → 0 (MEI did not exist)', () => {
    expect(applicableLimitCents(2025, '2026-03-15')).toBe(0)
  })

  it('January open → 12 months → full R$81.000 in the opening year', () => {
    expect(applicableLimitCents(2026, '2026-01-10')).toBe(8_100_000)
  })

  it('December open → 1 month → R$6.750', () => {
    expect(applicableLimitCents(2026, '2026-12-20')).toBe(675_000)
  })
})

describe('bandCeilingCents (×1.20, proportional in the start year)', () => {
  it('full-year applicable → R$97.200', () => {
    expect(bandCeilingCents(8_100_000)).toBe(9_720_000)
  })

  it('proportional applicable (Jul) → R$48.600 band, NOT the full-year 97.200', () => {
    expect(bandCeilingCents(4_050_000)).toBe(4_860_000)
  })

  it('zero applicable → zero band', () => {
    expect(bandCeilingCents(0)).toBe(0)
  })
})
