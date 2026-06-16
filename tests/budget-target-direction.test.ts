// 3-W0-01 (BUD-01 — direction default by kind): the DB stores whatever direction is
// written (both 'teto' and 'alvo' are accepted on any category — the direction is a
// business rule, NOT a DB default, because it depends on the category's kind). The
// default-from-kind affordance (consumo→teto, alocacao→alvo) lives in the action/form
// that ships in Plan 03-03 (upsertBudgetTarget); that half is RED-pending here.
//
// GREEN now: the schema/DB half (both directions accepted, override persists).
// RED until 03-03: the action-default half (it.skip below) — flip to it() when
// upsertBudgetTarget exists.
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

async function catByKind(a: SupabaseClient, kind: 'consumo' | 'alocacao'): Promise<string> {
  const { data } = await a
    .from('categories')
    .select('id')
    .eq('user_id', userA.id)
    .eq('kind', kind)
    .limit(1)
    .single()
  return data!.id
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('btdir-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('budget_targets direction — DB stores both directions (BUD-01)', () => {
  it('a consumo category accepts a teto target', async () => {
    const a = userClient(userA.jwt, config)
    const cat = await catByKind(a, 'consumo')
    const { data, error } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat, percent_bp: 3000, direction: 'teto' })
      .select('direction')
      .single()
    expect(error).toBeNull()
    expect(data!.direction).toBe('teto')
  })

  it('an alocacao category accepts an alvo target', async () => {
    const a = userClient(userA.jwt, config)
    const cat = await catByKind(a, 'alocacao')
    const { data, error } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat, percent_bp: 2000, direction: 'alvo' })
      .select('direction')
      .single()
    expect(error).toBeNull()
    expect(data!.direction).toBe('alvo')
  })

  it('a user OVERRIDE to the opposite direction persists (no DB default forces it)', async () => {
    const a = userClient(userA.jwt, config)
    // A consumo category with an explicit 'alvo' override (the user inverted the default).
    const { data: cat } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'Override', kind: 'consumo' })
      .select('id')
      .single()
    const { data, error } = await a
      .from('budget_targets')
      .insert({ user_id: userA.id, category_id: cat!.id, percent_bp: 1500, direction: 'alvo' })
      .select('direction')
      .single()
    expect(error).toBeNull()
    expect(data!.direction).toBe('alvo')
  })

  it('rejects an invalid direction value', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'Bad dir', kind: 'consumo' })
      .select('id')
      .single()
    const { error } = await a
      .from('budget_targets')
      // 'nope' is not in the teto/alvo check constraint — the DB rejects it.
      .insert({ user_id: userA.id, category_id: cat!.id, percent_bp: 1000, direction: 'nope' })
    expect(error).not.toBeNull()
  })

  // RED-PENDING until Plan 03-03 ships upsertBudgetTarget: the action defaults the
  // direction from the category kind (consumo→teto, alocacao→alvo) when the user does
  // not override it. Flip `it.skip` → `it` and import the action when it exists.
  it.skip('[03-03] upsertBudgetTarget defaults direction from kind (consumo→teto, alocacao→alvo)', () => {
    // const { upsertBudgetTarget } = await import('@/app/(app)/dashboard/actions')
    // → asserting the defaulted direction round-trips per kind.
    expect(true).toBe(true)
  })
})
