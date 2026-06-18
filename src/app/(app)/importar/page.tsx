import { ImportUploader } from '@/components/import-uploader'

/**
 * Runtime pin (D-08, Plan 13-03). PDF parsing (pdf-parse v2 / pdf.js) needs Node
 * APIs and MUST NOT run on Edge — Edge is forbidden, not a fallback (T-13-10). The
 * spike measured parse at 24–182 ms for a 4-page / ~330 KB Santander statement, so
 * the ingest stays a SYNCHRONOUS server action (no Route Handler — its performance
 * premise was disproved). maxDuration is a generous safety margin that also bounds
 * a hostile PDF's parse time (T-13-09). This satisfies the Node-runtime + maxDuration
 * letter of the CLAUDE.md-locked guidance without the unjustified Route-Handler churn.
 */
export const runtime = 'nodejs' // pdf-parse needs Node APIs — never Edge
export const maxDuration = 30 // generous margin; measured parse is <0.2s

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
          Suba o OFX, CSV ou PDF do seu banco. Vamos extrair, deduplicar e
          pré-classificar pela memória.
        </p>
      </header>
      <ImportUploader />
    </div>
  )
}
