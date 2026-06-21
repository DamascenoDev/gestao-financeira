import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ImportReviewTable,
  type ReviewCategory,
  type ReviewRow,
} from '@/components/import-review-table'

/**
 * ImportReviewTable component test (Plan 16-01) — pins the 7 review-grid suggestion
 * edges from 16-VALIDATION.md. The grid renders the Phase-15 `row.suggestion`
 * (`{ categoryId: string | null; confidence: number; source: 'ia' }`) into the
 * existing `SuggestionSlot` chip, adds a per-row provenance badge (memória vs IA),
 * a per-row "baixa confiança" tag, and orders low-confidence AI rows first on
 * initial load — all WITHOUT writing anything (the learn loop stays in confirmImport).
 *
 * Mocks: `@/actions/import` so apply proves NO write path fires; `next/navigation`
 * useRouter so render does not need a router. G-01 awareness — the Select trigger
 * renders a CategoryBadge child, so assertions target the rendered category NAME,
 * never a raw id.
 */

const confirmImportMock = vi.fn()
vi.mock('@/actions/import', () => ({
  confirmImport: (...args: unknown[]) => confirmImportMock(...args),
}))

// KW-07: stub addKeyword so the inline control renders without a Supabase server
// boundary, and sonner so the toasts don't touch the DOM.
vi.mock('@/actions/category-keywords', () => ({
  addKeyword: vi.fn(async () => ({ ok: true })),
}))
// `toast` is used both as a bare callable (toast('…')) AND via methods
// (toast.success/info/error), so the mock must be a function with attached spies.
vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })
  return { toast }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

/** A fixed two-category fixture so each case is a few lines. */
const CATEGORIES: ReviewCategory[] = [
  { id: 'cat-mercado', name: 'Mercado', color: 'green' },
  { id: 'cat-transporte', name: 'Transporte', color: 'blue' },
]

const SERVER_SUMMARY = {
  total: 0,
  novas: 0,
  naoClassificadas: 0,
  duplicadas: 0,
  descartadas: 0,
}

let rowSeq = 0
function makeRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  rowSeq += 1
  return {
    id: `row-${rowSeq}`,
    dedupe_key: `dk-${rowSeq}`,
    occurred_on: '2026-06-15',
    amount: 1000,
    amount_cents: 1000,
    descriptor_raw: `Descritor ${rowSeq}`,
    descriptor_norm: `descritor ${rowSeq}`,
    category_id: null,
    reserva_id: null,
    carro_id: null,
    origin: 'não classificada',
    is_recurring: false,
    ...overrides,
  }
}

/** Non-null index helper (the test config uses noUncheckedIndexedAccess). */
function at<T>(arr: T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`expected element at index ${i}`)
  return v
}

function renderTable(rows: ReviewRow[]) {
  return render(
    <ImportReviewTable
      statementId="stmt-1"
      initialRows={rows}
      serverSummary={SERVER_SUMMARY}
      categories={CATEGORIES}
    />,
  )
}

beforeEach(async () => {
  rowSeq = 0
  confirmImportMock.mockReset()
  // The bare `toast(...)` callable is asserted by the bulk-toast cases via
  // toHaveBeenCalledWith — clear it each test so a prior toast() call can't leak.
  const { toast } = await import('sonner')
  vi.mocked(toast).mockClear()
})

