'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { keywordSchema } from '@/lib/schemas/category-keyword'
import { normalizeDescriptor } from '@/lib/normalize'
import { createClient } from '@/lib/supabase/server'

/**
 * Category-keyword Server Actions (KW-01/KW-06). Mirrors actions/categories.ts:
 * Zod safeParse at the boundary → discriminated result (never throws/leaks),
 * getClaims() for the owner, idSchema uuid (WR-06) on row ids, and
 * revalidatePath('/categorias') on success.
 *
 * The load-bearing pieces:
 *  - keyword is stored NORMALIZED via normalizeDescriptor (the SINGLE key
 *    derivation, never re-derived) so Phase 20's substring match against
 *    descriptor_norm is apples-to-apples. An input that normalizes to '' is the
 *    empty-validation error.
 *  - duplicate is a friendly NO-OP, not an error: a maybeSingle pre-check yields
 *    { duplicate: true }, and the unique(user_id,category_id,keyword) constraint
 *    (23505) is the race backstop (mirrors the 23503 backstop in deleteCategory).
 *  - user_id ALWAYS comes from getClaims().claims.sub (never the client) — the
 *    with-check half of the RLS "own" policy (KW-06).
 */
export type ActionResult = { error: string } | { ok: true }
// Duplicate is a friendly no-op, NOT an error (UI-SPEC: toast.info "já cadastrada").
export type AddKeywordResult = { ok: true } | { duplicate: true } | { error: string }

const CATEGORIAS_PATH = '/categorias'

/**
 * WR-06: validate every row-id argument before it reaches `.eq(...)`. RLS already
 * makes a foreign/garbage id safe, so this is defense-in-depth + cleaner errors
 * (a non-UUID id otherwise raises 22P02 surfaced as a confusing toast).
 */
const idSchema = z.string().uuid('Identificador inválido')

/** Add a normalized keyword to a category for the caller (KW-01). */
export async function addKeyword(
  categoryId: string,
  keyword: string,
): Promise<AddKeywordResult> {
  if (!idSchema.safeParse(categoryId).success) {
    return { error: 'Identificador inválido.' }
  }

  // Validate raw length first (trim/min1/max60), then normalize ONCE. An input
  // that normalizes to '' (e.g. only punctuation) is the empty-validation error.
  const parsed = keywordSchema.safeParse(keyword)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }
  const normalized = normalizeDescriptor(parsed.data)
  if (normalized === '') return { error: 'Informe uma palavra-chave.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // Pre-check for the calm duplicate no-op (RLS already scopes to the caller).
  const { data: existing } = await supabase
    .from('category_keywords')
    .select('id')
    .eq('category_id', categoryId)
    .eq('keyword', normalized)
    .maybeSingle()
  if (existing) return { duplicate: true }

  const { error } = await supabase.from('category_keywords').insert({
    user_id: userId,
    category_id: categoryId,
    keyword: normalized,
  })
  // 23505 (unique_violation) is the race backstop — treat as duplicate, not error
  // (mirrors the 23503 backstop in deleteCategory). Never leak a raw DB error.
  if (error) {
    if (error.code === '23505') return { duplicate: true }
    return { error: 'Não foi possível salvar a palavra-chave.' }
  }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}

/** Remove a keyword by id (KW-01). RLS scopes the delete to the caller. */
export async function removeKeyword(keywordId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(keywordId).success) {
    return { error: 'Identificador inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // RLS scopes the delete to the caller — a foreign/garbage id deletes nothing.
  const { error } = await supabase
    .from('category_keywords')
    .delete()
    .eq('id', keywordId)
  if (error) return { error: 'Não foi possível remover a palavra-chave.' }

  revalidatePath(CATEGORIAS_PATH)
  return { ok: true }
}
