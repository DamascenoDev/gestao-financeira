import Link from 'next/link'

import { AmountCell } from '@/components/amount-cell'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { centsToBigInt } from '@/lib/money'

/**
 * One reserva ledger movement. `kind` is 'in' (entrada/aporte) or 'out' (saída).
 * `transactionId` links an aporte back to its source transação when present (RSV-02).
 */
export type LedgerMovement = {
  id: string
  occurred_on: string // yyyy-MM-dd
  kind: string // 'in' | 'out'
  amount_cents: number
  note: string
  transaction_id: string | null
}

/** "dd/MM" from a yyyy-MM-dd date string (civil date — no tz ambiguity). */
function ddMM(occurredOn: string): string {
  const [, m, d] = occurredOn.split('-')
  return `${d}/${m}`
}

/**
 * ReservaLedgerTable (RSV-04) — the per-reserva movement history. Newest first
 * (caller orders the rows). Columns: Data (dd/MM) · Tipo (badge Entrada/Saída) ·
 * Descrição · Valor (AmountCell: entrada green `+`, saída neutral `−`) · vínculo
 * (link to the source transação when transaction_id is set). On mobile (<md) each
 * movimento collapses to a single card (Tipo + Valor on top, Data + Descrição
 * below), mirroring the Extrato mobile pattern.
 */
export function ReservaLedgerTable({ rows }: { rows: LedgerMovement[] }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Data</TableHead>
              <TableHead className="w-24">Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-24 text-right">Vínculo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isEntrada = row.kind === 'in'
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm tabular-nums text-muted-foreground">
                    {ddMM(row.occurred_on)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={isEntrada ? 'secondary' : 'outline'}>
                      {isEntrada ? 'Entrada' : 'Saída'}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.note || '—'}</TableCell>
                  <TableCell className="text-right">
                    <AmountCell
                      cents={centsToBigInt(row.amount_cents)}
                      kind={isEntrada ? 'income' : 'expense'}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.transaction_id ? (
                      <Link
                        href="/extrato"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        Ver lançamento
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const isEntrada = row.kind === 'in'
          return (
            <li
              key={row.id}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between">
                <Badge variant={isEntrada ? 'secondary' : 'outline'}>
                  {isEntrada ? 'Entrada' : 'Saída'}
                </Badge>
                <AmountCell
                  cents={centsToBigInt(row.amount_cents)}
                  kind={isEntrada ? 'income' : 'expense'}
                />
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="font-mono tabular-nums">{ddMM(row.occurred_on)}</span>
                <span className="truncate pl-3">{row.note || '—'}</span>
              </div>
              {row.transaction_id ? (
                <Link
                  href="/extrato"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Ver lançamento
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
