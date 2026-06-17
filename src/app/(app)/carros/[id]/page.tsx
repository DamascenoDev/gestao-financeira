import { notFound } from 'next/navigation'

import { type CarroCardData } from '@/components/carro-card'
import { CarroDetailActions } from '@/components/carro-detail-actions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

/**
 * /carros/[id] (RSC, CAR-06) — MINIMAL identity detail. Reads the one carro RLS-scoped;
 * a foreign/missing id yields no row → notFound(). Header: apelido + modelo·placa·ano
 * + "Arquivado" badge + Editar/Arquivar actions. Body: a definition list of the
 * fields (null optionals show "—"). NO money, NO charts, NO tables, NO "coming soon"
 * placeholders — spend/abastecimento/consumo are deferred to Phases 9-11.
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
    </section>
  )
}
