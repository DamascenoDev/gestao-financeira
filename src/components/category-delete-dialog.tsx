'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  archiveCategory,
  deleteCategory,
  reassignAndDelete,
} from '@/actions/categories'
import { CategoryDot } from '@/components/category-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CategoryKind } from '@/lib/schemas/category'

type TargetCategory = {
  id: string
  name: string
  color: string | null
  kind: CategoryKind
}

/**
 * category-delete-dialog (UI-SPEC §2 / Copywriting Contract). The page passes the
 * category's current tx_count (from v_category_totals) so the dialog branches
 * synchronously: txCount>0 → the safe branch "Esta categoria tem {n} transações.
 * Você não pode excluí-la diretamente." with [Arquivar] (archiveCategory) and
 * [Reatribuir e remover] (target-category Select → reassignAndDelete); txCount==0 →
 * the standard "Excluir categoria — Esta ação não pode ser desfeita." confirm that
 * calls deleteCategory (with its v_category_totals pre-check + 23503 backstop as a
 * race-safe net).
 */
export function CategoryDeleteDialog({
  category,
  targets,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  category: { id: string; name: string; kind: CategoryKind; txCount: number }
  /** Other (non-archived) categories the user can reassign transactions to. */
  targets: TargetCategory[]
  trigger?: React.ReactElement
  /** Controlled open state (omit to use the built-in trigger). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = isControlled ? controlledOpen! : uncontrolledOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (isControlled) onOpenChange?.(next)
      else setUncontrolledOpen(next)
    },
    [isControlled, onOpenChange],
  )
  const [isPending, startTransition] = useTransition()
  const [target, setTarget] = React.useState<string>('')

  const blocked = category.txCount > 0
  // MD-01: only offer SAME-kind targets. Reassigning a consumo category's
  // transactions into an alocação category (or vice-versa) silently reclassifies
  // "gastos de consumo" as "alocação" — corrupting the very distinction the app
  // tracks for goal/adherence reporting. The action re-asserts this server-side.
  const reassignTargets = targets.filter(
    (t) => t.id !== category.id && t.kind === category.kind,
  )

  function close() {
    setOpen(false)
    setTarget('')
  }

  function onDelete() {
    startTransition(async () => {
      const result = await deleteCategory(category.id)
      if ('blocked' in result) {
        // Race: a transaction landed between render and confirm — never destructive.
        toast.error(
          `Esta categoria passou a ter ${result.txCount} ${
            result.txCount === 1 ? 'transação' : 'transações'
          }. Arquive-a ou reatribua antes.`,
        )
        close()
        return
      }
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Categoria excluída.')
      close()
    })
  }

  function onArchive() {
    startTransition(async () => {
      const result = await archiveCategory(category.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Categoria arquivada.')
      close()
    })
  }

  function onReassign() {
    if (!target) {
      toast.error('Selecione uma categoria de destino.')
      return
    }
    startTransition(async () => {
      const result = await reassignAndDelete(category.id, target)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Transações reatribuídas e categoria removida.')
      close()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      {isControlled ? null : trigger ? (
        <AlertDialogTrigger render={trigger} />
      ) : null}
      <AlertDialogContent>
        {blocked ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Não é possível excluir</AlertDialogTitle>
              <AlertDialogDescription>
                Esta categoria tem {category.txCount}{' '}
                {category.txCount === 1 ? 'transação' : 'transações'}. Você não
                pode excluí-la diretamente. Arquive-a ou reatribua as transações
                a outra categoria antes.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {reassignTargets.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">
                  Reatribuir transações para
                </span>
                <Select
                  value={target}
                  onValueChange={(v) => setTarget(v ?? '')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Escolha uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {reassignTargets.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="inline-flex items-center gap-2">
                          <CategoryDot color={t.color} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={onArchive}
              >
                Arquivar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isPending || reassignTargets.length === 0}
                onClick={onReassign}
              >
                Reatribuir e remover
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir categoria</AlertDialogTitle>
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
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
