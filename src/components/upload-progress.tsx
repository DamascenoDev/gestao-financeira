'use client'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/**
 * UploadProgress (UI-SPEC §1) — wraps the vendored progress bar (h-2) + a mono % +
 * filename + a status line that transitions "Enviando…" → "Processando…". The parse
 * phase is indeterminate (no byte progress) so it shows a loader-2 spin. The status
 * is announced via aria-live="polite"; the bar exposes role="progressbar". On error,
 * a "Tentar outro arquivo" retry returns to the dropzone.
 */

export type UploadPhase = 'enviando' | 'processando' | 'erro'

const PHASE_LABEL: Record<UploadPhase, string> = {
  enviando: 'Enviando…',
  processando: 'Processando…',
  erro: 'Não foi possível ler este arquivo. Verifique se é um extrato OFX, CSV ou PDF válido e tente de novo.',
}

export function UploadProgress({
  filename,
  phase,
  percent,
  onRetry,
  message,
}: {
  filename: string
  phase: UploadPhase
  /** 0–100 for the upload phase; ignored (indeterminate) for processando. */
  percent: number
  /** Retry handler for the error state (resets to the dropzone). */
  onRetry?: () => void
  /**
   * Server-provided error message for the `erro` phase (e.g. the image-only PDF
   * steering). When present it overrides the generic default so the specific,
   * actionable reason reaches the user instead of being masked.
   */
  message?: string
}) {
  const indeterminate = phase === 'processando'
  const isError = phase === 'erro'

  return (
    <div className="bg-card space-y-3 rounded-lg border p-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm truncate" title={filename}>
          {filename}
        </span>
        {!isError ? (
          <span className="text-muted-foreground font-mono text-sm tabular-nums">
            {indeterminate ? '' : `${Math.round(percent)}%`}
          </span>
        ) : null}
      </div>

      {!isError ? (
        <Progress
          value={indeterminate ? 100 : percent}
          className={cn(indeterminate && 'animate-pulse')}
        />
      ) : null}

      <div
        className={cn(
          'flex items-center gap-2 text-sm',
          isError ? 'text-destructive' : 'text-muted-foreground',
        )}
        aria-live="polite"
      >
        {indeterminate ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        <span>{isError && message ? message : PHASE_LABEL[phase]}</span>
      </div>

      {isError && onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          Tentar outro arquivo
        </Button>
      ) : null}
    </div>
  )
}
