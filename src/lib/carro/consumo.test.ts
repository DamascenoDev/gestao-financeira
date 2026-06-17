import { describe, it, expect } from 'vitest'

import { precoLitroCents, kmPerLitroLabel, reaisPerKmLabel } from './consumo'

// Unit tests for the consumo presentation helpers (CAR-04). preco_litro is NEVER
// stored — it is derived here (custo ÷ litros) and ONLY here, for display. The
// label helpers render the view's km/l and R$/km numbers and fall back to the
// '—' sentinel for null/invalid (the view already nulls bad intervals).

describe('precoLitroCents — derived preço/litro (custo ÷ litros)', () => {
  it('derives custo/litros in centavos for litros > 0', () => {
    // 24000 centavos / 40 L = 600 centavos/L
    expect(precoLitroCents(24000, 40)).toBeCloseTo(600, 6)
  })

  it('accepts a bigint custo', () => {
    expect(precoLitroCents(24000n, 40)).toBeCloseTo(600, 6)
  })

  it('handles a decimal litros', () => {
    // 25000 / 40.5 ≈ 617.28 centavos/L
    expect(precoLitroCents(25000, 40.5)).toBeCloseTo(617.2839, 3)
  })

  it('returns null for litros <= 0 (guard)', () => {
    expect(precoLitroCents(24000, 0)).toBeNull()
    expect(precoLitroCents(24000, -5)).toBeNull()
  })

  it('returns null for a non-finite litros', () => {
    expect(precoLitroCents(24000, Number.NaN)).toBeNull()
  })
})

describe('kmPerLitroLabel — render or sentinel', () => {
  it('renders a positive number', () => {
    expect(kmPerLitroLabel(12.5)).toBe('12,5')
  })

  it('returns the sentinel for null', () => {
    expect(kmPerLitroLabel(null)).toBe('—')
  })

  it('returns the sentinel for a non-positive / invalid number', () => {
    expect(kmPerLitroLabel(0)).toBe('—')
    expect(kmPerLitroLabel(-3)).toBe('—')
    expect(kmPerLitroLabel(Number.NaN)).toBe('—')
  })
})

describe('reaisPerKmLabel — render as currency or sentinel', () => {
  it('renders R$/km from centavos/km', () => {
    // 48 centavos/km → "R$ 0,48"
    expect(reaisPerKmLabel(48)).toContain('0,48')
  })

  it('returns the sentinel for null', () => {
    expect(reaisPerKmLabel(null)).toBe('—')
  })

  it('returns the sentinel for a non-positive / invalid number', () => {
    expect(reaisPerKmLabel(0)).toBe('—')
    expect(reaisPerKmLabel(-1)).toBe('—')
    expect(reaisPerKmLabel(Number.NaN)).toBe('—')
  })
})
