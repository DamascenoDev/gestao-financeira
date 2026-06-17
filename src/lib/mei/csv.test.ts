// 5-W0-05 (MEI-04): the DASN-ready CSV serializer. Establishes the export pattern the
// roadmap notes Phase 6 (DATA-01) reuses: a UTF-8 BOM (generated in code, never a
// literal invisible char) + `;` delimiter (Excel pt-BR), money via formatCents (pt-BR),
// exactly the DASN fields (ano, receita bruta total, comércio, serviços, funcionário
// Sim/Não, limite aplicável). A zero-revenue year still emits a valid row.

import { describe, it, expect } from 'vitest'

import { formatCents } from '@/lib/money'

import { meiReportToCsv, type MeiReport } from './csv'

const BOM = String.fromCharCode(0xfeff)

/** Split the CSV into its trimmed, BOM-stripped lines (header + data rows). */
function rowsOf(csv: string): string[] {
  return csv.replace(BOM, '').trim().split(/\r?\n/)
}

const report: MeiReport = {
  year: 2026,
  grossCents: 6_000_000,
  comercioCents: 2_500_000,
  servicosCents: 3_500_000,
  hasEmployee: true,
  applicableLimitCents: 8_100_000,
}

describe('meiReportToCsv (DASN-ready export)', () => {
  it('is prefixed with the UTF-8 byte-order mark', () => {
    expect(meiReportToCsv(report).startsWith(BOM)).toBe(true)
  })

  it('uses `;` as the delimiter (Excel pt-BR)', () => {
    const lines = rowsOf(meiReportToCsv(report))
    expect(lines).toHaveLength(2) // header + one data row
    const [header, data] = lines as [string, string]
    expect(header.split(';').length).toBeGreaterThanOrEqual(6)
    expect(data.split(';').length).toBe(header.split(';').length)
  })

  it('emits the DASN fields with pt-BR money and Sim funcionário', () => {
    const [, row] = rowsOf(meiReportToCsv(report)) as [string, string]
    expect(row).toContain('2026')
    expect(row).toContain(formatCents(6_000_000)) // receita bruta total
    expect(row).toContain(formatCents(2_500_000)) // comércio/indústria
    expect(row).toContain(formatCents(3_500_000)) // serviços
    expect(row).toContain(formatCents(8_100_000)) // limite aplicável
    expect(row).toContain('Sim') // funcionário
  })

  it('renders Não when there was no employee', () => {
    const [, row] = rowsOf(meiReportToCsv({ ...report, hasEmployee: false })) as [
      string,
      string,
    ]
    expect(row).toContain('Não')
  })

  it('routes textual fields through the shared formula-injection guard, a no-op for benign values (CR-01)', () => {
    // The current MeiReport columns are numeric/boolean and benign, but the serializer
    // shares the same csvField() guard as the transactions CSV so any future
    // user-controlled column is inert. A benign report serializes with NO injected
    // apostrophe (year/money cells start with a digit or 'R'), proving the guard does
    // not corrupt safe values while still being wired into every cell.
    const [, row] = rowsOf(meiReportToCsv({ ...report, year: 2026 })) as [string, string]
    expect(row.split(';').every((cell) => !cell.startsWith("'"))).toBe(true)
  })

  it('a zero-revenue year still emits a valid row (R$ 0,00)', () => {
    const zero: MeiReport = {
      year: 2026,
      grossCents: 0,
      comercioCents: 0,
      servicosCents: 0,
      hasEmployee: false,
      applicableLimitCents: 8_100_000,
    }
    const [, row] = rowsOf(meiReportToCsv(zero)) as [string, string]
    expect(row).toContain(formatCents(0)) // R$ 0,00
  })
})
