import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  CarroConsumoChart,
  consumoTooltipFormatter,
} from '@/components/carro-consumo-chart'
import { kmPerLitroLabel } from '@/lib/carro/consumo'

/**
 * CarroConsumoChart component tests (Plan 11-01, Task 1 — Wave-0).
 *
 * Recharts' ResponsiveContainer needs ResizeObserver + layout (absent in jsdom),
 * so we mock recharts to inert passthroughs (the line geometry/colors are not what
 * these tests assert — that is deferred to the human-verify checkpoint in Plan 04).
 * The contract under test is the data-viz GRAMMAR the UI-SPEC pins:
 * (1) with >=2 valid points, the aria-labelled chart region renders and NO empty copy;
 * (2) with 0 or 1 valid points, the exact pt-BR empty-state copy renders, no chart;
 * (3) a mixed series (null/0 km/l + one valid) falls to the empty state (<2 valid);
 * (4) the tooltip pt-BR + null discipline via kmPerLitroLabel (direct unit assertion).
 */
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Pass,
    LineChart: Pass,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  }
})

const EMPTY_HEADING = 'Sem dados de consumo ainda'
const EMPTY_BODY =
  'Registre abastecimentos com tanque cheio para ver a curva de km/l aqui.'

describe('CarroConsumoChart', () => {
  const validData = [
    { data: '01/03', kmPorLitro: 12.4 },
    { data: '15/03', kmPorLitro: 11.8 },
    { data: '02/04', kmPorLitro: 13.1 },
  ]

  it('renders the aria-labelled chart region for >=2 valid points and no empty copy', () => {
    render(<CarroConsumoChart data={validData} />)
    expect(
      screen.getByLabelText('Consumo de km/l ao longo do tempo'),
    ).toBeInTheDocument()
    expect(screen.queryByText(EMPTY_HEADING)).not.toBeInTheDocument()
  })

  it('shows the pt-BR empty copy for an empty series (0 points)', () => {
    render(<CarroConsumoChart data={[]} />)
    expect(screen.getByText(EMPTY_HEADING)).toBeInTheDocument()
    expect(screen.getByText(EMPTY_BODY)).toBeInTheDocument()
  })

  it('shows the pt-BR empty copy for a single valid point (1 point < 2)', () => {
    render(<CarroConsumoChart data={[{ data: '01/03', kmPorLitro: 12.4 }]} />)
    expect(screen.getByText(EMPTY_HEADING)).toBeInTheDocument()
  })

  it('drops null/0 km/l points and falls to empty when fewer than 2 valid remain', () => {
    render(
      <CarroConsumoChart
        data={[
          { data: '01/03', kmPorLitro: 0 },
          { data: '15/03', kmPorLitro: 12.4 },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { data: '02/04', kmPorLitro: null as any },
        ]}
      />,
    )
    // Only one finite-positive point survives → <2 valid → empty state.
    expect(screen.getByText(EMPTY_HEADING)).toBeInTheDocument()
  })

  it('formats the tooltip value in pt-BR via kmPerLitroLabel with the null sentinel', () => {
    // The frozen helper renders the pt-BR one-decimal number; the component's
    // tooltip formatter appends the "km/l" unit (consumoTooltipFormatter below).
    expect(kmPerLitroLabel(12.4)).toBe('12,4')
    expect(kmPerLitroLabel(null)).toBe('—')
    expect(consumoTooltipFormatter(12.4)).toBe('12,4 km/l')
    expect(consumoTooltipFormatter(null)).toBe('—')
  })
})
