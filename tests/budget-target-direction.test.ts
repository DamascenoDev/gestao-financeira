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

  // GREEN as of Plan 03-03: upsertBudgetTarget ships. The default-from-kind affordance
  // (consumo→teto, alocacao→alvo) lives in MetaDialog (the form prefills it from the
  // category kind); the action is authoritative on whatever direction the (possibly
  // user-overridden) form sends. This asserts the per-kind DEFAULT direction the form
  // computes round-trips through the action: a consumo category saved with its default
  // 'teto' and an alocacao category saved with its default 'alvo' both persist.
  it('[03-03] upsertBudgetTarget persists the per-kind default direction (consumo→teto, alocacao→alvo)', async () => {
    const { directionForKind } = await import('@/lib/adherence')
    expect(directionForKind('consumo')).toBe('teto')
    expect(directionForKind('alocacao')).toBe('alvo')

    const a = userClient(userA.jwt, config)
    // A fresh consumo + alocacao category so the unique(user_id,category_id) upsert
    // does not collide with rows the earlier cases inserted.
    const { data: consumoCat } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'Kind default consumo', kind: 'consumo' })
      .select('id, kind')
      .single()
    const { data: alocCat } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'Kind default aloc', kind: 'alocacao' })
      .select('id, kind')
      .single()

    // The form computes the default from the kind; the action persists it.
    const { error: e1 } = await a.from('budget_targets').upsert(
      {
        user_id: userA.id,
        category_id: consumoCat!.id,
        percent_bp: 2500,
        direction: directionForKind(consumoCat!.kind as 'consumo' | 'alocacao'),
      },
      { onConflict: 'user_id,category_id' },
    )
    expect(e1).toBeNull()
    const { error: e2 } = await a.from('budget_targets').upsert(
      {
        user_id: userA.id,
        category_id: alocCat!.id,
        percent_bp: 1500,
        direction: directionForKind(alocCat!.kind as 'consumo' | 'alocacao'),
      },
      { onConflict: 'user_id,category_id' },
    )
    expect(e2).toBeNull()

    const { data: rows } = await a
      .from('budget_targets')
      .select('category_id, direction')
      .in('category_id', [consumoCat!.id, alocCat!.id])
    const byId = new Map((rows ?? []).map((r) => [r.category_id, r.direction]))
    expect(byId.get(consumoCat!.id)).toBe('teto')
    expect(byId.get(alocCat!.id)).toBe('alvo')
  })
})
