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
})

describe('formatCents', () => {
  it('formats 30 centavos as R$ 0,30', () => {
    expect(normalizeSpace(formatCents(30))).toBe('R$ 0,30')
  })

  it('formats 123456 centavos as R$ 1.234,56', () => {
    expect(normalizeSpace(formatCents(123456))).toBe('R$ 1.234,56')
  })
})

describe('round-trip', () => {
  it('formatCents(parseBRLToCents(x)) reproduces the pt-BR string', () => {
    expect(normalizeSpace(formatCents(parseBRLToCents('1.234,56')))).toBe('R$ 1.234,56')
  })
})
