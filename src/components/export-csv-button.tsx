'use client'

import { Download } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { meiReportToCsv, type MeiReport } from '@/lib/mei/csv'

/**
 * ExportCsvButton (UI-SPEC §4) — an outline button that serializes the consolidated
 * DASN report via meiReportToCsv (the Plan-01 serializer: BOM + `;` delimiter, pt-BR
 * money) and triggers a Blob download named `dasn-{ano}.csv`. Establishes the reusable
 * CSV-export pattern the roadmap notes Phase 6 (DATA-01) reuses. The report is the
 * RLS-scoped row already read by the caller's own page (T-05-11). Toast "Relatório
 * exportado". (MEI-04)
 */
export function ExportCsvButton({ report }: { report: MeiReport }) {
  function onExport() {
    const csv = meiReportToCsv(report)
    // text/csv with charset utf-8; the serializer prepends a UTF-8 BOM so Excel
    // pt-BR opens it correctly.
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dasn-${report.year}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success('Relatório exportado')
  }

  return (
    <Button type="button" variant="outline" onClick={onExport}>
      <Download aria-hidden />
      Exportar CSV
    </Button>
  )
}
