// CLS-06 (4-W0-08): recurring detection. A descriptor_norm appearing in ≥3 distinct
// civil months is flagged by v_recurring_descriptors (security_invoker → caller's
// own rows only). The substrate proof ships now: seed a descriptor across 3 months
// and it shows; across 2 it does not. The review-time RecorrenteTag + is_recurring
// flag at confirm land in Plan 03.
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
let userA: { id: string; jwt: string }

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
  userA = await createUser('recur-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

async function seed(a: SupabaseClient, catId: string, norm: string, months: string[]) {
  for (const m of months) {
    await a.from('transactions').insert({
      user_id: userA.id,
      category_id: catId,
      amount_cents: 1500,
      occurred_on: `${m}-05`,
      description: norm,
      descriptor_norm: norm,
      dedupe_key: `recur-${norm}-${m}-${crypto.randomUUID()}`,
    })
  }
}

describe('CLS-06: v_recurring_descriptors flags ≥3 distinct months', () => {
  it('a descriptor across 3 distinct months IS flagged recurring', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .limit(1)
      .single()
    await seed(a, cat!.id, 'spotify', ['2026-01', '2026-02', '2026-03'])

    const { data } = await a
      .from('v_recurring_descriptors')
      .select('descriptor_norm, month_count')
      .eq('descriptor_norm', 'spotify')
      .maybeSingle()
    expect(data?.month_count).toBeGreaterThanOrEqual(3)
  })

  it('a descriptor across only 2 distinct months is NOT flagged', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .limit(1)
      .single()
    await seed(a, cat!.id, 'cafe esquina', ['2026-01', '2026-02'])

    const { data } = await a
      .from('v_recurring_descriptors')
      .select('descriptor_norm')
      .eq('descriptor_norm', 'cafe esquina')
      .maybeSingle()
    expect(data).toBeNull()
  })

  // GREEN in Plan 03 — the review-time recurring flag + RecorrenteTag.
  it.todo('confirmImport / review marks is_recurring from the recurring heuristic [Plan 03]')
})
