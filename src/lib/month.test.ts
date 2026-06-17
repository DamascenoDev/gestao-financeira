import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  currentMonthKey,
  isMonthKey,
  monthBounds,
  monthKeyOf,
  monthLabel,
  shiftMonthKey,
  toMonthKeyOrCurrent,
  toYearOrCurrent,
} from './month'

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

  describe('isMonthKey (MD-02)', () => {
    it.each(['2026-01', '2026-12', '1999-06'])('accepts %s', (v) => {
      expect(isMonthKey(v)).toBe(true)
    })

    it.each(['2026-00', '2026-13', '2026-99', '2026-6', 'garbage', '2026-06-01', ''])(
      'rejects %s',
      (v) => {
        expect(isMonthKey(v)).toBe(false)
      },
    )

    it('rejects non-string input', () => {
      expect(isMonthKey(42)).toBe(false)
      expect(isMonthKey(null)).toBe(false)
      expect(isMonthKey(undefined)).toBe(false)
    })
  })

  describe('toMonthKeyOrCurrent (MD-02 / WR-03)', () => {
    it('passes through a valid month key', () => {
      expect(toMonthKeyOrCurrent('2026-03')).toBe('2026-03')
    })

    it('falls back to the current month for malformed / missing input', () => {
      const current = currentMonthKey()
      expect(toMonthKeyOrCurrent('2026-99')).toBe(current)
      expect(toMonthKeyOrCurrent(undefined)).toBe(current)
      expect(toMonthKeyOrCurrent(new File([], 'x'))).toBe(current)
    })
  })

  describe('toYearOrCurrent (LR-02)', () => {
    it('passes through a valid in-range integer year (number or string)', () => {
      expect(toYearOrCurrent(2026)).toBe(2026)
      expect(toYearOrCurrent('2026')).toBe(2026)
      expect(toYearOrCurrent('2000')).toBe(2000)
      expect(toYearOrCurrent('2100')).toBe(2100)
    })

    it('falls back to the current year for non-integer / out-of-range / garbage', () => {
      // 2026-07-01T02:00:00Z is still 2026-06-30 in America/Sao_Paulo → year 2026.
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-07-01T02:00:00Z'))
      expect(toYearOrCurrent('2026.5')).toBe(2026)
      expect(toYearOrCurrent('1e9')).toBe(2026)
      expect(toYearOrCurrent('-5')).toBe(2026)
      expect(toYearOrCurrent('1999')).toBe(2026)
      expect(toYearOrCurrent('2101')).toBe(2026)
      expect(toYearOrCurrent('garbage')).toBe(2026)
      expect(toYearOrCurrent(undefined)).toBe(2026)
      expect(toYearOrCurrent(null)).toBe(2026)
    })
  })

  describe('monthKeyOf (WR-01)', () => {
    it('derives the month key from a civil date', () => {
      expect(monthKeyOf('2026-06-15')).toBe('2026-06')
    })

    it('throws on an impossible month so a bad date never reaches the DB', () => {
      expect(() => monthKeyOf('2026-13-45')).toThrow()
    })
  })
})
