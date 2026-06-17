// 5-W0-04 (MEI-01/03, T-05-02): two-user RLS isolation on the three MEI tables. User A
// inserts NFs (both activity_types), mei_settings, and a mei_year_flags row; they
// persist. User B reads ZERO of user A's mei_invoices / mei_settings / mei_year_flags.
// This is the proof the uniform USING+WITH CHECK auth.uid()=user_id policies actually
// isolate per user (forgetting ENABLE RLS is a silent leak).
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
  userA = await createUser('mei-rls-a')
  userB = await createUser('mei-rls-b')

  const a = userClient(userA.jwt, config)
  await a.from('mei_settings').insert({
    user_id: userA.id,
    mei_start_date: `${YEAR}-03-15`,
  })
  await a.from('mei_year_flags').insert({
    user_id: userA.id,
    year: YEAR,
    has_employee: true,
  })
  await a.from('mei_invoices').insert([
    {
      user_id: userA.id,
      issued_on: `${YEAR}-04-10`,
      amount_cents: 250000,
      tomador: 'Cliente Comércio',
      descricao: 'venda',
      activity_type: 'comercio_industria',
    },
    {
      user_id: userA.id,
      issued_on: `${YEAR}-05-20`,
      amount_cents: 350000,
      tomador: 'Cliente Serviço',
      descricao: 'consultoria',
      activity_type: 'servicos',
    },
  ])
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('MEI tables RLS isolation (T-05-02)', () => {
  it("user A's NFs (both activity_types) + settings + year flag persist", async () => {
    const a = userClient(userA.jwt, config)
    const { data: inv } = await a.from('mei_invoices').select('activity_type')
    expect((inv ?? []).length).toBe(2)
    const types = (inv ?? []).map((r) => r.activity_type).sort()
    expect(types).toEqual(['comercio_industria', 'servicos'])

    const { data: settings } = await a.from('mei_settings').select('mei_start_date')
    expect(settings).toHaveLength(1)
    expect(settings?.[0]?.mei_start_date).toBe(`${YEAR}-03-15`)

    const { data: flags } = await a.from('mei_year_flags').select('has_employee').eq('year', YEAR)
    expect(flags).toHaveLength(1)
    expect(flags?.[0]?.has_employee).toBe(true)
  })

  it('user B reads ZERO of user A mei_invoices', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('mei_invoices').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('user B reads ZERO of user A mei_settings', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('mei_settings').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('user B reads ZERO of user A mei_year_flags', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('mei_year_flags').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })
})
