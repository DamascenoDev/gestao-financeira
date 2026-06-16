import { cn } from '@/lib/utils'
import { formatCents } from '@/lib/money'

/**
 * Money cell — mono, tabular-nums, right-aligned. Sign/color derive from `kind`,
 * never from a negative value (the data model stores amount_cents positive). An
 * income renders `text-income` with a leading `+`; a gasto renders neutral with a
 * leading `−` only in mixed contexts. (UI-SPEC §Money & Number Formatting)
 */
export function AmountCell({
  cents,
  kind = 'income',
  signed = true,
  className,
}: {
  cents: number | bigint
  kind?: 'income' | 'expense'
  /** Show the leading +/− sign (off for single-sign lists where it's redundant). */
  signed?: boolean
  className?: string
}) {
  const isIncome = kind === 'income'
  const sign = signed ? (isIncome ? '+' : '−') : ''
  return (
    <span
      className={cn(
        'inline-flex justify-end font-mono font-semibold tabular-nums',
        isIncome ? 'text-income' : 'text-foreground',
        className,
      )}
    >
      {sign}
      {sign ? ' ' : ''}
      {formatCents(cents)}
    </span>
  )
}
