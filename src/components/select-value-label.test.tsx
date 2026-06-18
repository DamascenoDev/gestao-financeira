import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CarroPicker } from '@/components/carro-picker'
import { CARRO_NONE } from '@/lib/carro'

/**
 * G-01 regression pin (Plan 12-08). Base UI `<Select.Value>` renders the selected
 * raw `value` UNLESS the `<Select.Root>` is given an `items` value→label map (or a
 * children render-prop). Every value≠label Select in the app therefore showed a UUID
 * (or the literal `__none__` sentinel) in its collapsed trigger.
 *
 * CarroPicker is the simplest isolated value≠label component (it has both an id→apelido
 * mapping AND the `__none__`→"Nenhum" sentinel decode), so it pins the contract without
 * depending on server data. This is a PURE render test of the collapsed trigger — the
 * defect is purely the trigger's display, not the popup. The NONE sentinel is imported
 * (never hardcoded) so the assertion cannot drift from `@/lib/carro`.
 */
describe('Select value→label trigger (G-01)', () => {
  it('shows the carro apelido label in the trigger, not the raw id', () => {
    render(
      <CarroPicker
        carros={[{ id: 'car-uuid-1', apelido: 'Gol' }]}
        value="car-uuid-1"
        onChange={() => {}}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Carro' })
    expect(trigger).toHaveTextContent('Gol')
    expect(trigger).not.toHaveTextContent('car-uuid-1')
  })

  it('shows "Nenhum" (never the raw sentinel) when no carro is selected', () => {
    render(
      <CarroPicker
        carros={[{ id: 'car-uuid-1', apelido: 'Gol' }]}
        value=""
        onChange={() => {}}
      />,
    )

    const trigger = screen.getByRole('combobox', { name: 'Carro' })
    expect(trigger).toHaveTextContent('Nenhum')
    expect(trigger).not.toHaveTextContent(CARRO_NONE)
  })
})
