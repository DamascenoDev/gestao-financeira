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
import { createClient } from '@/lib/supabase/server'

/**
 * /carros (RSC, CAR-01). Reads the user's carros RLS-scoped (identity columns only —
 * no money/KPIs this phase, those land in Phases 9-11). The "mostrar arquivados"
 * filter is the `?arquivados=1` URL param (the Extrato convention): OFF (default)
 * shows only is_archived=false; ON shows all, archived carrying the "Arquivado" badge.
 * States per UI-SPEC §2: Empty-no-cars (the Car icon + CTA), Error (inline
 * text-destructive). loading.tsx streams a CardSkeleton grid.
 */
export default async function CarrosPage({
  searchParams,
}: {
  searchParams: Promise<{ arquivados?: string }>
}) {
  const { arquivados } = await searchParams
  const showArchived = arquivados === '1'

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('carros')
    .select('id, apelido, modelo, placa, ano, combustivel_padrao, is_archived')
    .order('apelido', { ascending: true })

  const carros: CarroCardData[] = (data ?? [])
    .filter((c) => showArchived || !c.is_archived)
    .map((c) => ({
      id: c.id,
      apelido: c.apelido,
      modelo: c.modelo,
      placa: c.placa,
      ano: c.ano,
      combustivelPadrao: c.combustivel_padrao,
      isArchived: c.is_archived,
    }))

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
