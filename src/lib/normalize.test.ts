// CLS-01/04: normalizeDescriptor is THE single deterministic merchant key. These
// pins lock determinism + each noise-strip rule + accent-equivalence + empty input.
// The match is EXACT on this output, so any drift in the rules is a behavior change
// that must break a test here first.

import { describe, it, expect } from 'vitest'
import { normalizeDescriptor } from './normalize'

describe('normalizeDescriptor — determinism (CLS-01/04)', () => {
  const samples = [
    'PADARIA SÃO JOÃO  SAO PAULO BR',
    'UBER *TRIP 12/03 SP',
    'COMPRA CARTAO 1234567 RESTAURANTE XYZ 01/02/2026',
    '',
    '   ',
    'iFood *Delivery 99 Bar',
  ]
  it('is idempotent: same raw input always yields the same key', () => {
    for (const s of samples) {
      expect(normalizeDescriptor(s)).toBe(normalizeDescriptor(s))
    }
  })
  it('is stable across repeated application of its own output', () => {
    for (const s of samples) {
      const once = normalizeDescriptor(s)
      expect(normalizeDescriptor(once)).toBe(once)
    }
  })
})

describe('normalizeDescriptor — accent equivalence (CLS-04)', () => {
  it('accented and unaccented forms of the same merchant collapse to one key', () => {
    expect(normalizeDescriptor('PADARIA SÃO JOÃO')).toBe(
      normalizeDescriptor('PADARIA SAO JOAO'),
    )
  })
  it('the OFX MEMO (merchant + city + UF) collapses to the NAME-only key', () => {
    // The fixture MEMO "PADARIA SAO JOAO  SAO PAULO BR" and the NAME
    // "PADARIA SAO JOAO" must produce the SAME memory key.
    expect(normalizeDescriptor('PADARIA SAO JOAO  SAO PAULO BR')).toBe(
      normalizeDescriptor('PADARIA SAO JOAO'),
    )
  })
})

describe('normalizeDescriptor — noise-strip rules', () => {
  it('lowercases', () => {
    expect(normalizeDescriptor('MERCADO')).toBe('mercado')
  })
  it('strips payment-rail tokens (compra/cartao/pix/ted/doc/...)', () => {
    expect(normalizeDescriptor('COMPRA CARTAO MERCADO LIVRE')).toBe('mercado livre')
    expect(normalizeDescriptor('PIX MERCADO')).toBe('mercado')
  })
  it('strips DD/MM[/YY[YY]] dates', () => {
    expect(normalizeDescriptor('NETFLIX 31/01/2026')).toBe('netflix')
    expect(normalizeDescriptor('SPOTIFY 05/06')).toBe('spotify')
  })
  it('strips card-network * noise', () => {
    expect(normalizeDescriptor('UBER *TRIP')).toBe('uber trip')
  })
  it('strips long digit runs (>=4)', () => {
    expect(normalizeDescriptor('LOJA 1234567 CENTRO')).toBe('loja centro')
  })
  it('strips a trailing 2-letter UF code', () => {
    expect(normalizeDescriptor('RESTAURANTE BOM SP')).toBe('restaurante bom')
  })
  it('collapses single-space-separated tokens and trims', () => {
    // NB: 2+ spaces is the merchant|location separator (only the first segment is
    // kept); single spaces inside the merchant segment are collapsed + trimmed.
    expect(normalizeDescriptor(' ABC DEF ')).toBe('abc def')
  })
  it('keeps only the merchant segment before a multi-space location tail', () => {
    expect(normalizeDescriptor('ABC DEF    LOCATION TAIL')).toBe('abc def')
  })
})

describe('normalizeDescriptor — empty / whitespace', () => {
  it('empty raw → empty key', () => {
    expect(normalizeDescriptor('')).toBe('')
  })
  it('whitespace-only raw → empty key', () => {
    expect(normalizeDescriptor('     ')).toBe('')
  })
})
