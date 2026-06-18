'use client'

import * as React from 'react'

import { CARRO_NONE } from '@/lib/carro'
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

export type CarroOption = { id: string; apelido: string }

/** WR-04: the shared "Nenhum" (clear) sentinel — Radix Select forbids an empty-string
 * item value, so the clear option carries this token and is decoded back to '' (none)
 * in onChange. Hoisted to lib/carro.ts so it cannot drift across components. */
const NONE = CARRO_NONE

/**
 * CarroPicker (CAR-02) — the optional "Carro" selector. Mirrors ReservaPicker's
 * Field + Select shape and a11y, but is UNCONDITIONAL and OPTIONAL: it is free of
 * category, has NO "+ Nova" affordance, and always offers a first "Nenhum" item that
 * clears the tag (maps to the empty value). value is the carro id ('' = none).
 *
 * Tagging a transaction to a carro is a non-destructive lens (D-CONTEXT D4) — it
 * never gates submit. When the user has no carros, an inline muted hint shows and the
 * Select offers only "Nenhum".
 */
export function CarroPicker({
  carros,
  value,
  onChange,
  error,
  id = 'carro-picker',
}: {
  /** The user's non-archived carros (server-fetched, passed from the parent). */
  carros: CarroOption[]
  /** The selected carro id ('' when none / cleared). */
  value: string
  onChange: (carroId: string) => void
  /** Optional validation error from the parent. */
  error?: string
  id?: string
}) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>Carro</FieldLabel>

      <Select
        items={
          {
            [NONE]: 'Nenhum',
            ...Object.fromEntries(carros.map((c) => [c.id, c.apelido])),
          } as Record<string, string>
        }
        value={value ? value : NONE}
        onValueChange={(v) => onChange(v === NONE ? '' : (v ?? ''))}
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-label="Carro"
          aria-invalid={!!error}
        >
          <SelectValue placeholder="Nenhum" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Nenhum</SelectItem>
          {carros.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.apelido}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {carros.length === 0 ? (
        <FieldDescription>Você ainda não tem carros.</FieldDescription>
      ) : (
        <FieldDescription>
          Vincular a um carro é opcional e não altera a categoria nem o valor.
        </FieldDescription>
      )}
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  )
}
