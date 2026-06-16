'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { monthLabel } from '@/lib/month'
import { isValidMoney, MoneyInput } from '@/components/money-input'
import {
  createAdhocIncome,
  createIncomeTemplate,
  updateOccurrence,
  updateTemplate,
} from '@/actions/incomes'
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
import { Switch } from '@/components/ui/switch'

const FONTE_SUGGESTIONS = ['Salário', 'Pensão', 'Outros'] as const

/**
 * "Nova receita" dialog (UI-SPEC §1 Receitas). One form for both kinds:
 * a recorrente toggle switches between day-of-month (template → createIncomeTemplate)
 * and a date (avulsa → createAdhocIncome). Mirrors auth-form's RHF/useTransition/toast
 * pattern; money is validated client-side via isValidMoney and re-parsed server-side.
 */
export function ReceitaForm({ monthKey }: { monthKey: string }) {
  const [open, setOpen] = React.useState(false)
  const [isPending, startTransition] = useTransition()
  const [recorrente, setRecorrente] = React.useState(true)
  const [source, setSource] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [dayOfMonth, setDayOfMonth] = React.useState('5')
  const [occurredOn, setOccurredOn] = React.useState(`${monthKey}-15`)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  function reset() {
    setSource('')
    setAmount('')
    setDayOfMonth('5')
    setOccurredOn(`${monthKey}-15`)
    setErrors({})
    setRecorrente(true)
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!source.trim()) next.source = 'Informe a fonte'
    if (!amount.trim()) next.amount = 'Informe o valor'
    else if (!isValidMoney(amount)) next.amount = 'Valor monetário inválido.'
    if (recorrente) {
      const d = Number(dayOfMonth)
      if (!Number.isInteger(d) || d < 1 || d > 31) next.dayOfMonth = 'Dia inválido'
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
      next.occurredOn = 'Data inválida'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const formData = new FormData()
    formData.set('source', source.trim())
    formData.set('amount', amount)
    startTransition(async () => {
      let result
      if (recorrente) {
        formData.set('dayOfMonth', dayOfMonth)
        formData.set('monthKey', monthKey)
        result = await createIncomeTemplate(formData)
      } else {
        formData.set('occurredOn', occurredOn)
        result = await createAdhocIncome(formData)
      }
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Receita salva.')
      reset()
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button">Nova receita</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova receita</DialogTitle>
          <DialogDescription>
            Cadastre um recebimento recorrente ou avulso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!errors.source}>
              <FieldLabel htmlFor="source">Fonte</FieldLabel>
              <Input
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Salário, Pensão…"
                aria-invalid={!!errors.source}
              />
              <div className="flex flex-wrap gap-1.5">
                {FONTE_SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSource(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <FieldError
                errors={errors.source ? [{ message: errors.source }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="amount">Valor</FieldLabel>
              <MoneyInput
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                invalid={!!errors.amount}
              />
              <FieldError
                errors={errors.amount ? [{ message: errors.amount }] : undefined}
              />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="recorrente">Recorrente</FieldLabel>
              <Switch
                id="recorrente"
                checked={recorrente}
                onCheckedChange={setRecorrente}
              />
            </Field>

            {recorrente ? (
              <Field data-invalid={!!errors.dayOfMonth}>
                <FieldLabel htmlFor="dayOfMonth">Dia do mês</FieldLabel>
                <Input
                  id="dayOfMonth"
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  aria-invalid={!!errors.dayOfMonth}
                />
                <FieldError
                  errors={
                    errors.dayOfMonth ? [{ message: errors.dayOfMonth }] : undefined
                  }
                />
              </Field>
            ) : (
              <Field data-invalid={!!errors.occurredOn}>
                <FieldLabel htmlFor="occurredOn">Data</FieldLabel>
                <Input
                  id="occurredOn"
                  type="date"
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                  aria-invalid={!!errors.occurredOn}
                />
                <FieldError
                  errors={
                    errors.occurredOn ? [{ message: errors.occurredOn }] : undefined
                  }
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline">Cancelar</Button>} />
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Recurring-occurrence edit (INC-02): the explicit, never-silent choice between
 * editing only this month's occurrence vs the template (future months).
 * (UI-SPEC §1 — "Alterar só em {mês}" vs "Alterar o template").
 */
export function EditOccurrenceDialog({
  occurrenceId,
  templateId,
  monthKey,
  currentAmount,
  trigger,
}: {
  occurrenceId: string
  /** Null for an avulsa — then only the "só neste mês" path applies. */
  templateId: string | null
  monthKey: string
  /** Raw pt-BR string to prefill (already formatted upstream). */
  currentAmount: string
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [isPending, startTransition] = useTransition()
  const [amount, setAmount] = React.useState(currentAmount)
  const [error, setError] = React.useState<string | null>(null)

  function run(scope: 'occurrence' | 'template') {
    if (!amount.trim() || !isValidMoney(amount)) {
      setError('Valor monetário inválido.')
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set('amount', amount)
    startTransition(async () => {
      let result
      if (scope === 'occurrence' || !templateId) {
        result = await updateOccurrence(occurrenceId, fd)
      } else {
        // WR-04: amount-only template edit — send ONLY the amount. updateTemplate
        // preserves the template's real source + day-of-month server-side rather
        // than overwriting them with client-held props that defaulted to the
        // occurrence snapshot + day 5 (a silent data regression).
        result = await updateTemplate(templateId, fd)
      }
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        scope === 'template'
          ? 'Template atualizado (próximos meses).'
          : `Receita de ${monthLabel(monthKey)} atualizada.`,
      )
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar receita</DialogTitle>
          <DialogDescription>
            {templateId
              ? 'Escolha se a alteração vale só para este mês ou para o template.'
              : 'Altere o valor desta receita avulsa.'}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="edit-amount">Valor</FieldLabel>
            <MoneyInput
              id="edit-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={!!error}
            />
            <FieldError errors={error ? [{ message: error }] : undefined} />
          </Field>
        </FieldGroup>
        <DialogFooter className="mt-6 flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            disabled={isPending}
            onClick={() => run('occurrence')}
          >
            {`Alterar só em ${monthLabel(monthKey)}`}
          </Button>
          {templateId ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => run('template')}
            >
              Alterar o template (próximos meses)
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
