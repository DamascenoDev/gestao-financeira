'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'

import { setKind } from '@/actions/categories'
import type { CategoryKind } from '@/lib/schemas/category'
import { Switch } from '@/components/ui/switch'

/**
 * Inline consumo↔alocação toggle for the Categorias list (CAT-03). A client island
 * over the RSC page: flipping the switch calls setKind and persists immediately
 * (revalidatePath refreshes the usos/list). The label keeps color from being the
 * sole signal (a11y).
 */
export function CategoryKindToggle({
  id,
  kind,
}: {
  id: string
  kind: CategoryKind
}) {
  const [isPending, startTransition] = useTransition()

  function onChange(checked: boolean) {
    const next: CategoryKind = checked ? 'alocacao' : 'consumo'
    startTransition(async () => {
      const result = await setKind(id, next)
      if ('error' in result) toast.error(result.error)
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={kind === 'alocacao'}
        onCheckedChange={onChange}
        disabled={isPending}
        aria-label="Alternar entre consumo e alocação"
      />
      <span className="text-xs text-muted-foreground">
        {kind === 'alocacao' ? 'Alocação' : 'Consumo'}
      </span>
    </span>
  )
}
