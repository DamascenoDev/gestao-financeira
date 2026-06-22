'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { assertOwnedCarro, assertOwnedTransaction } from '@/lib/ownership'
import {
  abastecimentoSchema,
  type AbastecimentoInput,
} from '@/lib/schemas/abastecimento'
import { createClient } from '@/lib/supabase/server'

/**
 * Abastecimento Server Actions (CAR-03). Mirrors actions/carros.ts + the
 * actions/transactions.ts carro_id sync EXACTLY in structure: Zod safeParse at the
 * boundary → { error } (never throws/leaks), getClaims() sub-gate → 'Sessão
 * expirada.', revalidatePath on success, DB errors mapped to friendly generic
 * strings (raw details never returned).
 *
 * Two security-critical invariants live here (T-10-04/05/06/07):
 *  - Cost-source XOR: enforced in abastecimentoSchema AND the DB CHECK (0027).
 *  - DUAL ownership re-derive BEFORE any FK write:
 *      1. assertOwnedCarro(carroId) tri-state — a forged carro_id never writes.
 *      2. From-fatura: assertOwnedTransaction(transactionId) + an "already linked?"
 *         pre-check — a forged/foreign tx writes NOTHING and never receives carro_id;
 *         a tx already linked to another abastecimento is rejected (1:1).
 * On the from-fatura path the linked transaction's carro_id is set so the fuel
 * appears in the carro's spend (mirror the actions/transactions.ts carro_id payload
 * — write ONLY carro_id, never category/amount). preco_litro is NEVER stored here —
 * it is derived for display only (lib/carro/consumo.ts).
 */
export type ActionResult = { error: string } | { ok: true }

const CARROS_PATH = '/carros'

/** Validate a row-id argument before it reaches `.eq('id', id)` (defense-in-depth + clean errors). */
const idSchema = z.string().uuid('Identificador inválido')

const ALREADY_LINKED = 'Este lançamento já está vinculado a um abastecimento.'

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

function carroPath(carroId: string): string {
  return `${CARROS_PATH}/${carroId}`
}

/**
 * Map a validated AbastecimentoInput to the abastecimentos insert/update shape.
 * The cost source materializes one of THREE EXCLUSIVE states (the schema + the
 * 0039 `abastecimentos_cost_xor` CHECK guarantee exactly one of these holds):
 *   1. À-VISTA por fatura: transaction_id set, amount_cents null, valor_total_cents
 *      null, parcelas_total null.
 *   2. À-VISTA manual:     amount_cents set (centavos), transaction_id null,
 *      valor_total_cents null, parcelas_total null.
 *   3. PARCELADO:          valor_total_cents set (centavos, D-09) + parcelas_total
 *      (>= 2), and BOTH transaction_id AND amount_cents NULL — the cost is counted
 *      ONCE via valor_total_cents (no double-count); the parcela tx links live in
 *      the `abastecimento_parcelas` junction (Phase 28), never on this row.
 *
 * Parcelado is detected by the SAME rule as the 27-01 schema:
 * `parcelasTotal !== undefined && parcelasTotal > 1`. À-VISTA convention (27-01):
 * `parcelas_total` is written as NULL (the 0039 CHECK treats null-or-1 as
 * não-parcelado). preco_litro is never written.
 */
function abastecimentoWriteFields(input: AbastecimentoInput, userId: string) {
  const isParcelado =
    input.parcelasTotal !== undefined && input.parcelasTotal > 1

  // PARCELADO: cost-of-record is valor_total_cents; both à-vista sources are NULL
  //   so the spend is never double-counted, and the tx 1:1 pre-check never runs.
  // À-VISTA: keep the original cost XOR untouched; never carry a parcelado total.
  // A single object shape (number | null on every cost column) so the Supabase
  // insert/update overload type-checks identically for both states.
  return {
    user_id: userId,
    carro_id: input.carroId,
    occurred_on: input.occurredOn,
    odometro_km: input.odometroKm,
    litros: input.litros,
    tanque_cheio: input.tanqueCheio,
    combustivel: input.combustivel ?? null,
    parcelas_total: isParcelado ? (input.parcelasTotal ?? null) : null,
    valor_total_cents: isParcelado ? (input.valorTotalCents ?? null) : null,
    transaction_id: isParcelado ? null : (input.transactionId ?? null),
    amount_cents: isParcelado ? null : (input.amountCents ?? null),
  }
}

