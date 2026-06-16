import { ReservaCard, type ReservaCardData } from '@/components/reserva-card'
import { ReservaForm } from '@/components/reserva-form'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { createClient } from '@/lib/supabase/server'

/**
 * /reservas (RSC, new nav surface — the sidebar item was added in Plan 01).
 *
 * Reads the user's reservas + their derived saldo from v_reserva_balance, RLS-scoped:
 * the saldo ALWAYS comes from the view (Σ in − Σ out), NEVER computed here (RSV-05).
 * Renders a responsive grid of ReservaCard. States per UI-SPEC §3: Empty-no-reservas
 * (the "Apê, Carro" copy + "Nova reserva" CTA), Error (inline text-destructive). The
 * RSC awaits its data server-side, so no client loading skeleton is needed.
 */
export default async function ReservasPage() {
  const supabase = await createClient()

  // The saldo is the view's authoritative derived value (never client-computed).
  const { data: balances, error: balanceError } = await supabase
    .from('v_reserva_balance')
    .select('reserva_id, nome, alvo_cents, saldo_cents')
    .order('nome', { ascending: true })

  // Movement counts (for the delete-confirm copy) — one cheap grouped read.
  const { data: ledger } = await supabase
    .from('reserva_ledger')
    .select('reserva_id')

  const movimentosByReserva = new Map<string, number>()
  for (const row of ledger ?? []) {
    if (!row.reserva_id) continue
    movimentosByReserva.set(
      row.reserva_id,
      (movimentosByReserva.get(row.reserva_id) ?? 0) + 1,
    )
  }

  const reservas: ReservaCardData[] = (balances ?? [])
    .filter((b): b is typeof b & { reserva_id: string; nome: string } =>
      b.reserva_id !== null && b.nome !== null,
    )
    .map((b) => ({
      id: b.reserva_id,
      nome: b.nome,
      saldoCents: b.saldo_cents ?? 0,
      alvoCents: b.alvo_cents,
      movimentos: movimentosByReserva.get(b.reserva_id) ?? 0,
    }))

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Reservas</h1>
        <ReservaForm />
      </div>

      {balanceError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as reservas. Tente recarregar a página.
        </p>
      ) : reservas.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhuma reserva ainda</EmptyTitle>
            <EmptyDescription>
              Crie uma reserva (ex.: Apê, Carro) para guardar dinheiro por objetivo.
              Lançamentos na categoria Reserva entram aqui.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ReservaForm />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {reservas.map((reserva) => (
            <ReservaCard key={reserva.id} reserva={reserva} />
          ))}
        </div>
      )}
    </section>
  )
}
