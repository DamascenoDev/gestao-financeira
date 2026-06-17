// 6-W0-01 (DATA-01): transactionsToCsv — the pt-BR transaction CSV serializer.
// Mirrors src/lib/mei/csv.ts: a UTF-8 BOM generated in code (never a literal
// invisible char), `;` delimiter, CRLF line endings, money via formatCents (pt-BR
// comma decimals), and RFC-4180 field escaping so an odd/malicious description can
// never break the column layout. GREEN now — implementation ships in this task.

import { describe, it, expect } from 'vitest'

import { formatCents } from '@/lib/money'

import { transactionsToCsv, type TransactionCsvRow } from './csv'

const BOM = String.fromCharCode(0xfeff)

/** Split into trimmed, BOM-stripped lines (header + data rows). */
function rowsOf(csv: string): string[] {
  return csv.replace(BOM, '').trim().split(/\r?\n/)
}

const rows: TransactionCsvRow[] = [
  {
    occurred_on: '2026-06-01',
    description: 'Padaria São João',
    category_name: 'Alimentação',
    category_kind: 'consumo',
    amount_cents: 123456,
  },
  {
    occurred_on: '2026-06-15',
    description: 'Aporte reserva',
    category_name: 'Reserva',
    category_kind: 'alocacao',
    amount_cents: 50000,
  },
]

describe('transactionsToCsv (DATA-01 pt-BR export)', () => {
  it('is prefixed with the UTF-8 BOM, uses `;` + CRLF, and ends with a trailing CRLF', () => {
    const csv = transactionsToCsv(rows)
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv.includes('\r\n')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    const lines = rowsOf(csv)
    expect(lines).toHaveLength(rows.length + 1) // header + one row each
    const [header, first] = lines as [string, string]
    expect(header.split(';').length).toBeGreaterThanOrEqual(5)
    expect(first.split(';').length).toBe(header.split(';').length)
  })

  it('renders money via formatCents (pt-BR comma decimal) and the date as dd/MM/yyyy', () => {
    const [, first] = rowsOf(transactionsToCsv(rows)) as [string, string]
    expect(first).toContain(formatCents(123456)) // 'R$ 1.234,56' (pt-BR NBSP)
    // pt-BR currency uses a non-breaking space after R$; assert the digits/decimal.
    expect(first).toMatch(/R\$\s1\.234,56/)
    expect(first).toContain('01/06/2026') // dd/MM/yyyy
  })

  it('maps category kind to Consumo/Alocação and falls back to "Sem categoria"', () => {
    const csv = transactionsToCsv([
      ...rows,
      {
        occurred_on: '2026-06-20',
        description: 'Sem cat',
        category_name: '',
        category_kind: null,
        amount_cents: 999,
      },
    ])
    const lines = rowsOf(csv)
    expect(lines[1]).toContain('Consumo')
    expect(lines[2]).toContain('Alocação')
    const last = lines[3] as string
    expect(last).toContain('Sem categoria')
    // null kind serializes an empty Tipo field (a valid line, no crash).
    expect(last.split(';')).toHaveLength((lines[0] as string).split(';').length)
  })

  it('quotes and doubles inner quotes for a field containing ; " or newline (RFC-4180)', () => {
    const csv = transactionsToCsv([
      {
        occurred_on: '2026-06-01',
        description: 'Loja; "Promo"\nlinha2',
        category_name: 'Outros',
        category_kind: 'consumo',
        amount_cents: 100,
      },
    ])
    // The whole malicious field is quoted and inner quotes are doubled, so the
    // embedded `;` and newline can't break the column layout.
    expect(csv).toContain('"Loja; ""Promo""\nlinha2"')
    // The header still has exactly one row's worth of `;`-separated columns.
    const headerCols = (csv.replace(BOM, '').split('\r\n')[0] as string).split(';').length
    expect(headerCols).toBeGreaterThanOrEqual(5)
  })
})
