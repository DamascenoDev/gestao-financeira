import { describe, it, expect } from 'vitest'
import { parseBRLToCents, formatCents } from './money'

// SEC-02 — money exactness. Centavos are the only money representation;
// never use float. parse once at ingest, format only at the UI edge.

// pt-BR currency formatting inserts a non-breaking space after "R$".
// Normalize any whitespace to a regular space so the assertion is robust
// across Node ICU builds.
function normalizeSpace(s: string): string {
  return s.replace(/\s/g, ' ')
}

describe('parseBRLToCents', () => {
  it('parses a pt-BR amount with thousands dot + decimal comma to integer centavos', () => {
    expect(parseBRLToCents('1.234,56')).toBe(123456)
  })

  it('sums R$ 0,10 + R$ 0,20 to exactly 30 centavos (no float drift)', () => {
    expect(parseBRLToCents('0,10') + parseBRLToCents('0,20')).toBe(30)
  })

  it('returns an integer for any valid input', () => {
    for (const input of ['0,10', '0,20', '1.234,56', '99,99', '1.000.000,00']) {
      expect(Number.isInteger(parseBRLToCents(input))).toBe(true)
    }
  })

  it('parses a currency-prefixed string ("R$ 10,00") to centavos', () => {
    expect(parseBRLToCents('R$ 10,00')).toBe(1000)
    expect(parseBRLToCents('R$1.234,56')).toBe(123456)
  })

  // HG-03: amounts must be STRICTLY POSITIVE. Negative and zero are rejected at
  // the parse boundary (single source of truth), never left to a divergent DB CHECK.
  it('rejects (throws on) negative values', () => {
    expect(() => parseBRLToCents('-10,00')).toThrow()
    expect(() => parseBRLToCents('-1')).toThrow()
    expect(() => parseBRLToCents('-0,01')).toThrow()
  })

  it('rejects (throws on) zero (R$ 0,00 is not a valid amount)', () => {
    expect(() => parseBRLToCents('0,00')).toThrow()
    expect(() => parseBRLToCents('0')).toThrow()
    expect(() => parseBRLToCents('R$ 0,00')).toThrow()
  })

  it('rejects (throws on) blank / whitespace-only input instead of returning 0', () => {
    expect(() => parseBRLToCents('')).toThrow()
    expect(() => parseBRLToCents('   ')).toThrow()
  })

  it('rejects (throws on) non-money input instead of returning NaN', () => {
    expect(() => parseBRLToCents('abc')).toThrow()
    expect(() => parseBRLToCents('R$')).toThrow()
  })

  // WR-05: ambiguous thousands-grouping must throw rather than silently coerce
  // to a plausible-but-wrong amount ("10.5" is NOT R$ 105,00; "1.2.3,45" is junk).
  it('rejects (throws on) ambiguous / malformed grouping', () => {
    expect(() => parseBRLToCents('10.5')).toThrow()
    expect(() => parseBRLToCents('1.2.3,45')).toThrow()
    expect(() => parseBRLToCents('1.23,45')).toThrow()
    expect(() => parseBRLToCents('12,345')).toThrow()
  })
})

describe('formatCents', () => {
  it('formats 30 centavos as R$ 0,30', () => {
    expect(normalizeSpace(formatCents(30))).toBe('R$ 0,30')
  })

  it('formats 123456 centavos as R$ 1.234,56', () => {
    expect(normalizeSpace(formatCents(123456))).toBe('R$ 1.234,56')
  })

  it('accepts a bigint and keeps precision above Number.MAX_SAFE_INTEGER centavos', () => {
    // 90.071.992.547.409 reais + 0,07 — strictly beyond Number.MAX_SAFE_INTEGER
    // (9.007.199.254.740.991) centavos. The bigint path must not drift.
    expect(normalizeSpace(formatCents(9_007_199_254_740_999n))).toBe(
      'R$ 90.071.992.547.409,99'
    )
  })

  it('formats a bigint within the safe range identically to the number path', () => {
    expect(formatCents(123456n)).toBe(formatCents(123456))
  })

  it('throws on an unsafe-integer number rather than silently losing precision', () => {
    expect(() => formatCents(Number.MAX_SAFE_INTEGER + 1)).toThrow()
  })
})

describe('round-trip', () => {
  it('formatCents(parseBRLToCents(x)) reproduces the pt-BR string', () => {
    expect(normalizeSpace(formatCents(parseBRLToCents('1.234,56')))).toBe('R$ 1.234,56')
  })
})
