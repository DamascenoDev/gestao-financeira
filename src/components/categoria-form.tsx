'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import {
  CATEGORY_COLORS,
  type CategoryColor,
  type CategoryKind,
} from '@/lib/schemas/category'
import { SWATCH_OKLCH } from '@/components/category-badge'
import {
  createCategory,
  renameCategory,
  setColor,
  setKind,
} from '@/actions/categories'
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** Seed categories consumed by a downstream feature flow (warn on edit). */
const FEATURE_CATEGORIES = new Set(['Reserva'])

const SWATCH_LABELS: Record<CategoryColor, string> = {
  slate: 'Ardósia',
  red: 'Vermelho',
  amber: 'Âmbar',
  green: 'Verde',
  teal: 'Turquesa',
  blue: 'Azul',
  violet: 'Violeta',
  pink: 'Rosa',
}

type ControlledProps = {
  /** Controlled open state (omit to use the built-in trigger). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type CategoriaFormProps = ControlledProps &
  (
    | {
        mode?: 'create'
        trigger?: React.ReactElement
      }
    | {
        mode: 'edit'
        category: {
          id: string
          name: string
          kind: CategoryKind
          color: string | null
        }
        trigger?: React.ReactElement
      }
  )

/**
 * "Nova categoria" / edit dialog (UI-SPEC §2 Categorias). nome (input) + tipo
 * (consumo/alocação switch, default consumo, CAT-03) + the 8-swatch color picker;
 * when editing a feature seed category (e.g. Reserva) an inline muted warning is
 * shown. Mirrors receita-form's manual-state + useTransition + toast pattern.
 *
 * On create → createCategory(formData). On edit → persists each changed field via
 * the single-field actions (renameCategory / setKind / setColor) so the inline
 * row toggles and the dialog share the same action surface.
 */
export function CategoriaForm(props: CategoriaFormProps) {
  const isEdit = props.mode === 'edit'
  const editing = isEdit ? props.category : null

  const isControlled = props.open !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = isControlled ? props.open! : uncontrolledOpen
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (isControlled) props.onOpenChange?.(next)
      else setUncontrolledOpen(next)
    },
    [isControlled, props],
  )

  const [isPending, startTransition] = useTransition()
  const [name, setName] = React.useState(editing?.name ?? '')
  const [kind, setKindState] = React.useState<CategoryKind>(
    editing?.kind ?? 'consumo',
  )
  const [color, setColorState] = React.useState<CategoryColor | null>(
    (editing?.color as CategoryColor | null) ?? null,
  )
  const [error, setError] = React.useState<string | null>(null)

  const isFeatureCategory = isEdit && FEATURE_CATEGORIES.has(editing!.name)

  function reset() {
    setName(editing?.name ?? '')
    setKindState(editing?.kind ?? 'consumo')
    setColorState((editing?.color as CategoryColor | null) ?? null)
    setError(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError('Informe o nome')
      return
    }
    setError(null)

    startTransition(async () => {
      if (!isEdit) {
        const formData = new FormData()
        formData.set('name', name.trim())
        formData.set('kind', kind)
        if (color) formData.set('color', color)
        const result = await createCategory(formData)
        if ('error' in result) {
          toast.error(result.error)
          return
        }
        toast.success('Categoria criada.')
        reset()
        setOpen(false)
        return
      }

      // Edit: persist only the fields that changed via single-field actions.
      const cat = editing!
      const ops: Promise<{ error: string } | { ok: true }>[] = []
      if (name.trim() !== cat.name) ops.push(renameCategory(cat.id, name.trim()))
      if (kind !== cat.kind) ops.push(setKind(cat.id, kind))
      if (color && color !== cat.color) ops.push(setColor(cat.id, color))

      if (ops.length === 0) {
        setOpen(false)
        return
      }
      const results = await Promise.all(ops)
      const failed = results.find((r) => 'error' in r) as
        | { error: string }
        | undefined
      if (failed) {
        toast.error(failed.error)
        return
      }
      toast.success('Categoria atualizada.')
      setOpen(false)
    })
  }

  const defaultTrigger = <Button type="button">Nova categoria</Button>

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isControlled ? null : (
        <DialogTrigger render={props.trigger ?? defaultTrigger} />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Atualize o nome, o tipo ou a cor da categoria.'
              : 'Crie uma categoria para organizar seus gastos.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="cat-name">Nome</FieldLabel>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Alimentação"
                aria-invalid={!!error}
                maxLength={60}
              />
              {isFeatureCategory ? (
                <FieldDescription className="text-muted-foreground">
                  Esta categoria é usada pelo fluxo de reservas — alterá-la pode
                  afetar relatórios.
                </FieldDescription>
              ) : null}
              <FieldError errors={error ? [{ message: error }] : undefined} />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="cat-kind">
                {kind === 'alocacao' ? 'Alocação' : 'Consumo'}
              </FieldLabel>
              <Switch
                id="cat-kind"
                checked={kind === 'alocacao'}
                onCheckedChange={(checked) =>
                  setKindState(checked ? 'alocacao' : 'consumo')
                }
              />
            </Field>

            <Field>
              <FieldLabel>Cor</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => {
                  const selected = color === c
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-label={SWATCH_LABELS[c]}
                      aria-pressed={selected}
                      onClick={() => setColorState(selected ? null : c)}
                      className={cn(
                        'size-7 rounded-full ring-offset-2 ring-offset-background transition-[box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selected ? 'ring-2 ring-ring' : 'hover:ring-1 hover:ring-border',
                      )}
                      style={{ backgroundColor: SWATCH_OKLCH[c] }}
                    />
                  )
                })}
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose
              render={<Button type="button" variant="outline">Cancelar</Button>}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
