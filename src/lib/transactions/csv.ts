// src/lib/transactions/csv.ts
// DATA-01 transaction CSV serializer. Mirrors src/lib/mei/csv.ts EXACTLY: a UTF-8
// byte-order mark generated in code (String.fromCharCode(0xFEFF) — NEVER a literal
// invisible char in source) so Excel pt-BR opens it correctly, `;` as the delimiter
// (Excel pt-BR), CRLF line endings, and money ONLY through formatCents (pt-BR comma
// decimals). A `field()` escaper quotes any value containing `;`, `"`, CR or LF and
// doubles inner quotes (RFC-4180) so an odd/malicious description can never break
// the column layout.
//
// Open Question #2: the CSV carries the resolved point-in-time category NAME (human
// readable). The raw category_id stays in the JSON bundle (06-03) — two
// representations, one source.

import { formatCents } from '@/lib/money'

/** A single RLS-scoped transaction row, already resolved for human-readable CSV. */
export interface TransactionCsvRow {
  /** 'YYYY-MM-DD' civil date (rendered dd/MM/yyyy). */
  occurred_on: string
  description: string
  /** Resolved point-in-time category name; '' falls back to 'Sem categoria'. */
  category_name: string
  /** Category kind → Tipo column. null serializes an empty Tipo field. */
  category_kind: 'consumo' | 'alocacao' | null
  /** Integer centavos. Rendered via formatCents (pt-BR). */
  amount_cents: number | bigint
}

/** UTF-8 byte-order mark — generated in code so no invisible char lives in source. */
const BOM = String.fromCharCode(0xfeff)
const DELIMITER = ';'

const HEADER = ['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor'] as const

/** Escape a field for `;`-delimited CSV (quote if it contains ; " CR or LF; double inner "). */
function field(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Render a 'YYYY-MM-DD' civil date as dd/MM/yyyy (string-only; no Date/TZ involved). */
function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate
  const [, year, month, day] = match
  return `${day}/${month}/${year}`
}

/** Map a category kind to the pt-BR Tipo label. */
function tipo(kind: TransactionCsvRow['category_kind']): string {
  if (kind === 'consumo') return 'Consumo'
  if (kind === 'alocacao') return 'Alocação'
  return ''
}

/**
 * Serialize RLS-scoped transaction rows to a pt-BR CSV string (BOM + `;`-delimited
 * header row + one data row per transaction, CRLF line endings + a trailing CRLF).
 * Columns: Data (dd/MM/yyyy) · Descrição · Categoria (or 'Sem categoria') · Tipo
 * (Consumo/Alocação) · Valor (formatCents). Money goes ONLY through formatCents; the
 * sign is semantic (transactions are positive) so no negative number is emitted.
 */
export function transactionsToCsv(rows: readonly TransactionCsvRow[]): string {
  const lines = [HEADER.join(DELIMITER)]
  for (const r of rows) {
    lines.push(
      [
        field(formatDate(r.occurred_on)),
        field(r.description),
        field(r.category_name || 'Sem categoria'),
        field(tipo(r.category_kind)),
        formatCents(r.amount_cents), // 'R$ 1.234,56' — pt-BR comma decimal
      ].join(DELIMITER),
    )
  }
  return BOM + lines.join('\r\n') + '\r\n'
}
