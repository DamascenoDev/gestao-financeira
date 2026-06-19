'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'

import { addKeyword, removeKeyword } from '@/actions/category-keywords'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

type CategoryKeyword = { id: string; keyword: string }

type CategoryKeywordsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: { id: string; name: string }
  keywords: CategoryKeyword[]
}

/**
 * Controlled per-category keyword dialog (KW-01, UI surface). Mirrors the
 * categoria-form.tsx dialog skeleton (controlled open/onOpenChange + useTransition
 * + sonner toast) and the removable-chip recipe from category-filter.tsx:106-122.
 *
 * Persistence is IMMEDIATE per action (add/remove), never batch-on-close: there is
 * no "Salvar" — the footer is a single "Fechar". The chip's X is a neutral muted
 * control (NOT destructive-red, NO confirm dialog) because removing a keyword is a
 * reversible edit. Chips display the NORMALIZED keyword (the action normalizes on
 * save); the server stays the source of truth (revalidatePath re-renders the page
 * and the refreshed list flows back via props). NO match preview / tx-count /
 * source / auto-suggestion surface here — that is Phase 20 / KW-F1.
 *
 * Copy/labels/states are LOCKED in 19-UI-SPEC.md §Copywriting Contract.
 */
export function CategoryKeywordsDialog({
  open,
  onOpenChange,
  category,
  keywords,
}: CategoryKeywordsDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function handleRemove(kw: CategoryKeyword) {
    startTransition(async () => {
      const r = await removeKeyword(kw.id)
      if ('error' in r) toast.error(r.error)
      else toast.success('Palavra-chave removida.')
    })
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const raw = value.trim()
    if (!raw) {
      setError('Informe uma palavra-chave.')
      return
    }
    setError(null)

    startTransition(async () => {
      const r = await addKeyword(category.id, raw)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      if ('duplicate' in r) {
        toast.info(`"${raw}" já está cadastrada nesta categoria.`)
        return
      }
      // { ok: true }: persisted — clear + return focus to the input so the user
      // can keep typing the next keyword without reaching for the mouse.
      toast.success('Palavra-chave adicionada.')
      setValue('')
      inputRef.current?.focus()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Palavras-chave — {category.name}</DialogTitle>
          <DialogDescription>
            Adicione termos que identificam gastos desta categoria. Eles serão
            usados para classificar automaticamente futuras faturas.
          </DialogDescription>
        </DialogHeader>

        {keywords.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nenhuma palavra-chave</EmptyTitle>
              <EmptyDescription>
                Adicione um termo abaixo (ex.: &quot;uber&quot;) para começar a
                classificar esta categoria automaticamente.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <Badge key={kw.id} variant="secondary" className="gap-1">
                {kw.keyword}
                <button
                  type="button"
                  aria-label={`Remover palavra-chave ${kw.keyword}`}
                  className="ml-0.5 inline-flex"
                  disabled={isPending}
                  onClick={() => handleRemove(kw)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="kw-input">Nova palavra-chave</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="kw-input"
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Ex.: uber"
                aria-invalid={!!error}
                maxLength={60}
                autoFocus
              />
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Adicionando…' : 'Adicionar'}
              </Button>
            </div>
            <FieldError errors={error ? [{ message: error }] : undefined} />
          </Field>
        </form>

        <DialogFooter className="mt-6">
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
