'use client'

import * as React from 'react'
import { MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { deleteMeiInvoice } from '@/actions/mei'
import { AmountCell } from '@/components/amount-cell'
import { AtividadeBadge } from '@/components/atividade-badge'
import { NfForm } from '@/components/nf-form'
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { centsToEditableBRL, formatCents } from '@/lib/money'
import type { MeiActivityType } from '@/lib/schemas/mei'

export type NfRow = {
  id: string
  issued_on: string // yyyy-MM-dd
  amount_cents: number // GROSS billed value (centavos)
  tomador: string
  descricao: string
  activity_type: MeiActivityType
}

/** "dd/MM" from a yyyy-MM-dd civil date string (no tz ambiguity). */
function ddMM(issuedOn: string): string {
  const [, m, d] = issuedOn.split('-')
  return `${d}/${m}`
}

/** A truncating cell with a tooltip carrying the full text. */
function TruncCell({ text }: { text: string }) {
  const value = text || '—'
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<span className="block max-w-[24ch] truncate">{value}</span>}
        />
        <TooltipContent>{value}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Per-row actions: Editar (opens the NfForm in edit mode, seeded from the row) and
 * Excluir (a destructive alert-dialog confirm → deleteMeiInvoice, ownership
 * re-derived server-side T-05-05). Both dialogs are controlled by the menu.
 */
function NfRowActions({ row, defaultDate }: { row: NfRow; defaultDate: string }) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [isPending, startTransition] = React.useTransition()

  function onDelete() {
    startTransition(async () => {
      const result = await deleteMeiInvoice(row.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Nota fiscal excluída')
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

      <NfForm
        defaultDate={defaultDate}
        open={editOpen}
        onOpenChange={setEditOpen}
        edit={{
          id: row.id,
          issuedOn: row.issued_on,
          amount: centsToEditableBRL(row.amount_cents),
          tomador: row.tomador,
          descricao: row.descricao,
          activityType: row.activity_type,
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nota fiscal</AlertDialogTitle>
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

/**
 * NfTable (UI-SPEC §2) — the dense NF list for the selected year, mirroring the
 * extrato grammar: Data (dd/MM) · Tomador (truncate+tooltip) · Descrição
 * (truncate+tooltip) · Atividade (AtividadeBadge) · Valor (AmountCell, kind='income'
 * — the NF value is GROSS money-in, rendered green `+`) · ações (Editar/Excluir).
 * Rows arrive already sorted by issued_on desc from the page. A totais footer sums
 * the year's gross (mono/600, right-aligned) — the same number the dashboard hero
 * shows. (MEI-01/MEI-03)
 */
export function NfTable({
  rows,
  defaultDate,
}: {
  rows: NfRow[]
  /** Today (SP, yyyy-MM-dd) — seeds a fresh date in the edit form when needed. */
  defaultDate: string
}) {
  const totalCents = rows.reduce((acc, r) => acc + r.amount_cents, 0)

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Data</TableHead>
          <TableHead>Tomador</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Atividade</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="py-2">
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {ddMM(row.issued_on)}
              </span>
            </TableCell>
            <TableCell className="py-2">
              <TruncCell text={row.tomador} />
            </TableCell>
            <TableCell className="py-2">
              <TruncCell text={row.descricao} />
            </TableCell>
            <TableCell className="py-2">
              <AtividadeBadge activityType={row.activity_type} />
            </TableCell>
            <TableCell className="py-2 text-right">
              <AmountCell cents={row.amount_cents} kind="income" />
            </TableCell>
            <TableCell className="py-2 text-right">
              <NfRowActions row={row} defaultDate={defaultDate} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={4} className="font-semibold">
            Receita bruta no ano
          </TableCell>
          <TableCell className="text-right font-mono font-semibold tabular-nums">
            {formatCents(totalCents)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  )
}
