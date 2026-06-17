import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MeiActivityType } from '@/lib/schemas/mei'

/**
 * AtividadeBadge — the per-NF DASN activity bucket (MEI-03): "Comércio/Indústria"
 * vs "Serviços". Neutral grayscale chrome (an `outline` badge) — the activity type
 * is a classification, NOT a financial signal, so it deliberately does NOT borrow a
 * semantic money color (income/expense/destructive). The label survives grayscale.
 * (UI-SPEC §AtividadeBadge / Semantic Color)
 */
const ATIVIDADE_LABEL: Record<MeiActivityType, string> = {
  comercio_industria: 'Comércio/Indústria',
  servicos: 'Serviços',
}

export function AtividadeBadge({
  activityType,
  className,
}: {
  activityType: MeiActivityType
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn('text-muted-foreground', className)}>
      {ATIVIDADE_LABEL[activityType]}
    </Badge>
  )
}
