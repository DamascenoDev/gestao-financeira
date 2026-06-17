import { notFound } from 'next/navigation'
import { z } from 'zod'

import {
  AbastecimentoForm,
} from '@/components/abastecimento-form'
import {
  AbastecimentoHistory,
  type AbastecimentoRow,
} from '@/components/abastecimento-history'
import { type CarroCardData } from '@/components/carro-card'
import {
  CarroCategoriaBars,
  type CarroCategoriaDatum,
} from '@/components/carro-categoria-bars'
import {
  CarroConsumoChart,
  type CarroConsumoDatum,
} from '@/components/carro-consumo-chart'
import { CarroDetailActions } from '@/components/carro-detail-actions'
import { type TransacaoOption } from '@/components/transacao-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { kmPerLitroLabel, reaisPerKmLabel } from '@/lib/carro/consumo'
import { gastoOrNull } from '@/lib/carro/resumo'
import { centsToBigInt, formatCents } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

/**
 * /carros/[id] (RSC, CAR-06 + CAR-03/CAR-04) — the carro detail. Reads the one carro
 * RLS-scoped; a foreign/missing id yields no row → notFound(). Header: apelido +
 * modelo·placa·ano + "Arquivado" badge + Editar/Arquivar actions. Body: a definition
 * list of the fields, then the "Abastecimentos" section — the "Novo abastecimento"
 * dialog + the history (table→card) + the km/l-médio & R$/km averages, all fed by
 * RLS-scoped reads of the abastecimentos + v_abastecimento_consumo + v_carro_resumo.
 * NO chart / rich KPI layout — those are Phase 11.
 */
