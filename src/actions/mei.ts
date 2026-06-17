'use server'

import { revalidatePath } from 'next/cache'

import { parseBRLToCents } from '@/lib/money'
import { assertOwnedMeiInvoice, moneyWriteError } from '@/lib/ownership'
import {
  meiInvoiceSchema,
  meiSettingsSchema,
  meiYearFlagSchema,
} from '@/lib/schemas/mei'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

/**
 * MEI Server Actions: NF CRUD + the single mei_settings row + the per-year
 * employee flag. Mirrors actions/incomes.ts EXACTLY: Zod safeParse at the boundary
 * → { error } (never throws/leaks), getClaims() for the owner, parseBRLToCents
 * (throw → friendly message), moneyWriteError maps the 23514 check, revalidatePath
 * on success. Money is bigint centavos — the GROSS billed NF value, never net.
 *
 * Edit/delete re-derive ownership (assertOwnedMeiInvoice) BEFORE the `.eq('id', id)`
 * write: defense-in-depth over RLS + clean IDOR errors (Pitfall 7, T-05-05). MEI-01/03.
 */
export type ActionResult = { error: string } | { ok: true }

const MEI_PATH = '/mei'

/**
 * WR-06: validate every row-id argument before it reaches `.eq('id', id)`. RLS
 * already makes a foreign/garbage id safe, so this is defense-in-depth + cleaner
 * errors (a non-UUID otherwise triggers a 22P02 the generic catch obscures).
 */
const idSchema = z.string().uuid('Identificador inválido')

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

/** Create a NF (gross receita): user_id from getClaims, positive cents, DASN bucket. */
export async function createMeiInvoice(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = meiInvoiceSchema.safeParse({
    issuedOn: formData.get('issuedOn'),
    amount: formData.get('amount'),
    tomador: formData.get('tomador'),
    descricao: formData.get('descricao') ?? undefined,
    activityType: formData.get('activityType'),
  })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  let amountCents: number
  try {
    // The GROSS billed value of the NF — never a net/after-tax amount (MEI-02).
    amountCents = parseBRLToCents(parsed.data.amount)
  } catch {
    return { error: 'Valor monetário inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('mei_invoices').insert({
    user_id: userId,
    issued_on: parsed.data.issuedOn,
    amount_cents: amountCents,
    tomador: parsed.data.tomador,
    descricao: parsed.data.descricao ?? '',
    activity_type: parsed.data.activityType,
  })
  if (error)
    return {
      error: moneyWriteError(error, 'Não foi possível salvar a nota fiscal.'),
    }

  revalidatePath(MEI_PATH)
  return { ok: true }
}

/** Edit a NF — re-derive ownership BEFORE the write so a forged id never updates (T-05-05). */
export async function updateMeiInvoice(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const parsed = meiInvoiceSchema.safeParse({
    issuedOn: formData.get('issuedOn'),
    amount: formData.get('amount'),
    tomador: formData.get('tomador'),
    descricao: formData.get('descricao') ?? undefined,
    activityType: formData.get('activityType'),
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

  // IDOR re-derive (Pitfall 7): a forged id not owned by the caller never reaches
  // the `.eq('id', id)` update — no write is issued.
  if (!(await assertOwnedMeiInvoice(supabase, id))) {
    return { error: 'Nota fiscal inválida.' }
  }

  const { error } = await supabase
    .from('mei_invoices')
    .update({
      issued_on: parsed.data.issuedOn,
      amount_cents: amountCents,
      tomador: parsed.data.tomador,
      descricao: parsed.data.descricao ?? '',
      activity_type: parsed.data.activityType,
    })
    .eq('id', id)
  if (error)
    return {
      error: moneyWriteError(error, 'Não foi possível atualizar a nota fiscal.'),
    }

  revalidatePath(MEI_PATH)
  return { ok: true }
}

/** Delete a NF — re-derive ownership BEFORE the delete (T-05-05). */
export async function deleteMeiInvoice(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  if (!(await assertOwnedMeiInvoice(supabase, id))) {
    return { error: 'Nota fiscal inválida.' }
  }

  const { error } = await supabase.from('mei_invoices').delete().eq('id', id)
  if (error) return { error: 'Não foi possível excluir a nota fiscal.' }

  revalidatePath(MEI_PATH)
  return { ok: true }
}

/** Upsert the single (user_id) mei_settings row — the start date drives the limit. */
export async function upsertMeiSettings(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = meiSettingsSchema.safeParse({
    meiStartDate: formData.get('meiStartDate'),
  })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('mei_settings')
    .upsert(
      { user_id: userId, mei_start_date: parsed.data.meiStartDate },
      { onConflict: 'user_id' },
    )
  if (error) return { error: 'Não foi possível salvar as configurações.' }

  revalidatePath(MEI_PATH)
  return { ok: true }
}

/** Upsert the (user_id, year) DASN employee flag (default Não). */
export async function upsertMeiYearFlag(
  year: number,
  hasEmployee: boolean,
): Promise<ActionResult> {
  const parsed = meiYearFlagSchema.safeParse({ year, hasEmployee })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('mei_year_flags')
    .upsert(
      {
        user_id: userId,
        year: parsed.data.year,
        has_employee: parsed.data.hasEmployee,
      },
      { onConflict: 'user_id,year' },
    )
  if (error) return { error: 'Não foi possível salvar as configurações.' }

  revalidatePath(MEI_PATH)
  return { ok: true }
}
