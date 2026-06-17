import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'
import { meiStatusTokens } from '@/lib/mei/presentation'
import type { MeiStatus } from '@/lib/mei/status'

/**
 * LimiteGauge — the MEI gross-vs-applicable-limit gauge, reusing the AdherenceBar
 * pattern verbatim: an `h-2` `bg-muted` track + a tiered fill (the token from
 * meiStatusTokens, per the UI-SPEC Semantic Color table) whose width clamps visually
 * at 100% though the % label may read >100%, an 80% threshold tick, and a 100% limite
 * marker. The applicable limit is always PASSED IN (computed upstream from the view /
 * limit.ts) — this component holds NO fiscal literal. Exposes role="progressbar" +
 * aria-value*(min 0, max = limite cents) + aria-valuetext. (UI-SPEC §LimiteGauge)
 */
export function LimiteGauge({
  grossCents,
  limitCents,
  ratioBp,
  status,
  className,
}: {
  grossCents: number
  /** The COMPUTED applicable limit in cents (aria-valuemax); never a hardcoded teto. */
  limitCents: number
  /** gross ÷ applicable limit in basis points (10000 = 100%); may exceed 10000. */
  ratioBp: number | null
  status: MeiStatus
  className?: string
}) {
  const { fill, label } = meiStatusTokens(status)

  // The fill width clamps to [0, 100]% of the track; the % LABEL (rendered by the
  // page) reads the true ratio and may exceed 100%.
  const ratioPct = ratioBp === null ? 0 : Math.min(Math.max(ratioBp / 100, 0), 100)
  const percentText =
    ratioBp === null
      ? '—'
      : new Intl.NumberFormat('pt-BR', {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(ratioBp / 10000)

  const valueText = `Receita bruta ${formatCents(grossCents)} de ${formatCents(
    limitCents,
  )} — ${percentText} do limite, ${label.toLowerCase()}`

  return (
    <div
      role="progressbar"
      aria-valuenow={grossCents}
      aria-valuemin={0}
      aria-valuemax={limitCents}
      aria-valuetext={valueText}
      className={cn(
        'bg-muted relative h-2 w-full overflow-hidden rounded-full',
        className,
      )}
    >
      <div
        data-slot="limite-fill"
        className={cn('h-full rounded-full transition-all', fill)}
        style={{ width: `${ratioPct}%` }}
      />
      {/* 80% threshold tick — where the âmbar alert begins. */}
      <span
        aria-hidden
        data-slot="threshold-tick"
        className="bg-foreground/40 absolute inset-y-0 w-px"
        style={{ left: '80%' }}
      />
      {/* 100% limite marker — the right edge of the clamped track (the applicable limit). */}
      <span
        aria-hidden
        data-slot="limite-marker"
        className="bg-foreground/70 absolute inset-y-0 right-0 w-1 rounded-full"
      />
    </div>
  )
}