/** Create an abastecimento (CAR-03) — dual IDOR + cost XOR + carro_id link sync. */
export async function createAbastecimento(
  input: AbastecimentoInput,
): Promise<ActionResult> {
  const parsed = abastecimentoSchema.safeParse(input)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // 1. Re-derive carro ownership BEFORE any FK write (FKs are not RLS-aware).
  //    WR-04 tri-state: 'error' → generic retry; 'not-owned' → 'Carro inválido.'.
  const owned = await assertOwnedCarro(supabase, parsed.data.carroId)
  if (owned === 'error') {
    return { error: 'Não foi possível salvar o abastecimento. Tente novamente.' }
  }
  if (owned === 'not-owned') return { error: 'Carro inválido.' }

  const { transactionId } = parsed.data

  // 2. From-fatura path: re-derive transaction ownership + the 1:1 link pre-check
  //    BEFORE writing anything. A forged/foreign tx writes nothing (T-10-05).
  if (transactionId !== undefined) {
    if (!(await assertOwnedTransaction(supabase, transactionId))) {
      return { error: 'Lançamento inválido.' }
    }
    // Defense-in-depth over the partial unique index (T-10-07): reject a tx already
    // linked to another abastecimento before we insert.
    const { data: existing, error: linkErr } = await supabase
      .from('abastecimentos')
      .select('id')
      .eq('transaction_id', transactionId)
    if (linkErr) {
      return { error: 'Não foi possível salvar o abastecimento. Tente novamente.' }
    }
    if (existing && existing.length > 0) return { error: ALREADY_LINKED }
  }

  // Insert the abastecimento (cost source already exclusive per the schema).
  const { error: insertErr } = await supabase
    .from('abastecimentos')
    .insert(abastecimentoWriteFields(parsed.data, userId))
  if (insertErr) {
    // A partial-unique violation (race) means the tx was linked between the
    // pre-check and the insert → map to the already-linked error, no carro_id sync.
    if ((insertErr as { code?: string }).code === '23505') {
      return { error: ALREADY_LINKED }
    }
    return { error: 'Não foi possível salvar o abastecimento.' }
  }

  // From-fatura: sync carro_id onto the linked transaction so the fuel cost shows
  // in the carro's spend. Write ONLY carro_id — never touch category/amount (the
  // tag is non-accounting, D4). The tx is already confirmed owned above.
  if (transactionId !== undefined) {
    const { error: tagErr } = await supabase
      .from('transactions')
      .update({ carro_id: parsed.data.carroId })
      .eq('id', transactionId)
    if (tagErr) {
      return { error: 'Não foi possível vincular o lançamento ao carro.' }
    }
  }

  revalidatePath(CARROS_PATH)
  revalidatePath(carroPath(parsed.data.carroId))
  return { ok: true }
}

/**
 * Edit an owned abastecimento (CAR-03). Re-derive carro ownership BEFORE the write
 * so a forged carroId never updates. RLS scopes the `.eq('id', id)` to the caller's
 * own row. NOTE: editing the cost source (relinking transactions) is out of scope
 * for v1 — the cost fields are written but the prior linked transaction's carro_id
 * is NOT re-synced here (the additive tag is harmless if left; documented).
 */
export async function updateAbastecimento(
  id: string,
  input: AbastecimentoInput,
): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const parsed = abastecimentoSchema.safeParse(input)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const owned = await assertOwnedCarro(supabase, parsed.data.carroId)
  if (owned === 'error') {
    return { error: 'Não foi possível atualizar o abastecimento. Tente novamente.' }
  }
  if (owned === 'not-owned') return { error: 'Carro inválido.' }

  const { transactionId } = parsed.data
  if (transactionId !== undefined) {
    if (!(await assertOwnedTransaction(supabase, transactionId))) {
      return { error: 'Lançamento inválido.' }
    }
    // The 1:1 pre-check must ignore THIS abastecimento's own existing link.
    const { data: existing, error: linkErr } = await supabase
      .from('abastecimentos')
      .select('id')
      .eq('transaction_id', transactionId)
      .neq('id', id)
    if (linkErr) {
      return { error: 'Não foi possível atualizar o abastecimento. Tente novamente.' }
    }
    if (existing && existing.length > 0) return { error: ALREADY_LINKED }
  }

  const { error: updErr } = await supabase
    .from('abastecimentos')
    .update(abastecimentoWriteFields(parsed.data, userId))
    .eq('id', id)
  if (updErr) {
    if ((updErr as { code?: string }).code === '23505') return { error: ALREADY_LINKED }
    return { error: 'Não foi possível atualizar o abastecimento.' }
  }

  if (transactionId !== undefined) {
    const { error: tagErr } = await supabase
      .from('transactions')
      .update({ carro_id: parsed.data.carroId })
      .eq('id', transactionId)
    if (tagErr) {
      return { error: 'Não foi possível vincular o lançamento ao carro.' }
    }
  }

  revalidatePath(CARROS_PATH)
  revalidatePath(carroPath(parsed.data.carroId))
  return { ok: true }
}

/**
 * Remove an owned abastecimento (CAR-03). RLS scopes the delete to the caller — a
 * forged id touches 0 rows. The linked transaction's carro_id is left as-is (the
 * additive non-accounting tag is harmless; clearing it on delete is out of scope
 * for v1).
 */
export async function deleteAbastecimento(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('abastecimentos').delete().eq('id', id)
  if (error) return { error: 'Não foi possível excluir o abastecimento.' }

  revalidatePath(CARROS_PATH)
  return { ok: true }
}
