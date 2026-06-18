'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { createMeiInvoice, updateMeiInvoice } from '@/actions/mei'
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
import { meiInvoiceSchema, type MeiActivityType } from '@/lib/schemas/mei'

/** The activity-type options (DASN split, MEI-03) — copy from the UI-SPEC. */
const ATIVIDADE_OPTIONS: { value: MeiActivityType; label: string }[] = [
  { value: 'comercio_industria', label: 'Comércio/Indústria' },
  { value: 'servicos', label: 'Serviços' },
]

type NfFormProps = {
  /** Default issued_on (today in SP, "yyyy-MM-dd") for the create dialog. */
  defaultDate: string
  /** Edit mode: when set, the dialog updates this NF instead of creating. */
  edit?: {
    id: string
    issuedOn: string // yyyy-MM-dd
    amount: string // raw pt-BR string e.g. "1.234,56"
    tomador: string
    descricao: string
    activityType: MeiActivityType
  }
  /** Optional controlled-open (so a row menu can drive the edit dialog). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Custom trigger (omitted when controlled). */
  trigger?: React.ReactElement
}

/**
 * "Registrar NF" / edit dialog (UI-SPEC §2). Fields: data (issued_on), valor
 * (MoneyInput, the GROSS billed value), tomador, descrição, atividade
 * (Comércio/Indústria ↔ Serviços — per NF, since a MEI can have mixed revenue).
 * Mirrors transacao-form's manual-state + useTransition + toast pattern; money is
 * validated client-side via isValidMoney and re-parsed server-side. Routes to
 * createMeiInvoice (MEI-01) or updateMeiInvoice (ownership re-derived server-side,
 * T-05-05). Success toast "Nota fiscal salva". (MEI-01/MEI-03)
 */
export function NfForm({
  defaultDate,
  edit,
  open: controlledOpen,
  onOpenChange,
  trigger,
}: NfFormProps) {
  const isControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v)
    else setUncontrolledOpen(v)
  }

  const [isPending, startTransition] = useTransition()
  const [issuedOn, setIssuedOn] = React.useState(edit?.issuedOn ?? defaultDate)
  const [amount, setAmount] = React.useState(edit?.amount ?? '')
  const [tomador, setTomador] = React.useState(edit?.tomador ?? '')
  const [descricao, setDescricao] = React.useState(edit?.descricao ?? '')
  const [activityType, setActivityType] = React.useState<MeiActivityType>(
    edit?.activityType ?? 'servicos',
  )
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const isEdit = !!edit

  function reset() {
    setIssuedOn(edit?.issuedOn ?? defaultDate)
    setAmount(edit?.amount ?? '')
    setTomador(edit?.tomador ?? '')
    setDescricao(edit?.descricao ?? '')
    setActivityType(edit?.activityType ?? 'servicos')
    setErrors({})
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    const parsed = meiInvoiceSchema.safeParse({
      issuedOn,
      amount,
      tomador,
      descricao: descricao || undefined,
      activityType,
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
    fd.set('issuedOn', issuedOn)
    fd.set('amount', amount)
    fd.set('tomador', tomador)
    fd.set('descricao', descricao)
    fd.set('activityType', activityType)

    startTransition(async () => {
      const result = isEdit
        ? await updateMeiInvoice(edit!.id, fd)
        : await createMeiInvoice(fd)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Nota fiscal salva')
      setOpen(false)
      if (!isEdit) reset()
    })
  }

  const defaultTrigger = (
    <Button type="button" size="sm">
      Registrar NF
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isControlled ? null : (
        <DialogTrigger render={trigger ?? defaultTrigger} />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar nota fiscal' : 'Registrar NF'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize a data, o valor, o tomador, a descrição ou a atividade.'
              : 'Registre uma nota fiscal emitida para acompanhar seu faturamento.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!errors.issuedOn}>
              <FieldLabel htmlFor="nf-date">Data</FieldLabel>
              <Input
                id="nf-date"
                type="date"
                value={issuedOn}
                onChange={(e) => setIssuedOn(e.target.value)}
                aria-invalid={!!errors.issuedOn}
              />
              <FieldError
                errors={errors.issuedOn ? [{ message: errors.issuedOn }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="nf-amount">Valor</FieldLabel>
              <MoneyInput
                id="nf-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                invalid={!!errors.amount}
              />
              <FieldError
                errors={errors.amount ? [{ message: errors.amount }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.tomador}>
              <FieldLabel htmlFor="nf-tomador">Tomador</FieldLabel>
              <Input
                id="nf-tomador"
                value={tomador}
                onChange={(e) => setTomador(e.target.value)}
                placeholder="Para quem você emitiu a NF"
                maxLength={120}
                aria-invalid={!!errors.tomador}
              />
              <FieldError
                errors={errors.tomador ? [{ message: errors.tomador }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.descricao}>
              <FieldLabel htmlFor="nf-desc">Descrição</FieldLabel>
              <Input
                id="nf-desc"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Serviço de consultoria"
                maxLength={240}
                aria-invalid={!!errors.descricao}
              />
              <FieldError
                errors={errors.descricao ? [{ message: errors.descricao }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.activityType}>
              <FieldLabel htmlFor="nf-activity">Tipo de atividade</FieldLabel>
              <Select
                items={
                  Object.fromEntries(
                    ATIVIDADE_OPTIONS.map((o) => [o.value, o.label]),
                  ) as Record<string, string>
                }
                value={activityType}
                onValueChange={(v) => {
                  if (v) setActivityType(v as MeiActivityType)
                }}
              >
                <SelectTrigger id="nf-activity" className="w-full">
                  <SelectValue placeholder="Selecione o tipo de atividade" />
                </SelectTrigger>
                <SelectContent>
                  {ATIVIDADE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError
                errors={
                  errors.activityType ? [{ message: errors.activityType }] : undefined
                }
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
              {isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
