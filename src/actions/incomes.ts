'use server'

import { revalidatePath } from 'next/cache'

import { parseBRLToCents } from '@/lib/money'
import { monthBounds, monthKeyOf, toMonthKeyOrCurrent } from '@/lib/month'
import {
  incomeAdhocSchema,
  incomeOccurrenceSchema,
  incomeTemplateSchema,
} from '@/lib/schemas/income'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'
import { z } from 'zod'

/**
 * Income Server Actions: recurring templates + per-month occurrences + ad-hoc
 * avulsas, plus the idempotent materialize-on-read. Mirrors actions/auth.ts:
 * Zod safeParse at the boundary → { error } (never throws/leaks), getClaims()
 * for the owner, parseBRLToCents (throw → friendly message), revalidatePath on
 * success. Money is bigint centavos; the sign is fixed positive (INC).
 */
export type ActionResult = { error: string } | { ok: true }

type TemplateRow = Database['public']['Tables']['income_templates']['Row']
type OccurrenceInsert =
  Database['public']['Tables']['income_occurrences']['Insert']

const RECEITAS_PATH = '/receitas'

/**
 * WR-06: validate every row-id argument before it reaches `.eq('id', id)`. RLS
 * already makes a foreign/garbage id safe (it matches 0 of the caller's rows),
 * so this is defense-in-depth + cleaner errors: a non-UUID id otherwise triggers
 * a 22P02 (invalid_text_representation) DB error that the generic catch turns
 * into a confusing toast.
 */
const idSchema = z.string().uuid('Identificador inválido')

/**
 * Concrete civil day for a template's monthly occurrence: the template's
 * day_of_month clamped to the month's last day (so day 31 in February becomes
 * the 28th/29th). Returns a 'YYYY-MM-DD' string. (RESEARCH Pattern 1)
 */
function occurredOnFor(monthKey: string, dayOfMonth: number): string {
  const { first, last } = monthBounds(monthKey)
  const lastDay = Number(last.slice(8, 10))
  const day = Math.min(Math.max(dayOfMonth, 1), lastDay)
  return `${first.slice(0, 7)}-${String(day).padStart(2, '0')}`
}

/**
 * Month key 'YYYY-MM' for an avulsa, derived from its picked date (INC-03).
 * Routes through lib/month so there is ONE owner of month-key derivation (WR-01).
 */
function monthKeyFromDate(occurredOn: string): string {
  return monthKeyOf(occurredOn)
}

function firstIssue(message: string | undefined): string {
  return message ?? 'Dados inválidos'
}

/** A Postgres error carries a SQLSTATE `code` we can branch on (MD-03). */
type DbError = { code?: string } | null

/**
 * MD-03: map the `amount_cents > 0` check violation (23514) to a money-specific
 * message instead of a generic "não foi possível salvar"; keep the generic
 * fallback otherwise. Raw error details are never returned to the client.
 */
function moneyWriteError(error: DbError, fallback: string): string {
  if (error?.code === '23514') return 'Valor monetário inválido.'
  return fallback
}

/**
 * Materialize-on-read: upsert one occurrence per active template for the month.
 * `ignoreDuplicates` makes a re-open a no-op — it never overwrites an INC-02
 * edit (no clobber, no duplicate). Idempotent on (user_id, template_id, month_key).
 */
export async function ensureMonthOccurrences(monthKey: string): Promise<void> {
  const supabase = await createClient()

  const { data: templates } = await supabase
    .from('income_templates')
    .select('*')
    .eq('is_active', true)

  const activeTemplates = (templates ?? []) as TemplateRow[]
  if (activeTemplates.length === 0) return

  const rows: OccurrenceInsert[] = activeTemplates.map((t) => ({
    user_id: t.user_id,
    template_id: t.id,
    source: t.source,
    amount_cents: t.amount_cents,
    month_key: monthKey,
    occurred_on: occurredOnFor(monthKey, t.day_of_month),
  }))

  await supabase
    .from('income_occurrences')
    .upsert(rows, {
      onConflict: 'user_id,template_id,month_key',
      ignoreDuplicates: true,
    })
}

