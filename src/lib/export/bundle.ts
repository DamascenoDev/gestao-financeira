// src/lib/export/bundle.ts
// DATA-02 — the LGPD "Baixar meus dados" bundle assembler. Takes the RLS-scoped
// server client (src/lib/supabase/server) and iterates the canonical OWNED_TABLES
// (06-01), doing a bare `select('*')` per table. NO `.eq('user_id', ...)` filter:
// RLS already restricts every read to the caller's rows, so "only my rows" is
// STRUCTURAL — a manual filter is exactly the leak Pattern 3 / Pitfall 3 forbids
// (a forgotten filter would leak; an absent filter can't, because the policy is the
// boundary). Iterating OWNED_TABLES (not a hand-written second list) means a table
// can never silently escape the export.
//
// The bundle is a SINGLE JSON object (06-RESEARCH A1 — no zip dependency):
//   { exportedAt, userId, tables: { <each owned table>: rows }, csv: { transactions, mei } }
// The JSON `tables` keep the machine-faithful shape (raw integer cents + raw
// category_id); the embedded CSVs are the human-readable pt-BR view. category_name
// is resolved point-in-time in the CSV by joining the already-fetched categories
// rows in-memory (Open Question #2 — the CSV carries the resolved NAME, the JSON
// keeps the raw id, lossless).

import type { SupabaseClient } from '@supabase/supabase-js'

import { OWNED_TABLES, type OwnedTable } from '@/lib/data/owned-tables'
import { applicableLimitCents } from '@/lib/mei/limit'
import { meiReportToCsv, type MeiReport } from '@/lib/mei/csv'
import { transactionsToCsv, type TransactionCsvRow } from '@/lib/transactions/csv'
import type { Database } from '@/types/database.types'

/** A generic owned-table row (machine-faithful — raw cents + raw ids). */
type Row = Record<string, unknown>

/** The single-JSON LGPD export bundle (06-RESEARCH A1). */
export interface ExportBundle {
  /** ISO-8601 timestamp the bundle was assembled. */
  exportedAt: string
  /** The owning user's id (from the session — informational, the rows are RLS-scoped). */
  userId: string
  /** One key per OWNED_TABLES entry → that table's RLS-scoped rows (raw shape). */
  tables: Record<OwnedTable, Row[]>
  /** Human-readable pt-BR CSV views (BOM + `;` + formatCents) embedded as strings. */
  csv: {
    /** Transactions CSV: resolved category name + Consumo/Alocação Tipo. */
    transactions: string
    /** Consolidated DASN-style MEI CSV: one row per year present in mei_invoices. */
    mei: string
  }
}

/** Narrow the DB category `kind` (string) to the CSV Tipo union; unknown → null. */
function toCategoryKind(kind: unknown): TransactionCsvRow['category_kind'] {
  return kind === 'consumo' || kind === 'alocacao' ? kind : null
}

/**
 * Build the transactions CSV from the already-fetched transactions + categories
 * rows. Resolves each transaction's point-in-time category name/kind by joining the
 * in-memory categories (no extra query — Open Question #2). A category-less row
 * serializes with an empty name (the serializer falls back to 'Sem categoria').
 */
function buildTransactionsCsv(transactions: Row[], categories: Row[]): string {
  const categoryById = new Map(categories.map((c) => [c.id as string, c]))
  const rows: TransactionCsvRow[] = transactions.map((t) => {
    const catId = t.category_id as string | null
    const cat = catId ? categoryById.get(catId) : undefined
    return {
      occurred_on: String(t.occurred_on ?? ''),
      description: String(t.description ?? ''),
      category_name: cat ? String(cat.name ?? '') : '',
      category_kind: toCategoryKind(cat?.kind),
      amount_cents: (t.amount_cents as number | bigint) ?? 0,
    }
  })
  return transactionsToCsv(rows)
}

/**
 * Build the consolidated MEI CSV from the already-fetched MEI rows. One DASN-style
 * row per calendar year present in mei_invoices: gross/comercio/servicos summed from
 * the invoices, applicableLimit via applicableLimitCents off mei_settings.start_date,
 * hasEmployee from mei_year_flags. Reuses the Phase-5 meiReportToCsv serializer
 * (header once + a data row per year) — does NOT rebuild the serializer. With no
 * MEI invoices it returns a header-only CSV (valid, no crash).
 */
