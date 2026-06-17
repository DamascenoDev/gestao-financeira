'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { currentYear } from '@/lib/month'

/**
 * MEI year context: a ‹ 2026 › segmented control mirroring MonthSelector's shape.
 * MEI is a calendar-year module (not monthly), so it reads the selected year from
 * the ?ano=YYYY searchparam (default = current civil year in America/Sao_Paulo) and
 * writes it back via router.replace, persisting the selection across the MEI
 * sub-pages. Replaces the global MonthSelector inside /mei. (UI-SPEC §YearSelector)
 */
export function YearSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const ano = Number(searchParams.get('ano')) || Number(currentYear())

  function goTo(nextAno: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('ano', String(nextAno))
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Ano anterior"
        onClick={() => goTo(ano - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-16 text-center text-sm font-semibold tabular-nums">
        {ano}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Próximo ano"
        onClick={() => goTo(ano + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
