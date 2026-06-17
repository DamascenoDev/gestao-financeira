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
  /** Soma da categoria em centavos. bigint para nunca trafegar dinheiro por float. */
  valorCents: bigint
}

export function CarroCategoriaBars({ data }: { data: CarroCategoriaDatum[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum gasto vinculado a este carro.
      </p>
    )
  }

  // valorCents is bigint money; compare/divide on bigint and convert to a ratio
  // only for the CSS width (a presentation %, never a money value).
  const sorted = [...data].sort((a, b) =>
    a.valorCents < b.valorCents ? 1 : a.valorCents > b.valorCents ? -1 : 0,
  )
  // sorted is valor-desc and non-empty here (the length===0 early-return precedes
  // this), so the max is simply the first row — no spread, no float on money.
  const maiorValor = sorted[0]?.valorCents ?? 0n

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((d) => {
        const widthPct =
          maiorValor > 0n ? (Number(d.valorCents) / Number(maiorValor)) * 100 : 0
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
