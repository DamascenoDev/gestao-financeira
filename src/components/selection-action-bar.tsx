'use client'

import * as React from 'react'
import { useTransition } from 'react'

import { CARRO_NONE } from '@/lib/carro'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type SelectionCategory = { id: string; name: string }
export type SelectionCarro = { id: string; apelido: string }

/**
 * SelectionActionBar — a SELF-CONTAINED bulk-reclassify bar (UI-SPEC §3). Takes
 * only { selectedIds, categories, onApply, onClear } so Phase 4's import-review /
 * memory flow reuses it verbatim. It owns the category-pick + apply lifecycle;
 * the parent owns the row-selection model and the bulkReclassify call.
 *
 * Renders a sticky --card surface: "{n} selecionadas" · a category select · a
 * primary "Reclassificar" button (→ onApply(categoryId)) · "Limpar seleção".
 * Hidden when nothing is selected.
 */
export function SelectionActionBar({
  selectedIds,
  categories,
  onApply,
  carros,
  onApplyCarro,
  onClear,
  className,
}: {
  selectedIds: string[]
  categories: SelectionCategory[]
  /**
   * Apply the chosen category to the selected ids. Returns ok/error so the bar
   * can keep the selection on failure and clear it on success (the caller wires
   * this to bulkReclassify + toast).
   */
  onApply: (categoryId: string) => Promise<{ error: string } | { ok: true }>
  /** CAR-02: the user's non-archived carros — feeds the bulk "Vincular a carro" control. */
  carros?: SelectionCarro[]
  /**
   * CAR-02: tag (or unlink, carroId=null) the selection. Same ok/error contract as
   * onApply — the caller wires this to bulkTagCarro + toast. Optional: when omitted,
   * the carro control is not rendered.
   */
  onApplyCarro?: (
    carroId: string | null,
  ) => Promise<{ error: string } | { ok: true }>
  onClear: () => void
  className?: string
}) {
  const [categoryId, setCategoryId] = React.useState('')
  const [carroValue, setCarroValue] = React.useState('')
  const [isPending, startTransition] = useTransition()
  const [isCarroPending, startCarroTransition] = useTransition()

  const n = selectedIds.length
  if (n === 0) return null

  function apply() {
    if (!categoryId) return
    startTransition(async () => {
      const result = await onApply(categoryId)
      if ('ok' in result) {
        setCategoryId('')
        onClear()
      }
    })
  }

  function applyCarro() {
    if (!carroValue || !onApplyCarro) return
    const carroId = carroValue === CARRO_NONE ? null : carroValue
    startCarroTransition(async () => {
      const result = await onApplyCarro(carroId)
      if ('ok' in result) {
        setCarroValue('')
        onClear()
      }
    })
  }

  return (
    <div
      className={cn(
        'sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-md',
        className,
      )}
      role="region"
      aria-label="Ações de seleção"
    >
      <span className="text-sm font-medium tabular-nums">
        {n} {n === 1 ? 'selecionada' : 'selecionadas'}
      </span>

      <Select
        items={
          Object.fromEntries(
            categories.map((c) => [c.id, c.name]),
          ) as Record<string, string>
        }
        value={categoryId || null}
        onValueChange={(v) => setCategoryId(v ?? '')}
      >
        <SelectTrigger className="min-w-48" size="sm">
          <SelectValue placeholder="Reclassificar para…" />
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        size="sm"
        onClick={apply}
        disabled={!categoryId || isPending}
      >
        {isPending ? 'Aplicando…' : 'Reclassificar'}
      </Button>

      {onApplyCarro ? (
        <>
          <Select
            items={
              {
                [CARRO_NONE]: 'Nenhum (desvincular)',
                ...Object.fromEntries(
                  (carros ?? []).map((c) => [c.id, c.apelido]),
                ),
              } as Record<string, string>
            }
            value={carroValue || null}
            onValueChange={(v) => setCarroValue(v ?? '')}
          >
            <SelectTrigger className="min-w-48" size="sm" aria-label="Vincular a carro">
              <SelectValue placeholder="Vincular a carro…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CARRO_NONE}>Nenhum (desvincular)</SelectItem>
              {(carros ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.apelido}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={applyCarro}
            disabled={!carroValue || isCarroPending}
          >
            {isCarroPending ? 'Aplicando…' : 'Vincular a carro'}
          </Button>
        </>
      ) : null}

      <Button type="button" size="sm" variant="ghost" onClick={onClear}>
        Limpar seleção
      </Button>
    </div>
  )
}
