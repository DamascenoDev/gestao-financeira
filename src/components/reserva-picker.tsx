'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { ReservaForm } from '@/components/reserva-form'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type ReservaOption = { id: string; nome: string }

/**
 * ReservaPicker (RSV-02, UI-SPEC §4) — the "Qual reserva?" sub-question. A `select`
 * of the user's reservas (by nome), required when the chosen categoria is the
 * Reserva one. Rendered as a CONDITIONAL field by the parent (progressive
 * disclosure) — it does not own the is_reserva check, the parent passes the list +
 * decides when to mount it.
 *
 * Includes an inline "+ Nova reserva" affordance that opens the controlled
 * ReservaForm (Plan 04) WITHOUT losing the transação in progress: on create it
 * refreshes the server-fetched list so the new reserva appears, and the user picks
 * it. When the user has no reservas yet, the picker shows an inline empty state with
 * the same affordance and the parent blocks submit until one is chosen/created.
 *
 * Required-field a11y: an accessible name "Qual reserva?" + aria-invalid wired from
 * the parent's error; the conditional reveal is announced via aria-live, not a
 * silent DOM swap.
 */
export function ReservaPicker({
  reservas,
  value,
  onChange,
  error,
  id = 'reserva-picker',
}: {
  /** The user's reservas (server-fetched, passed from the parent). */
  reservas: ReservaOption[]
  /** The selected reserva id ('' when none chosen yet). */
  value: string
  onChange: (reservaId: string) => void
  /** Validation error from the parent (e.g. "Selecione uma reserva."). */
  error?: string
  id?: string
}) {
  const router = useRouter()
  const [novaOpen, setNovaOpen] = React.useState(false)

  return (
    <Field data-invalid={!!error} aria-live="polite">
      <FieldLabel htmlFor={id}>Qual reserva?</FieldLabel>

      {reservas.length === 0 ? (
        <div className="rounded-md border border-dashed border-input bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          <p>Você ainda não tem reservas.</p>
          <ReservaForm
            open={novaOpen}
            onOpenChange={(o) => {
              setNovaOpen(o)
              if (!o) router.refresh()
            }}
            trigger={
              <Button type="button" variant="outline" size="sm" className="mt-2">
                + Nova reserva
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Select
            items={
              Object.fromEntries(
                reservas.map((r) => [r.id, r.nome]),
              ) as Record<string, string>
            }
            value={value || null}
            onValueChange={(v) => onChange(v ?? '')}
          >
            <SelectTrigger
              id={id}
              className="w-full"
              aria-label="Qual reserva?"
              aria-invalid={!!error}
            >
              <SelectValue placeholder="Selecione uma reserva" />
            </SelectTrigger>
            <SelectContent>
              {reservas.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ReservaForm
            open={novaOpen}
            onOpenChange={(o) => {
              setNovaOpen(o)
              if (!o) router.refresh()
            }}
            trigger={
              <Button type="button" variant="outline" size="sm">
                + Nova reserva
              </Button>
            }
          />
        </div>
      )}

      <FieldDescription>
        Este lançamento será registrado como aporte nesta reserva.
      </FieldDescription>
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  )
}
