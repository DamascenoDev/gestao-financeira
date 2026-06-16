// 3-W0-01 (BUD-01): budget_targets CRUD round-trips and unique(user_id, category_id)
// makes a second target for the same category an UPSERT (one meta per category), not
// a duplicate. percent_bp domain (0 < bp <= 10000) is enforced.
//
// GREEN as of 03-01: the 0011 table + unique constraint enforce this NOW.
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

async function aConsumoCategory(a: SupabaseClient): Promise<string> {
  const { data } = await a
    .from('categories')
    .select('id')
    .eq('user_id', userA.id)
    .eq('kind', 'consumo')
    .limit(1)
    .single()
  return data!.id
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('btcrud-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('budget_targets CRUD + one-meta-per-category (BUD-01)', () => {
  it('insert round-trips a target', async () => {
    const a = userClient(userA.jwt, config)
    const cat = await aConsumoCategory(a)
    const { data, error } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat, percent_bp: 3000, direction: 'teto' })
      .select('percent_bp, direction')
      .single()
    expect(error).toBeNull()
    expect(data!.percent_bp).toBe(3000)
    expect(data!.direction).toBe('teto')
  })

  it('a second target for the SAME category is an upsert, not a duplicate', async () => {
    const a = userClient(userA.jwt, config)
    const cat = await aConsumoCategory(a)
    // Upsert on the unique (user_id, category_id) key → updates the existing row.
    const { error } = await a
      .from('budget_targets')
      .upsert(
        { user_id: userA.id, category_id: cat, percent_bp: 4500, direction: 'teto' },
        { onConflict: 'user_id,category_id' },
      )
    expect(error).toBeNull()
    const { data: all } = await a
      .from('budget_targets')
      .select('percent_bp')
      .eq('category_id', cat)
    expect(all ?? []).toHaveLength(1)
    expect(all![0]!.percent_bp).toBe(4500)
  })

  it('a raw duplicate insert (no upsert) violates the unique constraint', async () => {
    const a = userClient(userA.jwt, config)
    const cat = await aConsumoCategory(a)
    const { error } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat, percent_bp: 1000, direction: 'teto' })
    expect(error).not.toBeNull()
  })

  it('rejects percent_bp out of domain (0 < bp <= 10000)', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'Domain test', kind: 'consumo' })
      .select('id')
      .single()
    const { error: zero } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat!.id, percent_bp: 0, direction: 'teto' })
    expect(zero).not.toBeNull()
    const { error: over } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat!.id, percent_bp: 10001, direction: 'teto' })
    expect(over).not.toBeNull()
  })

  it('update + delete a target', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'CRUD cat', kind: 'consumo' })
      .select('id')
      .single()
    const { data: created } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat!.id, percent_bp: 2000, direction: 'teto' })
      .select('id')
      .single()
    const { data: updated } = await a
      .from('budget_targets')
      .update({ percent_bp: 2500 })
      .eq('id', created!.id)
      .select('percent_bp')
      .single()
    expect(updated!.percent_bp).toBe(2500)
    await a.from('budget_targets').delete().eq('id', created!.id)
    const { data: gone } = await a
      .from('budget_targets')
      .select('id')
      .eq('id', created!.id)
    expect(gone ?? []).toHaveLength(0)
  })
})
