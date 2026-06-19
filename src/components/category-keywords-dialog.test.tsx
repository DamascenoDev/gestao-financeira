import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CategoryKeywordsDialog } from '@/components/category-keywords-dialog'

/**
 * CategoryKeywordsDialog tests (Plan 19-02, KW-01 UI surface). Pins the four
 * behaviors of the keyword dialog: render one removable chip per keyword (each X
 * carries aria-label "Remover palavra-chave {keyword}"), render the Empty state
 * when there are none, submit-to-add calls addKeyword(categoryId, value) + success
 * toast, and clicking a chip's X calls removeKeyword(keywordId). The actions suite
 * (Plan 19-01) remains the security/behavior gate; this is the optional UI cover.
 */

// Stub the server actions so the client component renders in jsdom without a
// Supabase server boundary. sonner is stubbed so toasts don't touch the DOM.
vi.mock('@/actions/category-keywords', () => ({
  addKeyword: vi.fn(async () => ({ ok: true })),
  removeKeyword: vi.fn(async () => ({ ok: true })),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const CATEGORY = { id: 'cat-1', name: 'Transporte' }

describe('CategoryKeywordsDialog', () => {
  it('renders one removable chip per keyword with the right aria-label', () => {
    render(
      <CategoryKeywordsDialog
        open
        onOpenChange={() => {}}
        category={CATEGORY}
        keywords={[
          { id: 'kw-1', keyword: 'uber' },
          { id: 'kw-2', keyword: '99' },
        ]}
      />,
    )

    expect(screen.getByText('uber')).toBeInTheDocument()
    expect(screen.getByText('99')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remover palavra-chave uber' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remover palavra-chave 99' }),
    ).toBeInTheDocument()
  })

  it('renders the Empty state when there are no keywords', () => {
    render(
      <CategoryKeywordsDialog
        open
        onOpenChange={() => {}}
        category={CATEGORY}
        keywords={[]}
      />,
    )

    expect(screen.getByText('Nenhuma palavra-chave')).toBeInTheDocument()
  })

  it('calls addKeyword with (category.id, value) on submit and toasts the normalized value (WR-01)', async () => {
    const { addKeyword } = await import('@/actions/category-keywords')
    const { toast } = await import('sonner')
    render(
      <CategoryKeywordsDialog
        open
        onOpenChange={() => {}}
        category={CATEGORY}
        keywords={[]}
      />,
    )

    const input = screen.getByLabelText('Nova palavra-chave')
    fireEvent.change(input, { target: { value: 'ifood' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    expect(addKeyword).toHaveBeenCalledWith('cat-1', 'ifood')
    // flush the awaited transition
    await Promise.resolve()
    await Promise.resolve()
    // WR-01: the toast echoes the NORMALIZED value (matches the chip), not the raw
    // input. normalizeDescriptor('ifood') === 'ifood'.
    expect(toast.success).toHaveBeenCalledWith('"ifood" adicionada.')
  })

  it('calls removeKeyword with the chip id when the X is clicked', async () => {
    const { removeKeyword } = await import('@/actions/category-keywords')
    render(
      <CategoryKeywordsDialog
        open
        onOpenChange={() => {}}
        category={CATEGORY}
        keywords={[{ id: 'kw-9', keyword: 'spotify' }]}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Remover palavra-chave spotify' }),
    )

    expect(removeKeyword).toHaveBeenCalledWith('kw-9')
  })
})
