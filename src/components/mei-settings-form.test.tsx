import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MeiSettingsForm } from '@/components/mei-settings-form'

// The form imports the Server Actions; stub them so the client component mounts
// under jsdom without a server runtime (we assert the rendered contract, not the IO).
vi.mock('@/actions/mei', () => ({
  upsertMeiSettings: vi.fn(async () => ({ ok: true })),
  upsertMeiYearFlag: vi.fn(async () => ({ ok: true })),
}))

/**
 * MeiSettingsForm component test (Plan 05-03, Task 2). Pins the DASN-relevant
 * copy + seeding contract: the per-year "Tinha funcionário em {ano}?" label, the
 * two helper lines (MEI-03), and that an existing start date seeds the input.
 */
describe('MeiSettingsForm', () => {
  it('scopes the employee question to the selected year and seeds the start date', () => {
    render(
      <MeiSettingsForm ano={2026} meiStartDate="2026-04-01" hasEmployee={false} />,
    )

    expect(screen.getByText('Tinha funcionário em 2026?')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Usamos esta data para calcular seu limite proporcional no primeiro ano.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Campo exigido pela declaração DASN-SIMEI.'),
    ).toBeInTheDocument()

    const startInput = screen.getByLabelText(
      'Data de início do MEI',
    ) as HTMLInputElement
    // BrDateField (G-06) renders the ISO seed as pt-BR dd/mm/aaaa; the stored
    // value stays ISO 2026-04-01 (the form keeps the same ISO state).
    expect(startInput.value).toBe('01/04/2026')
  })

  it('first run renders an empty start date', () => {
    render(<MeiSettingsForm ano={2027} meiStartDate="" hasEmployee={false} />)
    const startInput = screen.getByLabelText(
      'Data de início do MEI',
    ) as HTMLInputElement
    expect(startInput.value).toBe('')
    expect(screen.getByText('Tinha funcionário em 2027?')).toBeInTheDocument()
  })
})
