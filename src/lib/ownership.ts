// Shared ownership re-derive + reserva-aporte ledger helpers (the IDOR + RSV
// substrate). Factored out of actions/transactions.ts so BOTH transactions.ts and
// actions/import.ts (confirmImport) consume ONE consistent code path — no
// cross-sibling drift, one ledger write path (the Phase 2-3 lesson; Pitfall 6/8/9).
//
// This is a PLAIN module (not 'use server'): the Server-Action modules import these
// helpers, but a plain module may freely export both async re-derives and the sync
// money-error mapper. The Supabase client is always passed in (RLS-active), so every
// re-derive runs under the caller's own row visibility.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import type { Database } from '@/types/database.types'

/** The RLS-active server Supabase client, typed to the generated Database. */
export type Client = SupabaseClient<Database>

/** A uuid reserva id on the aporte path (RSV-02). */
const reservaIdSchema = z.string().uuid('Selecione uma reserva')

/** A Postgres error carries a SQLSTATE `code` we can branch on (MD-03). */
export type DbError = { code?: string } | null

/** Shared result shape for the ledger-sync + confirm helpers. */
export type SyncResult = { error: string } | { ok: true }

/**
 * MD-03: differentiate the DB errors the user can act on instead of collapsing
 * everything into one generic string. 23514 (check_violation) is the
 * `amount_cents > 0` money rule → a money-specific message; everything else keeps
 * the provided generic fallback. Raw error details are never returned to the client.
 */
export function moneyWriteError(error: DbError, fallback: string): string {
  if (error?.code === '23514') return 'Valor monetário inválido.'
  return fallback
}

/**
 * HG-01: verify EVERY category id belongs to the caller before writing it as a
 * foreign key. RLS scopes WHICH rows are written (the caller's own), but Postgres
 * foreign keys are NOT RLS-aware: a forged `category_id` pointing at another user's
 * category satisfies the FK (the row exists globally) and would silently attach the
 * caller's financial data to a category they do not own (IDOR on the FK target). The
 * RLS-active client only returns the caller's own categories, so a `select ... in
 * (ids)` that returns fewer rows than requested means at least one id is missing or
 * not-owned — reject the whole write.
 */
export async function assertOwnedCategories(
  supabase: Client,
  ids: string[],
): Promise<boolean> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return true
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .in('id', unique)
  if (error || !data) return false
  return data.length === unique.length
}

/**
 * IDOR (Pitfall 6): verify the reserva id belongs to the caller before writing it as
 * the `reserva_ledger.reserva_id` / `merchant_patterns.reserva_id` FK. RLS scopes
 * WHICH rows are written, but Postgres FKs are NOT RLS-aware — a forged reserva_id
 * pointing at another user's bucket satisfies the FK globally. The RLS-active client
 * only returns the caller's own reservas, so a `select id where id = $1` returning
 * exactly 1 row means owned; 0 ⇒ reject.
 */
export async function assertOwnedReserva(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('reservas').select('id').eq('id', id)
  if (error || !data) return false
  return data.length === 1
}

/**
 * IDOR (Pitfall 6, T-04-02): verify the statement id belongs to the caller before
 * writing it as the `transactions.statement_id` FK on confirmImport. Verbatim clone
 * of assertOwnedReserva applied to statements — a forged statement_id pointing at
 * another user's statement satisfies the FK globally; the RLS-active client only
 * returns the caller's own statements, so exactly 1 row = owned; 0 ⇒ reject.
 */
export async function assertOwnedStatement(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('statements').select('id').eq('id', id)
  if (error || !data) return false
  return data.length === 1
}

/**
 * IDOR (Pitfall 7, T-05-03): verify the mei_invoice id belongs to the caller before
 * using a client-supplied `mei_invoice_id` on the edit/delete path. Verbatim clone of
 * assertOwnedStatement applied to mei_invoices — a forged mei_invoice_id pointing at
 * another user's NF satisfies the FK globally (Postgres FKs are NOT RLS-aware); the
 * RLS-active client only returns the caller's own invoices, so exactly 1 row = owned;
 * 0 ⇒ reject. (MEI-01)
 */
export async function assertOwnedMeiInvoice(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase.from('mei_invoices').select('id').eq('id', id)
  if (error || !data) return false
  return data.length === 1
}

/**
 * RSV-02 / Open Question 2: a category triggers the aporte sub-flow ONLY when its
 * `is_reserva` FLAG is set — never a name match (the user may rename it; CAT-02).
 * The flag is read under the RLS-active client so a foreign/garbage id yields no row
 * (treated as not-Reserva). Keys off the migration-0012 flag, the stable handle.
 */
export async function isReservaCategory(
  supabase: Client,
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
 * RSV-02 (Open Question 3): keep the reserva_ledger consistent with a transaction's
 * category on create AND edit AND import-confirm through ONE code path. Optionally
 * delete-old (the partial unique(transaction_id) index makes the re-link idempotent
 * — no orphan, no double-count); then, ONLY when the category carries the
 * `is_reserva` flag, require + ownership-check the reservaId and insert a fresh `in`
 * entry linked to the txn.
 *
 * An aporte is an entrada ('in') — it raises the reserva's saldo and (via the
 * alocação grouping in v_adherence_*) the investment allocation total, and NEVER a
 * consumo spend (RSV-03 / RSV-06, pinned by tests/reserva-aporte.test.ts +
 * tests/import-reserva-aporte.test.ts).
 *
 * Returns an { error } when the Reserva category is chosen without a (valid, owned)
 * reservaId so the caller can surface it; otherwise { ok: true }.
 */
export async function syncReservaLedgerForTransaction(
  supabase: Client,
  userId: string,
  txnId: string,
  categoryId: string,
  amountCents: number,
  occurredOn: string,
  reservaId: string | undefined,
  // EDIT path only: drop any pre-existing linked entry first. A freshly-inserted
  // transaction (create / import path) has none, so we skip the delete to avoid
  // touching the ledger at all on a non-Reserva create.
  deleteOld: boolean,
): Promise<SyncResult> {
  const isReserva = await isReservaCategory(supabase, categoryId)

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
