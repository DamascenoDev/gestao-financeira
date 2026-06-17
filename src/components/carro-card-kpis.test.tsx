import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CarroCard, type CarroCardData } from '@/components/carro-card'
import { formatCents } from '@/lib/money'

/**
 * CarroCard KPI strip tests (Plan 11-02, Task 1 — Wave-0 RED).
 *
 * The Phase-8 identity card gains an additive two-up KPI strip (gasto total +
 * km/l médio) read from v_carro_resumo. The contract under test is the UI-SPEC
 * §2 grammar + the D4/CONTEXT null discipline:
 * (1) non-null KPIs format via formatCents / kmPerLitroLabel ("12,4 km/l");
 * (2) null KPIs render the '—' sentinel and NEVER "R$ 0,00" / "0 km/l";
 * (3) the card identity (apelido link to /carros/{id}) is unchanged.
 *
 * The server actions are async and only fire on the (closed) dropdown; sonner
 * toasts never trigger at render. Mock the actions module so no real server-only
 * code is pulled into jsdom.
 */
vi.mock('@/actions/carros', () => ({
  archiveCarro: vi.fn(),
  unarchiveCarro: vi.fn(),
}))

const base: CarroCardData = {
  id: 'carro-1',
  apelido: 'Gol',
  modelo: 'VW Gol',
  placa: 'ABC1D23',
  ano: 2018,
  combustivelPadrao: 'Flex',
  isArchived: false,
  gastoTotalCents: null,
  kmPorLitroMedio: null,
}

describe('CarroCard KPI strip', () => {
  it('renders gasto total (formatCents) and km/l médio for non-null KPIs', () => {
    render(
      <CarroCard
        carro={{ ...base, gastoTotalCents: 324000, kmPorLitroMedio: 12.4 }}
      />,
    )

    expect(screen.getByText('Gasto total')).toBeInTheDocument()
    expect(screen.getByText('km/l médio')).toBeInTheDocument()
    // formatCents emits a NBSP after "R$"; the digit pattern (3.240,00) is the
    // load-bearing assertion — match it with a whitespace-tolerant regex so the
    // space variant never flakes the test. (formatCents(324000) === "R$ 3.240,00".)
    expect(formatCents(324000)).toMatch(/^R\$\s3\.240,00$/)
    expect(screen.getByText(/R\$\s*3\.240,00/)).toBeInTheDocument()
    expect(screen.getByText('12,4 km/l')).toBeInTheDocument()
  })

  it('renders the "—" sentinel for null KPIs — never "R$ 0,00" or "0 km/l"', () => {
    render(<CarroCard carro={{ ...base, gastoTotalCents: null, kmPorLitroMedio: null }} />)

    // Both labels are always present (the strip is never hidden).
    expect(screen.getByText('Gasto total')).toBeInTheDocument()
    expect(screen.getByText('km/l médio')).toBeInTheDocument()

    // Two em-dash values, one per KPI.
    expect(screen.getAllByText('—')).toHaveLength(2)

    // The null discipline: no zero placeholders ever surface.
    expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument()
    expect(screen.queryByText(/0 km\/l/)).not.toBeInTheDocument()
  })

  it('keeps the identity apelido link to /carros/{id} intact', () => {
    render(<CarroCard carro={{ ...base, gastoTotalCents: 324000, kmPorLitroMedio: 12.4 }} />)

    const link = screen.getByRole('link', { name: 'Gol' })
    expect(link).toHaveAttribute('href', '/carros/carro-1')
  })
})
