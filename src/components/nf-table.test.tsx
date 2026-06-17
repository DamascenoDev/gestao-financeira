import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AtividadeBadge } from '@/components/atividade-badge'
import { NfTable, type NfRow } from '@/components/nf-table'
import { formatCents } from '@/lib/money'

/**
 * NfTable / AtividadeBadge component tests (Plan 05-03, Task 1). Pins the two
 * load-bearing display contracts the dashboard depends on: the activity label
 * mapping (the DASN split wording, MEI-03) and the gross year total footer (the
 * same number the dashboard hero shows, MEI-01).
 */

/** formatCents emits a non-breaking space (U+00A0); normalize for text matching. */
const NBSP = String.fromCharCode(0x00a0)
const norm = (s: string) => s.split(NBSP).join(' ')

describe('AtividadeBadge', () => {
  it('labels comércio/indústria and serviços (no money color)', () => {
    const { rerender } = render(
      <AtividadeBadge activityType="comercio_industria" />,
    )
    expect(screen.getByText('Comércio/Indústria')).toBeInTheDocument()

    rerender(<AtividadeBadge activityType="servicos" />)
    expect(screen.getByText('Serviços')).toBeInTheDocument()
  })
})

describe('NfTable', () => {
  const rows: NfRow[] = [
    {
      id: 'a',
      issued_on: '2026-03-10',
      amount_cents: 150000,
      tomador: 'Cliente A',
      descricao: 'Consultoria',
      activity_type: 'servicos',
    },
    {
      id: 'b',
      issued_on: '2026-05-02',
      amount_cents: 250000,
      tomador: 'Cliente B',
      descricao: 'Venda de produto',
      activity_type: 'comercio_industria',
    },
  ]

  it('sums the gross year total in the footer', () => {
    render(<NfTable rows={rows} defaultDate="2026-06-16" />)
    // 1.500,00 + 2.500,00 = 4.000,00
    const expected = norm(formatCents(400000))
    const matches = screen.getAllByText(
      (_, el) => norm(el?.textContent ?? '') === expected,
    )
    expect(matches.length).toBeGreaterThan(0)
    expect(screen.getByText('Receita bruta no ano')).toBeInTheDocument()
  })

  it('renders one row per NF with its tomador + activity badge', () => {
    render(<NfTable rows={rows} defaultDate="2026-06-16" />)
    expect(screen.getByText('Cliente A')).toBeInTheDocument()
    expect(screen.getByText('Cliente B')).toBeInTheDocument()
    expect(screen.getByText('Serviços')).toBeInTheDocument()
    expect(screen.getByText('Comércio/Indústria')).toBeInTheDocument()
  })
})
