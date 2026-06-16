import { cn } from '@/lib/utils'
import {
  adherenceStatus,
  adherenceTokens,
  formatBpAsPercent,
  type Direction,
} from '@/lib/adherence'

/**
 * AdherenceBar — a custom direction-aware progress bar (NOT shadcn `progress`;
 * UI-SPEC Charting Decision). An `h-2` track (`bg-muted`) + a direction-aware fill
 * whose width clamps visually at 100% (but the % label may read >100%) + a
 * meta-marker tick at the meta% position (always at the 100%-of-meta line, i.e. the
 * right edge of the clamped track — the visual "meta" reference). The fill token comes
 * from lib/adherence.ts's status→token map (teto: amber/destructive; alvo:
 * muted/allocation/income). Color is never the sole signal — the AdherenceRow pairs it
 * with a text label + glyph. Exposes role="progressbar" + aria-value* + aria-valuetext.
 * (UI-SPEC §Accessibility, §Semantic Color)
 */
export function AdherenceBar({
  adherenceBp,
  direction,
  categoryName,
  percentBp,
  className,
}: {
  /** realized ÷ meta in basis-points of the meta (10000 = exactly the meta); null = sem receita. */
  adherenceBp: number | null
  direction: Direction
  /** Category name for the accessible label. */
  categoryName: string
  /** The meta itself in basis-points of net income (3000 = 30%), for aria-valuetext. */
  percentBp: number
  className?: string
}) {
  const status = adherenceStatus(adherenceBp, direction)
  const { fill } = adherenceTokens(status)

  // Width is clamped to 100% of the track; the % LABEL (rendered by the row) can read
  // >100%. A null bp (sem receita) shows an empty track.
  const ratioPct =
    adherenceBp === null ? 0 : Math.min(Math.max(adherenceBp / 100, 0), 100)

  const realizedLabel = formatBpAsPercent(adherenceBp)
  const metaLabel = formatBpAsPercent(percentBp)
  const verb =
    direction === 'teto' ? 'em relação ao teto de' : 'em relação ao alvo de'
  const valueText =
    adherenceBp === null
      ? `${categoryName}: sem receita no período`
      : `${categoryName}: ${realizedLabel} ${verb} ${metaLabel}`

  return (
    <div
      role="progressbar"
      aria-valuenow={adherenceBp === null ? undefined : Math.round(ratioPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
      className={cn(
        'bg-muted relative h-2 w-full overflow-hidden rounded-full',
        className,
      )}
    >
      <div
        data-slot="adherence-fill"
        className={cn('h-full rounded-full transition-all', fill)}
        style={{ width: `${ratioPct}%` }}
      />
      {/* meta-marker tick at the 100%-of-meta line (the right edge of the clamped
          track). A 4px-wide foreground tick so the user sees where "a meta" sits even
          when the fill overruns it. Hidden when there is no receita to compare. */}
      {adherenceBp !== null ? (
        <span
          aria-hidden
          data-slot="meta-marker"
          className="bg-foreground/70 absolute inset-y-0 right-0 w-1 rounded-full"
        />
      ) : null}
    </div>
  )
}
