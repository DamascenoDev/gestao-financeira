// Civil-month math, pinned to America/Sao_Paulo. ONE module owns month boundaries
// app-wide so a transaction/occurrence near midnight on the last day of the month
// never slips into the wrong civil month, and the default "current month" never
// flips a day early/late via UTC. (RESEARCH Pitfall 3)

import { endOfMonth, format, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'

const TZ = 'America/Sao_Paulo'

/** Parse a 'YYYY-MM' month key into a local Date anchored at the first of the month. */
function parseMonthKey(monthKey: string): Date {
  return parse(monthKey, 'yyyy-MM', new Date())
}

/** The current civil month in America/Sao_Paulo as 'YYYY-MM' — the default ?mes. */
export function currentMonthKey(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM')
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
