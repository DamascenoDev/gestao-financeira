import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BrDateField } from '@/components/br-date-field'

/**
 * BrDateField component test (Plan 12-11, Task 1 — G-06 fix).
 * Pins the pt-BR dd/mm/aaaa ⇄ ISO yyyy-MM-dd round-trip contract and the
 * invalid/incomplete-input → '' behavior that keeps each parent form's existing
 * ISO-shape ("Data inválida") validation firing. The component never emits a
 * malformed or partial ISO string.
 */
describe('BrDateField', () => {
  it('displays an ISO value as dd/mm/aaaa', () => {
    const { getByRole } = render(
      <BrDateField id="d" value="2026-06-15" onChange={() => {}} />,
    )
    const input = getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('15/06/2026')
  })

  it('renders empty when value is ""', () => {
    const { getByRole } = render(
      <BrDateField id="d" value="" onChange={() => {}} />,
    )
    const input = getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('emits the ISO date when a complete valid dd/mm/aaaa is typed', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <BrDateField id="d" value="" onChange={onChange} />,
    )
    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: '25/12/2026' } })
    expect(onChange).toHaveBeenLastCalledWith('2026-12-25')
  })

  it('emits "" for an incomplete input (does not emit a partial ISO)', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <BrDateField id="d" value="" onChange={onChange} />,
    )
    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: '25/12' } })
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('emits "" for an impossible calendar date (rejects 31/02)', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <BrDateField id="d" value="" onChange={onChange} />,
    )
    const input = getByRole('textbox')
    fireEvent.change(input, { target: { value: '31/02/2026' } })
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('auto-masks digits into dd/mm/aaaa and rejects non-digits', () => {
    const onChange = vi.fn()
    const { getByRole } = render(
      <BrDateField id="d" value="" onChange={onChange} />,
    )
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '15062026' } })
    expect(input.value).toBe('15/06/2026')
    expect(onChange).toHaveBeenLastCalledWith('2026-06-15')
  })

  it('sets aria-invalid when invalid', () => {
    const { getByRole } = render(
      <BrDateField id="d" value="" onChange={() => {}} invalid />,
    )
    const input = getByRole('textbox')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
})
