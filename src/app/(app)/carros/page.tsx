import { Car } from 'lucide-react'

import { CarroCard, type CarroCardData } from '@/components/carro-card'
import { CarroForm } from '@/components/carro-form'
import { CarrosArchiveFilter } from '@/components/carros-archive-filter'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { gastoOrNull } from '@/lib/carro/resumo'
import { createClient } from '@/lib/supabase/server'

/**
 * /carros (RSC, CAR-01 / CAR-05.2). Reads the user's carros RLS-scoped (identity
 * columns) AND the v_carro_resumo KPIs (gasto total + km/l médio) per carro. The
 * "mostrar arquivados" filter is the `?arquivados=1` URL param (the Extrato
 * convention): OFF (default) shows only is_archived=false; ON shows all, archived
 * carrying the "Arquivado" badge. States per UI-SPEC §2: Empty-no-cars (the Car
 * icon + CTA), Error (inline text-destructive). loading.tsx streams a CardSkeleton
 * grid.
 *
 * Null discipline (D4/UI-SPEC §Money): v_carro_resumo coalesces gasto_total_cents
 * to 0 for a carro with NO tagged spend — but the UI must show '—' for "no data",
 * never "R$ 0,00". So a resumo gasto of 0 (or a missing resumo row) maps to
 * gastoTotalCents: null. km_por_litro_medio is genuinely null without a closed
 * interval and passes through as-is.
 */
export default async function CarrosPage({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string }>
}) {
  const { arquivados } = await searchParams
  const showArchived = arquivados === '1'

  const supabase = await createClient()

  // Push the archived predicate into Postgres so the default view never reads
  // archived rows (WR-03): RLS scopes WHICH rows are visible (the caller's own),
  // and `.eq('is_archived', false)` keeps archived identity data off the wire
  // entirely when "mostrar arquivados" is OFF.
  let query = supabase
    .from('carros')
    .select('id, apelido, modelo, placa, ano, combustivel_padrao, is_archived')
  if (!showArchived) query = query.eq('is_archived', false)
  const { data, error } = await query.order('apelido', { ascending: true })

  // Additive KPI read: v_carro_resumo is security_invoker=true, so RLS already
  // scopes it to the caller — no `.eq` needed (one row per owned carro). If this
  // read errors, fall back to an empty map so cards still render identity + '—';
  // a KPI read failure never fails the whole page.
  const { data: resumoRows } = await supabase
    .from('v_carro_resumo')
    .select('carro_id, gasto_total_cents, km_por_litro_medio')

  const kpiByCarro = new Map<
    string,
    { gastoTotalCents: number | null; kmPorLitroMedio: number | null }
  >()
  for (const r of resumoRows ?? []) {
    if (r.carro_id === null) continue
    // gasto_total_cents is coalesced to 0 by the view; treat 0/missing as
    // "no data" → null so the card shows '—', never "R$ 0,00" (D4 null rule).
    // WR-03: shared gastoOrNull keeps this rule identical to the detail page.
    kpiByCarro.set(r.carro_id, {
      gastoTotalCents: gastoOrNull(r.gasto_total_cents),
      kmPorLitroMedio: r.km_por_litro_medio,
    })
  }

  const carros: CarroCardData[] = (data ?? [])
    .map((c) => {
      const kpi = kpiByCarro.get(c.id)
      return {
        id: c.id,
        apelido: c.apelido,
        modelo: c.modelo,
        placa: c.placa,
        ano: c.ano,
        combustivelPadrao: c.combustivel_padrao,
        isArchived: c.is_archived,
        gastoTotalCents: kpi?.gastoTotalCents ?? null,
        kmPorLitroMedio: kpi?.kmPorLitroMedio ?? null,
      }
    })

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Carros</h1>
        <div className="flex items-center gap-4">
          <CarrosArchiveFilter checked={showArchived} />
          <CarroForm />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar os carros. Tente recarregar a página.
        </p>
      ) : carros.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Car />
            </EmptyMedia>
            <EmptyTitle>Nenhum carro ainda</EmptyTitle>
            <EmptyDescription>
              Cadastre um carro para começar a acompanhar seus gastos e
              abastecimentos.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CarroForm />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {carros.map((carro) => (
            <CarroCard key={carro.id} carro={carro} />
          ))}
        </div>
      )}
    </section>
  )
}
