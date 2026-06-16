'use server'

import { revalidatePath } from 'next/cache'

import {
  categorySchema,
  type CategoryColor,
  type CategoryKind,
  CATEGORY_COLORS,
  CATEGORY_KINDS,
} from '@/lib/schemas/category'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

/**
 * Category Server Actions (CAT-02/03). Mirrors actions/auth.ts + actions/incomes.ts:
 * Zod safeParse at the boundary → { error } (never throws/leaks), getClaims() for the
 * owner, revalidatePath('/categorias') on success.
 *
 * The load-bearing pieces:
 *  - deleteCategory PRE-CHECKS tx_count via v_category_totals and returns a
 *    discriminated { blocked, txCount } so the UI offers Arquivar / Reatribuir e
 *    remover instead of a destructive error. ON DELETE RESTRICT (error 23503) is the
 *    backstop — never surfaced as a raw DB error (RESEARCH Pitfall 5).
 *  - reassignAndDelete invokes the atomic reassign_and_delete_category RPC so the
 *    move+delete is one transaction (no half-applied state — RESEARCH Open Q2).
 */
export type ActionResult = { error: string } | { ok: true }

/** deleteCategory's discriminated result: ok | error | blocked-with-count (CAT-02). */
export type DeleteCategoryResult =
  | { ok: true }
  | { error: string }
  | { blocked: true; txCount: number }

const CATEGORIAS_PATH = '/categorias'

const nameSchema = z.string().trim().min(1, 'Informe o nome').max(60)
const kindSchema = z.enum(CATEGORY_KINDS)
const colorSchema = z.enum(CATEGORY_COLORS)

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

/** Create a category for the user (name + kind, optional swatch color). */
export async function createCategory(formData: FormData): Promise<ActionResult> {
  const rawColor = formData.get('color')
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    kind: formData.get('kind'),
    // Treat empty/absent color as "no color" rather than a validation failure.
    color: rawColor ? rawColor : undefined,
  })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('categories').insert({
    user_id: userId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    color: parsed.data.color ?? null,
  })
  if (error) return { error: 'Não foi possível salvar a categoria.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

/** Persist a rename (single-field edit). */
export async function renameCategory(
  id: string,
  name: string,
): Promise<ActionResult> {
  const parsed = nameSchema.safeParse(name)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('categories')
    .update({ name: parsed.data })
    .eq('id', id)
  if (error) return { error: 'Não foi possível renomear a categoria.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

/** Persist the consumo↔alocação kind toggle (CAT-03). */
export async function setKind(
  id: string,
  kind: CategoryKind,
): Promise<ActionResult> {
  const parsed = kindSchema.safeParse(kind)
  if (!parsed.success) return { error: 'Tipo inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('categories')
    .update({ kind: parsed.data })
    .eq('id', id)
  if (error) return { error: 'Não foi possível alterar o tipo.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

/** Persist a swatch color (one of the fixed 8-swatch palette). */
export async function setColor(
  id: string,
  color: CategoryColor,
): Promise<ActionResult> {
  const parsed = colorSchema.safeParse(color)
  if (!parsed.success) return { error: 'Cor inválida.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('categories')
    .update({ color: parsed.data })
    .eq('id', id)
  if (error) return { error: 'Não foi possível alterar a cor.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

/**
 * Archive a category: is_archived=true keeps every transaction (history preserved)
 * but hides the category from pickers (an is_archived=false filter excludes it).
 * The graceful alternative to a blocked delete (CAT-02).
 */
export async function archiveCategory(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('categories')
    .update({ is_archived: true })
    .eq('id', id)
  if (error) return { error: 'Não foi possível arquivar a categoria.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

/**
 * Delete a category — but BLOCK it when transactions reference it (CAT-02).
 * Pre-check tx_count via v_category_totals (cleaner UX → { blocked, txCount });
 * ON DELETE RESTRICT (error 23503) is the DB backstop, returned as a friendly
 * message rather than a raw DB error (RESEARCH Pitfall 5).
 */
export async function deleteCategory(id: string): Promise<DeleteCategoryResult> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // Pre-check: sum tx_count across the (per-month) v_category_totals rows.
  const { data: totals } = await supabase
    .from('v_category_totals')
    .select('tx_count')
    .eq('category_id', id)
  const txCount = (totals ?? []).reduce(
    (sum, row) => sum + (row.tx_count ?? 0),
    0,
  )
  if (txCount > 0) return { blocked: true, txCount }

  const { error } = await supabase.from('categories').delete().eq('id', id)
  // 23503 backstop (a transaction inserted between the pre-check and the delete):
  // surface the same friendly message, never a raw DB error toast.
  if (error) return { error: 'Não foi possível excluir a categoria.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

/**
 * Reassign every transaction from `src` to `dst`, then delete `src` — atomically,
 * via the reassign_and_delete_category RPC (one transaction, no half-applied state).
 * RLS scopes both the move and the delete to the caller (CAT-02).
 */
export async function reassignAndDelete(
  src: string,
  dst: string,
): Promise<ActionResult> {
  if (!src || !dst || src === dst) {
    return { error: 'Selecione uma categoria de destino diferente.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // HG-02: re-derive ownership of BOTH src and dst server-side before invoking
  // the RPC. The RPC itself is now hardened too (security-invoker EXISTS checks),
  // but this gives a friendly field error instead of a raw DB-exception toast for
  // a forged/foreign dst (FKs are not RLS-aware).
  const { data: owned } = await supabase
    .from('categories')
    .select('id, kind')
    .in('id', [src, dst])
  if (!owned || owned.length !== 2) {
    return { error: 'Selecione uma categoria de destino diferente.' }
  }

  // MD-01: block reassigning across kinds (consumo ↔ alocação). Mixing kinds
  // silently reclassifies the moved transactions and corrupts the consumo-vs-
  // alocação totals used for goal/adherence reporting.
  const srcKind = owned.find((c) => c.id === src)?.kind
  const dstKind = owned.find((c) => c.id === dst)?.kind
  if (srcKind !== dstKind) {
    return {
      error: 'Escolha uma categoria de destino do mesmo tipo (consumo ou alocação).',
    }
  }

  const { error } = await supabase.rpc('reassign_and_delete_category', {
    src,
    dst,
  })
  if (error) return { error: 'Não foi possível reatribuir e remover.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}
