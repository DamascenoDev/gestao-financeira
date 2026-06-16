import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type CategoryListItem = Pick<
  Database['public']['Tables']['categories']['Row'],
  'name' | 'kind'
>

export default async function DashboardPage() {
  const supabase = await createClient()

  // Real RLS-filtered read: the publishable-key server client runs under the
  // signed-in user's JWT, so RLS ((select auth.uid()) = user_id) returns ONLY
  // this user's seeded categories — the end-to-end data-isolation proof.
  const { data, error } = await supabase
    .from('categories')
    .select('name, kind')
    .order('sort')

  const categories: CategoryListItem[] = data ?? []

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Suas categorias</h1>
        <p className="text-sm text-muted-foreground">
          Lidas diretamente do banco, isoladas por RLS para a sua conta.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as categorias.
        </p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma categoria encontrada.
        </p>
      ) : (
        <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
          {categories.map((category) => (
            <li
              key={category.name}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span>{category.name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {category.kind}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
