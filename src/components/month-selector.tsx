'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { currentMonthKey, monthLabel, shiftMonthKey } from '@/lib/month'

/**
 * Global month context: a ‹ Junho 2026 › segmented control. Reads the selected
 * month from the ?mes=YYYY-MM searchparam (default = current civil month in
 * America/Sao_Paulo) and writes it back via router.replace, so the selection
 * persists across navigation between Receitas/Extrato. (UI-SPEC §0)
 */
export function MonthSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const mes = searchParams.get('mes') ?? currentMonthKey()

  function goTo(nextMes: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('mes', nextMes)
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Mês anterior"
        onClick={() => goTo(shiftMonthKey(mes, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-32 text-center text-sm font-semibold capitalize tabular-nums">
        {monthLabel(mes)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Próximo mês"
        onClick={() => goTo(shiftMonthKey(mes, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