/** Create a recurring template AND materialize its occurrence for the month (INC-01). */
export async function createIncomeTemplate(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = incomeTemplateSchema.safeParse({
    source: formData.get('source'),
    amount: formData.get('amount'),
    dayOfMonth: formData.get('dayOfMonth'),
    isActive: true,
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

  // WR-03 / MD-02: never trust an unchecked cast — validate the month key and
  // fall back to the current month so no malformed value reaches date-fns/the DB.
  const monthKey = toMonthKeyOrCurrent(formData.get('monthKey'))

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { data: tpl, error: tplErr } = await supabase
    .from('income_templates')
    .insert({
      user_id: userId,
      source: parsed.data.source,
      amount_cents: amountCents,
      day_of_month: parsed.data.dayOfMonth,
      is_active: true,
    })
    .select('id')
    .single()
  if (tplErr || !tpl) {
    return {
      error: moneyWriteError(
        tplErr,
        'Não foi possível salvar a receita recorrente.',
      ),
    }
  }

  // Materialize this template's occurrence for the selected month immediately.
  const { error: occErr } = await supabase
    .from('income_occurrences')
    .upsert(
      {
        user_id: userId,
        template_id: tpl.id,
        source: parsed.data.source,
        amount_cents: amountCents,
        month_key: monthKey,
        occurred_on: occurredOnFor(monthKey, parsed.data.dayOfMonth),
      },
      {
        onConflict: 'user_id,template_id,month_key',
        ignoreDuplicates: true,
      },
    )
  if (occErr)
    return {
      error: moneyWriteError(occErr, 'Não foi possível materializar a ocorrência.'),
    }

  revalidatePath(RECEITAS_PATH)
  return { ok: true }
}

/** Ad-hoc (avulsa) income — template_id NULL, month_key from occurred_on (INC-03). */
export async function createAdhocIncome(
  formData: FormData,
): Promise<ActionResult> {
  const parsed = incomeAdhocSchema.safeParse({
    source: formData.get('source'),
    amount: formData.get('amount'),
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

  // The schema regex allows a well-shaped but out-of-range date (e.g. 2026-13-45);
  // monthKeyOf rejects an impossible month so it never reaches the DB (WR-01/MD-02).
  let monthKey: string
  try {
    monthKey = monthKeyFromDate(parsed.data.occurredOn)
  } catch {
    return { error: 'Data inválida' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('income_occurrences').insert({
    user_id: userId,
    template_id: null,
    source: parsed.data.source,
    amount_cents: amountCents,
    month_key: monthKey,
    occurred_on: parsed.data.occurredOn,
  })
  if (error)
    return {
      error: moneyWriteError(error, 'Não foi possível salvar a receita avulsa.'),
    }

  revalidatePath(RECEITAS_PATH)
  return { ok: true }
}

/** Edit ONLY this month's occurrence — never the template, never other months (INC-02). */
export async function updateOccurrence(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const parsed = incomeOccurrenceSchema.safeParse({
    amount: formData.get('amount'),
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
    .from('income_occurrences')
    .update({ amount_cents: amountCents })
    .eq('id', id)
  if (error)
    return {
      error: moneyWriteError(error, 'Não foi possível atualizar a receita.'),
    }

  revalidatePath(RECEITAS_PATH)
  return { ok: true }
}

/**
 * Edit the template (affects future months' materialization), not past occurrences.
 *
 * WR-04: the amount-only edit dialog must NOT silently overwrite the template's
 * real source/day-of-month. When the FormData omits `source`/`dayOfMonth` (the
 * amount-only path), we update ONLY `amount_cents` and leave the genuine
 * source/day untouched — instead of writing client-held props that defaulted to
 * the occurrence snapshot + day 5. A full edit (source + dayOfMonth present)
 * still validates the whole schema and writes all three fields.
 */
export async function updateTemplate(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const rawSource = formData.get('source')
  const rawDay = formData.get('dayOfMonth')
  // Amount-only intent: neither template structural field was sent.
  const amountOnly = rawSource === null && rawDay === null

  let amountCents: number
  try {
    amountCents = parseBRLToCents(formData.get('amount') as string)
  } catch {
    return { error: 'Valor monetário inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // Amount-only: never touch source/day_of_month (WR-04 — no silent reset to 5).
  if (amountOnly) {
    const { error } = await supabase
      .from('income_templates')
      .update({ amount_cents: amountCents })
      .eq('id', id)
    if (error)
      return {
        error: moneyWriteError(error, 'Não foi possível atualizar o template.'),
      }

    revalidatePath(RECEITAS_PATH)
    return { ok: true }
  }

  // Full edit: validate + write the whole template row.
  const parsed = incomeTemplateSchema.safeParse({
    source: rawSource,
    amount: formData.get('amount'),
    dayOfMonth: rawDay,
    isActive: true,
  })
  if (!parsed.success) {
    return { error: firstIssue(parsed.error.issues[0]?.message) }
  }

  const { error } = await supabase
    .from('income_templates')
    .update({
      source: parsed.data.source,
      amount_cents: amountCents,
      day_of_month: parsed.data.dayOfMonth,
    })
    .eq('id', id)
  if (error)
    return {
      error: moneyWriteError(error, 'Não foi possível atualizar o template.'),
    }

  revalidatePath(RECEITAS_PATH)
  return { ok: true }
}

/** Remove a single occurrence (a month's recurring instance or an avulsa). */
export async function deleteOccurrence(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { error: 'Identificador inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase
    .from('income_occurrences')
    .delete()
    .eq('id', id)
  if (error) return { error: 'Não foi possível excluir a receita.' }

  revalidatePath(RECEITAS_PATH)
  return { ok: true }
}
