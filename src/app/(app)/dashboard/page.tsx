import { AdherenceRow, type AdherenceRowData } from '@/components/adherence-row'
import { AdherenceSummaryStrip } from '@/components/adherence-summary-strip'
import {
  CategoryDistributionChart,
  type CategoryDistributionDatum,
} from '@/components/category-distribution-chart'
import { MetaDialog, type MetaCategory } from '@/components/meta-dialog'
import { PeriodTabs } from '@/components/period-tabs'
import {
  ReceitaGastoChart,
  type ReceitaGastoDatum,
} from '@/components/receita-gasto-chart'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { directionForKind, type Direction } from '@/lib/adherence'
import { centsToBigInt } from '@/lib/money'
import {
  currentYear,
  monthLabel,
  shiftMonthKey,
  toMonthKeyOrCurrent,
} from '@/lib/month'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type Kind = 'consumo' | 'alocacao'

// Both adherence views share this shape (only the window column differs). We map
// either into AdherenceRowData so the Mensal and Anual tabs render identically (BUD-03).
type AdherenceViewRow = {
  category_id: string | null
  category_name: string | null
  kind: string | null
  direction: string | null
  percent_bp: number | null
  income_cents: number | null
  realized_cents: number | null
  adherence_bp: number | null
}

const BP_100 = 10000

/**
 * Collapse view rows into the dashboard's row list, ordered consumo-then-alocação and
 * STABLE across both tabs. The alocação categories (Investimentos + Reserva) render as
 * ONE combined line (RSV-03, locked): every alocação meta row already carries the same
 * combined realized total from the view, so we sum their metas (percent_bp) into one
 * combined meta and recompute the adherence ratio against it — the user sees a single
 * "investment allocation" line that aportes feed into, never a consumo line.
 *
 * Returns the rows plus the period's net income and the estouradas/atingidas counts for
 * the summary strip (BUD-04 — the dashboard is the alert surface).
 */
function buildRows(
  viewRows: AdherenceViewRow[],
  colorById: Map<string, string | null>,
): {
  rows: AdherenceRowData[]
  incomeCents: bigint
  estouradas: number
  atingidas: number
} {
  const incomeCents = centsToBigInt(viewRows[0]?.income_cents ?? 0)

  const consumo: AdherenceRowData[] = []
  const alocacaoRows = viewRows.filter((r) => r.kind === 'alocacao')

  for (const r of viewRows) {
    if (r.kind !== 'consumo') continue
    consumo.push({
      key: `consumo-${r.category_id}`,
      categoryName: r.category_name ?? 'Categoria',
      color: r.category_id ? (colorById.get(r.category_id) ?? null) : null,
      kind: 'consumo',
      direction: (r.direction as Direction) ?? 'teto',
      percentBp: r.percent_bp ?? 0,
      realizedCents: centsToBigInt(r.realized_cents ?? 0),
      adherenceBp: r.adherence_bp,
    })
  }
  consumo.sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'pt-BR'))

  const rows = [...consumo]

  // Combined alocação line: sum the metas, share the (already-combined) realized total,
  // recompute the ratio against the summed meta. All alocação rows carry the same
  // realized_cents and income_cents (the view's alloc_total CTE), so this is exact.
  if (alocacaoRows.length > 0) {
    const combinedPercentBp = alocacaoRows.reduce(
      (sum, r) => sum + (r.percent_bp ?? 0),
      0,
    )
    const realized = centsToBigInt(alocacaoRows[0]!.realized_cents ?? 0)
    const income = centsToBigInt(alocacaoRows[0]!.income_cents ?? 0)
    const metaCents =
      income > 0n && combinedPercentBp > 0
        ? (income * BigInt(combinedPercentBp) + 5000n) / 10000n
        : 0n
    // adherence_bp = realized ÷ meta in basis-points of the meta; null when no income.
    const adherenceBp =
      metaCents > 0n ? Number((realized * 10000n) / metaCents) : null

    rows.push({
      key: 'alocacao-combined',
      categoryName: 'Alocação (investimentos + reserva)',
      color: null,
      kind: 'alocacao',
      direction: 'alvo',
      percentBp: combinedPercentBp,
      realizedCents: realized,
      adherenceBp,
      isCombinedAlocacao: true,
    })
  }

  // BUD-04 counts: teto rows at ≥100% are estouradas; alvo rows at ≥100% are atingidas.
  let estouradas = 0
  let atingidas = 0
  for (const row of rows) {
    if (row.adherenceBp === null) continue
    if (row.direction === 'teto' && row.adherenceBp >= BP_100) estouradas += 1
    if (row.direction === 'alvo' && row.adherenceBp >= BP_100) atingidas += 1
  }

  return { rows, incomeCents, estouradas, atingidas }
}

