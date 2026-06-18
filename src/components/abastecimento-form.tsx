'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  createAbastecimento,
  updateAbastecimento,
} from '@/actions/abastecimentos'
import { isValidMoney, MoneyInput } from '@/components/money-input'
import {
  TransacaoPicker,
  type TransacaoOption,
} from '@/components/transacao-picker'
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BrDateField } from '@/components/br-date-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseBRLToCents } from '@/lib/money'
import {
  abastecimentoSchema,
  type AbastecimentoInput,
} from '@/lib/schemas/abastecimento'
import {
  COMBUSTIVEL_OPTIONS,
  type Combustivel,
} from '@/lib/schemas/carro'
import { todaySP } from '@/lib/month'

/** The cost-source segmented toggle: a linked fatura lançamento OR a manual value. */
type CostSource = 'fatura' | 'manual'

export type AbastecimentoEdit = {
  id: string
  occurredOn: string // yyyy-MM-dd
  odometroKm: string
  litros: string
  tanqueCheio: boolean
  combustivel: string
  /** When the abastecimento was linked to a lançamento (Da fatura path). */
  transactionId: string
  /** The editable pt-BR string for a manual cost (empty when linked). */
  amount: string
}

/**
 * AbastecimentoForm (CAR-03) — create/edit dialog cloning carro-form's manual-state +
 * useTransition + sonner pattern. Records a fuel-up on a carro: data (default
 * todaySP()), odômetro (int>0), litros (a VOLUME — a plain decimal input, NEVER a
 * MoneyInput), tanque-cheio (Switch, default ON), and combustível (Select, default =
 * the carro's combustivel_padrao when present).
 *
 * The cost source is an EXCLUSIVE pair driven by a segmented toggle ("Da fatura" |
 * "Manual"): "Da fatura" renders the TransacaoPicker (transactionId), "Manual" renders
 * a MoneyInput (amountCents). Switching the toggle clears the OTHER source so the
 * submitted input always carries exactly one — the schema XOR + DB CHECK (10-02/10-01)
 * are the authoritative guards; the UI never submits both (T-10-08).
 *
 * Re-seeds from server truth on open (no useEffect). EXPORTED and self-contained:
 * defaults to a gold "Novo abastecimento" trigger; a controlled open + `edit` drives
 * the per-row edit affordance in the history.
 */
