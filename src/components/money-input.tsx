'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { parseBRLToCents } from '@/lib/money'

/**
 * R$-affixed text input. Stores the RAW pt-BR string (e.g. "1.234,56"); the
 * money helper parses it to centavos at submit (the form/action calls
 * parseBRLToCents, which throws → "Valor monetário inválido."). This component
 * only renders the affix + validity styling; it never formats or rounds.
 * (UI-SPEC §MoneyInput)
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input> & { invalid?: boolean }
>(function MoneyInput({ className, invalid, ...props }, ref) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center font-mono text-sm text-muted-foreground"
      >
        R$
      </span>
      <Input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid}
        className={cn('pl-9 text-right font-mono tabular-nums', className)}
        {...props}
      />
    </div>
  )
})

/** Returns true if `raw` parses to a valid centavos value (no throw). */
export function isValidMoney(raw: string): boolean {
  try {
    parseBRLToCents(raw)
    return true
  } catch {
    return false
  }
}
