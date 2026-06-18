'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import {
  createSignedStatementUpload,
  ingestStatement,
  saveCsvProfile,
} from '@/actions/import'
import { CsvColumnMapper } from '@/components/csv-column-mapper'
import { UploadDropzone } from '@/components/upload-dropzone'
import { UploadProgress, type UploadPhase } from '@/components/upload-progress'
import { parseCsvRaw, readCsvHeaders } from '@/lib/parsers/csv'
import type { CsvMapping } from '@/lib/schemas/import'
import { createClient } from '@/lib/supabase/client'

/**
 * ImportUploader (UI-SPEC §1) — orchestrates the upload lifecycle ('use client'):
 *   pick file → createSignedStatementUpload(filename, ext) → uploadToSignedUrl
 *   (direct browser→Storage) → ingestStatement(path) → branch on the result.
 *
 * Branches: alreadyImported / novas===0 → toast "0 novas" + route to the review
 * (duplicate empty-state); needsMapping (CSV) → open the CsvColumnMapper; otherwise
 * router.push('/importar/' + statementId). Parse-failure → the error block + retry.
 */

function fileExt(name: string): 'ofx' | 'csv' | 'pdf' | null {
  const dot = name.lastIndexOf('.')
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
  if (ext === 'ofx' || ext === 'csv' || ext === 'pdf') return ext
  return null
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'busy'; phase: UploadPhase; filename: string; percent: number; message?: string }

type MapperState = {
  open: boolean
  headers: string[]
  sample: Record<string, string>[]
  path: string
  filename: string
}

export function ImportUploader() {
  const router = useRouter()
  const [stage, setStage] = React.useState<Stage>({ kind: 'idle' })
  const [mapper, setMapper] = React.useState<MapperState | null>(null)
  const [savingProfile, setSavingProfile] = React.useState(false)

  const setError = React.useCallback((filename: string, message?: string) => {
    setStage({ kind: 'busy', phase: 'erro', filename, percent: 0, message })
  }, [])

  const routeToReview = React.useCallback(
    (statementId: string) => {
      router.push(`/importar/${statementId}`)
    },
    [router],
  )

  const handleIngestResult = React.useCallback(
    (
      result: Awaited<ReturnType<typeof ingestStatement>>,
      filename: string,
      path: string,
    ) => {
      if ('error' in result) {
        setError(filename, result.error)
        return
      }
      if ('needsMapping' in result) {
        // The server returns headers; the rich sample is read client-side from the
        // File (already done before calling ingest — see onFileChosen).
        setStage({ kind: 'idle' })
        setMapper((m) =>
          m
            ? { ...m, open: true, headers: result.headers, path, filename }
            : {
                open: true,
                headers: result.headers,
                sample: [],
                path,
                filename,
              },
        )
        return
      }
      // Remaining union: a statement-bearing result (alreadyImported or a normal parse).
      const isZeroNovas =
        ('alreadyImported' in result && result.alreadyImported === true) ||
        result.summary.total === 0 ||
        result.summary.novas === 0
      if (isZeroNovas) {
        toast.message('Este arquivo já foi importado — 0 novas transações.')
      }
      routeToReview(result.statementId)
    },
    [setError, routeToReview],
  )

  const onFileChosen = React.useCallback(
    async (file: File) => {
      const ext = fileExt(file.name)
      if (!ext) {
        setError(file.name)
        return
      }

      // Pre-read CSV headers + sample client-side so the mapper has a rich preview
      // without a second server round-trip.
      let csvHeaders: string[] = []
      let csvSample: Record<string, string>[] = []
      if (ext === 'csv') {
        const text = await file.text()
        csvHeaders = readCsvHeaders(text)
        csvSample = parseCsvRaw(text).slice(0, 5)
      }

      setStage({ kind: 'busy', phase: 'enviando', filename: file.name, percent: 0 })

      const signed = await createSignedStatementUpload(file.name, ext)
      if ('error' in signed) {
        setError(file.name)
        toast.error(signed.error)
        return
      }

      const supabase = createClient()
      const up = await supabase.storage
        .from('statements')
        .uploadToSignedUrl(signed.path, signed.token, file)
      if (up.error) {
        setError(file.name)
        return
      }

      setStage({
        kind: 'busy',
        phase: 'processando',
        filename: file.name,
        percent: 100,
      })

      // Seed the mapper sample (used only if the server says needsMapping).
      if (ext === 'csv') {
        setMapper({
          open: false,
          headers: csvHeaders,
          sample: csvSample,
          path: signed.path,
          filename: file.name,
        })
      }

      const result = await ingestStatement(signed.path, file.name)
      handleIngestResult(result, file.name, signed.path)
    },
    [setError, handleIngestResult],
  )

  const onMapperConfirm = React.useCallback(
    async (mapping: CsvMapping, save: { name: string } | null) => {
      if (!mapper) return
      setSavingProfile(true)
      try {
        if (save) {
          await saveCsvProfile(mapper.headers, mapping, save.name)
        }
        setStage({
          kind: 'busy',
          phase: 'processando',
          filename: mapper.filename,
          percent: 100,
        })
        const result = await ingestStatement(mapper.path, mapper.filename, mapping)
        setMapper((m) => (m ? { ...m, open: false } : m))
        handleIngestResult(result, mapper.filename, mapper.path)
      } finally {
        setSavingProfile(false)
      }
    },
    [mapper, handleIngestResult],
  )

  return (
    <div>
      {stage.kind === 'idle' ? (
        <UploadDropzone onFileChosen={onFileChosen} />
      ) : (
        <UploadProgress
          filename={stage.filename}
          phase={stage.phase}
          percent={stage.percent}
          message={stage.message}
          onRetry={() => {
            setStage({ kind: 'idle' })
            setMapper(null)
          }}
        />
      )}

      {mapper ? (
        <CsvColumnMapper
          open={mapper.open}
          onOpenChange={(open) => {
            setMapper((m) => (m ? { ...m, open } : m))
            if (!open) setStage({ kind: 'idle' })
          }}
          headers={mapper.headers}
          sample={mapper.sample}
          saving={savingProfile}
          onConfirm={onMapperConfirm}
        />
      ) : null}
    </div>
  )
}
