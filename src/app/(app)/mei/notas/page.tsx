import { NfForm } from '@/components/nf-form'
import { NfTable, type NfRow } from '@/components/nf-table'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { todaySP, toYearOrCurrent, yearBounds } from '@/lib/month'
import { centsToBigInt } from '@/lib/money'
import { MEI_ACTIVITY_TYPES, type MeiActivityType } from '@/lib/schemas/mei'
import { createClient } from '@/lib/supabase/server'

/**
 * /mei/notas (RSC) — register/edit/delete the NFs emitted in the selected ?ano and
 * list them with a gross year total (MEI-01/MEI-03). Reads mei_invoices between the
 * year's civil bounds ordered by issued_on desc, RLS-scoped (T-05-09). The NfForm
 * dialog drives createMeiInvoice; the per-row menu drives updateMeiInvoice /
 * deleteMeiInvoice (ownership re-derived server-side, T-05-10). The disclaimer +
 * YearSelector come from the /mei segment layout — not re-rendered here.
 */
function isActivityType(value: string): value is MeiActivityType {
  return (MEI_ACTIVITY_TYPES as readonly string[]).includes(value)
}

export default async function MeiNotasPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>
}) {
  const { ano: anoParam } = await searchParams
  const ano = toYearOrCurrent(anoParam)
  const { first, last } = yearBounds(String(ano))
  const today = todaySP()

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('mei_invoices')
    .select('id, issued_on, amount_cents, tomador, descricao, activity_type')
    .gte('issued_on', first)
    .lte('issued_on', last)
    .order('issued_on', { ascending: false })

  const rows: NfRow[] = (data ?? []).map((r) => ({
    id: r.id,
    issued_on: r.issued_on,
    // Coerce the bigint money column at the data boundary (MD-04), mirroring
    // extrato/page.tsx — never pass a raw supabase value into a money sum.
    amount_cents: centsToBigInt(r.amount_cents),
    tomador: r.tomador,
    descricao: r.descricao,
    activity_type: isActivityType(r.activity_type) ? r.activity_type : 'servicos',
  }))

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Notas fiscais</h1>
        <NfForm defaultDate={today} />
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as notas. Tente recarregar a página.
        </p>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhuma nota em {ano}</EmptyTitle>
            <EmptyDescription>
              Registre as notas fiscais de serviço que você emitiu para acompanhar
              seu faturamento.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NfForm defaultDate={today} />
          </EmptyContent>
        </Empty>
      ) : (
        <NfTable rows={rows} defaultDate={today} />
      )}
    </section>
  )
}
