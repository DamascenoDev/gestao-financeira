'use client'

import * as React from 'react'
import { MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { deleteAbastecimento } from '@/actions/abastecimentos'
import {
  AbastecimentoForm,
  type AbastecimentoEdit,
} from '@/components/abastecimento-form'
import { type TransacaoOption } from '@/components/transacao-picker'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { kmPerLitroLabel, reaisPerKmLabel } from '@/lib/carro/consumo'
import { centsToEditableBRL, formatCents } from '@/lib/money'

/** A single abastecimento row, with its cost already resolved to centavos. */
export type AbastecimentoRow = {
  id: string
  occurred_on: string // yyyy-MM-dd
  odometro_km: number
  litros: number
  tanque_cheio: boolean
  combustivel: string | null
  /** When linked to a fatura lançamento. */
  transaction_id: string | null
  /** The cost in centavos — from the linked transaction's amount OR the manual value. */
  custo_cents: number | bigint
  /** km/l do intervalo from v_abastecimento_consumo (null when invalid/open). */
  km_por_litro: number | null
}

/** "dd/MM" from a yyyy-MM-dd civil date string (no tz ambiguity). */
function ddMM(occurredOn: string): string {
  const [, m, d] = occurredOn.split('-')
  return `${d}/${m}`
}

/** Build the edit seed for the per-row AbastecimentoForm. */
function toEdit(row: AbastecimentoRow): AbastecimentoEdit {
  return {
    id: row.id,
    occurredOn: row.occurred_on,
    odometroKm: String(row.odometro_km),
    // litros is a volume; pt-BR comma for the editable input.
    litros: String(row.litros).replace('.', ','),
    tanqueCheio: row.tanque_cheio,
    combustivel: row.combustivel ?? '',
    transactionId: row.transaction_id ?? '',
    // A linked row has no manual amount to seed.
    amount: row.transaction_id ? '' : centsToEditableBRL(row.custo_cents),
  }
}

/** Per-row actions: Editar (opens the form in edit mode) + Excluir (confirm → delete). */
function RowActions({
  row,
  carroId,
  combustivelPadrao,
  transacoes,
}: {
  row: AbastecimentoRow
  carroId: string
  combustivelPadrao?: string | null
  transacoes: TransacaoOption[]
}) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  function onDelete() {
    startTransition(async () => {
      const result = await deleteAbastecimento(row.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Abastecimento excluído')
      setDeleteOpen(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Ações">
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
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

      <AbastecimentoForm
        carroId={carroId}
        combustivelPadrao={combustivelPadrao}
        transacoes={transacoes}
        edit={toEdit(row)}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir abastecimento</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
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
    </>
  )
}

/** A labelled average number (mono, tabular-nums); '—' when null. */
function Average({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>
    </div>
  )
}

/**
 * AbastecimentoHistory (CAR-03 / CAR-04) — the abastecimento list reusing the
 * Phase-7 nf-table table→card grammar: a dense Table on desktop (≥md), a card stack
 * on mobile (<md). Columns: data (dd/MM) · odômetro · litros · custo (formatCents) ·
 * tanque-cheio badge · km/l do intervalo (kmPerLitroLabel → '—' when invalid/null).
 * Above the list, the averages block (km/l médio + R$/km) renders as mono
 * tabular-nums numbers from v_carro_resumo ('—' when null). NO chart — that is
 * Phase 11. Rows arrive sorted by odômetro/data desc from the page.
 */
export function AbastecimentoHistory({
  rows,
  kmPorLitroMedio,
  reaisPorKmMedio,
  carroId,
  combustivelPadrao,
  transacoes,
}: {
  rows: AbastecimentoRow[]
  /** km/l médio from v_carro_resumo (null → '—'). */
  kmPorLitroMedio: number | null
  /** R$/km médio (centavos/km) from v_carro_resumo (null → '—'). */
  reaisPorKmMedio: number | null
  carroId: string
  combustivelPadrao?: string | null
  transacoes: TransacaoOption[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-8">
        <Average label="km/l médio" value={kmPerLitroLabel(kmPorLitroMedio)} />
        <Average label="R$/km médio" value={reaisPerKmLabel(reaisPorKmMedio)} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum abastecimento registrado ainda.
        </p>
      ) : (
        <>
          {/* Desktop (≥md): the dense table. */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Data</TableHead>
                <TableHead className="text-right">Odômetro</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead>Tanque</TableHead>
                <TableHead className="text-right">km/l</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="py-2">
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {ddMM(row.occurred_on)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-sm tabular-nums">
                    {row.odometro_km.toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-sm tabular-nums">
                    {row.litros.toLocaleString('pt-BR', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 3,
                    })}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-sm tabular-nums">
                    {formatCents(row.custo_cents)}
                  </TableCell>
                  <TableCell className="py-2">
                    {row.tanque_cheio ? (
                      <Badge variant="secondary" className="text-xs">
                        Cheio
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-right font-mono text-sm tabular-nums">
                    {kmPerLitroLabel(row.km_por_litro)}
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <RowActions
                      row={row}
                      carroId={carroId}
                      combustivelPadrao={combustivelPadrao}
                      transacoes={transacoes}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Mobile (<md): one card per abastecimento — same cells, card wrapper. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-sm tabular-nums text-muted-foreground">
                      {ddMM(row.occurred_on)}
                    </span>
                    {row.tanque_cheio ? (
                      <Badge variant="secondary" className="w-fit text-xs">
                        Tanque cheio
                      </Badge>
                    ) : null}
                  </div>
                  <RowActions
                    row={row}
                    carroId={carroId}
                    combustivelPadrao={combustivelPadrao}
                    transacoes={transacoes}
                  />
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">Odômetro</dt>
                    <dd className="font-mono tabular-nums">
                      {row.odometro_km.toLocaleString('pt-BR')} km
                    </dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">Litros</dt>
                    <dd className="font-mono tabular-nums">
                      {row.litros.toLocaleString('pt-BR', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 3,
                      })}
                    </dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">Custo</dt>
                    <dd className="font-mono tabular-nums">
                      {formatCents(row.custo_cents)}
                    </dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-xs text-muted-foreground">km/l</dt>
                    <dd className="font-mono tabular-nums">
                      {kmPerLitroLabel(row.km_por_litro)}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
