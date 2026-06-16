'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  deleteBudgetTarget,
  upsertBudgetTarget,
} from '@/actions/budget-targets'
import { CategoryBadge } from '@/components/category-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { directionForKind, type Direction } from '@/lib/adherence'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

export type MetaCategory = {
  id: string
  name: string
  color: string | null
  kind: 'consumo' | 'alocacao'
  /** Current meta in basis-points (3000 = 30%), null when no meta is set yet. */
  percentBp: number | null
  /** Current direction, defaulting from kind when no meta exists. */
  direction: Direction | null
}

type RowState = {
  /** Raw % text the user types (one decimal allowed), e.g. "30" or "12,5". */
  percentText: string
  direction: Direction
}

/**
 * Parse a pt-BR percent string ("30", "12,5") into integer basis-points (3000, 1250).
 * Returns null when blank (meaning "clear the meta") and NaN-safe rejects garbage.
 * One decimal place; clamps nothing here — validation/soft-warn happens in the UI.
 */
function percentTextToBp(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d{1,3}(,\d)?$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(value) || value <= 0 || value > 100) return 'invalid'
  return Math.round(value * 100)
}

function bpToPercentText(bp: number | null): string {
  if (bp === null) return ''
  // bp is integer basis-points; render with up to one decimal, pt-BR comma.
  const pct = bp / 100
  return Number.isInteger(pct)
    ? String(pct)
    : pct.toFixed(1).replace('.', ',')
}

/**
 * MetaDialog (BUD-01) — a per-category surface to set a % meta with a direction. Each
 * category row: CategoryBadge · a % numeric input (0–100, one decimal) · a Teto↔Alvo
 * switch defaulting from the category kind (consumo→teto, alocacao→alvo; user-editable)
 * · a live R$ preview = formatCents(round(incomeCents × percentBp / 10000)) recomputed
 * as the user types. Soft-warns (does not block) when the SUM of teto metas > 100%. On
 * save calls upsertBudgetTarget; clearing the % calls deleteBudgetTarget. Mirrors
 * transacao-form's manual-state + useTransition + sonner pattern. Copy pt-BR
 * (UI-SPEC Copywriting Contract).
 */
export function MetaDialog({
  categories,
  incomeCents,
  trigger,
}: {
  categories: MetaCategory[]
  /** Net income of the period, drives the live R$ preview. */
  incomeCents: number
  trigger?: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [isPending, startTransition] = useTransition()

  const [rows, setRows] = React.useState<Record<string, RowState>>(() =>
    initialRows(categories),
  )

  // Re-seed when the dialog opens so server-truth (the latest categories/metas) wins
  // over stale local edits — done in the open-change handler rather than an effect to
  // avoid a cascading-render setState-in-effect.
  function handleOpenChange(next: boolean) {
    if (next) setRows(initialRows(categories))
    setOpen(next)
  }

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }))
  }

  // Soft-warn when the SUM of teto metas > 100% (UI-SPEC §2).
  const tetoSumBp = categories.reduce((sum, c) => {
    const row = rows[c.id]
    if (!row || row.direction !== 'teto') return sum
    const bp = percentTextToBp(row.percentText)
    return typeof bp === 'number' ? sum + bp : sum
  }, 0)
  const tetoSumOver = tetoSumBp > 10000

  function onSaveRow(cat: MetaCategory) {
    const row = rows[cat.id]
    if (!row) return
    const bp = percentTextToBp(row.percentText)
    if (bp === 'invalid') {
      toast.error('Informe uma porcentagem entre 0 e 100.')
      return
    }

    startTransition(async () => {
      // Clearing the % removes the meta.
      if (bp === null) {
        const result = await deleteBudgetTarget(cat.id)
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        toast.success(`Meta de ${cat.name} removida`)
        return
      }
      const result = await upsertBudgetTarget({
        categoryId: cat.id,
        percentBp: bp,
        direction: row.direction,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Meta de ${cat.name} salva`)
    })
  }

  const defaultTrigger = (
    <Button type="button" size="sm">
      Definir metas
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Definir metas</DialogTitle>
          <DialogDescription>
            Defina uma meta em % da sua receita líquida para cada categoria. Teto
            (não exceder) ou Alvo (atingir).
          </DialogDescription>
        </DialogHeader>

        {tetoSumOver ? (
          <p className="text-consumption text-xs">
            Suas metas de teto somam mais de 100% da receita.
          </p>
        ) : null}

        <div className="flex flex-col divide-y">
          {categories.map((cat) => {
            const row = rows[cat.id]!
            const bp = percentTextToBp(row.percentText)
            const previewCents =
              typeof bp === 'number'
                ? Math.round((incomeCents * bp) / 10000)
                : 0
            const isAlvo = row.direction === 'alvo'
            const helper =
              typeof bp === 'number'
                ? `${isAlvo ? 'Atingir' : 'Não exceder'} ${formatCents(previewCents)}`
                : 'Sem meta'
            return (
              <div key={cat.id} className="flex flex-col gap-2 py-3">
                <CategoryBadge name={cat.name} color={cat.color} kind={cat.kind} />
                <div className="flex flex-wrap items-end gap-3">
                  <Field className="w-24">
                    <FieldLabel htmlFor={`meta-pct-${cat.id}`}>%</FieldLabel>
                    <Input
                      id={`meta-pct-${cat.id}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={row.percentText}
                      onChange={(e) =>
                        setRow(cat.id, { percentText: e.target.value })
                      }
                      className="font-mono tabular-nums"
                    />
                  </Field>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-xs',
                        !isAlvo ? 'text-foreground font-medium' : 'text-muted-foreground',
                      )}
                    >
                      Teto
                    </span>
                    <Switch
                      checked={isAlvo}
                      onCheckedChange={(checked) =>
                        setRow(cat.id, { direction: checked ? 'alvo' : 'teto' })
                      }
                      aria-label={`Direção da meta de ${cat.name}`}
                    />
                    <span
                      className={cn(
                        'text-xs',
                        isAlvo ? 'text-foreground font-medium' : 'text-muted-foreground',
                      )}
                    >
                      Alvo
                    </span>
                  </div>

                  <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
                    {helper}
                  </span>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => onSaveRow(cat)}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter className="mt-4">
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Fechar
              </Button>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function initialRows(categories: MetaCategory[]): Record<string, RowState> {
  const next: Record<string, RowState> = {}
  for (const c of categories) {
    next[c.id] = {
      percentText: bpToPercentText(c.percentBp),
      direction: c.direction ?? directionForKind(c.kind),
    }
  }
  return next
}
