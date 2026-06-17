import { formatCents } from '@/lib/money'

/**
 * CarroCategoriaBars — gasto-por-categoria magnitude bars (CAR-05.2). A proportional
 * "share of this car's total" view: one horizontal bar per categoria of the car's
 * carro_id-tagged lançamentos, ordered by valor desc. Mirrors AdherenceBar's track/fill
 * markup ONLY (a bg-muted h-2 rounded track + a width-driven fill) — it does NOT import
 * AdherenceBar, whose meta/aria-meta progressbar semantics do not fit a meta-less
 * magnitude bar (UI-SPEC §Screen Contracts item 3). The fill is the NEUTRAL
 * bg-muted-foreground (never gold, never the income/consumption/allocation semantic
 * money tokens — those carry kind-meaning that does not apply here, UI-SPEC §Color).
 * Color/length is never the sole signal: each row pairs the bar with the categoria
 * name + a mono formatCents amount and an accessible name (categoria + valor). Empty
 * list → the single muted pt-BR line. Pure presentational, server-renderable.
 */

export type CarroCategoriaDatum = {
  categoria: string
  valorCents: number
}

export function CarroCategoriaBars({ data }: { data: CarroCategoriaDatum[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum gasto vinculado a este carro.
      </p>
    )
  }

  const sorted = [...data].sort((a, b) => b.valorCents - a.valorCents)
  const maiorValor = Math.max(...sorted.map((d) => d.valorCents))

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((d) => {
        const widthPct = maiorValor > 0 ? (d.valorCents / maiorValor) * 100 : 0
        return (
          <div
            key={d.categoria}
            data-slot="categoria-row"
            aria-label={`${d.categoria}: ${formatCents(d.valorCents)}`}
            className="flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">{d.categoria}</span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatCents(d.valorCents)}
              </span>
            </div>
            <div
              aria-hidden
              className="bg-muted relative h-2 w-full overflow-hidden rounded-full"
            >
              <div
                data-slot="categoria-fill"
                className="bg-muted-foreground h-full rounded-full"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
