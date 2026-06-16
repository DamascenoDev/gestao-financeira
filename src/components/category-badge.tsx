import { cn } from '@/lib/utils'
import type { CategoryColor, CategoryKind } from '@/lib/schemas/category'

/**
 * CategoryBadge — a swatch dot (mapped from the swatch key to a mid-chroma OKLCH
 * color) + the category name, with an optional kind variant badge (Consumo amber /
 * Alocação indigo). Self-contained so the Extrato slice (02-04) can import it for
 * the Categoria column. (UI-SPEC §tokens — fixed 8-swatch palette, no free hex.)
 */

/**
 * The 8 fixed swatches as mid-chroma OKLCH (≈ L 0.6 / C 0.12), tuned to read on
 * both card and table surfaces in light and dark. Keyed by the swatch key stored
 * on the category (CATEGORY_COLORS).
 */
export const SWATCH_OKLCH: Record<CategoryColor, string> = {
  slate: 'oklch(0.6 0.04 250)',
  red: 'oklch(0.62 0.18 25)',
  amber: 'oklch(0.7 0.13 70)',
  green: 'oklch(0.62 0.13 150)',
  teal: 'oklch(0.62 0.1 195)',
  blue: 'oklch(0.6 0.14 250)',
  violet: 'oklch(0.58 0.16 295)',
  pink: 'oklch(0.65 0.16 350)',
}

/** A small color dot for a category's swatch (falls back to a neutral ring). */
export function CategoryDot({
  color,
  className,
}: {
  color?: string | null
  className?: string
}) {
  const oklch =
    color && color in SWATCH_OKLCH
      ? SWATCH_OKLCH[color as CategoryColor]
      : undefined
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        oklch ? '' : 'border border-border',
        className,
      )}
      style={oklch ? { backgroundColor: oklch } : undefined}
    />
  )
}

/** The kind badge (text label so color is never the sole signal — a11y). */
export function KindBadge({ kind }: { kind: CategoryKind }) {
  const isAllocation = kind === 'alocacao'
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit items-center rounded-4xl px-2 py-0.5 text-xs font-medium',
        isAllocation
          ? 'bg-allocation/10 text-allocation'
          : 'bg-consumption/10 text-consumption',
      )}
    >
      {isAllocation ? 'Alocação' : 'Consumo'}
    </span>
  )
}

export function CategoryBadge({
  name,
  color,
  kind,
  className,
}: {
  name: string
  color?: string | null
  /** When provided, renders the consumo/alocação kind badge alongside the name. */
  kind?: CategoryKind
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <CategoryDot color={color} />
      <span className="truncate">{name}</span>
      {kind ? <KindBadge kind={kind} /> : null}
    </span>
  )
}
