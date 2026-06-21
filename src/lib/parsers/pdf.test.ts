// PDF-02/04/05: the Santander getText() line parser against a SYNTHETIC text
// fixture (real Santander PDFs stay gitignored). Pins the filter precision
// (PAGAMENTO DE FATURA / ANUIDADE / VALOR TOTAL / R$-lines dropped, estornos KEPT),
// the estorno kind:'credit' mapping, parcela = single line value (D-05), the
// trailing-DD/MM descriptor strip, the Dec→Jan vencimento year rollover, and the
// empty-text resilience (the image-only hard block lives in the ingest action).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

import { normalizeDescriptor } from '@/lib/normalize'
import {
  parseSantanderText,
  pdfDateToCivil,
  findStatementVencimento,
} from './pdf'

// parseSantanderText consumes ALREADY-EXTRACTED text (pdf.js returns Unicode;
// extractPdfText is the only async/IO part and is exercised against real PDFs
// locally, not in CI). The fixture is authored UTF-8.
function fixture(name: string): string {
  return readFileSync(join(process.cwd(), 'tests/fixtures', name), 'utf8')
}

const VENC = { month: 6, year: 2026 }

describe('findStatementVencimento', () => {
  it('returns {month, year} from the first full DD/MM/YYYY', () => {
    expect(findStatementVencimento(fixture('santander-sample.txt'))).toEqual({
      month: 6,
      year: 2026,
    })
  })

  it('returns null when no full date is present', () => {
    expect(findStatementVencimento('no dates here 15/03 only')).toBeNull()
  })
})

describe('pdfDateToCivil (vencimento-anchored year + Dec→Jan rollover)', () => {
  it('uses the vencimento year for a month at/under the vencimento month', () => {
    expect(pdfDateToCivil('15', '03', { month: 6, year: 2026 })).toBe('2026-03-15')
  })

  it('rolls back a year for a tx month AFTER the vencimento month', () => {
    // A January (06) vencimento containing a December (12) purchase → previous year.
    expect(pdfDateToCivil('20', '12', { month: 1, year: 2026 })).toBe('2025-12-20')
  })

  it('emits YYYY-MM-DD (never MM/DD)', () => {
    expect(pdfDateToCivil('07', '06', { month: 6, year: 2026 })).toBe('2026-06-07')
  })
})

describe('parseSantanderText — synthetic Santander fixture (filter precision)', () => {
  const { rows, capped } = parseSantanderText(fixture('santander-sample.txt'), VENC)

  it('keeps only compras + estornos (drops bill payment / ANUIDADE / VALOR TOTAL / R$-lines)', () => {
    // 4 compras (mercado, streaming, restaurante, parcela) + 1 estorno = 5 rows.
    expect(rows).toHaveLength(5)
    expect(capped).toBe(false)
  })

  it('excludes the PAGAMENTO DE FATURA bill-payment line', () => {
    expect(rows.some((r) => /pagamento de fatura/i.test(r.descriptor_raw))).toBe(false)
    // and never imports its huge negative value
    expect(rows.some((r) => r.amount_cents === 470197)).toBe(false)
  })

  it('excludes ANUIDADE and VALOR TOTAL summary lines', () => {
    expect(rows.some((r) => /anuidade/i.test(r.descriptor_raw))).toBe(false)
    expect(rows.some((r) => /valor total/i.test(r.descriptor_raw))).toBe(false)
  })

  it('maps a normal compra to kind:"expense" with positive cents', () => {
    const mercado = rows.find((r) => /mercado exemplo/i.test(r.descriptor_raw))
    expect(mercado).toBeDefined()
    expect(mercado!.amount_cents).toBe(8990)
    expect(mercado!.kind).toBe('expense')
    expect(mercado!.occurred_on).toBe('2026-03-15')
  })

  it('maps an estorno to kind:"credit" with positive cents (sign in kind, not amount)', () => {
    const estorno = rows.find((r) => /estorno compra/i.test(r.descriptor_raw))
    expect(estorno).toBeDefined()
    expect(estorno!.kind).toBe('credit')
    expect(estorno!.amount_cents).toBe(10038) // positive — the '-' lives in kind
  })

  it('imports a parcela as the single line value, not the plan total (D-05)', () => {
    const parcela = rows.find((r) => /eletronicos inventados/i.test(r.descriptor_raw))
    expect(parcela).toBeDefined()
    expect(parcela!.amount_cents).toBe(9273) // the per-installment value
    // the VALOR TOTAL DESTE PLANO (1.112,76) is NOT imported
    expect(rows.some((r) => r.amount_cents === 111276)).toBe(false)
  })

  it('strips a trailing " DD/MM" (original-purchase date) from the descriptor', () => {
    const restaurante = rows.find((r) => /restaurante ficticio/i.test(r.descriptor_raw))
    expect(restaurante).toBeDefined()
    expect(restaurante!.descriptor_raw).toBe('RESTAURANTE FICTICIO')
    expect(restaurante!.descriptor_raw).not.toMatch(/\d{2}\/\d{2}/)
  })

  it('derives descriptor_norm via the shared normalizeDescriptor', () => {
    const mercado = rows.find((r) => /mercado exemplo/i.test(r.descriptor_raw))!
    expect(mercado.descriptor_norm).toBe(normalizeDescriptor(mercado.descriptor_raw))
  })

  it('PDF rows carry no fitid (so dedupe uses the csv basis)', () => {
    expect(rows.every((r) => r.fitid === undefined)).toBe(true)
  })
})

describe('parseSantanderText — resilience', () => {
  it('returns an empty result on empty text without throwing (image-only seam)', () => {
    expect(() => parseSantanderText('', VENC)).not.toThrow()
    expect(parseSantanderText('', VENC)).toEqual({ rows: [], dropped: 0, capped: false })
  })

  it('does not throw on garbage text and yields an empty honest-counts result (SC2 generic degradation)', () => {
    expect(() => parseSantanderText('total garbage\nno tx lines here\n', VENC)).not.toThrow()
    expect(parseSantanderText('total garbage\nno tx lines here\n', VENC)).toEqual({
      rows: [],
      dropped: expect.any(Number),
      capped: false,
    })
  })
})
