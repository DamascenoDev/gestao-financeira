'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { assertOwnedCarro } from '@/lib/ownership'
import { carroSchema, type CarroInput } from '@/lib/schemas/carro'
import { createClient } from '@/lib/supabase/server'

/**
 * Carro Server Actions (CAR-01). Mirrors actions/mei.ts + actions/reservas.ts
 * EXACTLY in structure: Zod safeParse at the boundary → { error } (never
 * throws/leaks), getClaims() for the owner, revalidatePath('/carros') on success,
 * DB errors mapped to friendly generic strings (raw details never returned).
 *
 * Edit/archive/unarchive re-derive ownership (assertOwnedCarro) BEFORE the
 * `.eq('id', id)` write: defense-in-depth over RLS + clean IDOR errors — a forged
 * carro_id pointing at another user's carro satisfies the FK globally (FKs are not
 * RLS-aware), so the action re-derives and issues NO write when it isn't owned
 * (Pitfall 6/7, T-08-06). This is the typed, validated boundary the Plan 03 UI calls.
 */
export type ActionResult = { error: string } | { ok: true }

const CARROS_PATH = '/carros'

/**
 * Validate every row-id argument before it reaches `.eq('id', id)`. RLS already
 * makes a foreign/garbage id safe, so this is defense-in-depth + cleaner errors (a
 * non-UUID id otherwise triggers a 22P02 surfaced as a confusing toast).
 */
const idSchema = z.string().uuid('Identificador inválido')

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

/**
 * Map a CarroInput's optional fields to the carros insert/update shape: undefined
 * optionals are stored as null (a carro with only an apelido has no modelo/placa/
 * ano/combustivel).
 */
function carroWriteFields(input: CarroInput) {
  return {
    apelido: input.apelido,
    modelo: input.modelo ?? null,
    placa: input.placa ?? null,
    ano: input.ano ?? null,
    combustivel_padrao: input.combustivel_padrao ?? null,
  }
}

/** Create a carro for the user (apelido required, the rest optional). CAR-01. */
export async function createCarro(input: CarroInput): Promise<ActionResult> {
  const parsed = carroSchema.safeParse(input)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('carros').insert({
    user_id: userId,
    ...carroWriteFields(parsed.data),
  })
  if (error) return { error: 'Não foi possível salvar o carro.' }

  revalidatePath(CARROS_PATH)
  return { ok: true }
}

/** Edit an owned carro — re-derive ownership BEFORE the write so a forged id never updates (T-08-06). */
export async function updateCarro(
  id: string,
  input: CarroInput,
): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const parsed = carroSchema.safeParse(input)
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // IDOR re-derive (Pitfall 6/7): a forged id not owned by the caller never reaches
  // the `.eq('id', id)` update — no write is issued. WR-04: a transient query error
  // is NOT a "not owned" — surface a generic retry message instead of telling the
  // user their legitimately-owned carro is invalid.
  const owned = await assertOwnedCarro(supabase, id)
  if (owned === 'error') return { error: 'Não foi possível atualizar o carro. Tente novamente.' }
  if (owned === 'not-owned') return { error: 'Carro inválido.' }

  const { error } = await supabase
    .from('carros')
    .update(carroWriteFields(parsed.data))
    .eq('id', id)
  if (error) return { error: 'Não foi possível atualizar o carro.' }

  revalidatePath(CARROS_PATH)
  return { ok: true }
}

/**
 * Toggle is_archived on an owned carro (soft archive/unarchive — CAR-01). Both
 * paths re-derive ownership BEFORE the write (a forged id issues no write, T-08-06).
 */
async function setArchived(id: string, archived: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // WR-04: distinguish a transient query error from a genuine not-owned result so a
  // backend hiccup on an owned carro doesn't surface as "Carro inválido."
  const owned = await assertOwnedCarro(supabase, id)
  if (owned === 'error') return { error: 'Não foi possível atualizar o carro. Tente novamente.' }
  if (owned === 'not-owned') return { error: 'Carro inválido.' }

  const { error } = await supabase
    .from('carros')
    .update({ is_archived: archived })
    .eq('id', id)
  if (error) return { error: 'Não foi possível atualizar o carro.' }

  revalidatePath(CARROS_PATH)
  return { ok: true }
}

/** Archive an owned carro (hide from the active list without deleting its history). */
export async function archiveCarro(id: string): Promise<ActionResult> {
  return setArchived(id, true)
}

/** Restore an archived carro to the active list. */
export async function unarchiveCarro(id: string): Promise<ActionResult> {
  return setArchived(id, false)
}
