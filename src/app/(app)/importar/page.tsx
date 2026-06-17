import { ImportUploader } from '@/components/import-uploader'

/**
 * Importar fatura (UI-SPEC §1) — the upload screen shell (RSC). h1 + helper + the
 * client ImportUploader, which mints a {user_id}/ signed upload URL, uploads the
 * file DIRECT to the private statements bucket, then calls ingestStatement(path) to
 * parse → dedup → memory-classify and route to the review screen (Plan 03). The
 * global MonthSelector is NOT the driver here — an import spans the statement's own
 * date range.
 */
export default function ImportarPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-2">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Importar fatura</h1>
        <p className="text-muted-foreground text-sm">
          Suba o OFX ou CSV do seu banco. Vamos extrair, deduplicar e pré-classificar
          pela memória.
        </p>
      </header>
      <ImportUploader />
    </div>
  )
}
