import { describe, expect, it } from 'vitest'

import { confirmToastMessage } from '@/components/import-review-table'

/**
 * G-08 regression pin (Plan 12 gap-closure). Confirming an already-imported statement
 * (every row dedup-skipped → imported=0, duplicated>0) previously rendered the
 * failure-looking toast "0 transações importadas". The fix branches the message; this
 * pins all three outcomes of the PURE presentation helper (confirmImport's persist
 * logic is intentionally NOT exercised here — it is untouched).
 */
describe('confirmToastMessage (G-08)', () => {
  it('all-duplicate re-confirm shows the calm "já estavam" copy, never "0 importadas"', () => {
    const msg = confirmToastMessage(0, 22)
    expect(msg).toBe('Todas as 22 transações já estavam no extrato')
    expect(msg).not.toContain('0 transações importadas')
  })

  it('clean full import shows the plain imported count (no duplicate suffix)', () => {
    expect(confirmToastMessage(22, 0)).toBe('22 transações importadas')
  })

  it('singular clean import uses the singular noun', () => {
    expect(confirmToastMessage(1, 0)).toBe('1 transação importada')
  })

  it('partial import surfaces the duplicate count for context', () => {
    expect(confirmToastMessage(5, 3)).toBe('5 transações importadas (3 já existiam)')
  })

  it('empty statement (nothing new, nothing duplicated) stays honest', () => {
    expect(confirmToastMessage(0, 0)).toBe('0 transações importadas')
  })
})
