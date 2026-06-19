'use client'

import * as React from 'react'
import { MoreHorizontalIcon } from 'lucide-react'

import { CategoriaForm } from '@/components/categoria-form'
import { CategoryDeleteDialog } from '@/components/category-delete-dialog'
import { CategoryKeywordsDialog } from '@/components/category-keywords-dialog'
import type { CategoryKind } from '@/lib/schemas/category'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type Category = {
  id: string
  name: string
  kind: CategoryKind
  color: string | null
  txCount: number
  keywords: { id: string; keyword: string }[]
}

type TargetCategory = {
  id: string
  name: string
  color: string | null
  kind: CategoryKind
}

/**
 * Per-row actions menu for the Categorias list: Editar (opens CategoriaForm in
 * edit mode) and Excluir (opens CategoryDeleteDialog — blocked/archive/reassign or
 * the standard confirm). Both dialogs are controlled by their own open state; the
 * menu items just toggle them via dedicated triggers rendered inline.
 */
export function CategoryRowActions({
  category,
  targets,
}: {
  category: Category
  targets: TargetCategory[]
}) {
  const [editOpen, setEditOpen] = React.useState(false)
  const [keywordsOpen, setKeywordsOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Ações">
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setKeywordsOpen(true)}>
            {category.keywords.length > 0
              ? `Palavras-chave (${category.keywords.length})`
              : 'Palavras-chave'}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Both dialogs are controlled by the menu (no inline trigger). */}
      <CategoriaForm
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        category={{
          id: category.id,
          name: category.name,
          kind: category.kind,
          color: category.color,
        }}
      />

      <CategoryKeywordsDialog
        open={keywordsOpen}
        onOpenChange={setKeywordsOpen}
        category={{ id: category.id, name: category.name }}
        keywords={category.keywords}
      />

      <CategoryDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        category={{
          id: category.id,
          name: category.name,
          kind: category.kind,
          txCount: category.txCount,
        }}
        targets={targets}
      />
    </>
  )
}
