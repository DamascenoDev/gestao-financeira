import { cn } from '@/lib/utils'

/**
 * Minimal Radix-free progress bar (UI-SPEC §Component Inventory: reserva alvo bar,
 * `h-2`). Vendored as source — no new runtime dependency (Phase-3 threat model: no
 * external npm packages). Exposes role="progressbar" + aria-value{now,min,max} for
 * accessibility (UI-SPEC §Accessibility). The fill class is caller-controlled so the
 * reserva bar can switch to `bg-income` at ≥100% per the spec.
 */
function Progress({
  value = 0,
  max = 100,
  indicatorClassName,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  value?: number
  max?: number
  indicatorClassName?: string
}) {
  const clamped = Math.min(Math.max(value, 0), max)
  const pct = max > 0 ? (clamped / max) * 100 : 0

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('bg-muted relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn('bg-primary h-full transition-all', indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
