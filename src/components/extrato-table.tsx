'use client'

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import * as React from 'react'
import { toast } from 'sonner'

import { AmountCell } from '@/components/amount-cell'
import { CategoryBadge } from '@/components/category-badge'
import { ReservaPicker, type ReservaOption } from '@/components/reserva-picker'
import {
  SelectionActionBar,
  type SelectionCategory,
} from '@/components/selection-action-bar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { bulkReclassify, updateTransaction } from '@/actions/transactions'
import { cn } from '@/lib/utils'

export type ExtratoRow = {
  id: string
  occurred_on: string // yyyy-MM-dd
  description: string
  amount_cents: bigint // MD-04: integer-cents, never a lossy number
  category_id: string | null
}

export type ExtratoCategory = {
  id: string
  name: string
  color: string | null
  /** RSV-02: re-tagging into this category opens the focused "Qual reserva?" dialog. */
  isReserva?: boolean
}

export type CategoryTotal = {
  categoryId: string | null
  name: string
  color: string | null
  totalCents: bigint // MD-04: integer-cents, never a lossy number
}

/** "dd/MM" from a yyyy-MM-dd date string (no tz ambiguity — it's a civil date). */
function ddMM(occurredOn: string): string {
  const [, m, d] = occurredOn.split('-')
  return `${d}/${m}`
}

/**
 * Inline category editor — a small Select that calls updateTransaction directly
 * (UI-SPEC §3 "inline category edit"). Keeps the full description/amount/date so
 * the action's transactionSchema validates on a category-only change.
 *
 * RSV-02 (UI-SPEC §4): re-tagging a row INTO the is_reserva category has no open
 * dialog to host the "Qual reserva?" picker, so this cell opens a small FOCUSED
 * dialog containing just the ReservaPicker; on confirm it sends the chosen
 * reservaId through updateTransaction (which links the aporte 'in' entry). Re-tagging
 * AWAY from Reserva is the plain path — updateTransaction now removes the linked
 * ledger entry so the saldo re-derives (no silent orphan).
 */
