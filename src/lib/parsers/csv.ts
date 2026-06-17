// CSV parser (IMP-02/03) via papaparse + an explicit column mapping. BR exports
// vary in delimiter (`;` vs `,`), use comma-decimal money ("1.234,56") and DD/MM
// dates, so we never hand-roll tokenizing (papaparse handles quoting/embedded
// separators) and we route money through parseBRLToCents (comma format) — NOT the
// OFX dot-decimal path (Pitfall 2). Pure string→rows; Supabase-free.

import Papa from 'papaparse'

import { parseBRLToCents } from '@/lib/money'
import { normalizeDescriptor } from '@/lib/normalize'
import type { CsvMapping } from '@/lib/schemas/import'
import { MAX_PARSED_ROWS, type ParseResult, type RawTransaction } from './types'

/**
 * Convert a pt-BR 'DD/MM/YYYY' (or 'DD/MM/YY') date to civil 'YYYY-MM-DD'
 * (Pitfall 3: explicit DD/MM, never MM/DD). A 2-digit year is windowed to 2000+.
 */
export function brDateToCivil(input: string): string {
  const m = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/)
  if (!m) throw new Error(`Data pt-BR inválida: "${input}"`)
  const [, dd, mm, yy] = m
  const year = yy!.length === 2 ? `20${yy}` : yy!
  return `${year}-${mm}-${dd}`
}

/** Read the header row of a CSV without committing to a mapping (drives the mapper). */
export function readCsvHeaders(text: string): string[] {
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
    preview: 1,
    delimiter: '', // auto-detect
  })
  const first = parsed.data[0]
  return Array.isArray(first) ? first.map((h) => h.trim()) : []
}

/**
 * Parse CSV text into raw header-keyed records WITHOUT a mapping (drives the
 * CsvColumnMapper preview). No date/money coercion — each cell stays as the bank
 * wrote it so the dialog can show "this column's first value" while the user maps.
 */
export function parseCsvRaw(text: string): Record<string, string>[] {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // auto-detect ';' vs ','
    transformHeader: (h) => h.trim(),
  })
  return data
}

/**
 * Parse CSV text into a ParseResult using the column mapping. Header mode +
 * delimiter auto-detect. Each row maps mapping.dateCol → brDateToCivil,
 * mapping.valorCol → parseBRLToCents (comma decimal), mapping.descCol →
 * descriptor_raw; descriptor_norm via normalizeDescriptor. Rows whose mapped cells
 * are all blank are skipped (trailing/empty lines).
 *
 * CR-01: parsing is RESILIENT. A row whose date/valor cell fails the field
 * converters (a non-pt-BR date, a non-money valor — e.g. a header papaparse
 * mis-detected, a trailing balance line) is SKIPPED and counted in `dropped`,
 * never thrown — one garbage line never aborts the whole parse. WR-02: parsing
 * stops at MAX_PARSED_ROWS and flags `capped`.
 */
export function parseCsv(text: string, mapping: CsvMapping): ParseResult {
  const { data } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // auto-detect ';' vs ','
    transformHeader: (h) => h.trim(),
  })

  const rows: RawTransaction[] = []
  let dropped = 0
  let capped = false
  for (const r of data) {
    if (rows.length >= MAX_PARSED_ROWS) {
      capped = true
      break
    }
    const dateCell = (r[mapping.dateCol] ?? '').trim()
    const valorCell = (r[mapping.valorCol] ?? '').trim()
    const descCell = (r[mapping.descCol] ?? '').trim()
    if (!dateCell && !valorCell && !descCell) continue

    try {
      rows.push({
        occurred_on: brDateToCivil(dateCell),
        amount_cents: parseBRLToCents(valorCell),
        descriptor_raw: descCell,
        descriptor_norm: normalizeDescriptor(descCell),
      })
    } catch {
      // A malformed row (bad date / non-money valor) is skipped, not fatal.
      dropped += 1
    }
  }
  return { rows, dropped, capped }
}
