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

  // LW-03: the percentage is derived with INTEGER bigint math (basis-points of the
  // alvo) for consistency with the rest of the money path — no JS float round-trip.
  // The bar's value/max below are raw DOM widths (a CSS ratio), not money, so they
  // stay numeric. The saldo itself is always view-derived (never computed here).
  const saldo = centsToBigInt(saldoCents)
  const alvo = BigInt(alvoCents)
  const saldoNum = Number(saldo)
  // ratioBp = saldo / alvo in basis-points (10000 = 100%), clamped at 0.
  const ratioBp = saldo > 0n ? Number((saldo * 10000n) / alvo) : 0
  const reached = saldo >= alvo
  const pctLabel = pctFmt.format(ratioBp / 10000)
  const valueText = `${formatCents(saldoCents)} de ${formatCents(alvoCents)} (${pctLabel})`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Progress
        value={Math.max(saldoNum, 0)}
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
