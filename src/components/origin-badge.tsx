import { Brain, Pencil, Sparkles, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * OriginBadge (UI-SPEC §Component Inventory) — the classification-origin signal for
 * a review row. Origem is INFORMATION, rendered neutral/muted by default because a
 * classified row is the quiet, resolved state; only the UNCLASSIFIED state escalates
 * to the calm `--consumption` amber attention treatment (never `--destructive` red —
 * an unclassified row is a to-do, not an error). The reserved `sugerida` variant
 * (`--primary` + sparkles) is defined now but only ever rendered when a non-null AI
 * suggestion exists — always false in v1 (the deferred-AI seam).
 *
 * The text label is ALWAYS present so color is never the sole signal (a11y).
 */
export type OriginVariant = 'memória' | 'manual' | 'não classificada' | 'sugerida'

const VARIANT: Record<
  OriginVariant,
  { label: string; className: string; Icon: typeof Brain }
> = {
  memória: {
    label: 'Memória',
    className: 'bg-muted text-muted-foreground',
    Icon: Brain,
  },
  manual: {
    label: 'Manual',
    className: 'bg-muted text-muted-foreground',
    Icon: Pencil,
  },
  'não classificada': {
    label: 'Não classificada',
    className: 'bg-consumption/10 text-consumption',
    Icon: TriangleAlert,
  },
  sugerida: {
    label: 'Sugerida',
    className: 'bg-primary/10 text-primary',
    Icon: Sparkles,
  },
}

export function OriginBadge({
  variant,
  className,
}: {
  variant: OriginVariant
  className?: string
}) {
  const { label, className: variantClass, Icon } = VARIANT[variant]
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit items-center gap-1 rounded-4xl px-2 py-0.5 text-xs font-medium',
        variantClass,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
    </span>
  )
}
