'use client'

import * as React from 'react'
import { isValid, parse } from 'date-fns'

import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * Controlled pt-BR date field (G-06 fix). Replaces the native
 * `<input type="date">`, whose display order follows the browser/OS locale
 * (en-US → MM/DD/YYYY) and is not reliably forceable per-app. This field
 * always renders/accepts dd/mm/aaaa while keeping the stored value as an ISO
 * `yyyy-MM-dd` string, so every parent form's existing ISO state + server-side
 * `/^\d{4}-\d{2}-\d{2}$/` / `monthKeyOf` validation is untouched.
 *
 * Contract (mirrors money-input.tsx's controlled forwardRef pattern):
 * - `value`: ISO 'yyyy-MM-dd' or '' (renders as dd/mm/aaaa or empty).
 * - `onChange`: emits a valid ISO 'yyyy-MM-dd' once a COMPLETE, REAL calendar
 *   date is typed; emits '' while the entry is incomplete or impossible
 *   (e.g. 31/02/2026) so the parent's "Data inválida" path fires and a wrong
 *   date is never persisted.
 *
 * The field itself is timezone-agnostic civil-date text; any "today" default
 * (todaySP) is supplied by the parent.
 */

/** ISO 'yyyy-MM-dd' → display 'dd/mm/aaaa' (or '' for a non-ISO/empty value). */
function isoToDisplay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return ''
  const [, y, mo, d] = m
  return `${d}/${mo}/${y}`
}

/** Strip non-digits, cap at 8 (ddmmaaaa), re-insert slashes → 'dd/mm/aaaa'. */
function maskDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  const parts: string[] = []
  if (digits.length > 0) parts.push(digits.slice(0, 2))
  if (digits.length > 2) parts.push(digits.slice(2, 4))
  if (digits.length > 4) parts.push(digits.slice(4, 8))
  return parts.join('/')
}

/**
 * Display 'dd/mm/aaaa' → ISO 'yyyy-MM-dd', but ONLY when it is a complete, real
 * calendar date (rejects 31/02, 99/99/2026, incomplete entries…). Returns '' otherwise.
 */
function displayToIso(display: string): string {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return ''
  const dd = digits.slice(0, 2)
  const mm = digits.slice(2, 4)
  const yyyy = digits.slice(4, 8)
  const iso = `${yyyy}-${mm}-${dd}`
  // Parse strictly and verify the round-trip catches overflow (date-fns
  // normalizes 31/02 → 03/03, so `isValid` alone is not enough).
  const parsed = parse(iso, 'yyyy-MM-dd', new Date())
  if (!isValid(parsed)) return ''
  if (isoToDisplay(iso).replace(/\D/g, '') !== digits) return ''
  return iso
}

export const BrDateField = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
    value: string
    onChange: (iso: string) => void
    invalid?: boolean
  }
>(function BrDateField({ className, value, onChange, invalid, ...props }, ref) {
  // Local display state lets the user type an incomplete dd/mm/aaaa (which emits
  // ISO '') without the field snapping back to empty on every keystroke.
  const [display, setDisplay] = React.useState(() => isoToDisplay(value))

  // Keep the display in sync when the parent's ISO value changes externally
  // (e.g. a default/reset), without clobbering in-progress incomplete typing.
  React.useEffect(() => {
    const iso = displayToIso(display)
    if (iso !== value) {
      setDisplay(isoToDisplay(value))
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskDisplay(e.target.value)
    setDisplay(masked)
    onChange(displayToIso(masked))
  }

  return (
    <Input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      value={display}
      onChange={handleChange}
      aria-invalid={invalid}
      className={cn('tabular-nums', className)}
      {...props}
    />
  )
})
