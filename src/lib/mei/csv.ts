// src/lib/mei/csv.ts
// DASN-ready CSV serializer for the consolidated MEI yearly report. Establishes the
// export pattern the roadmap notes Phase 6 (DATA-01) reuses: a UTF-8 byte-order mark
// generated in code (String.fromCharCode(0xFEFF) — NEVER a literal invisible char in
// source) so Excel pt-BR opens it correctly, `;` as the delimiter (Excel pt-BR), and
// money via formatCents (pt-BR). Exactly the DASN fields: ano, receita bruta total,
// comércio/indústria, serviços, funcionário (Sim/Não), limite aplicável. (MEI-04)

import { formatCents } from '@/lib/money'

/** The consolidated yearly row the report screen + this CSV serializer render. */
export interface MeiReport {
  year: number
  /** GROSS receita bruta of the year (centavos). */
  grossCents: number | bigint
  /** Comércio/indústria split (centavos). */
  comercioCents: number | bigint
  /** Serviços split (centavos). */
  servicosCents: number | bigint
  /** DASN "houve empregado?" for the year. */
  hasEmployee: boolean
  /** Applicable limit for the year (centavos) — computed off mei_start_date. */
  applicableLimitCents: number | bigint
}

/** UTF-8 byte-order mark — generated in code so no invisible char lives in source. */
const BOM = String.fromCharCode(0xfeff)
const DELIMITER = ';'

const HEADER = [
  'Ano',
  'Receita bruta total',
  'Comércio/Indústria',
  'Serviços',
  'Funcionário',
  'Limite aplicável',
] as const

/**
 * Serialize a MeiReport to a DASN-ready CSV string (BOM + `;`-delimited header row +
 * one data row). All money goes through formatCents (pt-BR). A zero-revenue year still
 * emits a valid row (R$ 0,00) — the DASN is obligatory even with zero revenue.
 */
export function meiReportToCsv(report: MeiReport): string {
  const dataRow = [
    String(report.year),
    formatCents(report.grossCents),
    formatCents(report.comercioCents),
    formatCents(report.servicosCents),
    report.hasEmployee ? 'Sim' : 'Não',
    formatCents(report.applicableLimitCents),
  ]
  const lines = [HEADER.join(DELIMITER), dataRow.join(DELIMITER)]
  return BOM + lines.join('\r\n') + '\r\n'
}
