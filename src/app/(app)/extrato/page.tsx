import { CategoryFilter } from '@/components/category-filter'
import {
  ExtratoTable,
  type CategoryTotal,
  type ExtratoRow,
} from '@/components/extrato-table'
import { ExportTransactionsButton } from '@/components/export-transactions-button'
import { TransacaoForm } from '@/components/transacao-form'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { centsToBigInt } from '@/lib/money'
import type { TransactionCsvRow } from '@/lib/transactions/csv'
import { monthBounds, monthLabel, toMonthKeyOrCurrent } from '@/lib/month'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type TransactionRow = Database['public']['Tables']['transactions']['Row']
type CategoryRow = Database['public']['Tables']['categories']['Row']

/** Parse the comma-joined ?cat searchparam into a category-id array. */
function parseCatFilter(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').filter(Boolean)
}

/** Narrow the DB `kind` (string) to the CSV Tipo union; unknown → null. */
function toCategoryKind(
  kind: string | undefined,
): TransactionCsvRow['category_kind'] {
  return kind === 'consumo' || kind === 'alocacao' ? kind : null
}

/**
 * Extrato (UI-SPEC §3) — the central screen. RSC: reads ?mes (default current
 * civil month) + ?cat (multi-category filter), queries the month's transactions
 * filtered by the selected categories, and reads per-category + grand totals from
 * v_category_totals (security_invoker — RLS-scoped) for the same filter. Renders
 * the CategoryFilter, the dense TanStack ExtratoTable (selection + sort + totals
 * footer + bulk reclassify), the "Novo lançamento" CTA, and the empty/error states.
 */
export default async function ExtratoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cat?: string }>
}) {
  const params = await searchParams
  // MD-02: validate ?mes before it reaches monthBounds → date-fns / the DB query.
  const mes = toMonthKeyOrCurrent(params.mes)
  const catFilter = parseCatFilter(params.cat)

  const supabase = await createClient()
  const { first, last } = monthBounds(mes)

  // Active categories (the select + filter + inline-edit options). is_reserva drives
  // the RSV-02 "Qual reserva?" sub-flow (the FLAG, never the name — CAT-02 rename-safe).
  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name, color, is_reserva, kind')
    .eq('is_archived', false)
    .order('sort', { ascending: true })
    .order('name', { ascending: true })

  const categories: Pick<
    CategoryRow,
    'id' | 'name' | 'color' | 'is_reserva' | 'kind'
  >[] = categoriesData ?? []
  const categoryById = new Map(categories.map((c) => [c.id, c]))

  // The user's reservas feed the conditional "Qual reserva?" picker (RSV-02). Read
  // from v_reserva_balance (RLS-scoped) for a stable nome list, ordered by nome.
  const { data: reservasData } = await supabase
    .from('v_reserva_balance')
    .select('reserva_id, nome')
    .order('nome', { ascending: true })
  const reservas = (reservasData ?? [])
    .filter(
      (r): r is { reserva_id: string; nome: string } =>
        r.reserva_id !== null && r.nome !== null,
    )
    .map((r) => ({ id: r.reserva_id, nome: r.nome }))

  // The month's transactions, optionally filtered by the selected categories.
  let txQuery = supabase
    .from('transactions')
    .select('id, occurred_on, description, amount_cents, category_id')
    .gte('occurred_on', first)
    .lte('occurred_on', last)
    .order('occurred_on', { ascending: false })
  if (catFilter.length > 0) {
    txQuery = txQuery.in('category_id', catFilter)
  }
  const { data: txData, error } = await txQuery

  const rows: ExtratoRow[] = (
    (txData ?? []) as Pick<
      TransactionRow,
      'id' | 'occurred_on' | 'description' | 'amount_cents' | 'category_id'
    >[]
  ).map((t) => ({
    id: t.id,
    occurred_on: t.occurred_on,
    description: t.description,
    // MD-04: carry centavos as bigint, never via a lossy Number() cast.
    amount_cents: centsToBigInt(t.amount_cents),
    category_id: t.category_id,
  }))

  // DATA-01: the month's RLS-scoped rows resolved for the transactions CSV. Each
  // transaction is joined to its category point-in-time (name + kind); a null/missing
  // category → 'Sem categoria' / null Tipo. The CSV reflects the current ?mes window
  // the Extrato shows (UI-SPEC: "the CSV matches what the Extrato shows").
  const csvRows: TransactionCsvRow[] = rows.map((r) => {
    const cat = r.category_id ? categoryById.get(r.category_id) : undefined
    return {
      occurred_on: r.occurred_on,
      description: r.description,
      category_name: cat?.name ?? '',
      category_kind: toCategoryKind(cat?.kind),
      amount_cents: r.amount_cents,
    }
  })

  // Per-category + grand totals from the security_invoker view (RLS-scoped),
  // scoped to the month and (when present) the category filter. Sums in SQL.
  const { data: totalsData } = await supabase
    .from('v_category_totals')
    .select('category_id, total_cents, tx_count')
    .eq('month_key', mes)

  const categoryTotals: CategoryTotal[] = (totalsData ?? [])
    .filter((t) => catFilter.length === 0 || (t.category_id && catFilter.includes(t.category_id)))
    .map((t) => {
      const cat = t.category_id ? categoryById.get(t.category_id) : undefined
      return {
        categoryId: t.category_id,
        name: cat?.name ?? 'Sem categoria',
        color: cat?.color ?? null,
        // MD-04: bigint sum — no Number() truncation above MAX_SAFE_INTEGER.
        totalCents: centsToBigInt(t.total_cents),
      }
    })
    .sort((a, b) => (b.totalCents > a.totalCents ? 1 : b.totalCents < a.totalCents ? -1 : 0))

  const grandTotalCents = categoryTotals.reduce((s, t) => s + t.totalCents, 0n)

  const isFiltered = catFilter.length > 0
  const txForm = (
    <TransacaoForm
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        isReserva: c.is_reserva,
      }))}
      reservas={reservas}
      defaultDate={`${mes}-15`}
    />
  )

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Extrato</h1>
        <div className="flex items-center gap-2">
          <ExportTransactionsButton rows={csvRows} mes={mes} />
          {txForm}
        </div>
      </div>

      <CategoryFilter
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        }))}
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar o extrato. Tente recarregar a página.
        </p>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              {isFiltered
                ? 'Nenhuma transação com esses filtros'
                : `Nenhuma transação em ${monthLabel(mes)}`}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered
                ? 'Ajuste o mês ou as categorias.'
                : 'Lance um gasto manualmente para começar seu extrato.'}
            </EmptyDescription>
          </EmptyHeader>
          {!isFiltered ? <EmptyContent>{txForm}</EmptyContent> : null}
        </Empty>
      ) : (
        <ExtratoTable
          rows={rows}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            isReserva: c.is_reserva,
          }))}
          reservas={reservas}
          categoryTotals={categoryTotals}
          grandTotalCents={grandTotalCents}
        />
      )}
    </section>
  )
}
