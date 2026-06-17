// IMP-03: the in-house OFX parser against the synthetic latin1 OFX fixture. Pins
// RESEARCH Assumption A2 (STMTTRN field traversal) + the dot-decimal amount +
// YYYYMMDD→civil date conversions — WITHOUT ofx-data-extractor.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

import { normalizeDescriptor } from '@/lib/normalize'
import { parseOfx, ofxAmountToCents, ofxDateToCivil } from './ofx'

const itauText = readFileSync(
  join(process.cwd(), 'tests/fixtures/itau-sample.ofx'),
  'latin1',
)

describe('ofxDateToCivil', () => {
  it('converts YYYYMMDD → YYYY-MM-DD', () => {
    expect(ofxDateToCivil('20260131')).toBe('2026-01-31')
  })
  it('ignores a trailing HHMMSS/timezone', () => {
    expect(ofxDateToCivil('20260131120000[-3:BRT]')).toBe('2026-01-31')
  })
  it('throws on malformed input', () => {
    expect(() => ofxDateToCivil('2026-01')).toThrow()
  })
})

describe('ofxAmountToCents (dot-decimal, NOT parseBRLToCents)', () => {
  it('parses a negative dot-decimal debit to positive cents', () => {
    expect(ofxAmountToCents('-1234.56')).toBe(123456)
  })
  it('parses a positive dot-decimal credit', () => {
    expect(ofxAmountToCents('49.90')).toBe(4990)
  })
  it('rounds once at the cents boundary', () => {
    expect(ofxAmountToCents('-0.1')).toBe(10)
  })
  it('throws on a comma-decimal (that is the CSV path)', () => {
    expect(() => ofxAmountToCents('1.234,56')).toThrow()
  })
})

describe('parseOfx — itau fixture', () => {
  const rows = parseOfx(itauText)

  it('extracts all three STMTTRN rows', () => {
    expect(rows).toHaveLength(3)
  })

  it('maps the first STMTTRN to the normalized row (date, cents, descriptor, fitid)', () => {
    const padaria = rows[0]!
    expect(padaria.occurred_on).toBe('2026-01-31')
    expect(padaria.amount_cents).toBe(123456) // -1234.56 → positive cents
    expect(padaria.descriptor_raw).toBe('PADARIA SAO JOAO  SAO PAULO BR') // MEMO preferred
    expect(padaria.descriptor_norm).toBe(normalizeDescriptor('PADARIA SAO JOAO'))
    expect(padaria.fitid).toBe('20260131001')
  })

  it('prefers MEMO over NAME for descriptor_raw', () => {
    const netflix = rows[1]!
    expect(netflix.descriptor_raw).toBe('NETFLIX.COM  SAO PAULO BR')
  })

  it('carries the FITID for the cross-statement dedup overlap', () => {
    const uber = rows[2]!
    expect(uber.fitid).toBe('20260120003')
    expect(uber.amount_cents).toBe(8900)
  })
})
