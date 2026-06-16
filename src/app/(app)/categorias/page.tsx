import { CategoriaForm } from '@/components/categoria-form'
import { CategoryBadge } from '@/components/category-badge'
import { CategoryKindToggle } from '@/components/category-kind-toggle'
import { CategoryRowActions } from '@/components/category-row-actions'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CategoryKind } from '@/lib/schemas/category'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type CategoryRow = Database['public']['Tables']['categories']['Row']

/**
 * Categorias (UI-SPEC §2). RSC: lists the user's active categories joined with
 * their tx_count from v_category_totals (the "usos" column + the delete-block
 * pre-check). Each row renders the swatch+name (CategoryBadge), an inline
 * consumo↔alocação toggle (CAT-03), the usos count, and an actions menu
 * (Editar → CategoriaForm, Excluir → CategoryDeleteDialog).
 */
export default async function CategoriasPage() {
  const supabase = await createClient()

  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, kind, color, is_archived, sort')
    .eq('is_archived', false)
    .order('sort', { ascending: true })
    .order('name', { ascending: true })

  // Per-category usage counts (summed across months) from the security_invoker view.
  const { data: totals } = await supabase
    .from('v_category_totals')
    .select('category_id, tx_count')

  const txCountByCategory = new Map<string, number>()
  for (const row of totals ?? []) {
    if (!row.category_id) continue
    txCountByCategory.set(
      row.category_id,
      (txCountByCategory.get(row.category_id) ?? 0) + (row.tx_count ?? 0),
    )
  }

  const rows: Pick<
    CategoryRow,
    'id' | 'name' | 'kind' | 'color' | 'is_archived' | 'sort'
  >[] = categories ?? []

  // Reassign targets for the delete dialog: every other active category. Carry
  // `kind` so the dialog can offer only same-kind targets (MD-01: reassigning a
  // consumo category's transactions into an alocação category corrupts the
  // consumo-vs-alocação totals the app exists to track).
  const targets = rows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    kind: c.kind as CategoryKind,
  }))

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Categorias</h1>
        <CategoriaForm />
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as categorias. Tente recarregar a página.
        </p>
      ) : rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nenhuma categoria</EmptyTitle>
            <EmptyDescription>
              Crie categorias para organizar seus gastos.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CategoriaForm />
          </EmptyContent>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Usos</TableHead>
              <TableHead className="w-12 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const txCount = txCountByCategory.get(row.id) ?? 0
              const kind = row.kind as CategoryKind
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <CategoryBadge name={row.name} color={row.color} />
                  </TableCell>
                  <TableCell>
                    <CategoryKindToggle id={row.id} kind={kind} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {txCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <CategoryRowActions
                      category={{
                        id: row.id,
                        name: row.name,
                        kind,
                        color: row.color,
                        txCount,
                      }}
                      targets={targets}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
