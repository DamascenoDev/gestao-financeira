'use client'

import { Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * SuggestionSlot (UI-SPEC §Component Inventory + §Deferred-AI Seam) — the deferred-AI
 * affordance. In v1 `suggestCategory()` always returns null, so this renders a faint,
 * non-interactive "—" (`aria-hidden`) — NO phantom control. Its contract: when a
 * non-null suggestion arrives it renders a one-tap "Aplicar sugestão: {Categoria}"
 * chip (sparkles, `--primary`-tinted) that on click sets the category in client state
 * (origem `manual`, same as a hand pick — NO commit until Confirmar; merchant_patterns
 * is written only in confirmImport). The slot RESERVES its space so adding the chip later
 * does NOT reflow the Categoria column — building the slot now is the seam.
 */
export function SuggestionSlot({
  suggestion = null,
  onApply,
  className,
}: {
  /** The suggested category, or null in v1 (always null until AI ships). */
  suggestion?: { categoryId: string; name: string } | null
  onApply?: (categoryId: string) => void
  className?: string
}) {
  if (!suggestion) {
    // Reserve the vertical space (min-h) so the column does not reflow when the chip
    // appears later. Inert + aria-hidden — not a control.
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex min-h-5 items-center text-xs text-muted-foreground/50',
          className,
        )}
      >
        —
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onApply?.(suggestion.categoryId)}
      className={cn(
        'inline-flex min-h-5 w-fit items-center gap-1 rounded-4xl bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20',
        className,
      )}
    >
      <Sparkles className="size-3 shrink-0" aria-hidden />
      Aplicar sugestão: {suggestion.name}
    </button>
  )
}
