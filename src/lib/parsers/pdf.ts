// Santander PDF statement parser (PDF-02/04/05). The spike measured that
// getText() — NOT getTable() — is the workhorse on real Santander UNIQUE VISA
// PDFs (getTable returns 0 tables). The module splits into:
//   - extractPdfText(buffer): the ONLY async/IO part (pdf-parse v2 getText)
//   - parseSantanderText(text, venc): PURE, Supabase-free, fully CI-testable
//     against a committed synthetic text fixture (real PDFs stay gitignored).
// Pure rule: never throws on a bad line — a malformed line is SKIPPED into
// `dropped` (mirrors parseCsv/parseOfx). PDF text is already Unicode (pdf.js),
// so the latin1 decodeStatement heuristic must NOT run on it (Pitfall 7).

import { PDFParse } from 'pdf-parse'

import { parseBRLToCents } from '@/lib/money'
import { normalizeDescriptor } from '@/lib/normalize'
import { MAX_PARSED_ROWS, type ParseResult, type RawTransaction } from './types'

// A transaction line: an optional leading parcela index, a DD/MM date, the
// descriptor (which may carry a trailing original-purchase DD/MM), and a
// pt-BR comma-decimal value with an optional leading '-' (estorno).
const TX = /^(?:(\d{1,2})\s+)?(\d{2})\/(\d{2})\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})$/

// Summary / balance / non-transaction lines, filtered by LABEL (not by sign —
// estornos are also negative but must be KEPT; only these labels are dropped).
const NOISE_LABEL =
  /pagamento de fatura|^anuidade|valor total|saldo anterior|total de|total despesas|saldo desta|^resumo|limite|iof|encargos|juros|multa/i

/**
 * Extract the full text of a PDF buffer via pdf-parse v2 getText() (the only
 * async/IO part). Returns '' for an image-only / zero-text PDF without throwing
 * — the image-only HARD BLOCK (text.trim() === '') is decided by the ingest
 * action, not here (so the pure parser stays testable).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const { text } = await parser.getText()
    return text ?? ''
  } finally {
    await parser.destroy?.()
  }
}

/**
 * Anchor the statement year: the first full DD/MM/YYYY in the text is the
 * vencimento region. Returns { month, year } or null when no full date exists.
 */
export function findStatementVencimento(
  text: string,
): { month: number; year: number } | null {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return { month: Number(m[2]), year: Number(m[3]) }
}

/**
 * Convert a transaction DD/MM (no year on the line) to civil 'YYYY-MM-DD' using
 * the vencimento year. A tx whose month is AFTER the vencimento month belongs to
 * the previous year (Dec→Jan rollover, Pitfall 1). Mirrors ofxDateToCivil's shape
 * (small exported pure fn, emits YYYY-MM-DD — never MM/DD).
 */
export function pdfDateToCivil(
  dd: string,
  mm: string,
  venc: { month: number; year: number },
): string {
  const month = Number(mm)
  const year = month > venc.month ? venc.year - 1 : venc.year
  return `${year}-${mm}-${dd}`
}

/**
 * Parse extracted Santander statement text into a ParseResult. Windows to the
 * `Detalhamento da Fatura` … `Resumo da Fatura` section, drops R$-prefixed +
 * NOISE_LABEL lines, line-matches the TX regex, strips a trailing original-
 * purchase DD/MM from the descriptor, routes money through parseBRLToCents
 * (sign stripped — the sign lives in `kind`, never in the always-positive
 * amount_cents), treats 0,00 as `dropped`, and stops at MAX_PARSED_ROWS.
 * Resilient: a per-line throw is caught into `dropped`, never fatal.
 */
export function parseSantanderText(
  text: string,
  venc: { month: number; year: number },
): ParseResult {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())

  const start = lines.findIndex((l) => /detalhamento da fatura/i.test(l))
  const end = lines.findIndex((l, i) => i > start && /^resumo da fatura/i.test(l))
  // Pitfall 6 fallback: if the start marker is absent (layout drift), scan the
  // whole document rather than failing.
  const win = lines.slice(start >= 0 ? start : 0, end >= 0 ? end : lines.length)

  const rows: RawTransaction[] = []
  let dropped = 0
  let capped = false
  for (const l of win) {
    if (rows.length >= MAX_PARSED_ROWS) {
      capped = true
      break
    }
    // Drop summary/balance/payment-option noise: every such line either carries
    // the R$ prefix (transaction values never do) or a known label.
    if (!l || /R\$\s?\d/.test(l) || NOISE_LABEL.test(l)) continue
    const m = TX.exec(l)
    if (!m) continue
    const [, , dd, mm, descField, val] = m
    // Strip a trailing " DD/MM" (the original-purchase/conversion date).
    const descriptor_raw = descField!.replace(/\s+\d{2}\/\d{2}$/, '').trim()
    try {
      // parseBRLToCents rejects negative/zero by throwing — strip the sign first
      // and special-case 0,00 so an ANUIDADE-style line counts as dropped.
      const cents = parseBRLToCents(val!.replace('-', ''))
      if (cents === 0) {
        dropped += 1
        continue
      }
      rows.push({
        occurred_on: pdfDateToCivil(dd!, mm!, venc),
        amount_cents: cents,
        descriptor_raw,
        descriptor_norm: normalizeDescriptor(descriptor_raw),
        kind: val!.startsWith('-') ? 'credit' : 'expense',
        // no fitid → dedupeKey auto-uses the csv:<date>:<cents>:<norm> basis
      })
    } catch {
      dropped += 1
    }
  }
  return { rows, dropped, capped }
}
