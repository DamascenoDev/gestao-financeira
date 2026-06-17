import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CategoryDistributionChart } from '@/components/category-distribution-chart'
import { formatCents } from '@/lib/money'

/**
 * CategoryDistributionChart component tests (Plan 07-03, Task 2 — Wave-0 RED).
 *
 * Recharts mocked to inert passthroughs (ResponsiveContainer/Pie need layout +
 * ResizeObserver absent in jsdom). The contract pinned: (1) each category label
 * + the month total render via formatCents (legend, never the chart alone —
 * Pitfall 6); (2) the exact pt-BR empty-state copy for an empty month;
 * (3) the UI-SPEC aria-label interpolating the month.
 */
vi.mock('recharts', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    ResponsiveContainer: Pass,
    PieChart: Pass,
    Pie: () => null,
    Cell: () => null,
    Tooltip: () => null,
    Legend: () => null,
  }
})

const NBSP = String.fromCharCode(0x00a0)
const norm = (s: string) => s.split(NBSP).join(' ')

describe('CategoryDistributionChart', () => {
  const data = [
    { categoria: 'Mercado', cents: 300000 },
    { categoria: 'Transporte', cents: 120000 },
  ]

  it('renders the aria-labelled chart region with the month', () => {
    render(<CategoryDistributionChart data={data} mes="junho 2026" />)
    expect(
      screen.getByLabelText('Distribuição de gastos por categoria em junho 2026'),
    ).toBeInTheDocument()
  })

  it('shows each category label and the formatted month total (legend)', () => {
    render(<CategoryDistributionChart data={data} mes="junho 2026" />)
    expect(screen.getByText('Mercado')).toBeInTheDocument()
    expect(screen.getByText('Transporte')).toBeInTheDocument()
    // total = 4.200,00 — accompanies the chart, never sole-carried.
    const total = norm(formatCents(420000))
    expect(
      screen.getAllByText((_, el) => norm(el?.textContent ?? '').includes(total)).length,
    ).toBeGreaterThan(0)
  })

  it('shows the exact pt-BR empty-state copy for an empty month', () => {
    render(<CategoryDistributionChart data={[]} mes="junho 2026" />)
    expect(screen.getByText('Nenhum gasto neste mês')).toBeInTheDocument()
  })
})
