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

beforeEach(() => {
  rowSeq = 0
  confirmImportMock.mockReset()
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

  it('apply-all: the bulk button fills every unapplied suggestion (excluding memory hits) and invokes NO confirmImport', () => {
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
      // category_id === null), so the button reads "2", not "3".
      makeRow({
        descriptor_raw: 'PADARIA',
        category_id: 'cat-mercado',
        origin: 'memória',
        suggestion: { categoryId: 'cat-transporte', confidence: 0.2, source: 'ia' },
      }),
    ])

    // Button reflects ONLY the two unapplied suggestions.
    const bulk = screen.getByRole('button', { name: /Aplicar 2 sugest/i })
    fireEvent.click(bulk)

    // Every per-row chip is gone and the bulk button disappears (0 unapplied left).
    expect(screen.queryByText(/Aplicar sugestão/i)).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Aplicar \d+ sugest/i }),
    ).toBeNull()
    // The UBER row now shows its applied category.
    expect(screen.getAllByText('Transporte').length).toBeGreaterThan(0)
    // Client-state only: no write path fired.
    expect(confirmImportMock).not.toHaveBeenCalled()
  })
})
