'use client'

import * as React from 'react'

import { KeywordSuggestionsDialog } from '@/components/keyword-suggestions-dialog'
import { Button } from '@/components/ui/button'

type CategoryOption = { id: string; name: string; color: string | null }

/**
 * KW-08 launcher: client component that owns the batch-suggestion dialog's open
 * state (mirrors CategoryRowActions's client-owns-open-state pattern) so the
 * /categorias page can stay an RSC. The trigger is a non-primary affordance
 * (variant="outline") that does NOT compete with the gold "Nova categoria" CTA
 * (UI-SPEC §Color). The category list is passed down (already fetched by the RSC)
 * for the per-candidate category Select.
 */
export function KeywordSuggestionsLauncher({
  categories,
}: {
  categories: CategoryOption[]
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Sugerir palavras-chave
      </Button>
      <KeywordSuggestionsDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
      />
    </>
  )
}