describe('ImportReviewTable — suggestion affordances', () => {
  it('chip-on-ai-suggestion: a non-null categoryId suggestion shows the chip + "IA" badge', () => {
    renderTable([
      makeRow({
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
    ])

    expect(
      screen.getAllByText(/Aplicar sugestão: Mercado/i).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText(/^IA$/).length).toBeGreaterThan(0)
  })

  it('no-chip-on-none-fits: a null categoryId suggestion shows neither chip nor "IA" badge', () => {
    renderTable([
      makeRow({
        category_id: null,
        suggestion: { categoryId: null, confidence: 0.9, source: 'ia' },
      }),
    ])

    expect(screen.queryByText(/Aplicar sugestão/i)).toBeNull()
    expect(screen.queryByText(/^IA$/)).toBeNull()
  })

  it('memoria-badge: a memory-classified row shows the neutral "memória" badge and no chip/IA badge', () => {
    renderTable([
      makeRow({
        category_id: 'cat-mercado',
        origin: 'memória',
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
    ])

    expect(screen.getAllByText(/^memória$/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Aplicar sugestão/i)).toBeNull()
    expect(screen.queryByText(/^IA$/)).toBeNull()
  })

  it('keyword-provenance-badge: a keyword-classified row shows the lowercase "palavra-chave" pill and no chip/IA badge', () => {
    renderTable([
      makeRow({
        category_id: 'cat-mercado',
        origin: 'palavra-chave',
      }),
    ])

    // ProvenanceBadge surface (Categoria cell): lowercase, no icon.
    expect(screen.getAllByText(/^palavra-chave$/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Aplicar sugestão/i)).toBeNull()
    expect(screen.queryByText(/^IA$/)).toBeNull()
  })

  it('keyword-origin-badge: a keyword-classified row shows the Title-Case "Palavra-chave" badge in the Origem column', () => {
    renderTable([
      makeRow({
        category_id: 'cat-mercado',
        origin: 'palavra-chave',
      }),
    ])

    // OriginBadge surface (Origem column): Title-Case label.
    expect(screen.getAllByText(/^Palavra-chave$/).length).toBeGreaterThan(0)
  })

  it('keyword-distinct-from-memoria: keyword and memória rows never show the other state', () => {
    const { unmount } = renderTable([
      makeRow({ category_id: 'cat-mercado', origin: 'palavra-chave' }),
    ])
    // A keyword row must not surface the memória label in either casing.
    expect(screen.queryByText(/^memória$/)).toBeNull()
    expect(screen.queryByText(/^Memória$/)).toBeNull()
    unmount()

    renderTable([makeRow({ category_id: 'cat-mercado', origin: 'memória' })])
    // A memória row must not surface the keyword label in either casing.
    expect(screen.queryByText(/^palavra-chave$/)).toBeNull()
    expect(screen.queryByText(/^Palavra-chave$/)).toBeNull()
  })

  it('low-confidence-tag: confidence < 0.6 shows "baixa confiança", >= 0.6 does not', () => {
    const { unmount } = renderTable([
      makeRow({
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.3, source: 'ia' },
      }),
    ])
    expect(screen.getAllByText(/baixa confiança/i).length).toBeGreaterThan(0)
    unmount()

    rowSeq = 0
    renderTable([
      makeRow({
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
    ])
    expect(screen.queryByText(/baixa confiança/i)).toBeNull()
  })

  it('low-confidence-first-sort: a low-confidence AI row renders first even when later in input order', () => {
    renderTable([
      makeRow({
        descriptor_raw: 'ALTA',
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.95, source: 'ia' },
      }),
      makeRow({
        descriptor_raw: 'BAIXA',
        category_id: null,
        suggestion: { categoryId: 'cat-transporte', confidence: 0.2, source: 'ia' },
      }),
    ])

    // The desktop table body holds one row per data row; assert the FIRST data row
    // is the low-confidence one (BAIXA).
    const tables = screen.getAllByRole('table')
    const firstBodyRow = at(within(at(tables, 0)).getAllByRole('row'), 1) // [0] is the header
    expect(within(firstBodyRow).getByText('BAIXA')).toBeTruthy()
  })

  it('no-suggestions-v1.3-identical: no suggestion anywhere → no badges/chips/tags, input order preserved', () => {
    renderTable([
      makeRow({ descriptor_raw: 'PRIMEIRA' }),
      makeRow({ descriptor_raw: 'SEGUNDA' }),
    ])

    expect(screen.queryByText(/Aplicar sugestão/i)).toBeNull()
    expect(screen.queryByText(/^IA$/)).toBeNull()
    expect(screen.queryByText(/^memória$/)).toBeNull()
    expect(screen.queryByText(/baixa confiança/i)).toBeNull()

    const tables = screen.getAllByRole('table')
    const bodyRows = within(at(tables, 0)).getAllByRole('row').slice(1)
    expect(within(at(bodyRows, 0)).getByText('PRIMEIRA')).toBeTruthy()
    expect(within(at(bodyRows, 1)).getByText('SEGUNDA')).toBeTruthy()
  })

  it('apply-no-commit: clicking "Aplicar sugestão" fills the Select but invokes NO confirmImport', () => {
    renderTable([
      makeRow({
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
    ])

    const chip = at(screen.getAllByText(/Aplicar sugestão: Mercado/i), 0)
    fireEvent.click(chip)

    // After apply, the Select shows the picked category (CategoryBadge name) and the
    // chip is gone — the apply only mutates client state.
    expect(screen.queryByText(/Aplicar sugestão/i)).toBeNull()
    expect(screen.getAllByText('Mercado').length).toBeGreaterThan(0)
    // No write path fired: confirmImport must never be called by apply.
    expect(confirmImportMock).not.toHaveBeenCalled()
  })

  it('apply-all: the bulk button fills only CONFIDENT suggestions (>= 0.6), leaving low-confidence pending, excluding memory hits, and invokes NO confirmImport', () => {
    renderTable([
      makeRow({
        descriptor_raw: 'NETFLIX',
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
      makeRow({
        descriptor_raw: 'UBER',
        category_id: null,
        suggestion: { categoryId: 'cat-transporte', confidence: 0.3, source: 'ia' },
      }),
      // An already-classified memory hit: the bulk count must EXCLUDE it (gate on
      // category_id === null) AND it is below threshold anyway, so it never counts.
      makeRow({
        descriptor_raw: 'PADARIA',
        category_id: 'cat-mercado',
        origin: 'memória',
        suggestion: { categoryId: 'cat-transporte', confidence: 0.2, source: 'ia' },
      }),
    ])

    // CLSAI-10: button reflects ONLY the single confident (>= 0.6) unapplied suggestion.
    const bulk = screen.getByRole('button', { name: /Aplicar 1 sugest/i })
    fireEvent.click(bulk)

    // The confident NETFLIX→Mercado row is applied (Mercado appears in its Select).
    expect(screen.getAllByText('Mercado').length).toBeGreaterThan(0)
    // The low-confidence UBER (0.3) row STAYS pending: its "Aplicar sugestão" chip
    // remains and the row is still uncategorized.
    expect(screen.getAllByText(/Aplicar sugestão: Transporte/i).length).toBeGreaterThan(
      0,
    )
    // The bulk button DISAPPEARS — 0 confident suggestions remain.
    expect(
      screen.queryByRole('button', { name: /Aplicar \d+ sugest/i }),
    ).toBeNull()
    // Client-state only: no write path fired.
    expect(confirmImportMock).not.toHaveBeenCalled()
  })

  it('confident-applies-low-stays-pending: a 0.9 row applies; a 0.3 row keeps its chip AND its "baixa confiança" tag; no confirmImport', () => {
    renderTable([
      makeRow({
        descriptor_raw: 'ALTA',
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
      makeRow({
        descriptor_raw: 'BAIXA',
        category_id: null,
        suggestion: { categoryId: 'cat-transporte', confidence: 0.3, source: 'ia' },
      }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Aplicar 1 sugest/i }))

    // The 0.9 row is applied.
    expect(screen.getAllByText('Mercado').length).toBeGreaterThan(0)
    // The 0.3 row still has its apply chip AND still shows "baixa confiança".
    expect(screen.getAllByText(/Aplicar sugestão: Transporte/i).length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText(/baixa confiança/i).length).toBeGreaterThan(0)
    expect(confirmImportMock).not.toHaveBeenCalled()
  })

  it('boundary-0.6-is-confident: a row at exactly 0.6 is confident (button reads 1, NO "baixa confiança"), and applies on click', () => {
    renderTable([
      makeRow({
        descriptor_raw: 'LIMIAR',
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.6, source: 'ia' },
      }),
    ])

    // Before click: counted as confident, no amber tag.
    expect(
      screen.getByRole('button', { name: /Aplicar 1 sugest/i }),
    ).toBeTruthy()
    expect(screen.queryByText(/baixa confiança/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Aplicar 1 sugest/i }))

    // After click: applied (category shows, chip gone, button gone).
    expect(screen.getAllByText('Mercado').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Aplicar sugestão/i)).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Aplicar \d+ sugest/i }),
    ).toBeNull()
  })

  it('button-hidden-when-zero-confident: only low-confidence rows → no bulk-apply button even though rows stay pending', () => {
    renderTable([
      makeRow({
        descriptor_raw: 'BAIXA-1',
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.3, source: 'ia' },
      }),
      makeRow({
        descriptor_raw: 'BAIXA-2',
        category_id: null,
        suggestion: { categoryId: 'cat-transporte', confidence: 0.3, source: 'ia' },
      }),
    ])

    // No confident pending → the bulk-apply button is not rendered.
    expect(
      screen.queryByRole('button', { name: /Aplicar \d+ sugest/i }),
    ).toBeNull()
    // Both rows are still pending with their chips + amber tags.
    expect(screen.getAllByText(/Aplicar sugestão/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/baixa confiança/i).length).toBeGreaterThan(0)
  })

  it('bulk-toast-confident-copy (plural): apply with 2 confident rows toasts "2 sugestões confiáveis aplicadas"', async () => {
    const { toast } = await import('sonner')
    renderTable([
      makeRow({
        descriptor_raw: 'A',
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
      makeRow({
        descriptor_raw: 'B',
        category_id: null,
        suggestion: { categoryId: 'cat-transporte', confidence: 0.8, source: 'ia' },
      }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Aplicar 2 sugest/i }))

    expect(toast).toHaveBeenCalledWith('2 sugestões confiáveis aplicadas')
  })

  it('bulk-toast-confident-copy (singular): apply with 1 confident row toasts "1 sugestão confiável aplicada"', async () => {
    const { toast } = await import('sonner')
    renderTable([
      makeRow({
        descriptor_raw: 'SO-UMA',
        category_id: null,
        suggestion: { categoryId: 'cat-mercado', confidence: 0.9, source: 'ia' },
      }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Aplicar 1 sugest/i }))

    expect(toast).toHaveBeenCalledWith('1 sugestão confiável aplicada')
  })
})

describe('KW-07 inline keyword suggestion', () => {
  // The grid renders BOTH the desktop table (`hidden md:table`) and the mobile card
  // list (`md:hidden`) — CSS `hidden` keeps both in the jsdom DOM, so the inline pill
  // appears twice (once per layout). These helpers target the FIRST occurrence, the
  // same `getAllBy*` discipline the suggestion-affordance suite above uses.
  const PILL_NAME = 'Criar palavra-chave para esta categoria'
  const firstPill = () => at(screen.getAllByRole('button', { name: PILL_NAME }), 0)

  beforeEach(() => {
    rowSeq = 0
  })

  it("renders the '+ palavra-chave' pill ONLY on a manually-classified row", () => {
    renderTable([makeRow({ category_id: 'cat-mercado', origin: 'manual' })])

    expect(screen.getAllByRole('button', { name: PILL_NAME }).length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText('+ palavra-chave').length).toBeGreaterThan(0)
  })

  it('does NOT render the pill on memória/palavra-chave/não-classificada rows', () => {
    const { unmount } = renderTable([
      makeRow({ category_id: 'cat-mercado', origin: 'memória' }),
    ])
    expect(screen.queryByText('+ palavra-chave')).toBeNull()
    expect(screen.queryByRole('button', { name: PILL_NAME })).toBeNull()
    unmount()

    rowSeq = 0
    const second = renderTable([
      makeRow({ category_id: 'cat-mercado', origin: 'palavra-chave' }),
    ])
    expect(screen.queryByText('+ palavra-chave')).toBeNull()
    second.unmount()

    rowSeq = 0
    renderTable([makeRow({ category_id: null, origin: 'não classificada' })])
    expect(screen.queryByText('+ palavra-chave')).toBeNull()
  })

  it('Salvar calls addKeyword(row.category_id, term) and flips to criada ✓', async () => {
    const { addKeyword } = await import('@/actions/category-keywords')
    renderTable([
      makeRow({
        category_id: 'cat-transporte',
        origin: 'manual',
        descriptor_norm: 'uber trip 99',
      }),
    ])

    // Open the (first) popover.
    fireEvent.click(firstPill())

    // The term input is prefilled with the row's normalized descriptor.
    const input = at(
      screen.getAllByLabelText('Palavra-chave'),
      0,
    ) as HTMLInputElement
    expect(input.value).toBe('uber trip 99')

    fireEvent.click(at(screen.getAllByRole('button', { name: 'Salvar' }), 0))

    // addKeyword receives the just-picked category + the (un-re-normalized) term.
    expect(addKeyword).toHaveBeenCalledWith('cat-transporte', 'uber trip 99')

    // The control flips to the disabled "criada ✓" — no second create on offer.
    // findAllByText retries past the startTransition commit + popover teardown.
    expect((await screen.findAllByText(/criada/)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: PILL_NAME })).toBeNull()
  })

  it('duplicate still flips to criada ✓ (toast.info)', async () => {
    const { addKeyword } = await import('@/actions/category-keywords')
    const { toast } = await import('sonner')
    vi.mocked(addKeyword).mockResolvedValueOnce({ duplicate: true })

    renderTable([
      makeRow({
        category_id: 'cat-mercado',
        origin: 'manual',
        descriptor_norm: 'padaria pao',
      }),
    ])

    fireEvent.click(firstPill())
    fireEvent.click(at(screen.getAllByRole('button', { name: 'Salvar' }), 0))

    // findAllByText retries past the startTransition commit.
    expect((await screen.findAllByText(/criada/)).length).toBeGreaterThan(0)
    expect(toast.info).toHaveBeenCalled()
  })

  it('error keeps the popover open (no flip)', async () => {
    const { addKeyword } = await import('@/actions/category-keywords')
    vi.mocked(addKeyword).mockResolvedValueOnce({
      error: 'Não foi possível salvar a palavra-chave.',
    })

    renderTable([
      makeRow({
        category_id: 'cat-mercado',
        origin: 'manual',
        descriptor_norm: 'mercado x',
      }),
    ])

    fireEvent.click(firstPill())
    fireEvent.click(at(screen.getAllByRole('button', { name: 'Salvar' }), 0))

    await Promise.resolve()
    await Promise.resolve()

    // Popover stays open (the term input is still present) and no "criada ✓" flip.
    expect(screen.getAllByLabelText('Palavra-chave').length).toBeGreaterThan(0)
    expect(screen.queryByText(/criada/)).toBeNull()
  })
})
