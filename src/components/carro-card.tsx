'use client'

import * as React from 'react'
import { useTransition } from 'react'
import Link from 'next/link'
import { FuelIcon, MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { archiveCarro, unarchiveCarro } from '@/actions/carros'
import { AbastecimentoForm } from '@/components/abastecimento-form'
import { CarroForm, type CarroEdit } from '@/components/carro-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { kmPerLitroLabel } from '@/lib/carro/consumo'
import { formatCents } from '@/lib/money'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type CarroCardData = {
  id: string
  apelido: string
  modelo: string | null
  placa: string | null
  ano: number | null
  combustivelPadrao: string | null
  isArchived: boolean
  /** Gasto total em centavos (v_carro_resumo). null = sem dados → '—' (nunca R$ 0,00). */
  gastoTotalCents: number | null
  /** Consumo médio km/l (v_carro_resumo). null = sem intervalo fechado → '—' (nunca 0 km/l). */
  kmPorLitroMedio: number | null
}

/**
 * Render the km/l médio value for the list KPI strip: the frozen kmPerLitroLabel
 * returns just the number ("12,4") or the '—' sentinel; for a standalone KPI the
 * unit travels with the value. Append " km/l" only when there is a real number —
 * the sentinel stays bare (never "— km/l", never "0 km/l").
 */
function kmPorLitroKpiLabel(kmPorLitro: number | null): string {
  const label = kmPerLitroLabel(kmPorLitro)
  return label === '—' ? label : `${label} km/l`
}

/** Join the non-null identity fields with a middot (omit empties). */
function identityLine(carro: CarroCardData): string {
  return [carro.modelo, carro.placa, carro.ano !== null ? String(carro.ano) : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
}

/** Map a CarroCardData to the CarroForm edit shape (DB nulls → empty strings). */
export function toCarroEdit(carro: CarroCardData): CarroEdit {
  return {
    id: carro.id,
    apelido: carro.apelido,
    modelo: carro.modelo ?? '',
    placa: carro.placa ?? '',
    ano: carro.ano !== null ? String(carro.ano) : '',
    combustivel: carro.combustivelPadrao ?? '',
  }
}

/**
 * CarroCard (CAR-01 / CAR-05.2) — a --card surface showing car identity: apelido
 * (links to /carros/[id]) · modelo · placa · ano · combustível badge · "Arquivado"
 * badge, plus an additive two-up KPI strip (gasto total + km/l médio from
 * v_carro_resumo). KPIs are neutral foreground; missing data shows '—' (NEVER a
 * placeholder zero). Per-card actions via a DropdownMenu (mirrors ReservaCard):
 * Editar (controlled CarroForm) + Arquivar/Desarquivar (soft reversible toggle +
 * toast, no AlertDialog, no destructive styling).
 */
export function CarroCard({ carro }: { carro: CarroCardData }) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [isPending, startTransition] = useTransition()

  const secondary = identityLine(carro)

  function onToggleArchive() {
    startTransition(async () => {
      const result = carro.isArchived
        ? await unarchiveCarro(carro.id)
        : await archiveCarro(carro.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(carro.isArchived ? 'Carro desarquivado' : 'Carro arquivado')
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">
              <Link href={`/carros/${carro.id}`} className="hover:underline">
                {carro.apelido}
              </Link>
            </h2>
            {secondary ? (
              <span className="text-xs text-muted-foreground">{secondary}</span>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {carro.combustivelPadrao ? (
                <Badge variant="outline" className="text-xs">
                  {carro.combustivelPadrao}
                </Badge>
              ) : null}
              {carro.isArchived ? (
                <Badge variant="secondary" className="text-xs">
                  Arquivado
                </Badge>
              ) : null}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ações do carro ${carro.apelido}`}
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isPending} onClick={onToggleArchive}>
                {carro.isArchived ? 'Desarquivar' : 'Arquivar'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/*
          Additive KPI strip (CAR-05.2) — gasto total + km/l médio from
          v_carro_resumo. Mirrors ReceitaGastoChart's labeled-total grammar
          (text-muted-foreground label over a mono tabular-nums value). Neutral
          foreground (no gold, never red). Always renders both labels; null data
          shows the '—' sentinel — NEVER "R$ 0,00", NEVER "0 km/l" (D4 null rule).
        */}
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Gasto total</dt>
            <dd className="font-mono text-sm font-semibold tabular-nums">
              {carro.gastoTotalCents === null
                ? '—'
                : formatCents(carro.gastoTotalCents)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">km/l médio</dt>
            <dd className="font-mono text-sm font-semibold tabular-nums">
              {kmPorLitroKpiLabel(carro.kmPorLitroMedio)}
            </dd>
          </div>
        </dl>

        {/*
          Registro rápido (CAR-07, D-03) — a visible "Novo abastecimento" button on
          the card face (NOT in the ⋯ menu, which stays Editar/Arquivar only). Hosts
          the shared AbastecimentoForm in manual-only mode (D-01/D-02): só Manual |
          Parcelado, sem "Da fatura". The list never fetches unlinked lançamentos, so
          `transacoes` is empty — the manual-only branch never renders the picker.
          Reuses the carro's id + combustível padrão already in CarroCardData; the
          write goes through createAbastecimento (IDOR-safe, revalidates /carros).
        */}
        <AbastecimentoForm
          carroId={carro.id}
          combustivelPadrao={carro.combustivelPadrao}
          transacoes={[]}
          manualOnly
          trigger={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
            >
              <FuelIcon />
              Novo abastecimento
            </Button>
          }
        />
      </CardContent>

      <CarroForm
        edit={toCarroEdit(carro)}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </Card>
  )
}
