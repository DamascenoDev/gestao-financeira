import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DasnReportView } from '@/components/dasn-report-view'
import { ExportCsvButton } from '@/components/export-csv-button'
import type { MeiReport } from '@/lib/mei/csv'
import { MEI_ANNUAL_LIMIT_CENTS } from '@/lib/mei/rules'
import { formatCents } from '@/lib/money'

/**
 * DasnReportView / ExportCsvButton component tests (Plan 05-03, Task 3). Pins the
 * exact DASN-SIMEI field surface (MEI-04): total + comércio/serviços split (summing
 * to the total) + employee Sim/Não + the deadline label + the disclaimer in the
 * report header (MEI-06), and that the export button serializes via meiReportToCsv.
 */
const NBSP = String.fromCharCode(0x00a0)
const norm = (s: string) => s.split(NBSP).join(' ')

const report: MeiReport = {
  year: 2026,
  grossCents: 5000000, // R$ 50.000,00 = comércio 30k + serviços 20k
  comercioCents: 3000000,
  servicosCents: 2000000,
  hasEmployee: true,
  applicableLimitCents: MEI_ANNUAL_LIMIT_CENTS,
}

describe('DasnReportView', () => {
  it('shows the exact DASN fields: total, split, employee, deadline, disclaimer', () => {
    render(<DasnReportView report={report} hasStartDate />)

    expect(screen.getByText('Receita bruta total')).toBeInTheDocument()
    expect(screen.getByText('Comércio, indústria e transporte')).toBeInTheDocument()
    expect(screen.getByText('Prestação de serviços')).toBeInTheDocument()
    expect(
      screen.getByText('Empregado durante o ano-calendário'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sim')).toBeInTheDocument()

    // period + DASN deadline (derived from rules.ts, ano+1)
    expect(
      screen.getByText('Ano-base 2026 · período jan–dez/2026'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Prazo de entrega: 31 de maio de 2027.'),
    ).toBeInTheDocument()

    // disclaimer (MEI-06) is in the report header
    expect(
      screen.getByText('Este módulo é informativo e não constitui consultoria fiscal.'),
    ).toBeInTheDocument()
  })

  it('the split figures sum to the total', () => {
    render(<DasnReportView report={report} hasStartDate />)
    const find = (cents: number) =>
      screen.getAllByText((_, el) => norm(el?.textContent ?? '') === norm(formatCents(cents)))
    expect(find(5000000).length).toBeGreaterThan(0)
    expect(find(3000000).length).toBeGreaterThan(0)
    expect(find(2000000).length).toBeGreaterThan(0)
    // arithmetic invariant the view relies on
    expect(Number(report.comercioCents) + Number(report.servicosCents)).toBe(
      Number(report.grossCents),
    )
  })

  it('zero-revenue year still renders with the note (does not block)', () => {
    const zero: MeiReport = {
      year: 2026,
      grossCents: 0,
      comercioCents: 0,
      servicosCents: 0,
      hasEmployee: false,
      applicableLimitCents: MEI_ANNUAL_LIMIT_CENTS,
    }
    render(<DasnReportView report={zero} hasStartDate />)
    expect(
      screen.getByText('Nenhuma receita registrada em 2026.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Receita bruta total')).toBeInTheDocument()
  })
})

describe('ExportCsvButton', () => {
  it('serializes the report to a CSV blob download on click', () => {
    const createSpy = vi.fn((_blob: Blob) => 'blob:mock')
    const revokeSpy = vi.fn()
    // jsdom lacks createObjectURL/revokeObjectURL.
    Object.defineProperty(URL, 'createObjectURL', { value: createSpy, writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeSpy, writable: true })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    render(<ExportCsvButton report={report} />)
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }))

    expect(createSpy).toHaveBeenCalledTimes(1)
    const blob = createSpy.mock.calls[0]?.[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(blob?.type).toContain('text/csv')
    expect(clickSpy).toHaveBeenCalledTimes(1)

    clickSpy.mockRestore()
  })
})
