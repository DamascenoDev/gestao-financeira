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
const RESERVAS_PATH = '/reservas'
const DASHBOARD_PATH = '/dashboard'

/** Optional reservaId on the aporte path (RSV-02) — a uuid when present. */
const reservaIdSchema = z.string().uuid('Selecione uma reserva')

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

/** A Postgres error carries a SQLSTATE `code` we can branch on (MD-03). */
type DbError = { code?: string } | null

/**
 * MD-03: differentiate the DB errors the user can act on instead of collapsing
 * everything into one generic string. 23514 (check_violation) is the
 * `amount_cents > 0` money rule → a money-specific message; everything else keeps
 * the provided generic fallback. Raw error details are never returned to the client.
 */
function moneyWriteError(error: DbError, fallback: string): string {
  if (error?.code === '23514') return 'Valor monetário inválido.'
  return fallback
}

/**
 * HG-01: verify EVERY category id belongs to the caller before writing it as a
 * foreign key. RLS scopes WHICH transaction rows are written (the caller's own),
 * but Postgres foreign keys are NOT RLS-aware: a forged `category_id` pointing at
 * another user's category satisfies the FK (the row exists globally) and would
 * silently attach the caller's financial data to a category they do not own
 * (IDOR on the FK target). The RLS-active client only returns the caller's own
 * categories, so a `select ... in (ids)` that returns fewer rows than requested
 * means at least one id is missing or not-owned — reject the whole write.
 */
async function assertOwnedCategories(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<boolean> {
  const unique = [...new Set(ids)]
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .in('id', unique)
  if (error || !data) return false
  return data.length === unique.length
}

/**
 * RSV-02 / Open Question 2: a category triggers the aporte sub-flow ONLY when its
 * `is_reserva` FLAG is set — never a name match (the user may rename it; CAT-02).
 * The flag is read under the RLS-active client so a foreign/garbage id yields no
 * row (treated as not-Reserva). Keys off the migration-0012 flag, the stable handle.
 */
async function isReservaCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('categories')
    .select('is_reserva')
    .eq('id', categoryId)
    .maybeSingle()
  if (error || !data) return false
  return data.is_reserva === true
}

/**
 * IDOR (Pitfall 6): verify the reserva id belongs to the caller before writing it
 * as the `reserva_ledger.reserva_id` FK. RLS scopes WHICH ledger rows are written,
 * but Postgres FKs are NOT RLS-aware — a forged reserva_id pointing at another
 * user's bucket satisfies the FK globally. The RLS-active client only returns the
 * caller's own reservas, so a `select id where id = $1` returning exactly 1 row
 * means owned; 0 ⇒ reject. (Verbatim clone of assertOwnedCategories applied to
 * reservas — mirrors actions/reservas.ts; pinned by tests/reserva-idor.test.ts.)
 */
async function assertOwnedReserva(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('reservas').select('id').eq('id', id)
  if (error || !data) return false
  return data.length === 1
}

/**
 * RSV-02 (Open Question 3): keep the reserva_ledger consistent with a transaction's
 * category on create AND edit through ONE code path. Always delete-old (the partial
 * unique(transaction_id) index makes the re-link idempotent — no orphan, no
 * double-count); then, ONLY when the category carries the `is_reserva` flag, require
 * + ownership-check the reservaId and insert a fresh `in` entry linked to the txn.
 *
 * An aporte is an entrada ('in') — it raises the reserva's saldo and (via the
 * alocação grouping in v_adherence_*) the investment allocation total, and NEVER a
 * consumo spend (RSV-03, pinned by tests/reserva-aporte.test.ts).
 *
 * Returns an { error } when the Reserva category is chosen without a (valid, owned)
 * reservaId so the caller can surface it; otherwise { ok: true }.
 */
async function syncReservaLedgerForTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  txnId: string,
  categoryId: string,
  amountCents: number,
  occurredOn: string,
  reservaId: string | undefined,
  // EDIT path only: drop any pre-existing linked entry first. A freshly-inserted
  // transaction (create path) has none, so we skip the delete to avoid touching the
  // ledger at all on a non-Reserva create.
  deleteOld: boolean,
): Promise<ActionResult> {
  const isReserva = await isReservaCategory(supabase, categoryId)

  // Delete-old: on an edit, drop any existing linked entry. On a non-Reserva edit
  // this is the undo (balance re-derives); on a Reserva edit it clears the way for
  // the idempotent re-link. Skipped on create (nothing to delete) — and on a
  // non-Reserva create the ledger is never touched.
  if (deleteOld) {
    const { error: delError } = await supabase
      .from('reserva_ledger')
      .delete()
      .eq('transaction_id', txnId)
    if (delError) return { error: 'Não foi possível sincronizar a reserva.' }
  }

  if (!isReserva) return { ok: true }

  if (!reservaId) return { error: 'Selecione uma reserva.' }
  if (!reservaIdSchema.safeParse(reservaId).success) {
    return { error: 'Reserva inválida.' }
  }
  if (!(await assertOwnedReserva(supabase, reservaId))) {
    return { error: 'Reserva inválida.' }
  }

  const { error: insError } = await supabase.from('reserva_ledger').insert({
    user_id: userId,
    reserva_id: reservaId,
    kind: 'in', // an aporte is an entrada — raises the saldo + alocação total
    amount_cents: amountCents, // positive bigint; sign derives from kind
    transaction_id: txnId,
    occurred_on: occurredOn,
  })
  if (insError) return { error: 'Não foi possível registrar o aporte.' }
  return { ok: true }
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

  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      category_id: parsed.data.categoryId,
      amount_cents: amountCents, // positive bigint; sign derives from kind
      kind: 'expense',
      occurred_on: parsed.data.occurredOn,
      description: parsed.data.description,
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

  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: parsed.data.categoryId,
      amount_cents: amountCents,
      occurred_on: parsed.data.occurredOn,
      description: parsed.data.description,
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
