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
import { centsToBigInt, centsToEditableBRL, formatCents } from '@/lib/money'
import type { MeiActivityType } from '@/lib/schemas/mei'

export type NfRow = {
  id: string
  issued_on: string // yyyy-MM-dd
  // GROSS billed value (centavos). `number | bigint` because supabase-js may surface
  // the Postgres bigint column as either; summed via centsToBigInt (MD-04, MD-01).
  amount_cents: number | bigint
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
  // Sum on bigint and coerce each amount at the data boundary — never via a lossy
  // Number() cast or a raw `+` that becomes string concatenation if supabase-js
  // surfaces the bigint column as a string (MD-04 convention, the sibling money
  // tables' pattern). The total is then formatted bigint-safe via formatCents (MD-01).
  const totalCents = rows.reduce(
    (acc, r) => acc + centsToBigInt(r.amount_cents),
    0n,
  )

  return (
    <>
      {/* Desktop (≥md): the dense NF table — actions/total frozen. */}
      <Table className="hidden md:table">
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

      {/* Mobile (<md): one card per NF — same cells, only the wrapper changes.
          Tomador/descrição + AtividadeBadge on top, Data + AmountCell (income mono)
          below; per-row Editar/Excluir stay accessible via NfRowActions. The year
          total collapses to a compact footer. No prop/action change (frozen). */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <TruncCell text={row.tomador} />
                <span className="truncate text-sm text-muted-foreground">
                  {row.descricao || '—'}
                </span>
                <AtividadeBadge activityType={row.activity_type} />
              </div>
              <NfRowActions row={row} defaultDate={defaultDate} />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {ddMM(row.issued_on)}
              </span>
              <AmountCell cents={row.amount_cents} kind="income" />
            </div>
          </li>
        ))}
        <li className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
          <span className="text-sm font-semibold">Receita bruta no ano</span>
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatCents(totalCents)}
          </span>
        </li>
      </ul>
    </>
  )
}
