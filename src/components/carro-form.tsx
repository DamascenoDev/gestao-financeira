'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { createCarro, updateCarro } from '@/actions/carros'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { carroSchema, type CarroInput } from '@/lib/schemas/carro'

/**
 * CarroForm (CAR-01) — create/edit dialog, mirroring reserva-form's manual-state +
 * useTransition + sonner pattern. apelido (required) + the four optional descriptive
 * fields (modelo, placa, ano, combustivel_padrao). Identity only — no money/KPIs
 * (those are Phases 9-11).
 *
 * EXPORTED and self-contained: callers can supply a controlled `open`/`onOpenChange`
 * (the CarroCard edit affordance) or a custom `trigger`; defaults to a gold
 * "Novo carro" button. Re-seeds from server truth on open (no useEffect).
 */
const COMBUSTIVEL_OPTIONS = [
  'Flex',
  'Gasolina',
  'Etanol',
  'Diesel',
  'GNV',
] as const

type Combustivel = (typeof COMBUSTIVEL_OPTIONS)[number]

export type CarroEdit = {
  id: string
  apelido: string
  modelo: string
  placa: string
  ano: string
  combustivel: string
}

export function CarroForm({
  edit,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Edit mode: when set, the dialog updates this carro instead of creating. */
  edit?: CarroEdit
  /** Custom opener; defaults to a "Novo carro" button. Ignored when controlled. */
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
  const [apelido, setApelido] = React.useState(edit?.apelido ?? '')
  const [modelo, setModelo] = React.useState(edit?.modelo ?? '')
  const [placa, setPlaca] = React.useState(edit?.placa ?? '')
  const [ano, setAno] = React.useState(edit?.ano ?? '')
  const [combustivel, setCombustivel] = React.useState(edit?.combustivel ?? '')
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  // Re-seed from server truth each time the dialog opens (no useEffect — the
  // reserva-form / MetaDialog pattern).
  function handleOpenChange(next: boolean) {
    if (next) {
      setApelido(edit?.apelido ?? '')
      setModelo(edit?.modelo ?? '')
      setPlaca(edit?.placa ?? '')
      setAno(edit?.ano ?? '')
      setCombustivel(edit?.combustivel ?? '')
      setErrors({})
    }
    setOpen(next)
  }

  /** Build the CarroInput from the controlled fields (optionals → undefined). */
  function buildInput(): CarroInput {
    const anoTrimmed = ano.trim()
    return {
      apelido: apelido.trim(),
      modelo: modelo.trim() || undefined,
      placa: placa.trim() || undefined,
      ano: anoTrimmed ? Number(anoTrimmed) : undefined,
      combustivel_padrao: (combustivel || undefined) as Combustivel | undefined,
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Client-side validation mirroring carroSchema (the action re-validates server-side).
    const parsed = carroSchema.safeParse(buildInput())
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'apelido')
        next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    startTransition(async () => {
      const result = edit
        ? await updateCarro(edit.id, parsed.data)
        : await createCarro(parsed.data)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(edit ? 'Carro atualizado' : 'Carro adicionado')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isControlled ? null : (
        <DialogTrigger
          render={trigger ?? <Button type="button">Novo carro</Button>}
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? 'Editar carro' : 'Novo carro'}</DialogTitle>
          <DialogDescription>
            Dê um apelido ao carro e, se quiser, complete modelo, placa, ano e
            combustível.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!errors.apelido}>
              <FieldLabel htmlFor="carro-apelido">Apelido</FieldLabel>
              <Input
                id="carro-apelido"
                value={apelido}
                onChange={(e) => setApelido(e.target.value)}
                placeholder="Carro da família, Gol…"
                aria-invalid={!!errors.apelido}
              />
              <FieldError
                errors={errors.apelido ? [{ message: errors.apelido }] : undefined}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="carro-modelo">Modelo (opcional)</FieldLabel>
              <Input
                id="carro-modelo"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="Gol 1.6"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="carro-placa">Placa (opcional)</FieldLabel>
              <Input
                id="carro-placa"
                value={placa}
                onChange={(e) => setPlaca(e.target.value)}
                placeholder="ABC1D23"
              />
            </Field>

            <Field data-invalid={!!errors.ano}>
              <FieldLabel htmlFor="carro-ano">Ano (opcional)</FieldLabel>
              <Input
                id="carro-ano"
                inputMode="numeric"
                value={ano}
                onChange={(e) => setAno(e.target.value)}
                placeholder="2018"
                aria-invalid={!!errors.ano}
              />
              <FieldError
                errors={errors.ano ? [{ message: errors.ano }] : undefined}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="carro-combustivel">
                Combustível padrão (opcional)
              </FieldLabel>
              <Select
                value={combustivel}
                onValueChange={(v) => setCombustivel(v ?? '')}
              >
                <SelectTrigger id="carro-combustivel" className="w-full">
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