export default async function CarroDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // WR-02: validate the route param as a uuid BEFORE it reaches any query —
  // notably the `.or('carro_id.eq.' + id)` filter string below, which interpolates
  // id into a PostgREST expression. A malformed id is treated as not-found rather
  // than relying on the positional `.eq('id', id)` guard for input sanitization
  // (defense-in-depth for a financial app). Mirrors actions/carros.ts idSchema.
  if (!z.string().uuid().safeParse(id).success) {
    notFound()
  }
  const supabase = await createClient()

  const { data: row } = await supabase
    .from('carros')
    .select('id, apelido, modelo, placa, ano, combustivel_padrao, is_archived')
    .eq('id', id)
    .maybeSingle()

  if (!row) {
    notFound()
  }

  const carro: CarroCardData = {
    id: row.id,
    apelido: row.apelido,
    modelo: row.modelo,
    placa: row.placa,
    ano: row.ano,
    combustivelPadrao: row.combustivel_padrao,
    isArchived: row.is_archived,
    // Detail-page KPIs (km/l · R$/km · gasto total) are wired from v_carro_resumo
    // in Plan 03's enriched layout; the header carro shape carries nulls until then.
    gastoTotalCents: null,
    kmPorLitroMedio: null,
  }

  // ── Abastecimentos section data (RLS-scoped; security_invoker views) ──────────
  // The carro's abastecimentos, each with its linked transaction's amount_cents (the
  // cost source is exclusive: a linked tx OR a manual amount_cents). Ordered most
  // recent first by odômetro then date (matches the view's interval ordering).
  const { data: abastecimentos } = await supabase
    .from('abastecimentos')
    .select(
      'id, occurred_on, odometro_km, litros, tanque_cheio, combustivel, transaction_id, amount_cents, transactions(id, description, occurred_on, amount_cents)',
    )
    .eq('carro_id', id)
    .order('odometro_km', { ascending: false })
    .order('occurred_on', { ascending: false })

  // Per-interval km/l keyed by abastecimento id (the closing fill of each interval).
  // Also carries occurred_on so the chart can plot km/l chronologically (the history
  // table orders by odômetro desc; the chart needs the date-ascending series).
  const { data: consumoRows } = await supabase
    .from('v_abastecimento_consumo')
    .select('id, occurred_on, km_por_litro')
    .eq('carro_id', id)
  const kmPorLitroById = new Map<string, number | null>(
    (consumoRows ?? []).flatMap((c) =>
      c.id ? [[c.id, c.km_por_litro]] : [],
    ),
  )

  // Consumo (km/l) chart series (CAR-05.4): chronological, null-km/l intervals dropped
  // (CONTEXT: never plot a gap-filled 0). The X label is built from the civil date
  // string (SP-pinned by construction — no tz math on a yyyy-MM-dd day; no new date
  // lib). WR-04: a history spanning more than one calendar year would otherwise yield
  // colliding dd/MM ticks (e.g. 2025-03-01 and 2026-03-01 both → '01/03', ambiguous
  // and indistinguishable on the axis). So include the 2-digit year (dd/MM/aa) when
  // the series crosses a year boundary; keep the compact dd/MM for single-year data.
  const consumoValidos = (consumoRows ?? [])
    .filter(
      (c): c is { id: string; occurred_on: string; km_por_litro: number } =>
        c.occurred_on != null &&
        c.km_por_litro != null &&
        c.km_por_litro > 0,
    )
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
  const multiAno =
    new Set(consumoValidos.map((c) => c.occurred_on.slice(0, 4))).size > 1
  const consumoSeries: CarroConsumoDatum[] = consumoValidos.map((c) => {
    // occurred_on is a yyyy-MM-dd civil date string; slice positionally (total,
    // no possibly-undefined destructure) so tsc strict stays happy.
    const yy = c.occurred_on.slice(2, 4)
    const mm = c.occurred_on.slice(5, 7)
    const dd = c.occurred_on.slice(8, 10)
    const data = multiAno ? `${dd}/${mm}/${yy}` : `${dd}/${mm}`
    return { data, kmPorLitro: c.km_por_litro }
  })

  // The carro averages (km/l médio + R$/km médio) + gasto total — the 3 KPI figures.
  const { data: resumo } = await supabase
    .from('v_carro_resumo')
    .select('km_por_litro_medio, reais_por_km_medio, gasto_total_cents')
    .eq('carro_id', id)
    .maybeSingle()

  // ── Gasto por categoria (CAR-05.2) — inline RLS-scoped aggregation ────────────
  // Sum the caller's own carro_id-tagged transactions, grouped by the POINT-IN-TIME
  // category_id on each row (CLAUDE.md locked decision — never group by name). RLS
  // scopes the read to the owner; `.eq('carro_id', id)` on the already-notFound-guarded
  // owned carro keeps it to this car's tagged lançamentos. Untagged transactions
  // (carro_id null) are excluded by the filter. This read is D4-non-destructive: it
  // touches only `transactions` (never budget_targets / adherence views) and writes
  // nothing. Money stays in integer cents until the formatCents display edge.
  const { data: categoriaTx } = await supabase
    .from('transactions')
    .select('amount_cents, category_id, categories(name)')
    .eq('carro_id', id)
  const categoriaSums = new Map<
    string,
    { categoria: string; valorCents: bigint }
  >()
  for (const tx of categoriaTx ?? []) {
    // Group by point-in-time category_id; null category_id → a single "Sem categoria"
    // bucket. The embedded categories(name) supplies the display label.
    const key = tx.category_id ?? '__sem_categoria__'
    const embed = tx.categories as unknown as
      | { name: string }
      | { name: string }[]
      | null
    const nome =
      (Array.isArray(embed) ? embed[0]?.name : embed?.name) ?? 'Sem categoria'
    const prev = categoriaSums.get(key)
    // WR-01: accumulate money as bigint centavos (via centsToBigInt) — never `+`
    // on a JS number. Matches the rest of the money path (v_carro_resumo sums in
    // bigint) and avoids the formatCents MAX_SAFE_INTEGER throw at the display edge.
    categoriaSums.set(key, {
      categoria: prev?.categoria ?? nome,
      valorCents: (prev?.valorCents ?? 0n) + centsToBigInt(tx.amount_cents),
    })
  }
  const categoriaData: CarroCategoriaDatum[] = Array.from(
    categoriaSums.values(),
  ).sort((a, b) =>
    a.valorCents < b.valorCents ? 1 : a.valorCents > b.valorCents ? -1 : 0,
  )

  // The user's recent expenses still available to link (no abastecimento points at
  // them). RLS already scopes to the caller's own rows. We exclude the ids already
  // linked to ANY of the user's abastecimentos (the picker shows only unlinked).
  const { data: linkedRows } = await supabase
    .from('abastecimentos')
    .select('transaction_id')
    .not('transaction_id', 'is', null)
  const linkedTxIds = new Set(
    (linkedRows ?? []).flatMap((r) => (r.transaction_id ? [r.transaction_id] : [])),
  )
  // WR-04: only offer expenses that are NOT already tagged to a DIFFERENT carro.
  // Linking such an expense would silently re-stamp transactions.carro_id (the action
  // overwrites it), moving that spend from the other carro's total to this one. We
  // keep untagged expenses (carro_id null) OR expenses already tagged to THIS carro.
  const { data: recentTx } = await supabase
    .from('transactions')
    .select('id, description, occurred_on, amount_cents')
    .eq('kind', 'expense')
    // id is uuid-validated at the top of the handler (WR-02), so this filter
    // string carries no untrusted input — the interpolation cannot inject a
    // PostgREST predicate.
    .or(`carro_id.is.null,carro_id.eq.${id}`)
    .order('occurred_on', { ascending: false })
    .limit(100)
  const transacoes: TransacaoOption[] = (recentTx ?? [])
    .filter((t) => !linkedTxIds.has(t.id))
    .map((t) => ({
      id: t.id,
      description: t.description,
      occurred_on: t.occurred_on,
      amount_cents: t.amount_cents,
    }))

  // Resolve each abastecimento's cost to centavos (linked tx amount OR manual) and
  // attach its interval km/l. supabase-js returns the embedded `transactions` as an
  // object (1:1) — guard the nullable join.
  const abastecimentoRows: AbastecimentoRow[] = (abastecimentos ?? []).map((a) => {
    const linked = a.transactions as {
      id: string
      description: string
      occurred_on: string
      amount_cents: number
    } | null
    // WR-03: distinguish "linked but amount unavailable" (embed null — e.g. the
    // linked tx was deleted) from a real zero. A linked row with no embedded amount
    // renders the sentinel instead of a misleading R$ 0,00.
    const custoCents: bigint | null = a.transaction_id
      ? linked?.amount_cents != null
        ? centsToBigInt(linked.amount_cents)
        : null
      : centsToBigInt(a.amount_cents)
    // WR-01: the page-level `transacoes` list excludes ALL linked tx ids, so a
    // fatura-linked row's OWN transaction is hidden from its edit picker. Surface
    // the row's own linked transaction option so the edit form can render it as the
    // selected choice (the create form keeps the all-linked-excluded list).
    const linkedOption: TransacaoOption | null =
      a.transaction_id && linked
        ? {
            id: linked.id,
            description: linked.description,
            occurred_on: linked.occurred_on,
            amount_cents: linked.amount_cents,
          }
        : null
    return {
      id: a.id,
      occurred_on: a.occurred_on,
      odometro_km: a.odometro_km,
      litros: a.litros,
      tanque_cheio: a.tanque_cheio,
      combustivel: a.combustivel,
      transaction_id: a.transaction_id,
      custo_cents: custoCents,
      km_por_litro: kmPorLitroById.get(a.id) ?? null,
      linked_transacao: linkedOption,
    }
  })

  const secondary = [
    carro.modelo,
    carro.placa,
    carro.ano !== null ? String(carro.ano) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ')

  const fields: { label: string; value: string }[] = [
    { label: 'Apelido', value: carro.apelido },
    { label: 'Modelo', value: carro.modelo ?? '—' },
    { label: 'Placa', value: carro.placa ?? '—' },
    { label: 'Ano', value: carro.ano !== null ? String(carro.ano) : '—' },
    { label: 'Combustível padrão', value: carro.combustivelPadrao ?? '—' },
  ]

  // The 3 KPI figures (CAR-05.1) from v_carro_resumo. Each renders the '—' sentinel for
  // null/no-data — never a fake zero. Gasto total is neutral foreground (a gasto is
  // normal, never red); 0/no-data → '—' (UI-SPEC null rule).
  // WR-03: shared gastoOrNull is the single home for the "0/missing → no-data"
  // rule, so this KPI card and the list KPI strip never disagree on R$ x vs '—'.
  const gastoTotalCents = gastoOrNull(resumo?.gasto_total_cents)
  const kpis: { label: string; value: string }[] = [
    { label: 'km/l médio', value: kmPerLitroLabel(resumo?.km_por_litro_medio ?? null) },
    { label: 'R$/km', value: reaisPerKmLabel(resumo?.reais_por_km_medio ?? null) },
    {
      label: 'Gasto total',
      value: gastoTotalCents !== null ? formatCents(gastoTotalCents) : '—',
    },
  ]

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{carro.apelido}</h1>
          {secondary ? (
            <span className="text-sm text-muted-foreground">{secondary}</span>
          ) : null}
          {carro.isArchived ? (
            <Badge variant="secondary" className="mt-1 w-fit text-xs">
              Arquivado
            </Badge>
          ) : null}
        </div>
        <CarroDetailActions carro={carro} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <dl className="flex flex-col gap-3">
            {fields.map((field) => (
              <div key={field.label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="text-sm">{field.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* KPI stat cards (CAR-05.1): km/l médio · R$/km · gasto total — mono
          tabular-nums, '—' for null/no-data, neutral foreground (never red). */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex flex-col gap-1 pt-6">
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
              <span className="font-mono text-xl font-semibold tabular-nums">
                {kpi.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gasto por categoria (CAR-05.2): magnitude bars from the inline aggregation,
          ordered by valor desc. The component renders its own empty line. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Gasto por categoria</h2>
        <CarroCategoriaBars data={categoriaData} />
      </section>

      {/* Consumo (km/l) (CAR-05.4): km/l-over-time line chart, null intervals dropped,
          chronological. The component guards <2 valid points → pt-BR empty copy. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Consumo (km/l)</h2>
        <Card>
          <CardContent className="pt-6">
            <CarroConsumoChart data={consumoSeries} />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Abastecimentos</h2>
          <AbastecimentoForm
            carroId={carro.id}
            combustivelPadrao={carro.combustivelPadrao}
            transacoes={transacoes}
            trigger={<Button type="button">Novo abastecimento</Button>}
          />
        </div>
        <Card>
          <CardContent className="pt-6">
            <AbastecimentoHistory
              rows={abastecimentoRows}
              kmPorLitroMedio={resumo?.km_por_litro_medio ?? null}
              reaisPorKmMedio={resumo?.reais_por_km_medio ?? null}
              carroId={carro.id}
              combustivelPadrao={carro.combustivelPadrao}
              transacoes={transacoes}
            />
          </CardContent>
        </Card>
      </section>
    </section>
  )
}
