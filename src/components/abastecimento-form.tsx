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
import { formatCents, parseBRLToCents } from '@/lib/money'
import {
  abastecimentoSchema,
  type AbastecimentoInput,
} from '@/lib/schemas/abastecimento'
import {
  COMBUSTIVEL_OPTIONS,
  type Combustivel,
} from '@/lib/schemas/carro'
import { todaySP } from '@/lib/month'

/**
 * The cost-source segmented toggle, now spanning THREE states (D-04): a linked
 * fatura lançamento, a manual à-vista value, OR a parcelado (valor total + nº de
 * parcelas). Switching always clears the inactive sources (onSourceChange) so the
 * submitted input carries exactly one — mirrors the relaxed `abastecimentos_cost_xor`
 * CHECK (0039) and the 3-state superRefine (27-01).
 */
type CostSource = 'fatura' | 'manual' | 'parcelado'

/** Parcela-count bounds (D-07) — mirror the abastecimentoSchema [2, 24] / 0039. */
const PARCELAS_MIN = 2
const PARCELAS_MAX = 24

/**
 * Parse the nº-de-parcelas string into a valid integer in [2, 24], or null when
 * blank/non-integer/out-of-range. The schema (27-01) is the authoritative guard;
 * this keeps buildInput emitting `parcelasTotal` only for a plausible value and
 * gates the display-only preview.
 */
