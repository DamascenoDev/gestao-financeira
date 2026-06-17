'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseBRLToCents } from '@/lib/money'
import {
  assertOwnedCarro,
  assertOwnedCategories,
  assertOwnedReserva,
  isReservaCategory,
  moneyWriteError,
  syncReservaLedgerForTransaction,
} from '@/lib/ownership'
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
const RESERVAS_PATH = '/reservas'
const DASHBOARD_PATH = '/dashboard'

/** The bulk target must be a real category id — validated at the boundary. */
const categoryIdSchema = z.string().uuid('Selecione uma categoria')

/**
 * WR-06: validate every row-id argument before it reaches `.eq('id', id)` /
 * `.in('id', ids)`. RLS already makes a foreign/garbage id safe, so this is
 * defense-in-depth + cleaner errors (a non-UUID id otherwise raises 22P02).
 */
const idSchema = z.string().uuid('Identificador inválido')

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

/**
 * CAR-02: decode the optional carro choice from FormData exactly like reservaId is
 * read — '' or absent means "no carro" (null), a uuid means "tag to this carro".
 * Carro is FREE of category, so this is read on every create/update path that
 * supports tagging, independent of the Reserva branch.
 */
function decodeCarroId(formData: FormData): string | null {
  const raw = formData.get('carroId')
  return typeof raw === 'string' && raw !== '' ? raw : null
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

  // HG-01: re-derive category ownership server-side (FKs are not RLS-aware).
  if (!(await assertOwnedCategories(supabase, [parsed.data.categoryId]))) {
    return { error: 'Categoria inválida.' }
  }

  // LW-01: this plain create path does NOT sync the reserva ledger (no reservaId to
  // collect), so a Reserva-category transaction here would count as alocação spend
  // with NO matching aporte — the same saldo/ledger divergence as HG-01. Reject it
  // and steer the caller to createTransactionWithReserva, which owns the aporte flow.
  if (await isReservaCategory(supabase, parsed.data.categoryId)) {
    return {
      error: 'Use o lançamento de aporte para classificar como Reserva.',
    }
  }

  const { error } = await supabase.from('transactions').insert({
    user_id: userId,
    category_id: parsed.data.categoryId,
    amount_cents: amountCents, // positive bigint; sign derives from kind
    kind: 'expense',
    occurred_on: parsed.data.occurredOn,
    description: parsed.data.description,
  })
  if (error)
    return { error: moneyWriteError(error, 'Não foi possível salvar a transação.') }

  revalidatePath(EXTRATO_PATH)
  return { ok: true }
}

/**
 * Create a manual transaction and, when its category is the user's Reserva
 * (is_reserva FLAG), the linked `in` ledger entry — the aporte sub-flow (RSV-02).
 * The non-Reserva path behaves exactly like createTransaction (no ledger write).
 * Both category_id AND reserva_id are re-derived as owner-scoped server-side BEFORE
 * any FK write (FKs are not RLS-aware — the Phase-2 IDOR fix; Pitfall 6).
 */
