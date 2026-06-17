'use client'

import { Upload } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * UploadDropzone (UI-SPEC §1) — a --card/dashed-border drag area (min-h-48) backed
 * by a REAL labeled <input type="file" accept=".ofx,.csv"> (keyboard + screen-reader
 * reachable; drag is a visual enhancement, not the only path). Client-side validates
 * extension + size and surfaces an inline text-destructive error BEFORE any upload.
 * Emits the chosen File to the parent (which runs the signed-URL upload).
 *
 * Accent (teal --primary) is reserved for the "Selecionar arquivo" CTA and the
 * drag-over ring/fill. Destructive (red) is for genuine failures only (wrong type /
 * too large) — never the unclassified attention signal.
 */

const ACCEPTED_EXTS = ['ofx', 'csv'] as const
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024 // 4.5MB (the function-body limit ceiling)

function fileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

function formatLimit(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb % 1 === 0 ? mb : mb.toFixed(1).replace('.', ',')} MB`
}

export function UploadDropzone({
  onFileChosen,
  maxBytes = DEFAULT_MAX_BYTES,
  disabled = false,
}: {
  /** Called with a validated File once the user picks or drops one. */
  onFileChosen: (file: File) => void
  /** Max accepted size in bytes (default 4.5MB). */
  maxBytes?: number
  disabled?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const limit = formatLimit(maxBytes)

  const validateAndEmit = React.useCallback(
    (file: File) => {
      const ext = fileExt(file.name)
      if (!ACCEPTED_EXTS.includes(ext as (typeof ACCEPTED_EXTS)[number])) {
        setError('Formato não suportado. Envie um arquivo OFX ou CSV.')
        return
      }
      if (file.size > maxBytes) {
        setError(`Arquivo muito grande. O limite é ${limit}.`)
        return
      }
      setError(null)
      onFileChosen(file)
    },
    [maxBytes, limit, onFileChosen],
  )

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndEmit(file)
    // Reset so re-choosing the same file fires onChange again.
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files?.[0]
    if (file) validateAndEmit(file)
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'bg-card flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center transition-colors',
          dragging
            ? 'border-primary ring-primary bg-primary/5 ring-2'
            : 'border-border',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        <Upload className="text-muted-foreground size-8" aria-hidden />
        <div className="space-y-1">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Selecionar arquivo
          </Button>
          <p className="text-muted-foreground text-xs">
            ou arraste aqui · OFX (recomendado) ou CSV · até {limit}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.csv"
          className="sr-only"
          aria-label="Selecionar arquivo OFX ou CSV"
          disabled={disabled}
          onChange={handleInputChange}
        />
      </div>
      {error ? (
        <p className="text-destructive mt-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