function buildMeiCsv(
  invoices: Row[],
  settings: Row[],
  yearFlags: Row[],
): string {
  const startDate =
    (settings[0]?.mei_start_date as string | undefined) ?? undefined
  const employeeByYear = new Map(
    yearFlags.map((f) => [Number(f.year), Boolean(f.has_employee)]),
  )

  // Sum gross + the comercio/servicos split per year from the raw invoices.
  type YearAgg = { gross: bigint; comercio: bigint; servicos: bigint }
  const byYear = new Map<number, YearAgg>()
  for (const inv of invoices) {
    const year = Number(String(inv.issued_on ?? '').slice(0, 4))
    if (!Number.isFinite(year) || year === 0) continue
    const cents = BigInt((inv.amount_cents as number | bigint) ?? 0)
    const agg = byYear.get(year) ?? { gross: 0n, comercio: 0n, servicos: 0n }
    agg.gross += cents
    if (inv.activity_type === 'comercio_industria') agg.comercio += cents
    else agg.servicos += cents
    byYear.set(year, agg)
  }

  const reports: MeiReport[] = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, agg]) => ({
      year,
      grossCents: agg.gross,
      comercioCents: agg.comercio,
      servicosCents: agg.servicos,
      hasEmployee: employeeByYear.get(year) ?? false,
      applicableLimitCents: startDate ? applicableLimitCents(year, startDate) : 0,
    }))

  // meiReportToCsv emits BOM + header + one data row. Concatenate per-year rows under
  // a single header (drop the BOM + header from every report after the first).
  if (reports.length === 0) return meiReportToCsvEmpty()
  const parts = reports.map((r) => meiReportToCsv(r))
  const [head, ...rest] = parts
  // Each part is `BOM + HEADER\r\n + DATA\r\n`. Keep the first whole; from the rest,
  // strip the BOM + header line, keeping only the data row(s).
  const dataOnly = rest.map((p) => stripBomAndHeader(p))
  return head + dataOnly.join('')
}

/** A header-only MEI CSV (BOM + header + trailing CRLF) for the zero-invoice case. */
function meiReportToCsvEmpty(): string {
  // Derive the exact header by serializing then dropping the data row, so the header
  // stays a single source (meiReportToCsv) — no duplicated column list here.
  const sample = meiReportToCsv({
    year: 0,
    grossCents: 0,
    comercioCents: 0,
    servicosCents: 0,
    hasEmployee: false,
    applicableLimitCents: 0,
  })
  const bom = sample.charAt(0)
  const headerLine = sample.slice(1).split('\r\n')[0]
  return bom + headerLine + '\r\n'
}

/** Strip the leading BOM + the first (header) line from a meiReportToCsv output. */
function stripBomAndHeader(csv: string): string {
  const body = csv.charAt(0) === String.fromCharCode(0xfeff) ? csv.slice(1) : csv
  const nl = body.indexOf('\r\n')
  return nl === -1 ? '' : body.slice(nl + 2)
}

/**
 * Assemble the full LGPD export bundle from the RLS-scoped server client.
 *
 * Iterates OWNED_TABLES doing a bare `select('*')` per table (RLS = only the
 * caller's rows; NO manual user_id filter), then builds the embedded pt-BR CSVs from
 * the already-fetched rows. Returns a single JSON object the client downloads as
 * `meus-dados-{yyyy-MM-dd}.json`.
 */
export async function buildExportBundle(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ExportBundle> {
  const tables = {} as Record<OwnedTable, Row[]>
  for (const table of OWNED_TABLES) {
    // Bare select('*') — RLS restricts to the caller. A manual .eq('user_id', …)
    // is the leak Pattern 3 forbids and is intentionally absent.
    const { data, error } = await supabase.from(table).select('*')
    if (error) {
      throw new Error(`export: failed reading ${table}: ${error.message}`)
    }
    tables[table] = (data ?? []) as Row[]
  }

  return {
    exportedAt: new Date().toISOString(),
    userId,
    tables,
    csv: {
      transactions: buildTransactionsCsv(tables.transactions, tables.categories),
      mei: buildMeiCsv(tables.mei_invoices, tables.mei_settings, tables.mei_year_flags),
    },
  }
}
