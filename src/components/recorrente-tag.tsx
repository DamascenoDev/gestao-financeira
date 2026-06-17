import { Repeat } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * RecorrenteTag (UI-SPEC §Component Inventory) — a small `--consumption`-tinted
 * badge shown inline in the Descritor cell when the recurrence heuristic
 * (v_recurring_descriptors, ≥3 distinct months) flags the row's merchant. A
 * subscription is a kind of consumption signal, so it shares the amber tint. The
 * "Recorrente" text label + repeat glyph + tooltip make it informational, not an
 * action (color is never the sole signal — a11y).
 */
export function RecorrenteTag({ className }: { className?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                'inline-flex h-5 w-fit items-center gap-1 rounded-4xl bg-consumption/10 px-2 py-0.5 text-xs font-medium text-consumption',
                className,
              )}
            >
              <Repeat className="size-3 shrink-0" aria-hidden />
              Recorrente
            </span>
          }
        />
        <TooltipContent>Aparece em vários meses.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
