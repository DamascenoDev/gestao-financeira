// IMP-04: the two-layer dedup key derivation. contentHash pins the "0 novas"
// re-upload basis; dedupeKey pins the OFX-FITID vs CSV-tuple basis + collision
// semantics (same basis collides, different basis does not).

import { describe, it, expect } from 'vitest'
import { contentHash, dedupeKey } from './dedupe'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('contentHash (IMP-04 file-level "0 novas")', () => {
  it('byte-identical buffers → identical hash', () => {
    const a = Buffer.from('OFXHEADER:100\n<OFX>...</OFX>', 'utf8')
    const b = Buffer.from('OFXHEADER:100\n<OFX>...</OFX>', 'utf8')
    expect(contentHash(a)).toBe(contentHash(b))
  })
  it('different bytes → different hash', () => {
    const a = Buffer.from('file-A', 'utf8')
    const b = Buffer.from('file-B', 'utf8')
    expect(contentHash(a)).not.toBe(contentHash(b))
  })
  it('is a 64-char sha256 hex string', () => {
    expect(contentHash(Buffer.from('x'))).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('dedupeKey (IMP-04 transaction-level)', () => {
  const ofxRow = {
    fitid: '20260131001',
    occurred_on: '2026-01-31',
    amount_cents: 123456,
    descriptor_norm: 'padaria sao joao',
  }
  const csvRow = {
    occurred_on: '2026-01-31',
    amount_cents: 123456,
    descriptor_norm: 'padaria sao joao',
  }

  it('is deterministic for the same user + row', () => {
    expect(dedupeKey(USER, ofxRow)).toBe(dedupeKey(USER, ofxRow))
    expect(dedupeKey(USER, csvRow)).toBe(dedupeKey(USER, csvRow))
  })

  it('OFX uses the FITID basis; CSV uses the tuple basis — they differ', () => {
    // Same logical row, but the OFX path keys on FITID and the CSV path on the
    // (date, amount, descriptor) tuple → distinct keys by construction.
    expect(dedupeKey(USER, ofxRow)).not.toBe(dedupeKey(USER, csvRow))
  })

  it('two OFX rows with the same FITID collide (cross-statement dedup)', () => {
    const dup = { ...ofxRow, occurred_on: '2026-02-01', amount_cents: 999 }
    // FITID is the stable basis — even if other fields drift, same FITID → same key.
    expect(dedupeKey(USER, dup)).toBe(dedupeKey(USER, ofxRow))
  })

  it('two CSV rows with the same (date, amount, descriptor) collide', () => {
    const dup = { ...csvRow }
    expect(dedupeKey(USER, dup)).toBe(dedupeKey(USER, csvRow))
  })

  it('CSV rows differing in any tuple field do NOT collide', () => {
    expect(dedupeKey(USER, csvRow)).not.toBe(
      dedupeKey(USER, { ...csvRow, amount_cents: 654321 }),
    )
    expect(dedupeKey(USER, csvRow)).not.toBe(
      dedupeKey(USER, { ...csvRow, occurred_on: '2026-02-01' }),
    )
    expect(dedupeKey(USER, csvRow)).not.toBe(
      dedupeKey(USER, { ...csvRow, descriptor_norm: 'outro' }),
    )
  })

  it('the same row keyed to different users does NOT collide', () => {
    expect(dedupeKey(USER, ofxRow)).not.toBe(dedupeKey(OTHER, ofxRow))
  })

  it('empty fitid falls back to the CSV tuple basis', () => {
    const emptyFitid = { ...csvRow, fitid: '' }
    expect(dedupeKey(USER, emptyFitid)).toBe(dedupeKey(USER, csvRow))
  })

  it('a PDF-shaped row (no fitid) uses the csv basis — identical to CSV (PDF-05)', () => {
    // PDF rows omit fitid (no bank-stable id), so they dedupe on the same
    // csv:<date>:<cents>:<norm> tuple as CSV. A PDF row and a CSV row with the
    // same (date, amount, descriptor) must collide.
    const pdfRow = {
      occurred_on: '2026-03-15',
      amount_cents: 8990,
      descriptor_norm: 'mercado exemplo loja',
    }
    expect(dedupeKey(USER, pdfRow)).toBe(
      dedupeKey(USER, {
        occurred_on: '2026-03-15',
        amount_cents: 8990,
        descriptor_norm: 'mercado exemplo loja',
      }),
    )
  })
})
