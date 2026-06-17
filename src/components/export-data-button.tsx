'use client'

import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { exportMyData } from '@/actions/export-data'
import { Button } from '@/components/ui/button'

/**
 * ExportDataButton (UI-SPEC §1 / DATA-02) — the full LGPD "Baixar meus dados" bundle
 * download. An outline `Button` (`Download` glyph). On click: shows a disabled
 * "Preparando…" state, calls the `exportMyData` Server Action (which assembles the
 * bundle server-side via the RLS client — the secret never touches the client), then
 * downloads the returned JSON as `meus-dados-{yyyy-MM-dd}.json`. On success a sonner
 * toast; on failure an inline `text-destructive` message + a sonner error.
 *
 * Imports ONLY the action — never admin.ts. The assembly is server-side; this
 * component just triggers the download Blob (mirrors ExportCsvButton's shape).
 */
export function ExportDataButton() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function onExport() {
    setBusy(true)
    setFailed(false)
    try {
      const result = await exportMyData()
      if (!result.ok) {
        setFailed(true)
        toast.error('Não foi possível exportar seus dados. Tente novamente.')
        return
      }
      const json = JSON.stringify(result.bundle, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const today = new Date().toISOString().slice(0, 10) // yyyy-MM-dd
      const a = document.createElement('a')
      a.href = url
      a.download = `meus-dados-${today}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success('Seus dados foram exportados.')
    } catch {
      setFailed(true)
      toast.error('Não foi possível exportar seus dados. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={onExport}
        aria-label="Baixar meus dados"
      >
        <Download aria-hidden />
        {busy ? 'Preparando…' : 'Baixar meus dados'}
      </Button>
      {failed ? (
        <p className="text-xs text-destructive">
          Não foi possível exportar seus dados. Tente novamente.
        </p>
      ) : null}
    </div>
  )
}