function parseParcelas(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n < PARCELAS_MIN || n > PARCELAS_MAX) return null
  return n
}

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
  /**
   * CR-01: the parcelado total as a pt-BR string (empty unless the row is parcelado).
   * When present alongside `parcelas` >= 2, the form re-enters the 'parcelado' state
   * on open so editing a parcelado fuel-up no longer silently downgrades it to à-vista
   * manual (data loss).
   */
  valorTotal?: string
  /** CR-01: installment count as a string (empty unless the row is parcelado). */
  parcelas?: string
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
  manualOnly = false,
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
  /**
   * Manual-only mode (D-01/D-02): hides the "Da fatura" tab and starts the cost
   * source at 'manual'. The `/carros` list reuses the form this way so the page
   * never has to fetch `transacoes` for unlinked lançamentos (vincular fatura is
   * Phase 28). The `/carros/[id]` detail omits this prop → all 3 tabs intact.
   */
  manualOnly?: boolean
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

  // CR-01: a parcelado edit (valor total + >= 2 parcelas) re-enters 'parcelado' so the
  // round-trip preserves the parcelamento. Manual-only never derives 'fatura' (that
  // tab/branch does not render); otherwise a fatura-linked row opens on "Da fatura".
  function deriveInitialSource(): CostSource {
    if (edit?.parcelas && parseParcelas(edit.parcelas) !== null) return 'parcelado'
    if (!manualOnly && edit?.transactionId) return 'fatura'
    return 'manual'
  }
  const initialSource: CostSource = deriveInitialSource()
  // WR-02: in manual-only mode the "Da fatura" tab/branch never renders, so a
  // fatura-linked `edit` must NOT seed transactionId — otherwise the form would open
  // on the Manual tab with an empty amount AND a hidden transactionId, and buildInput
  // (which emits transactionId only when source === 'fatura') would submit NEITHER
  // cost source, tripping the schema XOR with no editable field to fix it. Dropping
  // the linked id forces the user to (re-)enter a manual value, which is the only
  // coherent outcome for a manual-only edit of a previously-linked row.
  function seededTransactionId(): string {
    if (manualOnly) return ''
    return edit?.transactionId ?? ''
  }
  const [data, setData] = React.useState(edit?.occurredOn ?? todaySP())
  const [odometro, setOdometro] = React.useState(edit?.odometroKm ?? '')
  const [litros, setLitros] = React.useState(edit?.litros ?? '')
  const [tanqueCheio, setTanqueCheio] = React.useState(edit?.tanqueCheio ?? true)
  const [combustivel, setCombustivel] = React.useState(
    edit?.combustivel ?? combustivelPadrao ?? '',
  )
  const [source, setSource] = React.useState<CostSource>(initialSource)
  const [transactionId, setTransactionId] = React.useState(seededTransactionId())
  const [amount, setAmount] = React.useState(edit?.amount ?? '')
  // Parcelado fields (D-06): valor total as a pt-BR string (MoneyInput) + nº de
  // parcelas as a string (integer Input). CR-01: seed from `edit` so editing a
  // parcelado row re-enters the parcelado state instead of losing the parcelamento.
  const [valorTotal, setValorTotal] = React.useState(edit?.valorTotal ?? '')
  const [parcelas, setParcelas] = React.useState(edit?.parcelas ?? '')
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
      // CR-01: re-derive the source (now including 'parcelado') and seed the parcelado
      // fields from `edit` so a parcelado row opens back in the parcelado state.
      setSource(deriveInitialSource())
      setTransactionId(seededTransactionId())
      setAmount(edit?.amount ?? '')
      setValorTotal(edit?.valorTotal ?? '')
      setParcelas(edit?.parcelas ?? '')
      setErrors({})
    }
    setOpen(next)
  }

  // Switching the cost source clears every inactive source so submit carries exactly
  // one of the THREE states (D-05, T-10-08). The schema's 3-state superRefine is the
  // authoritative guard; this keeps the UI honest. Entering 'parcelado' clears both
  // à-vista sources (transactionId AND amount); leaving it clears the parcelado
  // fields (valor total + nº de parcelas).
  function onSourceChange(next: CostSource) {
    setSource(next)
    // WR-03: clear errors on a tab switch so a cost error raised on one source never
    // lingers (visibly or via a hidden control) after moving to another source.
    setErrors({})
    if (next === 'parcelado') {
      setTransactionId('')
      setAmount('')
    } else {
      setValorTotal('')
      setParcelas('')
      if (next === 'fatura') setAmount('')
      else setTransactionId('')
    }
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
      // Exactly one cost source is present (the toggle clears the others). À-vista
      // states emit valorTotalCents/parcelasTotal undefined (preserves the 27-01 XOR);
      // the parcelado state emits transactionId/amountCents undefined.
      transactionId:
        source === 'fatura' && transactionId ? transactionId : undefined,
      amountCents:
        source === 'manual' && amount.trim() && isValidMoney(amount)
          ? parseBRLToCents(amount)
          : undefined,
      valorTotalCents:
        source === 'parcelado' && valorTotal.trim() && isValidMoney(valorTotal)
          ? parseBRLToCents(valorTotal)
          : undefined,
      parcelasTotal:
        source === 'parcelado' ? (parseParcelas(parcelas) ?? undefined) : undefined,
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Manual path: surface an invalid-money error before the schema sees `undefined`.
    if (source === 'manual' && amount.trim() && !isValidMoney(amount)) {
      setErrors({ amountCents: 'Valor monetário inválido.' })
      return
    }
    // Parcelado path: surface an invalid valor-total error before the schema sees
    // `undefined` (mirrors the manual guard above).
    if (source === 'parcelado' && valorTotal.trim() && !isValidMoney(valorTotal)) {
      setErrors({ valorTotalCents: 'Valor total inválido.' })
      return
    }
    const parsed = abastecimentoSchema.safeParse(buildInput())
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        // IN-02: a path-less issue (e.g. a future top-level superRefine) is filed
        // under the neutral '_form' sentinel — never mislabeled onto a real field
        // (the WR-03 neutral-path pattern). Rendered once at form level below.
        const key = issue.path.length > 0 ? String(issue.path[0]) : '_form'
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

  // Display-only "valor por parcela" preview (D-08): valor_total ÷ N via formatCents.
  // Renders ONLY when the valor total is valid money AND nº de parcelas is an integer
  // in [2, 24] — otherwise null so it disappears with invalid/empty input. NEVER
  // enters buildInput and is NEVER persisted. Integer-cents division keeps the
  // money invariant; the result is truncated (não há fração de centavo no preview).
  const parcelasNum = parseParcelas(parcelas)
  const valorPorParcela =
    source === 'parcelado' && valorTotal.trim() && isValidMoney(valorTotal) && parcelasNum
      ? formatCents(Math.floor(parseBRLToCents(valorTotal) / parcelasNum))
      : null

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
          {/* IN-02: form-level catch-all for any path-less schema issue, surfaced
              once here rather than mislabeled under an unrelated field. */}
          <FieldError
            errors={errors._form ? [{ message: errors._form }] : undefined}
          />
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

            <Field data-invalid={!!errors.cost}>
              <FieldLabel>Custo</FieldLabel>
              <Tabs
                value={source}
                onValueChange={(v) => onSourceChange(v as CostSource)}
              >
                <TabsList>
                  {manualOnly ? null : (
                    <TabsTrigger value="fatura">Da fatura</TabsTrigger>
                  )}
                  <TabsTrigger value="manual">Manual</TabsTrigger>
                  <TabsTrigger value="parcelado">Parcelado</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* WR-03: the source-neutral cost-source XOR error (path 'cost') renders
                  ONCE here, below the Tabs, so it is never bound to a single control
                  (e.g. the fatura picker) nor left stale on a hidden control. */}
              <FieldError
                errors={errors.cost ? [{ message: errors.cost }] : undefined}
              />

              {!manualOnly && source === 'fatura' ? (
                <TransacaoPicker
                  transacoes={transacoes}
                  value={transactionId}
                  onChange={setTransactionId}
                  error={undefined}
                />
              ) : source === 'manual' ? (
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
              ) : (
                <FieldGroup>
                  <Field data-invalid={!!errors.valorTotalCents}>
                    <FieldLabel htmlFor="ab-valor-total">Valor total</FieldLabel>
                    <MoneyInput
                      id="ab-valor-total"
                      value={valorTotal}
                      onChange={(e) => setValorTotal(e.target.value)}
                      placeholder="0,00"
                      invalid={!!errors.valorTotalCents}
                    />
                    <FieldError
                      errors={
                        errors.valorTotalCents
                          ? [{ message: errors.valorTotalCents }]
                          : undefined
                      }
                    />
                  </Field>

                  <Field data-invalid={!!errors.parcelasTotal}>
                    <FieldLabel htmlFor="ab-parcelas">Número de parcelas</FieldLabel>
                    <Input
                      id="ab-parcelas"
                      inputMode="numeric"
                      value={parcelas}
                      onChange={(e) => setParcelas(e.target.value)}
                      placeholder="6"
                      aria-invalid={!!errors.parcelasTotal}
                    />
                    <FieldError
                      errors={
                        errors.parcelasTotal
                          ? [{ message: errors.parcelasTotal }]
                          : undefined
                      }
                    />
                  </Field>

                  {valorPorParcela !== null ? (
                    <FieldDescription>
                      Valor por parcela: {valorPorParcela}
                    </FieldDescription>
                  ) : null}
                </FieldGroup>
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
