'use client'

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatCents } from '@/lib/money'

/**
 * ReceitaGastoChart — monthly receita-vs-gasto evolution (UI-04). A grouped Recharts
 * bar chart whose two series read the SEMANTIC money tokens (receita = --income green,
 * gasto = --consumption amber) via ChartContainer's per-key --color-{key} vars, so the
 * .dark flip re-themes it with zero JS. Every money value (tooltip + the accompanying
 * totals legend) goes through formatCents — the chart is NEVER the sole carrier of a
 * number (UI-SPEC §Data-Viz, Pitfall 6). Empty series → the pt-BR empty-state copy.
 * Props are pure data — the component fetches nothing (the RSC passes the series).
 * (UI-SPEC §Copywriting, §Accessibility)
 */

export type ReceitaGastoDatum = {
  /** Short month label for the X axis (e.g. 'jan'). */
  mes: string
  receita: number
  gasto: number
}

const chartConfig = {
  receita: { label: 'Receita', color: 'var(--income)' },
  gasto: { label: 'Gasto', color: 'var(--consumption)' },
} satisfies ChartConfig

export function ReceitaGastoChart({ data }: { data: ReceitaGastoDatum[] }) {
  const totalReceita = data.reduce((sum, d) => sum + d.receita, 0)
  const totalGasto = data.reduce((sum, d) => sum + d.gasto, 0)

  return (
    <section
      aria-label="Evolução de receita e gasto por mês"
      className="flex flex-col gap-3"
    >
      {data.length === 0 ? (
        <div className="text-muted-foreground flex min-h-[240px] flex-col items-center justify-center gap-1 text-center text-sm">
          <p className="text-foreground font-heading text-base">
            Sem dados para o gráfico
          </p>
          <p>Lance receitas e gastos para ver a evolução do mês aqui.</p>
        </div>
      ) : (
        <>
          {/* Labeled totals — the chart is never the sole carrier of a number. */}
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="bg-income size-2 rounded-full"
              />
              <dt className="text-muted-foreground">Receita</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatCents(totalReceita)}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="bg-consumption size-2 rounded-full"
              />
              <dt className="text-muted-foreground">Gasto</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {formatCents(totalGasto)}
              </dd>
            </div>
          </dl>
          <ChartContainer config={chartConfig} className="min-h-[240px] w-full">
            <BarChart data={data} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatCents(Number(value))}
                  />
                }
              />
              <Bar dataKey="receita" fill="var(--color-receita)" radius={4} />
              <Bar dataKey="gasto" fill="var(--color-gasto)" radius={4} />
            </BarChart>
          </ChartContainer>
        </>
      )}
    </section>
  )
}
