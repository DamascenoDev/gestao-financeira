'use client'

import * as React from 'react'

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { formatCents } from '@/lib/money'

/**
 * A recent UNLINKED expense the user can attach as the cost source of an
 * abastecimento (the "Da fatura" path). Server-fetched under RLS (only the
 * caller's own transactions, filtered to those with no abastecimento link).
 */
export type TransacaoOption = {
  id: string
  description: string
  occurred_on: string // yyyy-MM-dd
  // supabase-js may surface a bigint money column as number | string; formatCents
  // accepts number | bigint, so coerce a string at the display edge only.
  amount_cents: number | bigint
}

/** "dd/MM" from a yyyy-MM-dd civil date string (no tz ambiguity). */
function ddMM(occurredOn: string): string {
  const [, m, d] = occurredOn.split('-')
  return `${d}/${m}`
}

/**
 * TransacaoPicker (CAR-03) — a searchable list of the user's recent UNLINKED
 * expenses. Mirrors carro-picker's Field shape but renders a filterable list
 * instead of a Select (a Select cannot search). The parent owns the selected
 * `value` (transactionId, '' = none) and receives the choice via `onChange`.
 *
 * Filtering is client-side over the server-fetched list: a substring match on
 * the descrição OR the formatted valor (so the user can type "12,90" or part of
 * the merchant name). Money is formatted with formatCents at the display edge
 * only — the row carries raw centavos. An empty list shows a muted hint
 * (T-10-09: the list only ever contains the caller's own unlinked rows).
 */
export function TransacaoPicker({
  transacoes,
  value,
  onChange,
  error,
  id = 'transacao-picker',
}: {
  /** The user's recent UNLINKED expenses (server-fetched, passed from the page). */
  transacoes: TransacaoOption[]
  /** The selected transaction id ('' when none / cleared). */
  value: string
  onChange: (transactionId: string) => void
  /** Optional validation error from the parent. */
  error?: string
  id?: string
}) {
  const [query, setQuery] = React.useState('')

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return transacoes
    return transacoes.filter((t) => {
      const desc = (t.description || '').toLowerCase()
      const valor = formatCents(t.amount_cents).toLowerCase()
      return desc.includes(q) || valor.includes(q)
    })
  }, [transacoes, query])

  if (transacoes.length === 0) {
    return (
      <Field>
        <FieldLabel htmlFor={id}>Lançamento da fatura</FieldLabel>
        <FieldDescription>
          Nenhum lançamento disponível para vincular.
        </FieldDescription>
      </Field>
    )
  }

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>Lançamento da fatura</FieldLabel>
      <Input
        id={id}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por descrição ou valor…"
        autoComplete="off"
        aria-invalid={!!error}
      />
      <ul
        className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto"
        role="listbox"
        aria-label="Lançamentos disponíveis"
      >
        {filtered.length === 0 ? (
          <li className="px-2 py-3 text-sm text-muted-foreground">
            Nenhum lançamento corresponde à busca.
          </li>
        ) : (
          filtered.map((t) => {
            const selected = t.id === value
            return (
              <li key={t.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onChange(selected ? '' : t.id)}
                  className={
                    'flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors ' +
                    (selected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent')
                  }
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">
                      {t.description || '—'}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {ddMM(t.occurred_on)}
                    </span>
                  </span>
                  <span className="font-mono text-sm tabular-nums">
                    {formatCents(t.amount_cents)}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </Field>
  )
}
