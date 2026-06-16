import { CheckCircle2 } from 'lucide-react'

import { Progress } from '@/components/ui/progress'
import { centsToBigInt, formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * ReservaProgress (RSV-05) — wraps the vendored `progress` bar. Renders ONLY when
 * `alvoCents` is set (not null); when there is no alvo it renders NOTHING (not a 0%
 * bar — UI-SPEC §3 "No alvo → no bar at all"). The caller therefore passes
 * `alvoCents: number | null` and this component owns the conditional.
 *
 * The fill is `--primary` while below the alvo and switches to `--income` at ≥100%
 * with an "Alvo atingido" badge. Exposes role="progressbar" + aria-value{now,min,max}
 * + aria-valuetext (UI-SPEC §Accessibility — the saldo/alvo ratio, never just color).
 *
 * Percentages render mono/tabular, one decimal max, pt-BR.
 */
const pctFmt = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function ReservaProgress({
  saldoCents,
  alvoCents,
  className,
}: {
  saldoCents: number | bigint
  /** Null → no alvo → the component renders nothing. */
  alvoCents: number | null
  className?: string
}) {
  if (alvoCents === null || alvoCents <= 0) return null

  // Ratio for display only — the saldo itself is always view-derived (never here).
  const saldo = Number(centsToBigInt(saldoCents))
  const ratio = saldo / alvoCents
  const reached = ratio >= 1
  const pctLabel = pctFmt.format(Math.max(ratio, 0))
  const valueText = `${formatCents(saldoCents)} de ${formatCents(alvoCents)} (${pctLabel})`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Progress
        value={Math.max(saldo, 0)}
        max={alvoCents}
        indicatorClassName={reached ? 'bg-income' : 'bg-primary'}
        aria-valuetext={valueText}
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <span className="font-mono tabular-nums">{formatCents(saldoCents)}</span>
          {' de '}
          <span className="font-mono tabular-nums">{formatCents(alvoCents)}</span>
        </span>
        {reached ? (
          <span className="inline-flex items-center gap-1 font-medium text-income">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Alvo atingido
          </span>
        ) : (
          <span className="font-mono tabular-nums text-muted-foreground">
            {pctLabel}
          </span>
        )}
      </div>
    </div>
  )
}
