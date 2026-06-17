// IMP-02/03: the papaparse CSV parser + column mapping against synthetic pt-BR
// fixtures. Pins comma-decimal money (via parseBRLToCents) + DD/MM dates, the
// ambiguous-header detection that drives the CsvColumnMapper (Plan 02), and that an
// injection descriptor parses to a plain row (no special parse behavior).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

import { normalizeDescriptor } from '@/lib/normalize'
import { parseCsv, brDateToCivil, readCsvHeaders } from './csv'

// parseCsv consumes ALREADY-DECODED text (the latin1→UTF-8 decode lives in the
// ingest action, Plan 02). The fixtures are authored UTF-8, so read them UTF-8 here.
function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'tests/fixtures', name), 'utf8')
}

const MAPPING = { dateCol: 'Data', descCol: 'Histórico', valorCol: 'Valor' }

describe('brDateToCivil', () => {
  it('converts DD/MM/YYYY → YYYY-MM-DD', () => {
    expect(brDateToCivil('31/01/2026')).toBe('2026-01-31')
  })
  it('windows a 2-digit year to 2000+', () => {
    expect(brDateToCivil('05/06/26')).toBe('2026-06-05')
  })
  it('throws on an ISO date (not DD/MM)', () => {
    expect(() => brDateToCivil('2026-01-31')).toThrow()
  })
})

describe('parseCsv — generic-bank fixture (pt-BR comma decimal + DD/MM)', () => {
  const rows = parseCsv(fixture('generic-bank.csv'), MAPPING)

  it('parses all three rows', () => {
    expect(rows).toHaveLength(3)
  })

  it('maps comma-decimal money via parseBRLToCents (NOT dot-decimal)', () => {
    expect(rows[0]!.amount_cents).toBe(123456) // "1.234,56"
    expect(rows[1]!.amount_cents).toBe(8990) // "89,90"
  })

  it('maps DD/MM dates to civil dates', () => {
    expect(rows[0]!.occurred_on).toBe('2026-01-31')
    expect(rows[1]!.occurred_on).toBe('2026-01-15')
  })

  it('normalizes the descriptor (noise-strip applied)', () => {
    expect(rows[0]!.descriptor_norm).toBe(normalizeDescriptor('PADARIA SAO JOAO'))
  })

  it('CSV rows carry no fitid', () => {
    expect(rows[0]!.fitid).toBeUndefined()
  })
})

describe('readCsvHeaders — ambiguous-cols fixture (drives the mapper)', () => {
  it('returns headers that do NOT contain the canonical Data/Histórico/Valor names', () => {
    const headers = readCsvHeaders(fixture('ambiguous-cols.csv'))
    expect(headers).toEqual(['col_a', 'col_b', 'col_c', 'col_d'])
    expect(headers).not.toContain('Data')
    expect(headers).not.toContain('Valor')
  })
})

describe('parseCsv — injection fixture parses to a plain row', () => {
  it('yields an ordinary normalized row (the seam null-handles classification)', () => {
    const rows = parseCsv(fixture('injection.csv'), MAPPING)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.amount_cents).toBe(4200)
    expect(rows[0]!.descriptor_raw).toContain('IGNORE INSTRUCTIONS')
    // descriptor_norm is just a normalized string — no special handling at parse.
    expect(typeof rows[0]!.descriptor_norm).toBe('string')
  })
})
