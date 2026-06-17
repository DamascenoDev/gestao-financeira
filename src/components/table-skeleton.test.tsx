import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CardSkeleton } from '@/components/card-skeleton'
import { ChartSkeleton } from '@/components/chart-skeleton'
import { TableSkeleton } from '@/components/table-skeleton'

/**
 * Skeleton components tests (Plan 07-06, Task 1 — Wave-0 RED).
 *
 * UI-SPEC §Polish: skeletons, never spinners. The contract under test:
 * (1) TableSkeleton renders a header region + N placeholder rows built on the
 *     shadcn `Skeleton` primitive (data-slot="skeleton"); row count is driven by
 *     the `rows` prop;
 * (2) CardSkeleton renders `count` card placeholders (smoke);
 * (3) ChartSkeleton renders a placeholder box (smoke);
 * (4) none of the three uses a spinner (no `animate-spin`).
 */
describe('TableSkeleton', () => {
  it('renders a header region plus N placeholder rows on the Skeleton primitive', () => {
    const { container } = render(<TableSkeleton rows={5} />)

    // The header region is marked for assertion.
    expect(
      container.querySelector('[data-testid="table-skeleton-header"]'),
    ).not.toBeNull()

    // N body rows.
    const rows = container.querySelectorAll('[data-testid="table-skeleton-row"]')
    expect(rows.length).toBe(5)

    // Built on the shadcn Skeleton primitive (data-slot="skeleton"), not a spinner.
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
  })

  it('defaults to 8 rows', () => {
    const { container } = render(<TableSkeleton />)
    expect(
      container.querySelectorAll('[data-testid="table-skeleton-row"]').length,
    ).toBe(8)
  })

  it('never renders a spinner', () => {
    const { container } = render(<TableSkeleton rows={3} />)
    expect(container.querySelector('.animate-spin')).toBeNull()
  })
})

describe('CardSkeleton', () => {
  it('renders `count` card placeholders on the Skeleton primitive (smoke)', () => {
    const { container } = render(<CardSkeleton count={4} />)
    const cards = container.querySelectorAll('[data-testid="card-skeleton-card"]')
    expect(cards.length).toBe(4)
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('defaults to 3 cards', () => {
    const { container } = render(<CardSkeleton />)
    expect(
      container.querySelectorAll('[data-testid="card-skeleton-card"]').length,
    ).toBe(3)
  })
})

describe('ChartSkeleton', () => {
  it('renders a placeholder box on the Skeleton primitive (smoke)', () => {
    const { container } = render(<ChartSkeleton />)
    expect(screen.getByTestId('chart-skeleton')).toBeTruthy()
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
    expect(container.querySelector('.animate-spin')).toBeNull()
  })
})
