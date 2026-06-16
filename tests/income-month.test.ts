// 2-W0-01 (INC-04): v_income_month sums all of a month's income occurrences
// (recurring + avulsa) into the "receita líquida do mês", as one row per month,
// readable under the caller's own JWT (security_invoker view).
//
// GREEN as of 02-01: the migrated stack + security_invoker view make this pass now.
// (No feature action is required — this exercises the view directly.)
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

const MONTH = '2026-06'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let user: { id: string; jwt: string }

async function createUser(): Promise<{ id: string; jwt: string }> {
  const email = `income-month-${crypto.randomUUID()}@example.test`
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

  // Seed one recurring occurrence + one avulsa for the month via the service client.
  const { error } = await admin.from('income_occurrences').insert([
    {
      user_id: user.id,
      template_id: null,
      source: 'Salário',
      amount_cents: 500000,
      month_key: MONTH,
      occurred_on: `${MONTH}-05`,
    },
    {
      user_id: user.id,
      template_id: null,
      source: 'Freela',
      amount_cents: 120000,
      month_key: MONTH,
      occurred_on: `${MONTH}-20`,
    },
  ])
  if (error) throw new Error(`seed failed: ${error.message}`)
})

afterAll(async () => {
  if (user?.id) await admin.auth.admin.deleteUser(user.id).catch(() => {})
})

describe('v_income_month — receita líquida do mês (INC-04)', () => {
  it('sums all of a month income into one row equal to the total', async () => {
    const u = userClient(user.jwt, config)
    const { data, error } = await u
      .from('v_income_month')
      .select('month_key, total_cents')
      .eq('month_key', MONTH)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(1)
    expect(Number(data![0]!.total_cents)).toBe(620000)
  })
})
