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
  const { rows, dropped, capped } = parseOfx(itauText)

  it('extracts all three STMTTRN rows', () => {
    expect(rows).toHaveLength(3)
    expect(dropped).toBe(0)
    expect(capped).toBe(false)
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

// CR-01: parse robustness — a malformed STMTTRN (garbage DTPOSTED/TRNAMT) is
// SKIPPED and counted, never thrown. The phase's top-priority concern: one bad
// line must not abort the whole import.
describe('parseOfx — hostile/malformed fixture degrades gracefully (CR-01)', () => {
  const hostileText = readFileSync(
    join(process.cwd(), 'tests/fixtures/hostile-sample.ofx'),
    'latin1',
  )

  it('does not throw on garbage dates/amounts', () => {
    expect(() => parseOfx(hostileText)).not.toThrow()
  })

  it('keeps the good rows and counts the bad ones as dropped', () => {
    const { rows, dropped } = parseOfx(hostileText)
    // PADARIA (good) + SPOTIFY (good) survive; the 3 garbage blocks are dropped.
    expect(rows).toHaveLength(2)
    expect(dropped).toBe(3)
    expect(rows.map((r) => r.fitid)).toEqual(['20260131001', '20260118004'])
  })

  it('a file of ALL-malformed rows yields 0 usable rows but never throws', () => {
    const allBad = `<OFX><STMTTRN><DTPOSTED>00000000<TRNAMT>N/A<FITID>x</STMTTRN>` +
      `<STMTTRN><DTPOSTED>garbage<TRNAMT>nope<FITID>y</STMTTRN></OFX>`
    const { rows, dropped } = parseOfx(allBad)
    expect(rows).toHaveLength(0)
    expect(dropped).toBe(2)
  })

  it('a truncated file (mid-block, no closing tag) parses what it can without crashing', () => {
    const truncated = hostileText.slice(0, hostileText.indexOf('SPOTIFY'))
    expect(() => parseOfx(truncated)).not.toThrow()
    const { rows } = parseOfx(truncated)
    // The one well-formed, fully-closed block before the cut survives.
    expect(rows.map((r) => r.fitid)).toEqual(['20260131001'])
  })
})
