'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { Archive, ArchiveRestore, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { archiveCarro, unarchiveCarro } from '@/actions/carros'
import { CarroForm } from '@/components/carro-form'
import { toCarroEdit, type CarroCardData } from '@/components/carro-card'
import { Button } from '@/components/ui/button'

/**
 * Header actions for /carros/[id] (CAR-01): "Editar" (the same controlled CarroForm
 * edit dialog) + the Arquivar/Desarquivar soft toggle (reversible, neutral, toast —
 * no AlertDialog, no destructive styling). Identity only; no money.
 */
export function CarroDetailActions({ carro }: { carro: CarroCardData }) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [isPending, startTransition] = useTransition()

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
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
        <Pencil />
        Editar
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={onToggleArchive}
      >
        {carro.isArchived ? <ArchiveRestore /> : <Archive />}
        {carro.isArchived ? 'Desarquivar' : 'Arquivar'}
      </Button>
      <CarroForm
        edit={toCarroEdit(carro)}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  )
}
