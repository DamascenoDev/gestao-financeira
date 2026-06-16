'use client'

import * as React from 'react'
import { useTransition } from 'react'

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
  onClear: () => void
  className?: string
}) {
  const [categoryId, setCategoryId] = React.useState('')
  const [isPending, startTransition] = useTransition()

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

      <Select value={categoryId || null} onValueChange={(v) => setCategoryId(v ?? '')}>
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

      <Button type="button" size="sm" variant="ghost" onClick={onClear}>
        Limpar seleção
      </Button>
    </div>
  )
}
