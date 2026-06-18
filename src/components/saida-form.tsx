'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { registerSaida } from '@/actions/reservas'
import { isValidMoney, MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BrDateField } from '@/components/br-date-field'
import { formatCents, parseBRLToCents } from '@/lib/money'

/**
 * SaidaForm (RSV-04) — register a withdrawal dialog. valor (MoneyInput), data
 * (native date input, mirroring transacao-form), descrição (optional). Validates
 * `valor ≤ saldo atual` BOTH client-side (block submit + an inline FieldError with
 * the exact saldo) AND server-side (registerSaida → the atomic RPC is authoritative).
 *
 * The ≤-saldo error is a FieldError (aria-invalid + text), never just a disabled
 * button (UI-SPEC §Accessibility). The client check is a UX fast-path; the RPC's
 * never-negative guard is the real boundary.
 */
function todayISO(): string {
  // Civil date in the user's locale; the action re-validates the yyyy-MM-dd shape.
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function SaidaForm({
  reservaId,
  saldoCents,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  reservaId: string
  /** Current view-derived saldo in cents — the client ceiling for the saída. */
  saldoCents: number
  /** Custom opener; defaults to a "Registrar saída" button. Ignored when controlled. */
  trigger?: React.ReactElement
  /** Controlled open state (omit to use the built-in trigger). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = isControlled ? controlledOpen! : uncontrolledOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (isControlled) onOpenChange?.(next)
      else setUncontrolledOpen(next)
    },
    [isControlled, onOpenChange],
  )
  const [isPending, startTransition] = useTransition()
  const [amount, setAmount] = React.useState('')
  const [occurredOn, setOccurredOn] = React.useState(todayISO())
  const [note, setNote] = React.useState('')
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  function handleOpenChange(next: boolean) {
    if (next) {
      setAmount('')
      setOccurredOn(todayISO())
      setNote('')
      setErrors({})
    }
    setOpen(next)
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!amount.trim()) next.amount = 'Informe o valor'
    else if (!isValidMoney(amount)) next.amount = 'Valor monetário inválido.'
    else {
      // Client-side ≤ saldo guard (the RPC is authoritative server-side).
      const cents = parseBRLToCents(amount)
      if (cents > saldoCents) {
        next.amount = `A saída não pode ser maior que o saldo da reserva (${formatCents(saldoCents)}).`
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) next.occurredOn = 'Data inválida'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    startTransition(async () => {
      const result = await registerSaida({
        reservaId,
        amount: amount.trim(),
        occurredOn,
        note: note.trim() || undefined,
      })
      if ('error' in result) {
        // Server is authoritative: surface the ≤-saldo rejection as a FieldError too.
        if (result.error.includes('saldo')) {
          setErrors((prev) => ({ ...prev, amount: result.error }))
        } else {
          toast.error(result.error)
        }
        return
      }
      toast.success('Saída registrada')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isControlled ? null : (
        <DialogTrigger
          render={trigger ?? <Button type="button">Registrar saída</Button>}
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar saída</DialogTitle>
          <DialogDescription>
            Saldo disponível:{' '}
            <span className="font-mono tabular-nums">{formatCents(saldoCents)}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="saida-amount">Valor</FieldLabel>
              <MoneyInput
                id="saida-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                invalid={!!errors.amount}
              />
              <FieldError
                errors={errors.amount ? [{ message: errors.amount }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.occurredOn}>
              <FieldLabel htmlFor="saida-date">Data</FieldLabel>
              <BrDateField
                id="saida-date"
                value={occurredOn}
                onChange={setOccurredOn}
                invalid={!!errors.occurredOn}
                aria-invalid={!!errors.occurredOn}
              />
              <FieldError
                errors={
                  errors.occurredOn ? [{ message: errors.occurredOn }] : undefined
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="saida-note">Descrição (opcional)</FieldLabel>
              <Input
                id="saida-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: conserto do carro"
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose
              render={<Button type="button" variant="outline">Cancelar</Button>}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Registrando…' : 'Registrar saída'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
