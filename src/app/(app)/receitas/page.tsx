import { AmountCell } from '@/components/amount-cell'
import { EditOccurrenceDialog } from '@/components/receita-form'
import { ReceitaForm } from '@/components/receita-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { centsToBigInt, centsToEditableBRL, formatCents } from '@/lib/money'
import { monthLabel, toMonthKeyOrCurrent } from '@/lib/month'
import { ensureMonthOccurrences } from '@/actions/incomes'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type OccurrenceRow = Database['public']['Tables']['income_occurrences']['Row']

export default async function ReceitasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const params = await searchParams
  // MD-02: validate ?mes before it reaches ensureMonthOccurrences → date-fns/DB.
  const mes = toMonthKeyOrCurrent(params.mes)

  // Materialize-on-read: idempotently upsert this month's recurring occurrences
  // before reading (INC-01). Re-opening the month never clobbers an INC-02 edit.
  await ensureMonthOccurrences(mes)

  const supabase = await createClient()

  const { data: occurrences, error: occError } = await supabase
    .from('income_occurrences')
    .select('id, template_id, source, amount_cents, month_key, occurred_on')
    .eq('month_key', mes)
    .order('occurred_on', { ascending: true })

  // "Receita líquida do mês" = SUM via the security_invoker view (INC-04).
  const { data: liquida } = await supabase
    .from('v_income_month')
    .select('total_cents')
    .eq('month_key', mes)
    .maybeSingle()

  const rows: Pick<
    OccurrenceRow,
    'id' | 'template_id' | 'source' | 'amount_cents' | 'month_key' | 'occurred_on'
  >[] = occurrences ?? []
  // MD-04: keep the aggregate as bigint — never round-trip a money sum through a
  // JS number before formatCents (the bigint-safe path would otherwise be dead).
  const totalCents = centsToBigInt(liquida?.total_cents)

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-xl font-semibold">Receitas</h1>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              Receita líquida do mês
            </span>
            <span className="font-mono text-[28px] font-semibold tabular-nums text-income">
              {formatCents(totalCents)}
            </span>
          </div>
        </div>
        <ReceitaForm monthKey={mes} />
      </div>

      {occError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as receitas. Tente recarregar a página.
        </p>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhuma receita neste mês</EmptyTitle>
            <EmptyDescription>
              Cadastre seu salário ou um recebimento avulso para começar a
              calcular suas metas.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ReceitaForm monthKey={mes} />
          </EmptyContent>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fonte</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-16 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const recorrente = row.template_id !== null
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.source}</TableCell>
                  <TableCell>
                    <Badge variant={recorrente ? 'secondary' : 'outline'}>
                      {recorrente ? 'Recorrente' : 'Avulsa'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <AmountCell
                      cents={centsToBigInt(row.amount_cents)}
                      kind="income"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <EditOccurrenceDialog
                      occurrenceId={row.id}
                      templateId={row.template_id}
                      monthKey={mes}
                      currentAmount={centsToEditableBRL(row.amount_cents)}
                      trigger={
                        <Button type="button" size="sm" variant="ghost">
                          Editar
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>{monthLabel(mes)}</TableCell>
              <TableCell className="text-right">
                <AmountCell cents={totalCents} kind="income" signed={false} />
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </section>
  )
}
