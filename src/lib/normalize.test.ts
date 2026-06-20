// CLS-01/04: normalizeDescriptor is THE single deterministic merchant key. These
// pins lock determinism + each noise-strip rule + accent-equivalence + empty input.
// The match is EXACT on this output, so any drift in the rules is a behavior change
// that must break a test here first.

import { describe, it, expect } from 'vitest'
import { normalizeDescriptor, normalizeKeyword } from './normalize'

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
  it('IN-02: keeps a trailing 2-letter token that is NOT a UF code (no false merge)', () => {
    // "xv" is not a UF — must be kept so "BAR XV" and "BAR" do not collapse.
    expect(normalizeDescriptor('BAR XV')).toBe('bar xv')
    expect(normalizeDescriptor('BAR XV')).not.toBe(normalizeDescriptor('BAR'))
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

// KW-09 Phase 21 GATE: normalizeKeyword is the keyword-aware variant that PRESERVES
// the glob `*` but is otherwise bit-identical to normalizeDescriptor (same NFKD,
// lowercase, accent-strip, payment tokens, dates, digit runs, UF, whitespace). The
// descriptor-side MUST keep stripping `*` (it is card-network noise there).
describe('normalizeKeyword — preserves the glob `*` (KW-09)', () => {
  it('keeps a trailing `*` (UBER* stays a wildcard, not "uber")', () => {
    const r = normalizeKeyword('UBER*')
    expect(r).toContain('*')
    expect(r).toBe('uber*')
  })
  it('keeps both leading and trailing `*`', () => {
    expect(normalizeKeyword('*IFOOD*')).toBe('*ifood*')
  })
  it('normalizes accents/case exactly like the descriptor, but keeps `*`', () => {
    const r = normalizeKeyword('SÃO JOÃO*')
    expect(r).toBe('sao joao*')
    expect(r).toContain('*')
    expect(r).toBe(r.toLowerCase())
  })
  it('a lone `*` survives (reject of literal-count-0 is addKeyword’s job)', () => {
    expect(normalizeKeyword('*')).toBe('*')
  })
  it('collapses `**` content (only-wildcard survives as wildcard chars)', () => {
    const r = normalizeKeyword('**')
    expect(r.replace(/\*/g, '')).toBe('')
    expect(r).toContain('*')
  })
})

describe('normalizeKeyword — same key space as descriptor when no `*` (substring v1.5 intact)', () => {
  const noWildcard = [
    'mercado',
    'MERCADO',
    'COMPRA CARTAO MERCADO LIVRE',
    'PADARIA SÃO JOÃO  SAO PAULO BR',
    'NETFLIX 31/01/2026',
    'LOJA 1234567 CENTRO',
    'RESTAURANTE BOM SP',
    'BAR XV',
    '',
    '   ',
  ]
  it('is bit-identical to normalizeDescriptor for any input WITHOUT `*`', () => {
    for (const s of noWildcard) {
      expect(normalizeKeyword(s)).toBe(normalizeDescriptor(s))
    }
  })
})

describe('normalizeDescriptor — `*` strip preserved (regression: descriptor side unchanged)', () => {
  it('still collapses card-network `*` noise to a space', () => {
    expect(normalizeDescriptor('UBER *TRIP')).toBe('uber trip')
  })
})
