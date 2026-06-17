// src/lib/mei/limit.ts
// The applicable-limit oracle: the SAME formula v_mei_year_summary (0026) uses, so the
// integration test can assert SQL↔TS parity at the data level. Pure, integer-cents,
// NO DB. The opening month counts FULL (12 - openingMonth + 1) — a July MEI gets
// 6 months → R$40.500, not "safe at R$81.000" (Pitfall 12). The band is recomputed
// proportionally in the start year (NOT the full-year R$97.200).

import {
  MEI_ANNUAL_LIMIT_CENTS,
  MEI_MONTHLY_RATE_CENTS,
  MEI_TOLERANCE_BP,
} from './rules'

/**
 * Applicable gross-revenue limit (centavos) for `reportYear`, given the MEI's
 * `mei_start_date` ('YYYY-MM-DD'):
 *  - before the opening calendar year → 0 (the MEI did not exist);
 *  - in the opening year → proportional: MEI_MONTHLY_RATE_CENTS × active months,
 *    where active months = 12 − openingMonth + 1 (opening month counts in full);
 *  - in any later year → the full MEI_ANNUAL_LIMIT_CENTS.
 */
export function applicableLimitCents(reportYear: number, meiStartDate: string): number {
  const openingYear = Number(meiStartDate.slice(0, 4))
  const openingMonth = Number(meiStartDate.slice(5, 7))
  if (reportYear < openingYear) return 0
  if (reportYear === openingYear) {
    return MEI_MONTHLY_RATE_CENTS * (12 - openingMonth + 1)
  }
  return MEI_ANNUAL_LIMIT_CENTS
}

/**
 * The 20% tolerance-band ceiling (centavos) for a given applicable limit: applicable
 * × 1.20 via integer math (× (10000 + MEI_TOLERANCE_BP) / 10000). Computed from the
 * applicable limit so the start-year band is proportional, never the full-year R$97.200.
 */
export function bandCeilingCents(applicable: number): number {
  return Math.floor((applicable * (10000 + MEI_TOLERANCE_BP)) / 10000)
}
