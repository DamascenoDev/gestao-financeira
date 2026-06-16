'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseBRLToCents } from '@/lib/money'
import { transactionSchema } from '@/lib/schemas/transaction'
import { createClient } from '@/lib/supabase/server'

/**
 * Transaction Server Actions (TXN-01/02/04). Mirrors actions/auth.ts +
 * actions/incomes.ts: Zod safeParse at the boundary → { error } (never
 * throws/leaks), getClaims() for the owner, parseBRLToCents (throw → friendly
 * message), revalidatePath('/extrato') on success.
 *
 * Money is bigint centavos stored POSITIVE; the sign derives from `kind`
 * ('expense' here), never from a negative value (RESEARCH anti-pattern +
 * `amount_cents > 0` DB check, T-02-TXN-VAL).
 *
 * The load-bearing piece is bulkReclassify: a SINGLE update().in('id', ids)
 * that RLS scopes to the caller's rows even if an id is forged — bulk-reclassify
 * .test.ts proves user B's forged-id update touches 0 of user A's rows (T-02-TXN-BULK).
 */
export type ActionResult = { error: string } | { ok: true }

const EXTRATO_PATH = '/extrato'

/** The bulk target must be a real category id — validated at the boundary. */
const categoryIdSchema = z.string().uuid('Selecione uma categoria')

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

/** Create a manual expense (data, valor, descrição, categoria) for the user (TXN-01). */
export async function createTransaction(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = transactionSchema.safeParse({
    description: formData.get('description'),
    amount: formData.get('amount'), // raw "R$ 1.234,56"
    categoryId: formData.get('categoryId'),
    occurredOn: formData.get('occurredOn'), // 'yyyy-MM-dd'
  })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  let amountCents: number
  try {
    amountCents = parseBRLToCents(parsed.data.amount)
  } catch {
    return { error: 'Valor monetário inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    category_id: parsed.data.categoryId,
    amount_cents: amountCents, // positive bigint; sign derives from kind
    kind: 'expense',
    occurred_on: parsed.data.occurredOn,
    description: parsed.data.description,
  })
  if (error) return { error: 'Não foi possível salvar a transação.' }

  revalidatePath(EXTRATO_PATH)
  return { ok: true }
}

/**
 * Edit the user's own transaction by id (TXN-02). RLS guarantees only the
 * owner's row is touched — a forged id matches 0 rows for another user.
 */
export async function updateTransaction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = transactionSchema.safeParse({
    description: formData.get('description'),
    amount: formData.get('amount'),
    categoryId: formData.get('categoryId'),
    occurredOn: formData.get('occurredOn'),
  })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  let amountCents: number
  try {
    amountCents = parseBRLToCents(parsed.data.amount)
  } catch {
    return { error: 'Valor monetário inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: parsed.data.categoryId,
      amount_cents: amountCents,
      occurred_on: parsed.data.occurredOn,
      description: parsed.data.description,
    })
    .eq('id', id)
  if (error) return { error: 'Não foi possível atualizar a transação.' }

  revalidatePath(EXTRATO_PATH)
  return { ok: true }
}

/** Remove the user's own transaction by id (TXN-02); RLS scopes the delete. */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) return { error: 'Não foi possível excluir a transação.' }

  revalidatePath(EXTRATO_PATH)
  return { ok: true }
}

/**
 * Re-classify every selected transaction to one category in a SINGLE
 * update().in('id', ids) (TXN-04). RLS scopes the UPDATE to the caller's own
 * rows even if an id is forged (bulk-reclassify.test.ts asserts a forged-id
 * bulk update touches 0 of another user's rows — T-02-TXN-BULK).
 */
export async function bulkReclassify(
  ids: string[],
  categoryId: string,
): Promise<ActionResult> {
  if (ids.length === 0) return { error: 'Nenhuma transação selecionada.' }

  const parsed = categoryIdSchema.safeParse(categoryId)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('transactions')
    .update({ category_id: parsed.data })
    .in('id', ids)
  if (error) return { error: 'Não foi possível reclassificar.' }

  revalidatePath(EXTRATO_PATH)
  return { ok: true }
}
