'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { createReserva, updateReserva } from '@/actions/reservas'
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

/**
 * ReservaForm (RSV-01) — create/edit dialog, mirroring receita-form's manual-state +
 * useTransition + sonner pattern. nome (required) + alvo (optional MoneyInput).
 * Editing alvo to empty removes the progress bar (the action stores alvo_cents null).
 *
 * EXPORTED and self-contained so Plan 05's ReservaPicker can open "+ Nova reserva"
 * without re-implementing the form. Accepts an optional `trigger` so callers can
 * supply their own opener; defaults to a "Nova reserva" button.
 */
export function ReservaForm({
  edit,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  /** Edit mode: when set, the dialog updates this reserva instead of creating. */
  edit?: { id: string; nome: string; alvo: string }
  /** Custom opener; defaults to a "Nova reserva" button. Ignored when controlled. */
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
  const [nome, setNome] = React.useState(edit?.nome ?? '')
  const [alvo, setAlvo] = React.useState(edit?.alvo ?? '')
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  // Re-seed from server truth each time the dialog opens (no useEffect — keeps the
  // react-hooks/set-state-in-effect rule clean; the 03-03 MetaDialog pattern).
  function handleOpenChange(next: boolean) {
    if (next) {
      setNome(edit?.nome ?? '')
      setAlvo(edit?.alvo ?? '')
      setErrors({})
    }
    setOpen(next)
  }

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!nome.trim()) next.nome = 'Informe o nome'
    // alvo is optional; only validate when the user typed something.
    if (alvo.trim() && !isValidMoney(alvo)) next.alvo = 'Valor monetário inválido.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    startTransition(async () => {
      const input = { nome: nome.trim(), alvo: alvo.trim() }
      const result = edit
        ? await updateReserva(edit.id, input)
        : await createReserva(input)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(edit ? 'Reserva atualizada' : 'Reserva criada')
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isControlled ? null : (
        <DialogTrigger
          render={trigger ?? <Button type="button">Nova reserva</Button>}
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edit ? 'Editar reserva' : 'Nova reserva'}</DialogTitle>
          <DialogDescription>
            Dê um nome à reserva e, se quiser, defina um alvo a atingir.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!errors.nome}>
              <FieldLabel htmlFor="reserva-nome">Nome</FieldLabel>
              <Input
                id="reserva-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Apê, Carro, Viagem…"
                aria-invalid={!!errors.nome}
              />
              <FieldError
                errors={errors.nome ? [{ message: errors.nome }] : undefined}
              />
            </Field>

            <Field data-invalid={!!errors.alvo}>
              <FieldLabel htmlFor="reserva-alvo">Alvo (opcional)</FieldLabel>
              <MoneyInput
                id="reserva-alvo"
                value={alvo}
                onChange={(e) => setAlvo(e.target.value)}
                placeholder="0,00"
                invalid={!!errors.alvo}
              />
              <FieldDescription>
                Defina um alvo para acompanhar o progresso. Sem alvo, a reserva não
                mostra barra.
              </FieldDescription>
              <FieldError
                errors={errors.alvo ? [{ message: errors.alvo }] : undefined}
              />
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
