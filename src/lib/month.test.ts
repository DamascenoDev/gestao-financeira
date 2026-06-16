import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentMonthKey, monthBounds, monthLabel, shiftMonthKey } from './month'

describe('lib/month — civil-month helpers (America/Sao_Paulo)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('currentMonthKey', () => {
    it('derives the Sao_Paulo civil month, not UTC, near a month boundary', () => {
      // 2026-07-01T02:00:00Z is still 2026-06-30 23:00 in America/Sao_Paulo (UTC-3).
      // A naive UTC reading would yield '2026-07'; the tz-pinned helper must yield '2026-06'.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-01T02:00:00Z'))
      expect(currentMonthKey()).toBe('2026-06')
    })

    it('returns a YYYY-MM string', () => {
      expect(currentMonthKey()).toMatch(/^\d{4}-\d{2}$/)
    })
  })

  describe('shiftMonthKey', () => {
    it('rolls back across a year boundary', () => {
      expect(shiftMonthKey('2026-01', -1)).toBe('2025-12')
    })

    it('rolls forward across a year boundary', () => {
      expect(shiftMonthKey('2026-12', 1)).toBe('2027-01')
    })

    it('shifts within a year', () => {
      expect(shiftMonthKey('2026-06', -1)).toBe('2026-05')
      expect(shiftMonthKey('2026-06', 1)).toBe('2026-07')
    })
  })

  describe('monthLabel', () => {
    it('produces a pt-BR label containing the month name and year', () => {
      const label = monthLabel('2026-06').toLowerCase()
      expect(label).toContain('junho')
      expect(label).toContain('2026')
    })
  })

  describe('monthBounds', () => {
    it('returns the first and last civil day of a 30-day month', () => {
      expect(monthBounds('2026-06')).toEqual({ first: '2026-06-01', last: '2026-06-30' })
    })

    it('returns Feb 28 for a non-leap year', () => {
      expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' })
    })

    it('returns Feb 29 for a leap year', () => {
      expect(monthBounds('2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29' })
    })
  })
})
