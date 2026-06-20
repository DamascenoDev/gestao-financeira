import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { KeywordSuggestionsDialog } from '@/components/keyword-suggestions-dialog'

/**
 * KeywordSuggestionsDialog tests (Plan 22-03, KW-08 client surface). Pins the
 * five behaviors of the batch dialog: load-on-open lists the server candidates,
 * bulk approve calls approveKeywordSuggestions(selected) + toasts, discard is
 * side-effect-free (NO action call), the Empty state renders for an empty feed,
 * and approve is disabled at zero selection. The actions suite (Plan 22-02) is
 * the security/behavior gate; this is the client cover. Actions + sonner are
 * mocked so the component renders in jsdom with no server boundary.
 */

vi.mock('@/actions/category-keywords', () => ({
  getKeywordSuggestions: vi.fn(async () => ({
    ok: true,
    suggestions: [
      {
        descriptorNorm: 'uber trip',
        categoryId: 'cat-1',
        categoryName: 'Transporte',
        hitCount: 3,
      },
      {
        descriptorNorm: 'ifood centro',
        categoryId: 'cat-1',
        categoryName: 'Transporte',
        hitCount: 1,
      },
    ],
  })),
  approveKeywordSuggestions: vi.fn(async () => ({
    ok: true,
    created: 1,
    skipped: 0,
  })),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const CATEGORIES = [{ id: 'cat-1', name: 'Transporte', color: 'blue' }]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('KeywordSuggestionsDialog', () => {
  it('loads candidates on open and lists them as editable term inputs', async () => {
    const { getKeywordSuggestions } = await import(
      '@/actions/category-keywords'
    )
    render(
      <KeywordSuggestionsDialog
        open
        onOpenChange={() => {}}
        categories={CATEGORIES}
      />,
    )

    expect(getKeywordSuggestions).toHaveBeenCalled()

    const first = await screen.findByLabelText('Termo da sugestão uber trip')
    const second = await screen.findByLabelText('Termo da sugestão ifood centro')
    expect((first as HTMLInputElement).value).toBe('uber trip')
    expect((second as HTMLInputElement).value).toBe('ifood centro')
  })

  it('approve calls approveKeywordSuggestions with the selected items + toasts', async () => {
    const { approveKeywordSuggestions } = await import(
      '@/actions/category-keywords'
    )
    const { toast } = await import('sonner')
    render(
      <KeywordSuggestionsDialog
        open
        onOpenChange={() => {}}
        categories={CATEGORIES}
      />,
    )

    // wait for the load to settle, then select the first candidate
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Selecionar uber trip',
    })
    fireEvent.click(checkbox)

    const approveBtn = await screen.findByRole('button', {
      name: 'Aprovar selecionadas (1)',
    })
    fireEvent.click(approveBtn)

    await waitFor(() =>
      expect(approveKeywordSuggestions).toHaveBeenCalled(),
    )
    expect(approveKeywordSuggestions).toHaveBeenCalledWith([
      { categoryId: 'cat-1', keyword: 'uber trip' },
    ])
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
  })

  it('discard makes NO server call and removes the row', async () => {
    const { approveKeywordSuggestions } = await import(
      '@/actions/category-keywords'
    )
    render(
      <KeywordSuggestionsDialog
        open
        onOpenChange={() => {}}
        categories={CATEGORIES}
      />,
    )

    const discard = await screen.findByRole('button', {
      name: 'Descartar sugestão uber trip',
    })
    fireEvent.click(discard)

    // The discarded row is gone...
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Termo da sugestão uber trip'),
      ).not.toBeInTheDocument(),
    )
    // ...and the sibling candidate is still there.
    expect(
      screen.getByLabelText('Termo da sugestão ifood centro'),
    ).toBeInTheDocument()
    // Discard is local-only: NO approve action fired.
    expect(approveKeywordSuggestions).not.toHaveBeenCalled()
  })

  it('renders the Empty state when there are no candidates', async () => {
    const { getKeywordSuggestions } = await import(
      '@/actions/category-keywords'
    )
    vi.mocked(getKeywordSuggestions).mockResolvedValueOnce({
      ok: true,
      suggestions: [],
    })
    render(
      <KeywordSuggestionsDialog
        open
        onOpenChange={() => {}}
        categories={CATEGORIES}
      />,
    )

    expect(
      await screen.findByText('Nenhuma sugestão por enquanto'),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Termo da sugestão uber trip'),
    ).not.toBeInTheDocument()
  })

  it('disables approve until at least one candidate is selected', async () => {
    render(
      <KeywordSuggestionsDialog
        open
        onOpenChange={() => {}}
        categories={CATEGORIES}
      />,
    )

    // After load, approve is disabled (nothing selected).
    const approveBtn = await screen.findByRole('button', {
      name: 'Aprovar selecionadas',
    })
    expect(approveBtn).toBeDisabled()

    // Select one → approve enables and shows the count.
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Selecionar uber trip' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Aprovar selecionadas (1)' }),
    ).toBeEnabled()
  })
})
