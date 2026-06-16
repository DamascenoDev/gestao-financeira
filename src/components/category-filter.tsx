'use client'

import { ListFilter, X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as React from 'react'

import { CategoryDot } from '@/components/category-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type FilterCategory = { id: string; name: string; color: string | null }

/**
 * Multi-category filter (UI-SPEC §3 filter bar). Writes the selected category
 * ids to ?cat (comma-joined) via useSearchParams + router.replace so the filter
 * persists in the URL and is read by the RSC. Renders a popover checkbox list,
 * the active filters as removable badges, and a "Limpar filtros" link. The month
 * (?mes) lives in the shell MonthSelector and is preserved on every write.
 */
export function CategoryFilter({ categories }: { categories: FilterCategory[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selected = React.useMemo(() => {
    const raw = searchParams.get('cat')
    return new Set(raw ? raw.split(',').filter(Boolean) : [])
  }, [searchParams])

  const byId = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  function writeSelection(next: Set<string>) {
    const params = new URLSearchParams(searchParams.toString())
    if (next.size === 0) params.delete('cat')
    else params.set('cat', Array.from(next).join(','))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    writeSelection(next)
  }

  function clearAll() {
    writeSelection(new Set())
  }

  const activeIds = Array.from(selected).filter((id) => byId.has(id))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger
          render={
            <Button type="button" variant="outline" size="sm">
              <ListFilter className="size-4" />
              Categorias
              {activeIds.length > 0 ? (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary tabular-nums">
                  {activeIds.length}
                </span>
              ) : null}
            </Button>
          }
        />
        <PopoverContent className="w-64 p-2" align="start">
          <div className="flex flex-col gap-0.5">
            {categories.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                Nenhuma categoria.
              </p>
            ) : (
              categories.map((c) => {
                const checked = selected.has(c.id)
                return (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(c.id)}
                    />
                    <CategoryDot color={c.color} />
                    <span className="truncate">{c.name}</span>
                  </label>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      {activeIds.map((id) => {
        const c = byId.get(id)!
        return (
          <Badge key={id} variant="secondary" className="gap-1">
            <CategoryDot color={c.color} />
            {c.name}
            <button
              type="button"
              aria-label={`Remover filtro ${c.name}`}
              className="ml-0.5 inline-flex"
              onClick={() => toggle(id)}
            >
              <X className="size-3" />
            </button>
          </Badge>
        )
      })}

      {activeIds.length > 0 ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-1 text-muted-foreground"
          onClick={clearAll}
        >
          Limpar filtros
        </Button>
      ) : null}
    </div>
  )
}
