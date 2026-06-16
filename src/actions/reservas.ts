'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { parseBRLToCents } from '@/lib/money'
import { reservaSchema, saidaSchema } from '@/lib/schemas/reserva'
import { createClient } from '@/lib/supabase/server'

/**
 * Reserva Server Actions (RSV-01/04/05). Mirrors actions/transactions.ts +
 * actions/budget-targets.ts verbatim in structure: Zod safeParse at the boundary
 * → { error } (never throws/leaks), getClaims() for the owner, parseBRLToCents
 * (throw → friendly money message), revalidatePath('/reservas') on success.
 *
 * The load-bearing pieces:
 *  - registerSaida calls the atomic register_reserva_saida RPC — the authoritative
 *    never-negative / TOCTOU-safe guard (the balance read + insert happen in ONE
 *    function body under the caller's RLS, hardened with a per-reserva row lock in
 *    migration 0017). The action does NOT read-balance-then-insert app-side (Pitfall 4).
 *  - assertOwnedReserva re-derives ownership of every client-supplied reserva_id
 *    BEFORE the RPC: FKs are not RLS-aware (the Phase-2 IDOR lesson, pinned by
 *    tests/reserva-idor.test.ts). The RPC is hardened as a backstop, but the action
 *    re-derives for a friendly error instead of a raw DB-exception toast.
 */
export type ActionResult = { error: string } | { ok: true }

const RESERVAS_PATH = '/reservas'

/**
 * WR-06: validate every row-id argument before it reaches `.eq('id', id)`. RLS
 * already makes a foreign/garbage id safe, so this is defense-in-depth + cleaner
 * errors (a non-UUID id otherwise raises 22P02 surfaced as a confusing toast).
 */
const idSchema = z.string().uuid('Identificador inválido')

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

/**
 * HG-01 / IDOR: verify the reserva id belongs to the caller before writing it as a
 * foreign key (or handing it to the saída RPC). RLS scopes WHICH reserva_ledger
 * rows are written (the caller's own), but Postgres foreign keys are NOT RLS-aware:
 * a forged `reserva_id` pointing at another user's reserva satisfies the FK (the
 * row exists globally). The RLS-active client only returns the caller's own
 * reservas, so a `select id where id = $1` that returns exactly 1 row means owned;
 * 0 rows ⇒ not owned ⇒ reject. (Verbatim clone of assertOwnedCategories applied to
 * reserva_id — pinned by tests/reserva-idor.test.ts.)
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
 * Parse the optional alvo (raw pt-BR money string) to integer centavos, or null
 * when absent/blank (RSV-01: alvo is optional — no alvo means no progress bar).
 * Throws on a non-blank but unparseable money string so the caller maps it to the
 * friendly "Valor monetário inválido." copy.
 */
function parseOptionalAlvo(alvo: string | undefined): number | null {
  if (alvo === undefined) return null
  const trimmed = alvo.trim()
  if (trimmed === '') return null
  return parseBRLToCents(trimmed)
}

/** Create a named reserva for the user, with an optional alvo (RSV-01). */
export async function createReserva(input: {
  nome: string
  alvo?: string
}): Promise<ActionResult> {
  const parsed = reservaSchema.safeParse(input)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  let alvoCents: number | null
  try {
    alvoCents = parseOptionalAlvo(parsed.data.alvo)
  } catch {
    return { error: 'Valor monetário inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('reservas').insert({
    user_id: userId,
    nome: parsed.data.nome,
    alvo_cents: alvoCents,
  })
  if (error) return { error: 'Não foi possível salvar a reserva.' }

  revalidatePath(RESERVAS_PATH)
  return { ok: true }
}

/**
 * Edit an owned reserva (RSV-01). Setting alvo empty stores null (removes the
 * progress bar). RLS scopes the update to the caller — a forged id touches 0 rows.
 */
export async function updateReserva(
  id: string,
  input: { nome: string; alvo?: string },
): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const parsed = reservaSchema.safeParse(input)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  let alvoCents: number | null
  try {
    alvoCents = parseOptionalAlvo(parsed.data.alvo)
  } catch {
    return { error: 'Valor monetário inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('reservas')
    .update({ nome: parsed.data.nome, alvo_cents: alvoCents })
    .eq('id', id)
  if (error) return { error: 'Não foi possível atualizar a reserva.' }

  revalidatePath(RESERVAS_PATH)
  return { ok: true }
}

/** Remove an owned reserva (RSV-01); RLS scopes the delete, the ledger cascades. */
export async function deleteReserva(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('reservas').delete().eq('id', id)
  if (error) return { error: 'Não foi possível excluir a reserva.' }

  revalidatePath(RESERVAS_PATH)
  return { ok: true }
}

/**
 * Register a saída (withdrawal) against a reserva (RSV-04). The validation that a
 * saída never overdraws is the RPC's job (atomic, race-safe — Pattern 5 / Pitfall
 * 4); the action only re-derives ownership for a friendly error and maps the RPC's
 * overdraw raise to the UI-SPEC copy.
 */
export async function registerSaida(input: {
  reservaId: string
  amount: string
  occurredOn: string
  note?: string
}): Promise<ActionResult> {
  const parsed = saidaSchema.safeParse(input)
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

  // IDOR: re-derive reserva ownership BEFORE the RPC (FKs are not RLS-aware). The
  // RPC's balance read also returns null for a foreign reserva (backstop), but
  // this gives a friendly field error instead of a raw DB-exception toast.
  if (!(await assertOwnedReserva(supabase, parsed.data.reservaId))) {
    return { error: 'Reserva inválida.' }
  }

  const { error } = await supabase.rpc('register_reserva_saida', {
    p_reserva_id: parsed.data.reservaId,
    p_amount_cents: amountCents,
    p_occurred_on: parsed.data.occurredOn,
    p_note: parsed.data.note ?? '',
  })
  // LW-02: the RPC raises the DEDICATED SQLSTATE 'P0002' for an overdraw (0018) → map
  // to the friendly UI-SPEC copy by branching on the structured `error.code`, not the
  // pt-BR message text (a copy/i18n change must not downgrade this to the generic
  // toast). Any other error → generic fallback (never raw details to the client).
  if (error) {
    if (error.code === 'P0002') {
      return { error: 'A saída não pode ser maior que o saldo da reserva.' }
    }
    return { error: 'Não foi possível registrar a saída.' }
  }

  revalidatePath(RESERVAS_PATH)
  return { ok: true }
}
