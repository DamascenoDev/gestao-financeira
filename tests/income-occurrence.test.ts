// 2-W0-02 (INC-02): editing a single month's occurrence must NOT change the template
// nor any other month's occurrence; re-materializing a month is idempotent
// (onConflict user_id,template_id,month_key + ignoreDuplicates) — no duplicate row and
// the edited value survives (never clobbered).
//
// This exercises the income substrate directly (template + occurrence + unique
// constraint) delivered by 02-01. The materialize-on-read ACTION wrapper ships in
// 02-02 (Receitas); this test asserts the DB-level guarantees the action relies on.
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let user: { id: string; jwt: string }
let templateId: string

async function createUser(): Promise<{ id: string; jwt: string }> {
  const email = `income-occ-${crypto.randomUUID()}@example.test`
  const password = 'test-password-123!'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const signIn = userClient('', config)
  const { data: session, error: signInErr } = await signIn.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr || !session.session) throw new Error(`signIn failed: ${signInErr?.message}`)
  return { id: data.user.id, jwt: session.session.access_token }
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  user = await createUser()

  const { data: tpl, error: tplErr } = await admin
    .from('income_templates')
    .insert({ user_id: user.id, source: 'Salário', amount_cents: 500000, day_of_month: 5 })
    .select('id')
    .single()
  if (tplErr || !tpl) throw new Error(`template seed failed: ${tplErr?.message}`)
  templateId = tpl.id
})

afterAll(async () => {
  if (user?.id) await admin.auth.admin.deleteUser(user.id).catch(() => {})
})

describe('income occurrence edit isolation + idempotent materialize (INC-02)', () => {
  it('editing one month does not touch the template or another month', async () => {
    const u = userClient(user.jwt, config)

    // Materialize two months from the template.
    const months = ['2026-06', '2026-07']
    for (const month_key of months) {
      const { error } = await u.from('income_occurrences').upsert(
        {
          user_id: user.id,
          template_id: templateId,
          source: 'Salário',
          amount_cents: 500000,
          month_key,
          occurred_on: `${month_key}-05`,
        },
        { onConflict: 'user_id,template_id,month_key', ignoreDuplicates: true },
      )
      expect(error).toBeNull()
    }

    // Edit ONLY June's occurrence amount.
    const { error: editErr } = await u
      .from('income_occurrences')
      .update({ amount_cents: 450000 })
      .eq('template_id', templateId)
      .eq('month_key', '2026-06')
    expect(editErr).toBeNull()

    // Template unchanged.
    const { data: tpl } = await u
      .from('income_templates')
      .select('amount_cents')
      .eq('id', templateId)
      .single()
    expect(Number(tpl!.amount_cents)).toBe(500000)

    // July occurrence unchanged.
    const { data: july } = await u
      .from('income_occurrences')
      .select('amount_cents')
      .eq('template_id', templateId)
      .eq('month_key', '2026-07')
      .single()
    expect(Number(july!.amount_cents)).toBe(500000)
  })

  it('re-materializing June is idempotent — no duplicate, edited value survives', async () => {
    const u = userClient(user.jwt, config)

    // Re-run the upsert for June (ignoreDuplicates → no-op on conflict).
    const { error } = await u.from('income_occurrences').upsert(
      {
        user_id: user.id,
        template_id: templateId,
        source: 'Salário',
        amount_cents: 500000,
        month_key: '2026-06',
        occurred_on: '2026-06-05',
      },
      { onConflict: 'user_id,template_id,month_key', ignoreDuplicates: true },
    )
    expect(error).toBeNull()

    const { data } = await u
      .from('income_occurrences')
      .select('amount_cents')
      .eq('template_id', templateId)
      .eq('month_key', '2026-06')
    expect(data ?? []).toHaveLength(1) // no duplicate
    expect(Number(data![0]!.amount_cents)).toBe(450000) // edit preserved, not clobbered
  })
})
