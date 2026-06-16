'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  createTransaction,
  updateTransaction,
} from '@/actions/transactions'
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

export type CategoryOption = { id: string; name: string }

type TransacaoFormProps = {
  /** Non-archived categories for the categoria select. */
  categories: CategoryOption[]
  /** Default occurred_on / month context (e.g. "2026-06-15"). */
  defaultDate: string
  /** Edit mode: when set, the dialog updates this transaction instead of creating. */
  edit?: {
    id: string
    description: string
    amount: string // raw pt-BR string e.g. "1.234,56"
    categoryId: string | null
    occurredOn: string // yyyy-MM-dd
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
  const [occurredOn, setOccurredOn] = React.useState(
    edit?.occurredOn ?? defaultDate,
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const isEdit = !!edit

  function reset() {
    setDescription(edit?.description ?? '')
    setAmount(edit?.amount ?? '')
    setCategoryId(edit?.categoryId ?? '')
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

    startTransition(async () => {
      const result = isEdit
        ? await updateTransaction(edit!.id, fd)
        : await createTransaction(fd)
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
                onValueChange={(v) => setCategoryId(v ?? '')}
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
