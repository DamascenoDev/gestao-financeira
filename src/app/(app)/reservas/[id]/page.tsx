import { notFound } from 'next/navigation'

import { AmountCell } from '@/components/amount-cell'
import { ReservaProgress } from '@/components/reserva-progress'
import {
  ReservaLedgerTable,
  type LedgerMovement,
} from '@/components/reserva-ledger-table'
import { SaidaForm } from '@/components/saida-form'
import { centsToBigInt } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

/**
 * /reservas/[id] (RSC detail/ledger). Reads the one reserva's derived saldo from
 * v_reserva_balance + its reserva_ledger movements, RLS-scoped, newest first. A
 * not-found / not-owned id renders a clean notFound() (RLS returns no view row).
 *
 * Header: nome + saldo (view-derived) + alvo progress (only when alvo set). Body:
 * ReservaLedgerTable (entradas/saídas with links back to the source transação when
 * transaction_id is set). Primary action: "Registrar saída" (SaidaForm).
 */
export default async function ReservaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // The saldo is the view's authoritative derived value (RLS-scoped — a foreign or
  // nonexistent id yields no row → notFound).
  const { data: reserva } = await supabase
    .from('v_reserva_balance')
    .select('reserva_id, nome, alvo_cents, saldo_cents')
    .eq('reserva_id', id)
    .maybeSingle()

  if (!reserva || reserva.reserva_id === null) {
    notFound()
  }

  const { data: ledger, error: ledgerError } = await supabase
    .from('reserva_ledger')
    .select('id, occurred_on, kind, amount_cents, note, transaction_id')
    .eq('reserva_id', id)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  const saldoCents = reserva.saldo_cents ?? 0
  const rows: LedgerMovement[] = ledger ?? []

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{reserva.nome}</h1>
          <span className="text-xs text-muted-foreground">Saldo</span>
          <AmountCell
            cents={centsToBigInt(saldoCents)}
            kind="expense"
            signed={false}
            className="text-[28px]"
          />
          <ReservaProgress
            saldoCents={saldoCents}
            alvoCents={reserva.alvo_cents}
            className="mt-2 max-w-xs"
          />
        </div>
        <SaidaForm reservaId={id} saldoCents={saldoCents} />
      </div>

      {ledgerError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar o histórico. Tente recarregar a página.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum movimento nesta reserva ainda. Um lançamento na categoria Reserva
          cria a primeira entrada.
        </p>
      ) : (
        <ReservaLedgerTable rows={rows} />
      )}
    </section>
  )
}
