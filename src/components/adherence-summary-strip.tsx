import { formatCents } from '@/lib/money'

/**
 * AdherenceSummaryStrip (UI-SPEC §1) — the dashboard's top strip: período label ·
 * receita líquida do período as a 28px mono hero (`text-income`) · a terse count of
 * metas estouradas / atingidas (BUD-04 — the dashboard IS the alert surface, so the
 * count is part of the alert affordance, not a separate notification).
 */
export function AdherenceSummaryStrip({
  periodLabel,
  incomeCents,
  estouradas,
  atingidas,
}: {
  periodLabel: string
  incomeCents: number | bigint
  /** Count of teto metas at ≥100% (estouradas). */
  estouradas: number
  /** Count of alvo metas at ≥100% (atingidas). */
  atingidas: number
}) {
  const counts: string[] = []
  if (estouradas > 0) {
    counts.push(`${estouradas} ${estouradas === 1 ? 'categoria estourada' : 'categorias estouradas'}`)
  }
  if (atingidas > 0) {
    counts.push(`${atingidas} ${atingidas === 1 ? 'meta atingida' : 'metas atingidas'}`)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{periodLabel}</span>
      <span className="text-income font-mono text-[28px] font-semibold tabular-nums">
        {formatCents(incomeCents)}
      </span>
      <span className="text-muted-foreground text-xs">
        Receita líquida do período
        {counts.length > 0 ? ` · ${counts.join(' · ')}` : null}
      </span>
    </div>
  )
}
