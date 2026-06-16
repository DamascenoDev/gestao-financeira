import { AdherenceRow, type AdherenceRowData } from '@/components/adherence-row'
import { AdherenceSummaryStrip } from '@/components/adherence-summary-strip'
import { MetaDialog, type MetaCategory } from '@/components/meta-dialog'
import { PeriodTabs } from '@/components/period-tabs'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { directionForKind, type Direction } from '@/lib/adherence'
import { centsToBigInt } from '@/lib/money'
import {
  currentYear,
  monthLabel,
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

  // RLS-scoped reads: the server client runs under the user's JWT, so the
  // security_invoker views (0014) return ONLY this user's rows.
  const [monthRes, ytdRes, categoriesRes, incomeRes] = await Promise.all([
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
