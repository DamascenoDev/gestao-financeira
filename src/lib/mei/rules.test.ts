// 5-W0-01 (MEI-02 / D-MEI-RULES): the four MEI rule numbers live ONLY in rules.ts,
// and a parity guard reads the 0026 view migration and asserts the SQL literals equal
// the constants — so an SQL↔TS drift fails loudly. A second guard greps every source
// .ts under src/ and asserts NO file except rules.ts carries a bare fiscal-limit
// literal (the "never hardcode 81k elsewhere" property; Pitfall 12 / T-05-04).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  MEI_ANNUAL_LIMIT_CENTS,
  MEI_MONTHLY_RATE_CENTS,
  MEI_TOLERANCE_BP,
  MEI_ALERT_BP,
  DASN_DEADLINE,
  MEI_RULES_YEAR,
} from './rules'

const ROOT = join(__dirname, '..', '..', '..')
const VIEW_MIGRATION = join(ROOT, 'supabase', 'migrations', '0026_mei_views.sql')

/** Recursively collect every .ts/.tsx file under src/. */
function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsFilesUnder(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('MEI rule constants (the ONE source of truth)', () => {
  it('the four verified 2026 numbers', () => {
    expect(MEI_ANNUAL_LIMIT_CENTS).toBe(8_100_000) // R$ 81.000,00
    expect(MEI_MONTHLY_RATE_CENTS).toBe(675_000) // R$ 6.750,00 / mês ativo
    expect(MEI_TOLERANCE_BP).toBe(2000) // 20% band
    expect(MEI_ALERT_BP).toBe(8000) // 80% alert
    expect(DASN_DEADLINE).toEqual({ month: 5, day: 31 }) // 31 de maio
    expect(MEI_RULES_YEAR).toBe(2026)
  })
})

describe('SQL↔TS parity (the view literals must equal the constants)', () => {
  const sql = readFileSync(VIEW_MIGRATION, 'utf8')

  it('the view migration carries the annual-limit literal', () => {
    expect(sql).toContain(String(MEI_ANNUAL_LIMIT_CENTS))
  })

  it('the view migration carries the monthly-rate literal', () => {
    expect(sql).toContain(String(MEI_MONTHLY_RATE_CENTS)) // 675000
  })

  it('the view migration carries the ×1.20 band numerator', () => {
    expect(sql).toContain(String(10000 + MEI_TOLERANCE_BP)) // 12000
  })
})

describe('never-hardcode the fiscal limit in src outside rules.ts', () => {
  it('only rules.ts may contain the bare fiscal-limit literals', () => {
    // Build the forbidden literals FROM the constants so the bare digits never appear
    // in this file (otherwise this guard would flag itself). The full-year limit in
    // reais (cents / 100) and its 20% band (× 1.2) are the two numbers the
    // "no scattered fiscal literal" property forbids outside rules.ts.
    const fullReais = String(MEI_ANNUAL_LIMIT_CENTS / 100)
    const bandReais = String(
      Math.floor((MEI_ANNUAL_LIMIT_CENTS / 100) * (10000 + MEI_TOLERANCE_BP)) / 10000,
    )
    const forbidden = new RegExp(`\\b(${fullReais}|${bandReais})\\b`)
    const offenders = tsFilesUnder(join(ROOT, 'src'))
      .filter((f) => !f.endsWith(join('lib', 'mei', 'rules.ts')))
      .filter((f) => forbidden.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
