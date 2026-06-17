// 5-W0-06 (MEI-02/04, T-05-01 / Pitfall 6): v_mei_year_summary is security_invoker — a
// second user reads ZERO of the first user's MEI summary. This is the proof the view
// inherits RLS instead of running as the definer (a DEFINER view would leak every
// user's MEI revenue). Clone of tests/view-leak.test.ts for the MEI summary view.
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

const YEAR = 2026

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }

async function createUser(prefix: string): Promise<{ id: string; jwt: string }> {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`
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
  userA = await createUser('mei-leak-a')
  userB = await createUser('mei-leak-b')

  const a = userClient(userA.jwt, config)
  await a.from('mei_settings').insert({ user_id: userA.id, mei_start_date: `${YEAR}-01-10` })
  await a.from('mei_invoices').insert({
    user_id: userA.id,
    issued_on: `${YEAR}-02-01`,
    amount_cents: 500000,
    tomador: 'Cliente A',
    descricao: '',
    activity_type: 'servicos',
  })
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('v_mei_year_summary is security_invoker (T-05-01)', () => {
  it('user A sees its own summary row', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a.from('v_mei_year_summary').select('*').eq('year', YEAR)
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it('user B reads ZERO of user A summary rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('v_mei_year_summary').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })
})
