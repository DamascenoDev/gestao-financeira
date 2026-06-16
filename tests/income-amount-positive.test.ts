// HG-03 / MD-03: income amounts must be STRICTLY POSITIVE at the DB layer (0009
// migration tightened income_*.amount_cents to > 0, matching transactions). A
// zero or negative amount raises 23514 (check_violation) — the SQLSTATE the
// actions map to the friendly "Valor monetário inválido." message (MD-03).
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

async function createUser(): Promise<{ id: string; jwt: string }> {
  const email = `income-pos-${crypto.randomUUID()}@example.test`
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

describe('income amount strictly positive (HG-03 / MD-03)', () => {
  it('rejects a ZERO-amount template with 23514 (check_violation)', async () => {
    const u = userClient(user.jwt, config)
    const { error } = await u.from('income_templates').insert({
      user_id: user.id,
      source: 'Zero',
      amount_cents: 0,
      day_of_month: 5,
      is_active: true,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it('rejects a ZERO-amount occurrence (avulsa) with 23514', async () => {
    const u = userClient(user.jwt, config)
    const { error } = await u.from('income_occurrences').insert({
      user_id: user.id,
      template_id: null,
      source: 'Zero avulsa',
      amount_cents: 0,
      month_key: '2026-06',
      occurred_on: '2026-06-10',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it('rejects a NEGATIVE-amount occurrence with 23514', async () => {
    const u = userClient(user.jwt, config)
    const { error } = await u.from('income_occurrences').insert({
      user_id: user.id,
      template_id: null,
      source: 'Negativa',
      amount_cents: -100,
      month_key: '2026-06',
      occurred_on: '2026-06-10',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it('accepts a positive amount', async () => {
    const u = userClient(user.jwt, config)
    const { error } = await u.from('income_occurrences').insert({
      user_id: user.id,
      template_id: null,
      source: 'Válida',
      amount_cents: 1000,
      month_key: '2026-06',
      occurred_on: '2026-06-10',
    })
    expect(error).toBeNull()
  })
})
