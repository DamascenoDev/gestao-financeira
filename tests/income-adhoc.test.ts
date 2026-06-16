// 2-W0-03 (INC-03): multiple avulsas (template_id NULL) are allowed in the same
// month — Postgres treats NULLs as distinct in the unique(user_id,template_id,month_key)
// index, so the de-dup only applies to materialized template occurrences.
//
// Exercises the income substrate delivered by 02-01. The createAdhocIncome ACTION
// ships in 02-02 (Receitas); this asserts the DB-level guarantee it relies on.
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
  const email = `income-adhoc-${crypto.randomUUID()}@example.test`
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
})

afterAll(async () => {
  if (user?.id) await admin.auth.admin.deleteUser(user.id).catch(() => {})
})

describe('multiple avulsas in the same month (INC-03)', () => {
  it('allows two template_id NULL occurrences in the same month_key', async () => {
    const u = userClient(user.jwt, config)
    const rows = [
      {
        user_id: user.id,
        template_id: null,
        source: 'Venda 1',
        amount_cents: 10000,
        month_key: MONTH,
        occurred_on: `${MONTH}-10`,
      },
      {
        user_id: user.id,
        template_id: null,
        source: 'Venda 2',
        amount_cents: 20000,
        month_key: MONTH,
        occurred_on: `${MONTH}-15`,
      },
    ]
    const { error } = await u.from('income_occurrences').insert(rows)
    expect(error).toBeNull()

    const { data } = await u
      .from('income_occurrences')
      .select('id')
      .is('template_id', null)
      .eq('month_key', MONTH)
    expect(data ?? []).toHaveLength(2)
  })
})
