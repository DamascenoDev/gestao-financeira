'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  createTransactionWithReserva,
  updateTransaction,
} from '@/actions/transactions'
import { CarroPicker, type CarroOption } from '@/components/carro-picker'
import { isValidMoney, MoneyInput } from '@/components/money-input'
import { ReservaPicker, type ReservaOption } from '@/components/reserva-picker'
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { transactionSchema } from '@/lib/schemas/transaction'

export type CategoryOption = {
  id: string
  name: string
  /** RSV-02: when true, choosing this category reveals the "Qual reserva?" picker. */
  isReserva?: boolean
}

type TransacaoFormProps = {
  /** Non-archived categories for the categoria select (enriched with is_reserva). */
  categories: CategoryOption[]
  /** The user's reservas — feeds the conditional ReservaPicker (RSV-02). */
  reservas?: ReservaOption[]
  /** CAR-02: the user's non-archived carros — feeds the optional Carro selector. */
  carros?: CarroOption[]
  /** Default occurred_on / month context (e.g. "2026-06-15"). */
  defaultDate: string
  /** Edit mode: when set, the dialog updates this transaction instead of creating. */
  edit?: {
    id: string
    description: string
    amount: string // raw pt-BR string e.g. "1.234,56"
    categoryId: string | null
    occurredOn: string // yyyy-MM-dd
    /** CAR-02: the currently-linked carro (null = untagged). */
    carroId: string | null
  }
  /** Optional controlled-open (so a row menu can drive the edit dialog). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Custom trigger (omitted when controlled). */
  trigger?: React.ReactElement
}

/**
 * "Novo lançamento" / edit dialog (UI-SPEC §3). Fields: data, descrição, valor
 * (MoneyInput), categoria (select of non-archived categories). Mirrors
 * receita-form's manual-state + useTransition + toast pattern; money is validated
 * client-side via isValidMoney and re-parsed server-side. Routes to
 * createTransaction (TXN-01) or updateTransaction (TXN-02).
 */
export function TransacaoForm({
  categories,
  reservas = [],
  carros = [],
  defaultDate,
  edit,
  open: controlledOpen,
  onOpenChange,
  trigger,
}: TransacaoFormProps) {
  const isControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v)
    else setUncontrolledOpen(v)
  }

  const [isPending, startTransition] = useTransition()
  const [description, setDescription] = React.useState(edit?.description ?? '')
  const [amount, setAmount] = React.useState(edit?.amount ?? '')
  const [categoryId, setCategoryId] = React.useState(edit?.categoryId ?? '')
  const [reservaId, setReservaId] = React.useState('')
  // CAR-02: optional carro tag, free of category ('' = none/cleared).
  const [carroId, setCarroId] = React.useState(edit?.carroId ?? '')
  const [occurredOn, setOccurredOn] = React.useState(
    edit?.occurredOn ?? defaultDate,
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const isEdit = !!edit

  // RSV-02: the chosen category reveals the "Qual reserva?" picker only when its
  // is_reserva FLAG is set (the same flag the server keys off — never the name).
  const isReservaCategory =
    categories.find((c) => c.id === categoryId)?.isReserva ?? false

  function reset() {
    setDescription(edit?.description ?? '')
    setAmount(edit?.amount ?? '')
    setCategoryId(edit?.categoryId ?? '')
    setReservaId('')
    setCarroId(edit?.carroId ?? '')
    setOccurredOn(edit?.occurredOn ?? defaultDate)
    setErrors({})
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    const parsed = transactionSchema.safeParse({
      description,
      amount,
      categoryId,
      occurredOn,
    })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !next[key]) next[key] = issue.message
      }
    }
    if (amount && !isValidMoney(amount)) {
      next.amount = 'Valor monetário inválido.'
    }
    // RSV-02: a Reserva category requires a chosen reserva before submit (the
    // server re-checks ownership; this blocks the obvious empty case up front).
    if (isReservaCategory && !reservaId) {
      next.reservaId = 'Selecione uma reserva.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const fd = new FormData()
    fd.set('description', description)
    fd.set('amount', amount)
    fd.set('categoryId', categoryId)
    fd.set('occurredOn', occurredOn)
    if (isReservaCategory && reservaId) fd.set('reservaId', reservaId)
    // CAR-02: always send the carro tag (empty string clears — Plan-01 decode);
    // free of category, never gated on the Reserva sub-flow.
    fd.set('carroId', carroId)

    startTransition(async () => {
      // Both paths route through actions that sync the reserva ledger: edit via
      // updateTransaction (delete-old + maybe-re-link), create via
      // createTransactionWithReserva (txn + linked 'in' for a Reserva category;
      // identical to createTransaction for a non-Reserva one).
      const result = isEdit
        ? await updateTransaction(edit!.id, fd)
        : await createTransactionWithReserva(fd)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(isEdit ? 'Transação atualizada' : 'Lançamento adicionado')
      setOpen(false)
      if (!isEdit) reset()
    })
  }

  const defaultTrigger = (
    <Button type="button" size="sm">
      Novo lançamento
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isControlled ? null : (
        <DialogTrigger render={trigger ?? defaultTrigger} />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize a data, a descrição, o valor ou a categoria.'
              : 'Lance um gasto manual no seu extrato.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!errors.occurredOn}>
              <FieldLabel htmlFor="tx-date">Data</FieldLabel>
              <Input
                id="tx-date"
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                aria-invalid={!!errors.occurredOn}
              />
              <FieldError
                errors={errors.occurredOn ? [{ message: errors.occurredOn }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="tx-desc">Descrição</FieldLabel>
              <Input
                id="tx-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Mercado, farmácia, combustível"
                maxLength={200}
                aria-invalid={!!errors.description}
              />
              <FieldError
                errors={errors.description ? [{ message: errors.description }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="tx-amount">Valor</FieldLabel>
              <MoneyInput
                id="tx-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                invalid={!!errors.amount}
              />
              <FieldError
                errors={errors.amount ? [{ message: errors.amount }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.categoryId}>
              <FieldLabel htmlFor="tx-category">Categoria</FieldLabel>
              <Select
                value={categoryId || null}
                onValueChange={(v) => {
                  const next = v ?? ''
                  setCategoryId(next)
                  // Drop the chosen reserva when leaving a Reserva category so a
                  // stale reservaId can't ride along on a non-Reserva submit.
                  const nextIsReserva =
                    categories.find((c) => c.id === next)?.isReserva ?? false
                  if (!nextIsReserva) setReservaId('')
                }}
              >
                <SelectTrigger id="tx-category" className="w-full">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError
                errors={errors.categoryId ? [{ message: errors.categoryId }] : undefined}
              />
            </Field>

            {/* RSV-02: progressive disclosure — the "Qual reserva?" picker appears
                INSIDE this same dialog when the chosen category is_reserva. */}
            {isReservaCategory ? (
              <ReservaPicker
                id="tx-reserva"
                reservas={reservas}
                value={reservaId}
                onChange={setReservaId}
                error={errors.reservaId}
              />
            ) : null}

            {/* CAR-02: the optional "Carro" selector — UNCONDITIONAL and free of
                category (not coupled to the Reserva sub-flow). "Nenhum" clears it. */}
            <CarroPicker
              id="tx-carro"
              carros={carros}
              value={carroId}
              onChange={setCarroId}
            />
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              }
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando…' : isEdit ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
