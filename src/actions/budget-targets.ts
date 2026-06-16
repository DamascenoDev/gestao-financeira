'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { budgetTargetSchema } from '@/lib/schemas/budget-target'
import { createClient } from '@/lib/supabase/server'

/**
 * Budget-target Server Actions (BUD-01). Mirrors actions/transactions.ts verbatim
 * in structure: 'use server'; Zod safeParse at the boundary → { error } (never
 * throws/leaks); getClaims() for the owner; the category-ownership re-derive (the
 * carried Phase-2 IDOR fix — FKs are NOT RLS-aware, so a forged category_id pointing
 * at another user's category would otherwise satisfy the FK and attach the caller's
 * meta to a category they do not own); revalidatePath('/dashboard') on success.
 *
 * One meta per category: the upsert keys on the unique (user_id, category_id) pair
 * (budget_targets_user_idx + the table's UNIQUE constraint), so a second save for the
 * same category UPDATES the existing row rather than creating a duplicate.
 *
 * The direction default-from-kind (consumo→teto, alocacao→alvo) is a UI affordance in
 * MetaDialog — the action validates whatever direction the (possibly user-overridden)
 * form sends against the enum. This is the half that turns the Plan-02
 * budget-target-direction it.skip GREEN.
 */
export type ActionResult = { error: string } | { ok: true }

const DASHBOARD_PATH = '/dashboard'

/**
 * WR-06: validate the category id before it reaches `.eq('category_id', id)`. RLS
 * already makes a foreign/garbage id safe on the delete, so this is defense-in-depth
 * + a cleaner error (a non-UUID id otherwise raises 22P02).
 */
const categoryIdSchema = z.string().uuid('Identificador inválido')

/**
 * HG-01 (carried Phase-2 IDOR fix): re-derive that the category belongs to the
 * caller before writing it as an FK. The RLS-active client only returns the caller's
 * own categories, so a `select id where id = $1` that returns exactly 1 row means the
 * category is owned; 0 rows means it is missing or not-owned — reject the write.
 */
async function assertOwnedCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId)
  if (error || !data) return false
  return data.length === 1
}

/**
 * Define / update a per-category % meta with a direction (BUD-01). Upserts on
 * (user_id, category_id) so there is exactly one meta per category.
 */
export async function upsertBudgetTarget(
  input: z.infer<typeof budgetTargetSchema>,
): Promise<ActionResult> {
  const parsed = budgetTargetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // HG-01: re-derive category ownership server-side (FKs are not RLS-aware).
  if (!(await assertOwnedCategory(supabase, parsed.data.categoryId))) {
    return { error: 'Categoria inválida.' }
  }

  const { error } = await supabase.from('budget_targets').upsert(
    {
      user_id: userId,
      category_id: parsed.data.categoryId,
      percent_bp: parsed.data.percentBp,
      direction: parsed.data.direction,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,category_id' },
  )
  if (error) return { error: 'Não foi possível salvar a meta.' }

  revalidatePath(DASHBOARD_PATH)
  return { ok: true }
}

/**
 * Remove the meta for an owned category (BUD-01 — clearing the % in MetaDialog).
 * RLS scopes the delete to the caller's own row; the UUID guard keeps a garbage id
 * from reaching the DB.
 */
export async function deleteBudgetTarget(categoryId: string): Promise<ActionResult> {
  if (!categoryIdSchema.safeParse(categoryId).success) {
    return { error: 'Identificador inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('budget_targets')
    .delete()
    .eq('category_id', categoryId)
  if (error) return { error: 'Não foi possível remover a meta.' }

  revalidatePath(DASHBOARD_PATH)
  return { ok: true }
}
