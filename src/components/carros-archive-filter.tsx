'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

/**
 * "Mostrar arquivados" filter for /carros. Reflects the `?arquivados=1` URL param
 * (the Extrato convention) so the RSC re-reads with the new filter on toggle. Default
 * OFF (archived hidden). A soft, reversible control — neutral styling, no money.
 */
export function CarrosArchiveFilter({ checked }: { checked: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function onCheckedChange(next: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('arquivados', '1')
    else params.delete('arquivados')
    const query = params.toString()
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        id="carros-arquivados"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={isPending}
      />
      <Label htmlFor="carros-arquivados" className="text-sm text-muted-foreground">
        Mostrar arquivados
      </Label>
    </div>
  )
}
