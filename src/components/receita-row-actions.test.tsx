import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReceitaRowActions } from '@/components/receita-form'

/**
 * ReceitaRowActions tests (Plan 12-10, G-05). Pins the delete affordance the
 * receitas re-verify needs: an Ações menu with Editar + a destructive Excluir
 * whose AlertDialog confirm copy branches on templateId (recorrente "só neste
 * mês" vs avulsa "não pode ser desfeita"). Mirrors the NfRowActions contract.
 */

// The component imports server actions from '@/actions/incomes'. Stub the module
// so the client component renders in jsdom without a Supabase server boundary.
vi.mock('@/actions/incomes', () => ({
  deleteOccurrence: vi.fn(async () => ({ ok: true })),
  updateOccurrence: vi.fn(async () => ({ ok: true })),
  updateTemplate: vi.fn(async () => ({ ok: true })),
}))

describe('ReceitaRowActions', () => {
  it('exposes an Ações menu with Editar and a destructive Excluir', () => {
    render(
      <ReceitaRowActions
        occurrenceId="occ-1"
        templateId={null}
        monthKey="2026-06"
        currentAmount="1.500,00"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    expect(screen.getByText('Editar')).toBeInTheDocument()
    expect(screen.getByText('Excluir')).toBeInTheDocument()
  })

  it('shows avulsa confirm copy when templateId is null', () => {
    render(
      <ReceitaRowActions
        occurrenceId="occ-1"
        templateId={null}
        monthKey="2026-06"
        currentAmount="1.500,00"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    fireEvent.click(screen.getByText('Excluir'))

    expect(screen.getByText(/não pode ser desfeita/i)).toBeInTheDocument()
  })

  it('shows recurring "só neste mês" confirm copy when templateId is set', () => {
    render(
      <ReceitaRowActions
        occurrenceId="occ-2"
        templateId="tpl-1"
        monthKey="2026-06"
        currentAmount="3.000,00"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    fireEvent.click(screen.getByText('Excluir'))

    // The recurring copy must mention that the template is unaffected.
    expect(screen.getByText(/template não é alterado/i)).toBeInTheDocument()
  })

  it('calls deleteOccurrence with the occurrence id on confirm', async () => {
    const { deleteOccurrence } = await import('@/actions/incomes')
    render(
      <ReceitaRowActions
        occurrenceId="occ-9"
        templateId={null}
        monthKey="2026-06"
        currentAmount="500,00"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ações' }))
    fireEvent.click(screen.getByText('Excluir'))
    // The confirm action button inside the AlertDialog (role=button, name "Excluir").
    const confirmButtons = screen.getAllByRole('button', { name: 'Excluir' })
    const confirmButton = confirmButtons.at(-1)
    if (!confirmButton) throw new Error('confirm button not found')
    fireEvent.click(confirmButton)

    expect(deleteOccurrence).toHaveBeenCalledWith('occ-9')
  })
})
