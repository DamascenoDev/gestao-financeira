import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReceitaGastoChart } from '@/components/receita-gasto-chart'
import { formatCents } from '@/lib/money'

/**
 * ReceitaGastoChart component tests (Plan 07-03, Task 2 — Wave-0 RED).
 *
 * Recharts' ResponsiveContainer needs ResizeObserver + layout (absent in jsdom),
 * so we mock recharts to inert passthroughs (the chart geometry is not what these
 * tests assert). The contract under test is the data-viz GRAMMAR the UI-SPEC pins:
 * (1) with data, the labeled total/legend accompanies the chart (Pitfall 6 — the
 * chart is never the sole carrier of a number), formatted via formatCents;
 * (2) with an empty series, the exact pt-BR empty-state copy renders;
 * (3) the UI-SPEC aria-label is present.
 */
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  }
})

/** formatCents emits a non-breaking space (U+00A0); normalize for text matching. */
const NBSP = String.fromCharCode(0x00a0)
const norm = (s: string) => s.split(NBSP).join(' ')

describe('ReceitaGastoChart', () => {
  const data = [
    { mes: 'jan', receita: 500000, gasto: 300000 },
    { mes: 'fev', receita: 450000, gasto: 420000 },
  ]

  it('renders the aria-labelled chart region', () => {
    render(<ReceitaGastoChart data={data} />)
    expect(
      screen.getByLabelText('Evolução de receita e gasto por mês'),
    ).toBeInTheDocument()
  })

  it('accompanies the chart with labeled receita and gasto totals (formatCents)', () => {
    render(<ReceitaGastoChart data={data} />)
    // Σ receita = 9.500,00 · Σ gasto = 7.200,00 — never sole-carried by the chart.
    const receita = norm(formatCents(950000))
    const gasto = norm(formatCents(720000))
    expect(
      screen.getAllByText((_, el) => norm(el?.textContent ?? '').includes(receita)).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText((_, el) => norm(el?.textContent ?? '').includes(gasto)).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Receita')).toBeInTheDocument()
    expect(screen.getByText('Gasto')).toBeInTheDocument()
  })

  it('shows the exact pt-BR empty-state copy for an empty series', () => {
    render(<ReceitaGastoChart data={[]} />)
    expect(screen.getByText('Sem dados para o gráfico')).toBeInTheDocument()
  })
})