export function AbastecimentoForm({
  carroId,
  combustivelPadrao,
  transacoes,
  edit,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  /** The carro this abastecimento belongs to. */
  carroId: string
  /** The carro's default fuel (pre-selects combustível when present). */
  combustivelPadrao?: string | null
  /** The user's recent UNLINKED expenses, for the "Da fatura" picker. */
  transacoes: TransacaoOption[]
  /** Edit mode: when set, the dialog updates this abastecimento instead of creating. */
  edit?: AbastecimentoEdit
  /** Custom opener; defaults to a "Novo abastecimento" button. Ignored when controlled. */
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

  const initialSource: CostSource = edit?.transactionId ? 'fatura' : 'manual'
  const [data, setData] = React.useState(edit?.occurredOn ?? todaySP())
  const [odometro, setOdometro] = React.useState(edit?.odometroKm ?? '')
  const [litros, setLitros] = React.useState(edit?.litros ?? '')
  const [tanqueCheio, setTanqueCheio] = React.useState(edit?.tanqueCheio ?? true)
  const [combustivel, setCombustivel] = React.useState(
    edit?.combustivel ?? combustivelPadrao ?? '',
  )
  const [source, setSource] = React.useState<CostSource>(initialSource)
  const [transactionId, setTransactionId] = React.useState(edit?.transactionId ?? '')
  const [amount, setAmount] = React.useState(edit?.amount ?? '')
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  // Re-seed from server truth each time the dialog opens (no useEffect — the
  // carro-form / reserva-form pattern).
  function handleOpenChange(next: boolean) {
    if (next) {
      setData(edit?.occurredOn ?? todaySP())
      setOdometro(edit?.odometroKm ?? '')
      setLitros(edit?.litros ?? '')
      setTanqueCheio(edit?.tanqueCheio ?? true)
      setCombustivel(edit?.combustivel ?? combustivelPadrao ?? '')
      setSource(edit?.transactionId ? 'fatura' : 'manual')
      setTransactionId(edit?.transactionId ?? '')
      setAmount(edit?.amount ?? '')
      setErrors({})
    }
    setOpen(next)
  }

  // Switching the cost source clears the inactive source so submit carries exactly
  // one (T-10-08). The schema XOR is the authoritative guard; this keeps the UI honest.
  function onSourceChange(next: CostSource) {
    setSource(next)
    if (next === 'fatura') setAmount('')
    else setTransactionId('')
  }

  /** Build the AbastecimentoInput from the controlled fields (cost source XOR). */
  function buildInput(): AbastecimentoInput {
    const litrosNum = Number(litros.replace(',', '.'))
    const odometroNum = Number(odometro)
    return {
      carroId,
      occurredOn: data,
      // NaN flows through to a friendly schema error rather than coercing to 0.
      odometroKm: Number.isFinite(odometroNum) ? odometroNum : NaN,
      litros: Number.isFinite(litrosNum) ? litrosNum : NaN,
      tanqueCheio,
      combustivel: (combustivel || undefined) as Combustivel | undefined,
      // Exactly one cost source is present (the toggle clears the other).
      transactionId:
        source === 'fatura' && transactionId ? transactionId : undefined,
      amountCents:
        source === 'manual' && amount.trim() && isValidMoney(amount)
          ? parseBRLToCents(amount)
          : undefined,
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Manual path: surface an invalid-money error before the schema sees `undefined`.
    if (source === 'manual' && amount.trim() && !isValidMoney(amount)) {
      setErrors({ amountCents: 'Valor monetário inválido.' })
      return
    }
    const parsed = abastecimentoSchema.safeParse(buildInput())
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'odometroKm')
        next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    startTransition(async () => {
      const result = edit
        ? await updateAbastecimento(edit.id, parsed.data)
        : await createAbastecimento(parsed.data)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(edit ? 'Abastecimento atualizado' : 'Abastecimento adicionado')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isControlled ? null : (
        <DialogTrigger
          render={trigger ?? <Button type="button">Novo abastecimento</Button>}
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {edit ? 'Editar abastecimento' : 'Novo abastecimento'}
          </DialogTitle>
          <DialogDescription>
            Registre o abastecimento e escolha a fonte do custo: um lançamento da
            fatura ou um valor manual.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!errors.occurredOn}>
              <FieldLabel htmlFor="ab-data">Data</FieldLabel>
              <BrDateField
                id="ab-data"
                value={data}
                onChange={setData}
                invalid={!!errors.occurredOn}
                aria-invalid={!!errors.occurredOn}
              />
              <FieldError
                errors={errors.occurredOn ? [{ message: errors.occurredOn }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.odometroKm}>
              <FieldLabel htmlFor="ab-odometro">Odômetro (km)</FieldLabel>
              <Input
                id="ab-odometro"
                inputMode="numeric"
                value={odometro}
                onChange={(e) => setOdometro(e.target.value)}
                placeholder="45000"
                aria-invalid={!!errors.odometroKm}
              />
              <FieldError
                errors={errors.odometroKm ? [{ message: errors.odometroKm }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.litros}>
              <FieldLabel htmlFor="ab-litros">Litros</FieldLabel>
              <Input
                id="ab-litros"
                inputMode="decimal"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                placeholder="38,5"
                aria-invalid={!!errors.litros}
              />
              <FieldDescription>Volume abastecido (não é dinheiro).</FieldDescription>
              <FieldError
                errors={errors.litros ? [{ message: errors.litros }] : undefined}
              />
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="ab-tanque"
                checked={tanqueCheio}
                onCheckedChange={(checked) => setTanqueCheio(checked)}
              />
              <FieldLabel htmlFor="ab-tanque">Tanque cheio</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="ab-combustivel">Combustível</FieldLabel>
              <Select
                value={combustivel}
                onValueChange={(v) => setCombustivel(v ?? '')}
              >
                <SelectTrigger id="ab-combustivel" className="w-full">
                  <SelectValue placeholder="Selecione o combustível" />
                </SelectTrigger>
                <SelectContent>
                  {COMBUSTIVEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field data-invalid={!!errors.amountCents}>
              <FieldLabel>Custo</FieldLabel>
              <Tabs
                value={source}
                onValueChange={(v) => onSourceChange(v as CostSource)}
              >
                <TabsList>
                  <TabsTrigger value="fatura">Da fatura</TabsTrigger>
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                </TabsList>
              </Tabs>

              {source === 'fatura' ? (
                <TransacaoPicker
                  transacoes={transacoes}
                  value={transactionId}
                  onChange={setTransactionId}
                  error={errors.amountCents}
                />
              ) : (
                <>
                  <MoneyInput
                    id="ab-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    invalid={!!errors.amountCents}
                  />
                  <FieldError
                    errors={
                      errors.amountCents ? [{ message: errors.amountCents }] : undefined
                    }
                  />
                </>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose
              render={<Button type="button" variant="outline">Cancelar</Button>}
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
