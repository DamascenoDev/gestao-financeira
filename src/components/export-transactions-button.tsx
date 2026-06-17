'use client'

import { Download } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  transactionsToCsv,
  type TransactionCsvRow,
} from '@/lib/transactions/csv'

/**
 * ExportTransactionsButton (DATA-01, UI-SPEC §"Component Inventory") — reuses the
 * Phase-5 `ExportCsvButton` shape EXACTLY (outline `Button`, `Download` glyph, Blob
 * download, sonner toast), parameterized for transactions. It serializes the rows the
 * caller's RLS-scoped RSC already returned — it NEVER fetches data itself, so no
 * cross-user row and no server secret can reach this path (T-06-07). Money is never
 * computed here: `transactionsToCsv` owns all pt-BR formatting (BOM + `;` + formatCents)
 * and the `field()` escaper neutralizes any odd description (T-06-08).
 *
 * On an empty period it still exports a valid header-only CSV — it does not crash or hide.
 */
export function ExportTransactionsButton({
  rows,
  mes,
}: {
  /** The current `?mes` window's RLS-scoped rows, already resolved for CSV. */
  rows: readonly TransactionCsvRow[]
  /** The 'yyyy-MM' month key, used for the file name `transacoes-{mes}.csv`. */
  mes: string
}) {
  function onExport() {
    const csv = transactionsToCsv(rows)
    // text/csv with charset utf-8; the serializer prepends a UTF-8 BOM so Excel
    // pt-BR opens it correctly.
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transacoes-${mes}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('Transações exportadas.')
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onExport}
      aria-label="Exportar transações em CSV"
    >
      <Download aria-hidden />
      Exportar transações (CSV)
    </Button>
  )
}