export async function createTransactionWithReserva(
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

  // The reserva choice is optional in the payload — only meaningful when the
  // chosen category is the Reserva one (enforced in the sync helper).
  const rawReservaId = formData.get('reservaId')
  const reservaId =
    typeof rawReservaId === 'string' && rawReservaId !== ''
      ? rawReservaId
      : undefined

  // CAR-02: optional carro tag — null means "no carro" (free of category).
  const carroId = decodeCarroId(formData)

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

  // HG-01: re-derive category ownership server-side (FKs are not RLS-aware).
  if (!(await assertOwnedCategories(supabase, [parsed.data.categoryId]))) {
    return { error: 'Categoria inválida.' }
  }

  // RSV-02: when the category is Reserva, the aporte needs a chosen reserva BEFORE
  // we insert anything — fail fast so we never leave a dangling transaction.
  if (await isReservaCategory(supabase, parsed.data.categoryId)) {
    if (!reservaId) return { error: 'Selecione uma reserva.' }
    if (!(await assertOwnedReserva(supabase, reservaId))) {
      return { error: 'Reserva inválida.' }
    }
  }

  // CAR-02 / T-09-01: re-derive carro ownership before the carro_id FK write (FKs
  // are not RLS-aware). WR-04 tri-state: 'error' → generic retry; 'not-owned' →
  // 'Carro inválido.'. Clearing (carroId null) needs no check — own rows only.
  if (carroId !== null) {
    const owned = await assertOwnedCarro(supabase, carroId)
    if (owned === 'error') {
      return { error: 'Não foi possível salvar a transação. Tente novamente.' }
    }
    if (owned === 'not-owned') return { error: 'Carro inválido.' }
  }

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      category_id: parsed.data.categoryId,
      amount_cents: amountCents, // positive bigint; sign derives from kind
      kind: 'expense',
      occurred_on: parsed.data.occurredOn,
      description: parsed.data.description,
      carro_id: carroId, // CAR-02: optional carro tag (null = untagged)
    })
    .select('id')
    .single()
  if (error || !inserted) {
    return { error: moneyWriteError(error, 'Não foi possível salvar a transação.') }
  }

  // Write the linked aporte (or nothing, for a non-Reserva category) via the shared
  // helper so create + edit share one consistent ledger path.
  const sync = await syncReservaLedgerForTransaction(
    supabase,
    userId,
    inserted.id,
    parsed.data.categoryId,
    amountCents,
    parsed.data.occurredOn,
    reservaId,
    false, // fresh txn — no pre-existing ledger entry to delete
  )
  if ('error' in sync) return sync

  revalidatePath(EXTRATO_PATH)
  revalidatePath(RESERVAS_PATH)
  revalidatePath(DASHBOARD_PATH)
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
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const parsed = transactionSchema.safeParse({
    description: formData.get('description'),
    amount: formData.get('amount'),
    categoryId: formData.get('categoryId'),
    occurredOn: formData.get('occurredOn'),
  })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const rawReservaId = formData.get('reservaId')
  const reservaId =
    typeof rawReservaId === 'string' && rawReservaId !== ''
      ? rawReservaId
      : undefined

  // CAR-02: optional carro tag — null means "no carro" / clear (free of category).
  const carroId = decodeCarroId(formData)

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

  // HG-01: re-derive category ownership server-side (FKs are not RLS-aware).
  if (!(await assertOwnedCategories(supabase, [parsed.data.categoryId]))) {
    return { error: 'Categoria inválida.' }
  }

  // RSV-02: when the NEW category is Reserva, require + own-check the reserva BEFORE
  // mutating the transaction, so a Reserva edit without a chosen reserva fails fast.
  if (await isReservaCategory(supabase, parsed.data.categoryId)) {
    if (!reservaId) return { error: 'Selecione uma reserva.' }
    if (!(await assertOwnedReserva(supabase, reservaId))) {
      return { error: 'Reserva inválida.' }
    }
  }

  // CAR-02 / T-09-01: re-derive carro ownership before the carro_id FK write (FKs
  // are not RLS-aware). WR-04 tri-state: 'error' → generic retry; 'not-owned' →
  // 'Carro inválido.'. Clearing (carroId null) needs no check — own rows only.
  if (carroId !== null) {
    const owned = await assertOwnedCarro(supabase, carroId)
    if (owned === 'error') {
      return { error: 'Não foi possível atualizar a transação. Tente novamente.' }
    }
    if (owned === 'not-owned') return { error: 'Carro inválido.' }
  }

  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: parsed.data.categoryId,
      amount_cents: amountCents,
      occurred_on: parsed.data.occurredOn,
      description: parsed.data.description,
      carro_id: carroId, // CAR-02: optional carro tag (null = untagged/cleared)
    })
    .eq('id', id)
  if (error)
    return {
      error: moneyWriteError(error, 'Não foi possível atualizar a transação.'),
    }

  // Sync the linked ledger entry: delete-old + (if Reserva) insert a fresh 'in'.
  // This is the edit/undo path — re-classifying away from Reserva removes the
  // entry so the saldo re-derives; no orphan, no double-count (Open Question 3).
  const sync = await syncReservaLedgerForTransaction(
    supabase,
    userId,
    id,
    parsed.data.categoryId,
    amountCents,
    parsed.data.occurredOn,
    reservaId,
    true, // edit path — delete any pre-existing linked entry first
  )
  if ('error' in sync) return sync

  revalidatePath(EXTRATO_PATH)
  revalidatePath(RESERVAS_PATH)
  revalidatePath(DASHBOARD_PATH)
  return { ok: true }
}

/** Remove the user's own transaction by id (TXN-02); RLS scopes the delete. */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // Explicitly drop any linked aporte entry first so the reserva saldo drops
  // immediately (the FK is ON DELETE SET NULL — it would otherwise UNLINK but keep
  // the entry, leaving a phantom aporte in the saldo). RLS scopes the delete.
  const { error: ledgerError } = await supabase
    .from('reserva_ledger')
    .delete()
    .eq('transaction_id', id)
  if (ledgerError) return { error: 'Não foi possível excluir a transação.' }

  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) return { error: 'Não foi possível excluir a transação.' }

  revalidatePath(EXTRATO_PATH)
  revalidatePath(RESERVAS_PATH)
  revalidatePath(DASHBOARD_PATH)
  return { ok: true }
}

/** A uuid carro id on the bulk-tag path — validated at the boundary (WR-06). */
const carroIdSchema = z.string().uuid('Selecione um carro')

/**
 * Tag (or clear) the `carro_id` of every selected own transaction in a SINGLE
 * update().in('id', ids) (CAR-02). Modeled verbatim on bulkReclassify: RLS scopes
 * the UPDATE to the caller's own rows even if an id is forged (the
 * bulk-reclassify.test.ts guarantee — a forged id touches 0 foreign rows).
 *
 * D4 (non-destructive lens, T-09-02): the write payload contains ONLY carro_id —
 * never category_id, amount_cents, kind, or the reserva_ledger — so tagging cannot
 * perturb any metas aggregate. Only '/extrato' is revalidated (tagging does not
 * affect '/reservas' or '/dashboard' metas).
 *
 * T-09-01: the target carro is validated ONCE for the whole batch via the WR-04
 * tri-state assertOwnedCarro before any write; a forged carro_id issues NO write.
 * A null carroId (bulk-unlink) is always allowed on own rows — no ownership check.
 */
