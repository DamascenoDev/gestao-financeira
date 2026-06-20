'use client'

import * as React from 'react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'

import {
  getKeywordSuggestions,
  approveKeywordSuggestions,
  type KeywordSuggestion,
} from '@/actions/category-keywords'
import { CategoryBadge } from '@/components/category-badge'
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type CategoryOption = { id: string; name: string; color: string | null }

type KeywordSuggestionsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: CategoryOption[]
}

/**
 * KW-08 global batch dialog. Loads server-computed candidates on open
 * (getKeywordSuggestions), lets the user multi-select + edit term/category, then
 * bulk-approves via approveKeywordSuggestions (one owner-gate + one revalidate
 * server-side). Discard is SESSION-ONLY: a candidate leaves the local list with NO
 * server call (no dismissed table — Pitfall 5). The dialog never re-filters: it
 * renders exactly what the server returned (already-covered exclusion is
 * server-side, Plan 02). Mirrors category-keywords-dialog.tsx (controlled
 * open/onOpenChange + useTransition + sonner). Copy LOCKED in 22-UI-SPEC.md.
 */
type Candidate = {
  key: string
  descriptorNorm: string
  term: string
  categoryId: string
  categoryName: string
  hitCount: number
  selected: boolean
}

function toCandidate(s: KeywordSuggestion): Candidate {
  return {
    key: `${s.descriptorNorm}::${s.categoryId}`,
    descriptorNorm: s.descriptorNorm,
    term: s.descriptorNorm,
    categoryId: s.categoryId,
    categoryName: s.categoryName,
    hitCount: s.hitCount,
    selected: false,
  }
}

export function KeywordSuggestionsDialog({
  open,
  onOpenChange,
  categories,
}: KeywordSuggestionsDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [candidates, setCandidates] = React.useState<Candidate[]>([])
  const [loaded, setLoaded] = React.useState(false)
  // Derived, not stateful: while the dialog is open and the feed has not resolved
  // yet, we are loading. Avoids a synchronous setState(true) in the effect body.
  const loading = open && !loaded

  // Load-on-open: when `open` flips to true, fetch the candidate feed once. The
  // effect only runs its body while open; on close (or unmount) the cleanup
  // resets all derived state, so the next open re-loads fresh and any session
  // discards are forgotten (the server feed is the source of truth). Resetting in
  // cleanup — rather than a synchronous setState in the effect body — keeps this a
  // pure "synchronize with an async external system" effect.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    // Plain async load (NOT wrapped in startTransition): the candidate list is the
    // dialog's primary content, so seeding it should be a normal, high-priority
    // state update — a transition would let React defer it under load, which both
    // delays the first paint and makes the rows race in tests. The disabled
    // controls + "Carregando…" affordance already cover the in-flight state.
    void (async () => {
      const r = await getKeywordSuggestions()
      if (cancelled) return
      if ('error' in r) {
        toast.error(
          r.error ?? 'Não foi possível carregar as sugestões. Tente novamente.',
        )
        setCandidates([])
      } else {
        setCandidates(r.suggestions.map(toCandidate))
      }
      setLoaded(true)
    })()
    return () => {
      cancelled = true
      setLoaded(false)
      setCandidates([])
    }
  }, [open])

  const selected = candidates.filter((c) => c.selected)
  const allSelected = candidates.length > 0 && selected.length === candidates.length

  function setTerm(key: string, term: string) {
    setCandidates((prev) =>
      prev.map((c) => (c.key === key ? { ...c, term } : c)),
    )
  }

  function setCategory(key: string, categoryId: string) {
    const name = categories.find((c) => c.id === categoryId)?.name ?? categoryId
    setCandidates((prev) =>
      prev.map((c) =>
        c.key === key ? { ...c, categoryId, categoryName: name } : c,
      ),
    )
  }

  function toggle(key: string, value: boolean) {
    setCandidates((prev) =>
      prev.map((c) => (c.key === key ? { ...c, selected: value } : c)),
    )
  }

  function toggleAll(value: boolean) {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: value })))
  }

  // Session-only: removes the candidate from local state with NO server call.
  function discard(key: string) {
    setCandidates((prev) => prev.filter((c) => c.key !== key))
  }

  function onApprove() {
    const toApprove = candidates.filter((c) => c.selected)
    if (toApprove.length === 0) return
    const approvedKeys = new Set(toApprove.map((c) => c.key))
    startTransition(async () => {
      const r = await approveKeywordSuggestions(
        toApprove.map((c) => ({ categoryId: c.categoryId, keyword: c.term })),
      )
      if ('error' in r) {
        toast.error(
          r.error ?? 'Não foi possível aprovar. Tente novamente.',
        )
        return
      }
      if (r.skipped > 0) {
        toast.success(`${r.created} criadas · ${r.skipped} já cadastradas.`)
      } else {
        toast.success(
          r.created === 1
            ? '1 palavra-chave criada.'
            : `${r.created} palavras-chave criadas.`,
        )
      }
      // Remove the approved rows; keep the dialog open so the user can continue.
      setCandidates((prev) => prev.filter((c) => !approvedKeys.has(c.key)))
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sugestões de palavras-chave</DialogTitle>
          <DialogDescription>
            Termos extraídos dos gastos que você já confirmou. Aprove os que
            quiser virar palavra-chave para classificar futuras faturas
            automaticamente.
          </DialogDescription>
        </DialogHeader>

        {loaded && candidates.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Nenhuma sugestão por enquanto</EmptyTitle>
              <EmptyDescription>
                Conforme você confirma a categoria dos seus gastos, novos termos
                aparecem aqui para virar palavra-chave.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {candidates.length > 0 ? (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selected.length > 0 && !allSelected}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="Selecionar todas"
                  disabled={isPending}
                />
                Selecionar todas
              </label>
            ) : null}

            <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {candidates.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <Checkbox
                    checked={c.selected}
                    onCheckedChange={(v) => toggle(c.key, !!v)}
                    aria-label={`Selecionar ${c.descriptorNorm}`}
                    disabled={isPending}
                  />
                  <Input
                    value={c.term}
                    onChange={(e) => setTerm(c.key, e.target.value)}
                    aria-label={`Termo da sugestão ${c.descriptorNorm}`}
                    maxLength={60}
                    disabled={isPending}
                    className="flex-1"
                  />
                  <Select
                    value={c.categoryId}
                    onValueChange={(v) => v && setCategory(c.key, v)}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={`Categoria da sugestão ${c.descriptorNorm}`}
                      disabled={isPending}
                    >
                      <SelectValue>
                        <CategoryBadge
                          name={c.categoryName}
                          color={
                            categories.find((cat) => cat.id === c.categoryId)
                              ?.color ?? null
                          }
                        />
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          <CategoryBadge name={cat.name} color={cat.color} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {c.hitCount} usos
                  </span>
                  <button
                    type="button"
                    aria-label={`Descartar sugestão ${c.term}`}
                    className="inline-flex text-muted-foreground hover:text-foreground"
                    disabled={isPending}
                    onClick={() => discard(c.key)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}

              {!loaded && loading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="mt-6">
          <DialogClose
            render={
              <Button type="button" variant="outline">
                Fechar
              </Button>
            }
          />
          <Button
            type="button"
            onClick={onApprove}
            disabled={isPending || selected.length === 0}
          >
            {isPending
              ? 'Aprovando…'
              : selected.length > 0
                ? `Aprovar selecionadas (${selected.length})`
                : 'Aprovar selecionadas'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
