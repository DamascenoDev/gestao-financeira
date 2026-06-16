'use client'

import * as React from 'react'
import { useTransition } from 'react'
import Link from 'next/link'
import { MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { deleteReserva } from '@/actions/reservas'
import { AmountCell } from '@/components/amount-cell'
import { ReservaForm } from '@/components/reserva-form'
import { ReservaProgress } from '@/components/reserva-progress'
import { SaidaForm } from '@/components/saida-form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { centsToBigInt, centsToEditableBRL } from '@/lib/money'

export type ReservaCardData = {
  id: string
  nome: string
  saldoCents: number
  alvoCents: number | null
  /** Number of ledger movements — surfaced in the delete confirm copy. */
  movimentos: number
}

/**
 * ReservaCard (RSV-01/04/05) — a --card surface: nome · saldo (mono hero, view-
 * derived — never client-computed) · ReservaProgress (only when alvo set) · a
 * dropdown-menu of actions: Registrar saída (SaidaForm dialog) · Ver extrato (link
 * to /reservas/[id]) · Editar (ReservaForm dialog) · Excluir (alert-dialog with the
 * "Esta reserva tem {n} movimentos…" copy). The saldo ALWAYS comes from the caller's
 * view read; this component only formats it.
 */
export function ReservaCard({ reserva }: { reserva: ReservaCardData }) {
  const [saidaOpen, setSaidaOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [isPending, startTransition] = useTransition()

  function onDelete() {
    startTransition(async () => {
      const result = await deleteReserva(reserva.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Reserva excluída')
      setDeleteOpen(false)
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">{reserva.nome}</h2>
            <span className="text-xs text-muted-foreground">Saldo</span>
            <AmountCell
              cents={centsToBigInt(reserva.saldoCents)}
              kind="expense"
              signed={false}
              className="text-[22px]"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ações da reserva ${reserva.nome}`}
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSaidaOpen(true)}>
                Registrar saída
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link href={`/reservas/${reserva.id}`}>Ver extrato</Link>}
              />
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Renders nothing when there is no alvo (RSV-05). */}
        <ReservaProgress
          saldoCents={reserva.saldoCents}
          alvoCents={reserva.alvoCents}
        />
      </CardContent>

      {/* Controlled dialogs driven by the dropdown menu. */}
      <SaidaForm
        reservaId={reserva.id}
        saldoCents={reserva.saldoCents}
        open={saidaOpen}
        onOpenChange={setSaidaOpen}
      />
      <ReservaForm
        edit={{
          id: reserva.id,
          nome: reserva.nome,
          alvo: reserva.alvoCents !== null ? centsToEditableBRL(reserva.alvoCents) : '',
        }}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => (next ? setDeleteOpen(true) : setDeleteOpen(false))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir reserva</AlertDialogTitle>
            <AlertDialogDescription>
              Esta reserva tem {reserva.movimentos}{' '}
              {reserva.movimentos === 1 ? 'movimento' : 'movimentos'} no histórico.
              Excluí-la remove o histórico e o saldo. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={onDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