function RowList({
  rows,
  incomeCents,
  estouradas,
  atingidas,
  periodLabel,
  noReceitaCopy,
}: {
  rows: AdherenceRowData[]
  incomeCents: bigint
  estouradas: number
  atingidas: number
  periodLabel: string
  noReceitaCopy: string
}) {
  // Empty (metas defined, no receita this period): the division-by-zero guard surfaced
  // as copy, never NaN% — every row carries adherence_bp === null when income is 0.
  const semReceita =
    incomeCents <= 0n || rows.every((r) => r.adherenceBp === null)

  return (
    <div className="flex flex-col gap-4">
      <AdherenceSummaryStrip
        periodLabel={periodLabel}
        incomeCents={incomeCents}
        estouradas={estouradas}
        atingidas={atingidas}
      />
      {semReceita ? (
        <p className="text-muted-foreground text-sm">{noReceitaCopy}</p>
      ) : null}
      <div className="divide-y rounded-lg ring-1 ring-foreground/10">
        {rows.map((row) => (
          <div key={row.key} className="px-4">
            <AdherenceRow data={row} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  const mes = toMonthKeyOrCurrent(params.mes)
  const ano = currentYear()

  const supabase = await createClient()

  // ~12-month window (SP-pinned via month.ts) for the receita-vs-gasto evolution
  // chart: the current month back through 11 prior months, oldest → newest.
  const chartMonthKeys: string[] = Array.from({ length: 12 }, (_, i) =>
    shiftMonthKey(mes, i - 11),
  )

  // RLS-scoped reads: the server client runs under the user's JWT, so the
  // security_invoker views (0014) return ONLY this user's rows.
  const [monthRes, ytdRes, categoriesRes, incomeRes, incomeSeriesRes, categoryTotalsRes, allCategoriesRes] =
    await Promise.all([
    supabase
      .from('v_adherence_month')
      .select(
        'category_id, category_name, kind, direction, percent_bp, income_cents, realized_cents, adherence_bp',
      )
      .eq('month_key', mes),
    supabase
      .from('v_adherence_ytd')
      .select(
        'category_id, category_name, kind, direction, percent_bp, income_cents, realized_cents, adherence_bp',
      )
      .eq('year', ano),
    // Categories for the MetaDialog (non-archived), with any existing meta so the
    // dialog prefills the % + direction.
    supabase
      .from('categories')
      .select('id, name, color, kind, is_archived, budget_targets(percent_bp, direction)')
      .eq('is_archived', false)
      .order('sort'),
    supabase
      .from('v_income_month')
      .select('total_cents')
      .eq('month_key', mes)
      .maybeSingle(),
    // Chart data — existing views only, no new query/view/migration:
    // receita per month across the 12-month window.
    supabase
      .from('v_income_month')
      .select('month_key, total_cents')
      .in('month_key', chartMonthKeys),
    // gasto per (month, category) across the window — summed to a monthly gasto
    // (consumo categories) for the evolution chart and filtered to `mes` for the
    // category-distribution donut.
    supabase
      .from('v_category_totals')
      .select('month_key, category_id, total_cents')
      .in('month_key', chartMonthKeys),
    // Category kind + name for ALL categories (incl. archived) so historical
    // transactions classify correctly into gasto (consumo) and carry a label.
    supabase.from('categories').select('id, name, kind'),
  ])

  const error = monthRes.error || ytdRes.error
  const monthRows = (monthRes.data ?? []) as AdherenceViewRow[]
  const ytdRows = (ytdRes.data ?? []) as AdherenceViewRow[]

  type CategoryRow = Pick<
    Database['public']['Tables']['categories']['Row'],
    'id' | 'name' | 'color' | 'kind'
  > & {
    budget_targets: { percent_bp: number; direction: string }[] | null
  }
  const categoryRows = (categoriesRes.data ?? []) as unknown as CategoryRow[]

  const metaCategories: MetaCategory[] = categoryRows.map((c) => {
    const target = c.budget_targets?.[0]
    const kind = c.kind as Kind
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      kind,
      percentBp: target?.percent_bp ?? null,
      direction: (target?.direction as Direction) ?? directionForKind(kind),
    }
  })
  const incomeCentsForDialog = Number(centsToBigInt(incomeRes.data?.total_cents ?? 0))

  const colorById = new Map<string, string | null>(
    categoryRows.map((c) => [c.id, c.color]),
  )

  // ---- Chart data (UI-04 / UI-05) — derived from existing-view reads only. ----
  type AllCategory = { id: string; name: string; kind: string }
  const allCategories = (allCategoriesRes.data ?? []) as AllCategory[]
  const kindById = new Map(allCategories.map((c) => [c.id, c.kind]))
  const nameById = new Map(allCategories.map((c) => [c.id, c.name]))

  type IncomeMonthRow = { month_key: string | null; total_cents: number | null }
  type CategoryTotalRow = {
    month_key: string | null
    category_id: string | null
    total_cents: number | null
  }
  const incomeSeries = (incomeSeriesRes.data ?? []) as IncomeMonthRow[]
  const categoryTotals = (categoryTotalsRes.data ?? []) as CategoryTotalRow[]

  // receita per month (MD-04: aggregate on bigint via centsToBigInt — never a
  // lossy Number() cast — and cast to Number only at the chart-datum boundary
  // below, where Recharts requires a plain number).
  const receitaByMonth = new Map<string, bigint>()
  for (const r of incomeSeries) {
    if (r.month_key) receitaByMonth.set(r.month_key, centsToBigInt(r.total_cents))
  }
  // gasto per month = Σ consumo-category totals (alocação is a transfer, not gasto).
  const gastoByMonth = new Map<string, bigint>()
  for (const r of categoryTotals) {
    if (!r.month_key) continue
    if (r.category_id && kindById.get(r.category_id) !== 'consumo') continue
    gastoByMonth.set(
      r.month_key,
      (gastoByMonth.get(r.month_key) ?? 0n) + centsToBigInt(r.total_cents),
    )
  }
  const shortMonthLabel = (key: string) => monthLabel(key).split(' ')[0]!.slice(0, 3)
  const receitaGastoData: ReceitaGastoDatum[] = chartMonthKeys.map((key) => ({
    mes: shortMonthLabel(key),
    receita: Number(receitaByMonth.get(key) ?? 0n),
    gasto: Number(gastoByMonth.get(key) ?? 0n),
  }))
  // WR-02: gate the empty state on whether ANY source rows existed in the window,
  // not on the post-filter receita/gasto sums. The sum-based gate showed the
  // "Sem dados" copy even when the user had activity that nets to zero in both
  // series (e.g. only alocação transfers, which are correctly excluded from gasto
  // and have no matching receita). "Has any row" is the truthful contract.
  const hasReceitaGastoData =
    incomeSeries.length > 0 || categoryTotals.length > 0

  // category distribution for the selected month (consumo gasto by categoria).
  const distributionData: CategoryDistributionDatum[] = categoryTotals
    .filter(
      (r) =>
        r.month_key === mes &&
        (!r.category_id || kindById.get(r.category_id) === 'consumo'),
    )
    .map((r) => ({
      categoria: r.category_id
        ? (nameById.get(r.category_id) ?? 'Sem categoria')
        : 'Sem categoria',
      // MD-04: coerce via centsToBigInt then cast to Number only at the datum
      // boundary (Recharts needs a plain number), never a raw lossy Number().
      cents: Number(centsToBigInt(r.total_cents)),
    }))
    .filter((d) => d.cents > 0)
    .sort((a, b) => b.cents - a.cents)

  const hasMetas = monthRows.length > 0 || ytdRows.length > 0

  const month = buildRows(monthRows, colorById)
  const ytd = buildRows(ytdRows, colorById)

  // YTD window label: "Acumulado de 2026 (jan–{mês corrente})".
  const currentMonthName = monthLabel(`${ano}-${mes.slice(5, 7)}`).split(' ')[0]
  const anualLabel = 'Anual (YTD)'
  const ytdWindowLabel = `Acumulado de ${ano} (jan–${currentMonthName})`

  const metaDialog = (
    <MetaDialog
      categories={metaCategories}
      incomeCents={incomeCentsForDialog}
      trigger={
        <Button type="button" size="sm">
          Definir metas
        </Button>
      }
    />
  )

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Metas e aderência</h1>
        {metaDialog}
      </div>

      {/* Data-viz (UI-04 / UI-05): evolução receita-vs-gasto + distribuição por
          categoria do mês. 2-col em lg, empilhado abaixo de md. Each chart carries
          its own labeled total/legend (the chart is never the sole carrier). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolução mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ReceitaGastoChart
              data={hasReceitaGastoData ? receitaGastoData : []}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoria — {monthLabel(mes)}</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDistributionChart
              data={distributionData}
              mes={monthLabel(mes)}
            />
          </CardContent>
        </Card>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar a aderência. Tente recarregar a página.
        </p>
      ) : !hasMetas ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Você ainda não definiu metas</EmptyTitle>
            <EmptyDescription>
              Defina uma meta em % da sua receita líquida para cada categoria e
              acompanhe sua aderência aqui.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{metaDialog}</EmptyContent>
        </Empty>
      ) : (
        <PeriodTabs
          mensalLabel="Mensal"
          anualLabel={anualLabel}
          mensal={
            <RowList
              rows={month.rows}
              incomeCents={month.incomeCents}
              estouradas={month.estouradas}
              atingidas={month.atingidas}
              periodLabel={monthLabel(mes)}
              noReceitaCopy={`Sem receita líquida em ${monthLabel(mes)} — as metas em % não podem ser calculadas. Cadastre uma receita em Receitas.`}
            />
          }
          anual={
            <RowList
              rows={ytd.rows}
              incomeCents={ytd.incomeCents}
              estouradas={ytd.estouradas}
              atingidas={ytd.atingidas}
              periodLabel={ytdWindowLabel}
              noReceitaCopy={`Sem receita líquida em ${ano} — as metas em % não podem ser calculadas. Cadastre uma receita em Receitas.`}
            />
          }
        />
      )}
    </section>
  )
}
