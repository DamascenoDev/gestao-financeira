'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { keywordSchema } from '@/lib/schemas/category-keyword'
import { normalizeKeyword } from '@/lib/normalize'
import { createClient } from '@/lib/supabase/server'
import { compileRule, matchKeyword, type KeywordRule } from '@/lib/classifier/keywords'

/**
 * Category-keyword Server Actions (KW-01/KW-06). Mirrors actions/categories.ts:
 * Zod safeParse at the boundary → discriminated result (never throws/leaks),
 * getClaims() for the owner, idSchema uuid (WR-06) on row ids, and
 * revalidatePath('/categorias') on success.
 *
 * The load-bearing pieces:
 *  - keyword is stored NORMALIZED via normalizeKeyword (KW-09: the keyword-aware
 *    variant that PRESERVES the glob `*` but is otherwise bit-identical to
 *    normalizeDescriptor) so Phase 20's substring match against descriptor_norm
 *    stays apples-to-apples for non-wildcard keys. An input that normalizes to ''
 *    is the empty-validation error; a normalized value with zero literals (only
 *    `*`, e.g. `*`/`**`) is rejected — it would match everything in the matcher.
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

  // Validate raw length first (trim/min1/max60), then normalize ONCE via the
  // keyword-aware normalizer (KW-09: keeps the glob `*`). An input that normalizes
  // to '' (e.g. only punctuation) is the empty-validation error.
  const parsed = keywordSchema.safeParse(keyword)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }
  const normalized = normalizeKeyword(parsed.data)
  if (normalized === '') return { error: 'Informe uma palavra-chave.' }
  // Reject a literal-count-0 keyword (only `*`, e.g. `*` / `**`): a rule with no
  // literal would match EVERY descriptor in the matcher (T-21-01) — friendlier to
  // refuse at cadastro than to silently persist a catch-all (RESEARCH §Pitfall 3, Q2).
  if (normalized.replace(/\*/g, '') === '') {
    return { error: 'Use ao menos uma letra ou número além de *.' }
  }

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

/**
 * KW-08: one candidate from {@link getKeywordSuggestions} — a confirmed
 * merchant_pattern descriptor NOT yet covered by any of the caller's keywords.
 * `descriptorNorm` is the already-normalized match key (never re-normalize it —
 * re-normalizing would re-strip a `*` that never belongs here anyway, the
 * documented landmine). It is the editable prefill the batch dialog (Plan 03)
 * sends back as the keyword.
 */
export type KeywordSuggestion = {
  descriptorNorm: string
  categoryId: string
  categoryName: string
  hitCount: number
}

/** KW-08 batch-create result: created/skipped counts, or a session error. */
export type ApproveSuggestionsResult =
  | { ok: true; created: number; skipped: number }
  | { error: string }

/**
 * KW-08: mine the caller's CONFIRMED merchant_patterns and surface the ones not
 * yet covered by an existing keyword, sorted by hit_count desc — the candidate
 * feed for the batch-suggestion dialog (Plan 03).
 *
 * ALL candidate computation stays server-side (T-22-03): RLS scopes the three
 * reads to the caller (NO manual user_id filter), and only the computed candidate
 * shape — never raw merchant rows — crosses to the client. The already-covered
 * filter reuses the SAME pure matcher (compileRule/matchKeyword) the upload
 * pipeline uses, so "covered" means exactly what classification means.
 */
export async function getKeywordSuggestions(): Promise<
  { ok: true; suggestions: KeywordSuggestion[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // Three RLS-scoped reads — RLS (auth.uid() = user_id) enforces ownership, so
  // NO manual .eq('user_id', …) here (repo convention).
  const [{ data: patterns }, { data: keywords }, { data: categories }] =
    await Promise.all([
      supabase
        .from('merchant_patterns')
        .select('descriptor_norm, category_id, hit_count'),
      supabase.from('category_keywords').select('category_id, keyword'),
      supabase
        .from('categories')
        .select('id, name, sort')
        .eq('is_archived', false),
    ])

  const sortById = new Map<string, number>()
  const nameById = new Map<string, string>()
  for (const c of categories ?? []) {
    sortById.set(c.id, c.sort)
    nameById.set(c.id, c.name)
  }

  // Build the precompiled rule list ONCE; compileRule drops '' / literal-count-0.
  const rules: KeywordRule[] = (keywords ?? [])
    .map((k) => compileRule(k.category_id, k.keyword, sortById.get(k.category_id) ?? 0))
    .filter((r): r is KeywordRule => r !== null)

  const suggestions: KeywordSuggestion[] = (patterns ?? [])
    // Exclude any descriptor already covered by an existing keyword (the matcher
    // is the single source of truth for "covered"). descriptor_norm is the match
    // key as-is — do NOT re-normalize it.
    .filter((p) => matchKeyword(p.descriptor_norm, rules) === null)
    .map((p) => ({
      descriptorNorm: p.descriptor_norm,
      categoryId: p.category_id,
      categoryName: nameById.get(p.category_id) ?? p.category_id,
      hitCount: p.hit_count,
    }))
    .sort((a, b) => b.hitCount - a.hitCount)

  // Read-only: no revalidatePath.
  return { ok: true, suggestions }
}

/**
 * KW-08: bulk-create the chosen candidates as category_keywords behind ONE
 * owner-gate and ONE revalidatePath. Each item is validated/normalized/deduped
 * EXACTLY like addKeyword — the client's edited term is never trusted (V5), the
 * categoryId is uuid-checked (V4) and RLS + FK reject a foreign id (counted as a
 * skip). A single invalid/duplicate item is counted as `skipped` and the loop
 * continues — one bad item NEVER aborts the batch.
 */
export async function approveKeywordSuggestions(
  items: { categoryId: string; keyword: string }[],
): Promise<ApproveSuggestionsResult> {
  if (items.length === 0) return { ok: true, created: 0, skipped: 0 }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  let created = 0
  let skipped = 0

  for (const item of items) {
    // Mirror addKeyword's four guards — never throw, `continue` + count skipped.
    if (!idSchema.safeParse(item.categoryId).success) {
      skipped++
      continue
    }
    const parsed = keywordSchema.safeParse(item.keyword)
    if (!parsed.success) {
      skipped++
      continue
    }
    const normalized = normalizeKeyword(parsed.data)
    if (normalized === '') {
      skipped++
      continue
    }
    // Reject a literal-count-0 catch-all (`*` / `**`) — would match everything.
    if (normalized.replace(/\*/g, '') === '') {
      skipped++
      continue
    }

    // Duplicate pre-check (RLS scopes to the caller).
    const { data: existing } = await supabase
      .from('category_keywords')
      .select('id')
      .eq('category_id', item.categoryId)
      .eq('keyword', normalized)
      .maybeSingle()
    if (existing) {
      skipped++
      continue
    }

    const { error } = await supabase.from('category_keywords').insert({
      user_id: userId,
      category_id: item.categoryId,
      keyword: normalized,
    })
    // Any insert error (incl. 23505 race / foreign categoryId rejected by RLS/FK)
    // is a skip — never throw, never leak a raw DB error.
    if (error) {
      skipped++
      continue
    }
    created++
  }

  // ONE revalidate after the whole batch, never per item.
  revalidatePath(CATEGORIAS_PATH)
  return { ok: true, created, skipped }
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
