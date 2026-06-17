// Civil-month math, pinned to America/Sao_Paulo. ONE module owns month boundaries
// app-wide so a transaction/occurrence near midnight on the last day of the month
// never slips into the wrong civil month, and the default "current month" never
// flips a day early/late via UTC. (RESEARCH Pitfall 3)

import { endOfMonth, format, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'

const TZ = 'America/Sao_Paulo'

/** A real civil month key: 'YYYY-MM' with month in 01..12 (MD-02). */
const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * True when `value` is a well-formed civil month key ('YYYY-MM', month 01..12).
 * The single guard used to reject crafted `?mes` values (e.g. '2026-99', 'garbage')
 * BEFORE they reach date-fns or the DB and silently materialize occurrences in a
 * wrong period (MD-02).
 */
export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && MONTH_KEY_RE.test(value)
}

/**
 * Normalize an untrusted month string (e.g. `searchParams.mes` or a FormData
 * entry) to a valid month key, falling back to the current civil month when it
 * is missing or malformed (MD-02 / WR-03). No unvalidated month string ever
 * reaches date-fns or the DB.
 */
export function toMonthKeyOrCurrent(value: unknown): string {
  return isMonthKey(value) ? value : currentMonthKey()
}

/**
 * Derive the civil month key from a 'YYYY-MM-DD' date string through the one
 * owner of month-key math (WR-01) rather than an ad-hoc slice. Throws on a
 * malformed date so a bad source surfaces instead of corrupting the period.
 */
export function monthKeyOf(dateStr: string): string {
  const key = dateStr.slice(0, 7)
  if (!isMonthKey(key)) {
    throw new Error(`Data inválida para month_key: "${dateStr}"`)
  }
  return key
}

/** Parse a 'YYYY-MM' month key into a local Date anchored at the first of the month. */
function parseMonthKey(monthKey: string): Date {
  return parse(monthKey, 'yyyy-MM', new Date())
}

/** The current civil month in America/Sao_Paulo as 'YYYY-MM' — the default ?mes. */
export function currentMonthKey(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM')
}

/**
 * Today's civil date in America/Sao_Paulo as 'YYYY-MM-DD'. The single owner of
 * "today" so a form default (e.g. a new NF's issued_on) never slips a day via UTC
 * near midnight. Mirrors currentMonthKey/currentYear's TZ pinning.
 */
export function todaySP(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
}

/** A pt-BR 'junho 2026'-style label for the MonthSelector. */
export function monthLabel(monthKey: string): string {
  return format(parseMonthKey(monthKey), 'MMMM yyyy', { locale: ptBR })
}

/** Previous / next month key for the ‹ › arrows — year rollover safe both directions. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const d = parseMonthKey(monthKey)
  d.setMonth(d.getMonth() + delta)
  return format(d, 'yyyy-MM')
}

/** First and last civil day (YYYY-MM-DD) of the month — Feb 28/29 correct. */
export function monthBounds(monthKey: string): { first: string; last: string } {
  const start = parseMonthKey(monthKey)
  return {
    first: format(start, 'yyyy-MM-dd'),
    last: format(endOfMonth(start), 'yyyy-MM-dd'),
  }
}

/**
 * The current civil year in America/Sao_Paulo as 'YYYY' — the default Anual/YTD
 * window. Uses the same TZ as the month helpers so a transaction near midnight on
 * 31-Dec never slips into the wrong year via UTC. (BUD-03)
 */
export function currentYear(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy')
}

/**
 * Normalize an untrusted year value (e.g. `searchParams.ano`) to a real calendar
 * year, falling back to the current civil year when it is missing, non-integer, or
 * out of the supported [2000, 2100] range. Mirrors `toMonthKeyOrCurrent`: the single
 * guard so a crafted `?ano` (e.g. '2026.5', '1e9', '-5', 'garbage') becomes the
 * current year instead of flowing into `.eq('year', ...)` as a nonsense value (LR-02).
 */
export function toYearOrCurrent(value: unknown): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : Number(currentYear())
}

/**
 * First and last civil day of the year (YYYY-MM-DD) for the YTD window. The civil
 * year is a fixed [YYYY-01-01 .. YYYY-12-31] span — no TZ math needed beyond the
 * year string, which currentYear() already pins to America/Sao_Paulo. (BUD-03)
 */
export function yearBounds(year: string): { first: string; last: string } {
  return { first: `${year}-01-01`, last: `${year}-12-31` }
}
