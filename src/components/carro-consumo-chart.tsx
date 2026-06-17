'use client'

import { CartesianGrid, Line, LineChart, XAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { kmPerLitroLabel } from '@/lib/carro/consumo'

/**
 * CarroConsumoChart — km/l-over-time line chart (CAR-05.4). A Recharts LineChart via
 * shadcn `chart`, mirroring ReceitaGastoChart's structure exactly (swapping Bar→Line).
 * The single series reads the gold primary chart token (--chart-1) via ChartContainer's
 * --color-{key} var, so the .dark flip re-themes the line with zero JS. The tooltip
 * renders pt-BR km/l via kmPerLitroLabel (one-decimal discipline + '—' for null).
 * Null/0-km/l intervals are dropped before render — the line plots only valid
 * tank-to-tank intervals (never a 0 or gap-filled value, UI-SPEC §4). Fewer than 2
 * valid points → the pt-BR empty-state copy (mirrors ReceitaGastoChart's empty block).
 * Props are pure data — the component fetches nothing (the RSC passes the series).
 * (UI-SPEC §Screen Contracts item 4, §Color, §Copywriting, §Accessibility)
 */

export type CarroConsumoDatum = {
  /** Pre-formatted dd/MM SP-pinned X label (the RSC does the date math; this is pure data). */
  data: string
  kmPorLitro: number
}

const chartConfig = {
  kmPorLitro: { label: 'km/l', color: 'var(--chart-1)' },
} satisfies ChartConfig

/**
 * Tooltip value formatter: the frozen kmPerLitroLabel renders the pt-BR one-decimal
 * number ('12,4') or the '—' sentinel; we append the 'km/l' unit on a real value so
 * the tooltip reads '12,4 km/l' while preserving the null discipline ('—' stays bare).
 */
export function consumoTooltipFormatter(value: number | null): string {
  const label = kmPerLitroLabel(value)
  return label === '—' ? label : `${label} km/l`
}

export function CarroConsumoChart({ data }: { data: CarroConsumoDatum[] }) {
  // The caller (Plan 03 RSC) drops null-km/l intervals; this component additionally
  // guards to finite, positive points so a stray null never plots a gap-filled 0.
  const validPoints = data.filter(
    (d) => Number.isFinite(d.kmPorLitro) && d.kmPorLitro > 0,
  )

  return (
    <section
      aria-label="Consumo de km/l ao longo do tempo"
      className="flex flex-col gap-3"
    >
      {validPoints.length < 2 ? (
        <div className="text-muted-foreground flex min-h-[240px] flex-col items-center justify-center gap-1 text-center text-sm">
          <p className="text-foreground font-heading text-base">
            Sem dados de consumo ainda
          </p>
          <p>
            Registre abastecimentos com tanque cheio para ver a curva de km/l
            aqui.
          </p>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="min-h-[240px] w-full">
          <LineChart data={validPoints} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="data"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => consumoTooltipFormatter(Number(value))}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="kmPorLitro"
              stroke="var(--color-kmPorLitro)"
              dot
              strokeWidth={2}
            />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  )
}
