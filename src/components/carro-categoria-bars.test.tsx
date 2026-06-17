import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CarroCategoriaBars } from '@/components/carro-categoria-bars'
import { formatCents } from '@/lib/money'

/**
 * CarroCategoriaBars component tests (Plan 11-01, Task 2 — Wave-0).
 *
 * A pure presentational magnitude-bar list (no recharts — plain divs), so the width
 * ratio IS observable in jsdom (unlike SVG geometry). The contract under test:
 * (1) one row per categoria, ordered by valor desc, each with name + formatCents amount;
 * (2) magnitude — the largest valor's fill width is 100% and a half-max row is 50%;
 * (3) empty list → the single muted pt-BR line, no bar track.
 */

/** formatCents emits a non-breaking space (U+00A0); normalize for text matching. */
const NBSP = String.fromCharCode(0x00a0)
const norm = (s: string) => s.split(NBSP).join(' ')

const EMPTY_COPY = 'Nenhum gasto vinculado a este carro.'

describe('CarroCategoriaBars', () => {
  const data = [
    { categoria: 'Combustível', valorCents: 200000 },
    { categoria: 'Manutenção', valorCents: 100000 }, // half of the max
    { categoria: 'Seguro', valorCents: 50000 },
  ]

  it('renders one row per categoria with name + formatCents amount', () => {
    render(<CarroCategoriaBars data={data} />)
    expect(screen.getByText('Combustível')).toBeInTheDocument()
    expect(screen.getByText('Manutenção')).toBeInTheDocument()
    expect(screen.getByText('Seguro')).toBeInTheDocument()
    for (const d of data) {
      const amount = norm(formatCents(d.valorCents))
      expect(
        screen
          .getAllByText((_, el) => norm(el?.textContent ?? '').includes(amount))
          .length,
      ).toBeGreaterThan(0)
    }
  })

  it('orders rows by valor desc', () => {
    const { container } = render(<CarroCategoriaBars data={data} />)
    const names = Array.from(
      container.querySelectorAll('[data-slot="categoria-row"]'),
    ).map((el) => el.getAttribute('aria-label') ?? '')
    expect(names[0]).toContain('Combustível')
    expect(names[1]).toContain('Manutenção')
    expect(names[2]).toContain('Seguro')
  })

  it('sizes the fill width proportional to the max valor (100% / 50%)', () => {
    const { container } = render(<CarroCategoriaBars data={data} />)
    const fills = Array.from(
      container.querySelectorAll<HTMLElement>('[data-slot="categoria-fill"]'),
    )
    // Rows are valor-desc; the first (max) is 100%, the second (half) is 50%.
    expect(fills[0]?.style.width).toBe('100%')
    expect(fills[1]?.style.width).toBe('50%')
  })

  it('renders the single muted empty line and no bar for an empty list', () => {
    const { container } = render(<CarroCategoriaBars data={[]} />)
    expect(screen.getByText(EMPTY_COPY)).toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="categoria-fill"]'),
    ).toBeNull()
  })
})