export async function bulkTagCarro(
  ids: string[],
  carroId: string | null,
): Promise<ActionResult> {
  if (ids.length === 0) return { error: 'Nenhuma transação selecionada.' }

  // WR-06: every selected id must be a UUID before it reaches `.in('id', ids)`.
  if (!ids.every((id) => idSchema.safeParse(id).success)) {
    return { error: 'Seleção inválida.' }
  }

  // The carro target, when set, must be a real uuid before the ownership re-derive.
  if (carroId !== null && !carroIdSchema.safeParse(carroId).success) {
    return { error: 'Carro inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // T-09-01: re-derive carro ownership ONCE for the whole batch (FKs are not
  // RLS-aware). WR-04 tri-state: 'error' → generic retry; 'not-owned' → invalid.
  // A null carroId (bulk-unlink) needs no check — clearing own rows is allowed.
  if (carroId !== null) {
    const owned = await assertOwnedCarro(supabase, carroId)
    if (owned === 'error') {
      return { error: 'Não foi possível vincular ao carro. Tente novamente.' }
    }
    if (owned === 'not-owned') return { error: 'Carro inválido.' }
  }

  // D4 (T-09-02): update ONLY carro_id — never category_id or the reserva_ledger.
  // RLS scopes the UPDATE to the caller's own rows even if an id is forged.
  const { error } = await supabase
    .from('transactions')
    .update({ carro_id: carroId })
    .in('id', ids)
  if (error) return { error: 'Não foi possível vincular ao carro.' }

  // Tagging does not affect metas — only the extrato view changes (D4).
  revalidatePath(EXTRATO_PATH)
  return { ok: true }
}

/**
 * CR-01: tag (or clear) the `carro_id` of ONE own transaction — the single-row
 * counterpart to bulkTagCarro. Routing the row-menu "Vincular a carro" through this
 * (instead of updateTransaction) makes the carro tag CATEGORY-FREE: it never
 * re-validates categoryId/reservaId and never re-parses the amount, so it works for
 * an imported-but-unclassified row (category_id === null) and for a Reserva-category
 * row alike (CR-01 / WR-01 / WR-02). D4: the write payload is carro_id ONLY.
 *
 * Implemented as a single-id reuse of bulkTagCarro so the RLS scoping + WR-04
 * tri-state assertOwnedCarro ownership re-derive are shared verbatim — a forged carro
 * issues no write, a forged tx id touches 0 foreign rows, and a null carroId clears
 * the tag on the caller's own row.
 */
export async function tagCarro(
  id: string,
  carroId: string | null,
): Promise<ActionResult> {
  return bulkTagCarro([id], carroId)
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

  // WR-06: every selected id must be a UUID before it reaches `.in('id', ids)`.
  if (!ids.every((id) => idSchema.safeParse(id).success)) {
    return { error: 'Seleção inválida.' }
  }

  const parsed = categoryIdSchema.safeParse(categoryId)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // HG-01: re-derive ownership of the target category server-side before the
  // bulk update (FKs are not RLS-aware — a forged target would otherwise stick).
  if (!(await assertOwnedCategories(supabase, [parsed.data]))) {
    return { error: 'Categoria inválida.' }
  }

  // HG-01: the bulk path has no UI to collect a per-row reservaId, so it CANNOT
  // create the required aporte ('in') ledger entry for a Reserva target. Block
  // bulk-into-Reserva server-side (authoritative — the picker also hides it) so
  // we never count the spend as alocação while the saldo/ledger stays untouched.
  if (await isReservaCategory(supabase, parsed.data)) {
    return {
      error: 'Use o lançamento individual para classificar como Reserva.',
    }
  }

  const { error } = await supabase
    .from('transactions')
    .update({ category_id: parsed.data })
    .in('id', ids)
  if (error) return { error: 'Não foi possível reclassificar.' }

  // HG-01: the target is now a NON-Reserva category, so any of these rows that
  // previously carried a linked aporte ('in') entry must have it removed — else a
  // phantom aporte keeps inflating the old reserva's saldo (the single-row edit
  // path deletes it via deleteOld; the bulk path must mirror that). RLS scopes the
  // delete to the caller's own ledger rows.
  const { error: ledgerError } = await supabase
    .from('reserva_ledger')
    .delete()
    .in('transaction_id', ids)
  if (ledgerError) return { error: 'Não foi possível sincronizar a reserva.' }

  revalidatePath(EXTRATO_PATH)
  revalidatePath(RESERVAS_PATH)
  revalidatePath(DASHBOARD_PATH)
  return { ok: true }
}
