import { notFound } from 'next/navigation'

import {
  AbastecimentoForm,
} from '@/components/abastecimento-form'
import {
  AbastecimentoHistory,
  type AbastecimentoRow,
} from '@/components/abastecimento-history'
import { type CarroCardData } from '@/components/carro-card'
import { CarroDetailActions } from '@/components/carro-detail-actions'
import { type TransacaoOption } from '@/components/transacao-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { centsToBigInt } from '@/lib/money'
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
  }

  // ── Abastecimentos section data (RLS-scoped; security_invoker views) ──────────
  // The carro's abastecimentos, each with its linked transaction's amount_cents (the
  // cost source is exclusive: a linked tx OR a manual amount_cents). Ordered most
  // recent first by odômetro then date (matches the view's interval ordering).
  const { data: abastecimentos } = await supabase
    .from('abastecimentos')
    .select(
      'id, occurred_on, odometro_km, litros, tanque_cheio, combustivel, transaction_id, amount_cents, transactions(amount_cents)',
    )
    .eq('carro_id', id)
    .order('odometro_km', { ascending: false })
    .order('occurred_on', { ascending: false })

  // Per-interval km/l keyed by abastecimento id (the closing fill of each interval).
  const { data: consumoRows } = await supabase
    .from('v_abastecimento_consumo')
    .select('id, km_por_litro')
    .eq('carro_id', id)
  const kmPorLitroById = new Map<string, number | null>(
    (consumoRows ?? []).flatMap((c) =>
      c.id ? [[c.id, c.km_por_litro]] : [],
    ),
  )

  // The carro averages (km/l médio + R$/km médio).
  const { data: resumo } = await supabase
    .from('v_carro_resumo')
    .select('km_por_litro_medio, reais_por_km_medio')
    .eq('carro_id', id)
    .maybeSingle()

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
  const { data: recentTx } = await supabase
    .from('transactions')
    .select('id, description, occurred_on, amount_cents')
    .eq('kind', 'expense')
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
    const linked = a.transactions as { amount_cents: number } | null
    const custoCents = a.transaction_id
      ? centsToBigInt(linked?.amount_cents)
      : centsToBigInt(a.amount_cents)
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
