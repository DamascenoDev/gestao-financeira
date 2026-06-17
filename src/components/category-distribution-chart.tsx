'use client'

import { Cell, Pie, PieChart } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatCents } from '@/lib/money'

/**
 * CategoryDistributionChart — the selected month's gasto split by categoria (UI-05).
 * A Recharts donut whose slices cycle the CATEGORICAL ramp --chart-1..5 (NOT the money
 * tokens, so a slice never reads as "income"); the center + legend carry the total via
 * formatCents and every category label is spelled out beside its swatch — the chart is
 * never the sole carrier of a number (Pitfall 6). Auto-themes via the CSS-var ramp.
 * Empty month → the pt-BR empty-state copy. Props are pure data (RSC supplies them).
 * (UI-SPEC §Data-Viz, §Copywriting, §Accessibility)
 */

export type CategoryDistributionDatum = {
  categoria: string
  cents: number
}

/** The 5-stop categorical ramp, repeated for >5 categories. */
const RAMP = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

export function CategoryDistributionChart({
  data,
  mes,
}: {
  data: CategoryDistributionDatum[]
  /** Human month label (e.g. 'junho 2026') for the aria-label. */
  mes: string
}) {
  const total = data.reduce((sum, d) => sum + d.cents, 0)

  // ChartConfig keyed by category so the tooltip/legend resolve labels + colors.
  const chartConfig: ChartConfig = Object.fromEntries(
    data.map((d, i) => [
      d.categoria,
      { label: d.categoria, color: RAMP[i % RAMP.length] },
    ]),
  )

  return (
    <section
      aria-label={`Distribuição de gastos por categoria em ${mes}`}
      className="flex flex-col gap-3"
    >
      {data.length === 0 ? (
        <div className="text-muted-foreground flex min-h-[240px] flex-col items-center justify-center gap-1 text-center text-sm">
          <p className="text-foreground font-heading text-base">
            Nenhum gasto neste mês
          </p>
          <p>
            Os gastos por categoria aparecem aqui quando você lançar transações.
          </p>
        </div>
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square min-h-[240px] max-h-[260px]"
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="categoria"
                    formatter={(value) => formatCents(Number(value))}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="cents"
                nameKey="categoria"
                innerRadius={60}
                strokeWidth={2}
              >
                {data.map((d, i) => (
                  <Cell key={d.categoria} fill={RAMP[i % RAMP.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          {/* Labeled total + per-category legend — never sole-carried by the donut. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Total no mês</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatCents(total)}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {data.map((d, i) => (
                <li
                  key={d.categoria}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: RAMP[i % RAMP.length] }}
                    />
                    {d.categoria}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatCents(d.cents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