function InlineCategoryCell({
  row,
  categories,
  reservas,
}: {
  row: ExtratoRow
  categories: ExtratoCategory[]
  reservas: ReservaOption[]
}) {
  const [, startTransition] = React.useTransition()
  const current = categories.find((c) => c.id === row.category_id)

  // Focused re-tag dialog: holds the pending Reserva category + the chosen reserva.
  const [pendingCategoryId, setPendingCategoryId] = React.useState<string | null>(
    null,
  )
  const [reservaId, setReservaId] = React.useState('')
  const [reservaError, setReservaError] = React.useState<string | undefined>()
  const [isSaving, setIsSaving] = React.useState(false)

  function apply(categoryId: string, reservaIdToSend?: string) {
    const fd = new FormData()
    fd.set('description', row.description)
    fd.set('amount', centsToEditableBRL(row.amount_cents))
    fd.set('categoryId', categoryId)
    fd.set('occurredOn', row.occurred_on)
    if (reservaIdToSend) fd.set('reservaId', reservaIdToSend)
    startTransition(async () => {
      const result = await updateTransaction(row.id, fd)
      if ('error' in result) toast.error(result.error)
      else toast.success('Categoria atualizada')
    })
  }

  function onChange(next: string) {
    if (!next || next === row.category_id) return
    const target = categories.find((c) => c.id === next)
    if (target?.isReserva) {
      // Open the focused picker dialog instead of writing immediately.
      setPendingCategoryId(next)
      setReservaId('')
      setReservaError(undefined)
      return
    }
    apply(next)
  }

  function confirmReserva() {
    if (!reservaId) {
      setReservaError('Selecione uma reserva.')
      return
    }
    if (pendingCategoryId) {
      setIsSaving(true)
      apply(pendingCategoryId, reservaId)
      setIsSaving(false)
      setPendingCategoryId(null)
    }
  }

  return (
    <>
      <Select value={row.category_id ?? null} onValueChange={(v) => onChange(v ?? '')}>
        <SelectTrigger
          size="sm"
          className="border-transparent bg-transparent hover:border-input"
          aria-label="Alterar categoria"
        >
          <SelectValue
            placeholder={<span className="text-muted-foreground">Sem categoria</span>}
          >
            {current ? (
              <CategoryBadge name={current.name} color={current.color} />
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <CategoryBadge name={c.name} color={c.color} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog
        open={pendingCategoryId !== null}
        onOpenChange={(o) => {
          if (!o) setPendingCategoryId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Qual reserva?</DialogTitle>
            <DialogDescription>
              Classificar como Reserva registra este lançamento como aporte.
            </DialogDescription>
          </DialogHeader>
          <ReservaPicker
            id="extrato-reserva"
            reservas={reservas}
            value={reservaId}
            onChange={(v) => {
              setReservaId(v)
              setReservaError(undefined)
            }}
            error={reservaError}
          />
          <DialogFooter className="mt-6">
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              }
            />
            <Button type="button" onClick={confirmReserva} disabled={isSaving}>
              Confirmar aporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Extrato table (UI-SPEC §3) — the central, dense, selectable transaction grid.
 * @tanstack/react-table with getRowId = tx.id (stable selection across renders,
 * Phase-4 reusable), columns checkbox / Data dd/MM / Descrição (truncate+tooltip)
 * / Categoria (inline-editable CategoryBadge) / Valor (AmountCell mono, neutral
 * expense color — never red). Sort by data desc default. Per-category + grand
 * totals footer (from v_category_totals). Selected ids feed the SelectionActionBar
 * → bulkReclassify with a sonner success toast.
 */
export function ExtratoTable({
  rows,
  categories,
  reservas = [],
  categoryTotals,
  grandTotalCents,
}: {
  rows: ExtratoRow[]
  categories: ExtratoCategory[]
  /** RSV-02: the user's reservas — feeds the focused re-tag "Qual reserva?" dialog. */
  reservas?: ReservaOption[]
  categoryTotals: CategoryTotal[]
  grandTotalCents: bigint
}) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'occurred_on', desc: true },
  ])

  const selectCategories: SelectionCategory[] = React.useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name })),
    [categories],
  )

  const columns = React.useMemo<ColumnDef<ExtratoRow>[]>(
    () => [
      {
        id: 'select',
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={
              table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
            }
            onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
            aria-label="Selecionar todas"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Selecionar linha"
          />
        ),
      },
      {
        accessorKey: 'occurred_on',
        header: 'Data',
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {ddMM(row.original.occurred_on)}
          </span>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Descrição',
        enableSorting: false,
        cell: ({ row }) => {
          const text = row.original.description || '—'
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="block max-w-[28ch] truncate">{text}</span>
                  }
                />
                <TooltipContent>{text}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        },
      },
      {
        accessorKey: 'category_id',
        header: 'Categoria',
        enableSorting: false,
        cell: ({ row }) => (
          <InlineCategoryCell
            row={row.original}
            categories={categories}
            reservas={reservas}
          />
        ),
      },
      {
        accessorKey: 'amount_cents',
        header: () => <div className="text-right">Valor</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <AmountCell
              cents={row.original.amount_cents}
              kind="expense"
              signed={false}
            />
          </div>
        ),
      },
    ],
    [categories, reservas],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { rowSelection, sorting },
    getRowId: (r) => r.id, // stable id = transaction.id (Phase-4 reusable)
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const selectedIds = Object.keys(rowSelection)

  async function applyBulk(categoryId: string) {
    const n = selectedIds.length
    const result = await bulkReclassify(selectedIds, categoryId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success(`${n} ${n === 1 ? 'transação reclassificada' : 'transações reclassificadas'}`)
    }
    return result
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const canSort = header.column.getCanSort()
              return (
                <TableHead
                  key={header.id}
                  className={cn(
                    header.column.id === 'select' && 'w-10',
                    header.column.id === 'occurred_on' && 'w-16',
                    canSort && 'cursor-pointer select-none',
                  )}
                  onClick={
                    canSort
                      ? header.column.getToggleSortingHandler()
                      : undefined
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                  {canSort
                    ? { asc: ' ↑', desc: ' ↓' }[
                        header.column.getIsSorted() as string
                      ] ?? null
                    : null}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? 'selected' : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          {categoryTotals.map((t) => (
            <TableRow key={t.categoryId ?? 'sem-categoria'}>
              <TableCell colSpan={3} />
              <TableCell>
                <CategoryBadge name={t.name} color={t.color} />
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums">
                {formatCents(t.totalCents)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={3} />
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className="text-right font-mono font-semibold tabular-nums">
              {formatCents(grandTotalCents)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <SelectionActionBar
        selectedIds={selectedIds}
        categories={selectCategories}
        onApply={applyBulk}
        onClear={() => setRowSelection({})}
      />
    </div>
  )
}
