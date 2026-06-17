'use client'

import * as React from 'react'
import { useTransition } from 'react'
import Link from 'next/link'
import { MoreHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'

import { archiveCarro, unarchiveCarro } from '@/actions/carros'
import { CarroForm, type CarroEdit } from '@/components/carro-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
 * CarroCard (CAR-01) — a --card surface showing car IDENTITY ONLY: apelido (links to
 * /carros/[id]) · modelo · placa · ano · combustível badge · "Arquivado" badge. No
 * KPIs, no money (gasto total / km/l are deferred to Phases 9-11 — do NOT render
 * placeholder zeros). Per-card actions via a DropdownMenu (mirrors ReservaCard):
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
      </CardContent>

      <CarroForm
        edit={toCarroEdit(carro)}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </Card>
  )
}
