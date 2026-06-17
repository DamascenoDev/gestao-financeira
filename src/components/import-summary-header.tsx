'use client'

import { TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * ImportSummaryHeader (UI-SPEC §Component Inventory + §Dedup) — the single source of
 * dedup truth above the review grid. Renders the counts:
 *   "{N} transações · {M} novas · {K} não classificadas · {J} duplicadas ignoradas".
 * Counts are mono `tabular-nums`. The "{K} não classificadas" uses `text-consumption`
 * + `triangle-alert` when K>0 and is a REAL click-to-filter button ("Ver não
 * classificadas"). "{J} duplicadas ignoradas" is muted (duplicates being ignored is
 * the system working, not an error). On a pure re-upload (M===0) the header swaps to
 * the explicit "0 novas — este arquivo já foi importado." success line so the "0
 * novas" acceptance criterion is literally visible.
 *
 * N may step up to the 20px mono hero (UI-SPEC allowed exception — the loudest number
 * on the screen).
 */
export interface ImportSummary {
  /** N — total parsed rows. */
  total: number
  /** M — genuinely new (not already in transactions by dedupe_key). */
  novas: number
  /** K — unclassified (category null). */
  naoClassificadas: number
  /** J — pre-marked duplicates (dedupe_key already present). */
  duplicadas: number
}

export function ImportSummaryHeader({
  summary,
  onFilterUnclassified,
  className,
}: {
  summary: ImportSummary
  /** Click-to-filter the grid to the memory-miss rows (the user's to-do). */
  onFilterUnclassified?: () => void
  className?: string
}) {
  const { total, novas, naoClassificadas: k, duplicadas } = summary

  // Re-upload zero-state: nothing new in this file.
  if (novas === 0 && total > 0 && duplicadas === total) {
    return (
      <div
        className={cn('flex flex-wrap items-baseline gap-x-2 text-sm', className)}
      >
        <span className="font-mono text-xl font-semibold tabular-nums">0</span>
        <span className="text-muted-foreground">
          novas — este arquivo já foi importado.
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm',
        className,
      )}
    >
      <span>
        <span className="font-mono text-xl font-semibold tabular-nums">
          {total}
        </span>{' '}
        transações
      </span>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <span>
        <span className="font-mono font-semibold tabular-nums">{novas}</span> novas
      </span>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      {k > 0 ? (
        <button
          type="button"
          onClick={onFilterUnclassified}
          className="inline-flex items-center gap-1 text-consumption hover:underline"
          aria-label={`Ver ${k} não classificadas`}
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          <span className="font-mono font-semibold tabular-nums">{k}</span> não
          classificadas
        </button>
      ) : (
        <span>
          <span className="font-mono font-semibold tabular-nums">0</span> não
          classificadas
        </span>
      )}
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <span className="text-muted-foreground">
        <span className="font-mono font-semibold tabular-nums">{duplicadas}</span>{' '}
        duplicadas ignoradas
      </span>
    </div>
  )
}
