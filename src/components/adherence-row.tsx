import { CheckCircle2, OctagonAlert, TriangleAlert } from 'lucide-react'

import { AdherenceBar } from '@/components/adherence-bar'
import { AmountCell } from '@/components/amount-cell'
import { CategoryBadge } from '@/components/category-badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  adherenceStatus,
  adherenceTokens,
  formatBpAsPercent,
  type Direction,
} from '@/lib/adherence'
import { centsToBigInt } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * One per-category (or combined-alocação) adherence line for the dashboard. Carries
 * everything the row + bar need, decoupled from the view's raw column names so the
 * dashboard RSC maps both v_adherence_month and v_adherence_ytd rows into the same
 * shape (BUD-03 consistency). `adherenceBp` null = sem receita no período.
 */
export type AdherenceRowData = {
  key: string
  categoryName: string
  color: string | null
  kind: 'consumo' | 'alocacao'
  direction: Direction
  /** meta in basis-points of net income (3000 = 30%). */
  percentBp: number
  /** realized cents in the period. */
  realizedCents: number | bigint
  /** realized ÷ meta in basis-points of the meta (10000 = exactly the meta); null = sem receita. */
  adherenceBp: number | null
  /** The combined alocação line (Investimentos + Reserva) shows the aporte helper. */
  isCombinedAlocacao?: boolean
}

// 80% / 100% alert thresholds in basis-points of the meta (BUD-04).
const BP_80 = 8000
const BP_100 = 10000

/**
 * AdherenceRow (UI-SPEC §1) — CategoryBadge · AdherenceBar · realized R$ · realized %
 * (status color) · meta % (muted) · status label + glyph. Percentages mono,
 * tabular-nums, one decimal. The 80%/100% alert affordance (BUD-04) is the inline
 * glyph + label: triangle-alert ≥80, octagon-alert for teto ≥100, check for alvo ≥100.
 * A null adherence_bp renders the "sem receita no período" copy, never NaN%. The
 * combined alocação line carries a "Inclui aportes de reserva." tooltip (RSV-03).
 */
export function AdherenceRow({ data }: { data: AdherenceRowData }) {
  const {
    categoryName,
    color,
    kind,
    direction,
    percentBp,
    realizedCents,
    adherenceBp,
    isCombinedAlocacao,
  } = data

  const status = adherenceStatus(adherenceBp, direction)
  const { text, label } = adherenceTokens(status)
  const semReceita = adherenceBp === null

  // BUD-04 alert glyph: warn at ≥80; terminal at ≥100 (octagon for an over-teto, check
  // for an alvo atingido).
  let Glyph: typeof TriangleAlert | null = null
  if (!semReceita && adherenceBp !== null) {
    if (direction === 'teto') {
      if (adherenceBp >= BP_100) Glyph = OctagonAlert
      else if (adherenceBp >= BP_80) Glyph = TriangleAlert
    } else {
      if (adherenceBp >= BP_100) Glyph = CheckCircle2
      else if (adherenceBp >= BP_80) Glyph = TriangleAlert
    }
  }

  return (
    <div className="flex flex-col gap-2 py-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-center md:gap-4">
      {/* Category + (optional) aporte helper. */}
      <div className="flex min-w-0 items-center gap-2">
        <CategoryBadge name={categoryName} color={color} kind={kind} />
        {isCombinedAlocacao ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-muted-foreground cursor-help text-xs underline decoration-dotted">
                  aportes
                </span>
              }
            />
            <TooltipContent>Inclui aportes de reserva.</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Bar. */}
      <AdherenceBar
        adherenceBp={adherenceBp}
        direction={direction}
        categoryName={categoryName}
        percentBp={percentBp}
      />

      {/* Numbers + status. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 md:justify-end">
        {semReceita ? (
          <span className="text-muted-foreground text-xs">
            sem receita no período
          </span>
        ) : (
          <>
            <AmountCell cents={centsToBigInt(realizedCents)} kind="expense" signed={false} />
            <span className={cn('font-mono text-sm font-semibold tabular-nums', text)}>
              {formatBpAsPercent(adherenceBp)}
            </span>
          </>
        )}
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          meta {formatBpAsPercent(percentBp)}
        </span>
        <span className={cn('inline-flex items-center gap-1 text-xs font-medium', text)}>
          {Glyph ? <Glyph className="size-3.5" aria-hidden /> : null}
          {label}
        </span>
      </div>
    </div>
  )
}
