// HG-01 / HG-02 (IDOR on category_id FK target): a category_id is validated only
// as a well-formed UUID before being written as a foreign key. Postgres FKs are
// NOT RLS-aware — a forged id pointing at ANOTHER user's category satisfies the
// FK (the row exists globally) and would silently attach the caller's financial
// data to a category they do not own.
//
// This test proves BOTH halves of the fix:
//  (1) the RAW DB write accepts a foreign category_id → RLS alone does NOT close
//      the hole, so a server-side ownership check is mandatory;
//  (2) the ownership check the actions use (`select id from categories where id
//      in (...)` under the caller's RLS) returns 0 of the foreign id → it is a
//      correct, sufficient guard;
//  (3) reassign_and_delete_category(src, foreign_dst) now ABORTS (HG-02 hardened
//      RPC) instead of reassigning to the foreign category.
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
let userB: { id: string; jwt: string }
let catA: string
let catB: string // user B's category — the forged FK target

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

async function newCategory(
  u: SupabaseClient,
  userId: string,
  name: string,
): Promise<string> {
  const { data, error } = await u
    .from('categories')
    .insert({ user_id: userId, name, kind: 'consumo' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`category insert failed: ${error?.message}`)
  return data.id
}

/** The ownership check the transaction actions run before any write (HG-01). */
async function ownsCategories(
  u: SupabaseClient,
  ids: string[],
): Promise<boolean> {
  const unique = [...new Set(ids)]
  const { data, error } = await u.from('categories').select('id').in('id', unique)
  if (error || !data) return false
  return data.length === unique.length
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('idor-a')
  userB = await createUser('idor-b')

  const a = userClient(userA.jwt, config)
  const b = userClient(userB.jwt, config)
  catA = await newCategory(a, userA.id, 'A own')
  catB = await newCategory(b, userB.id, 'B own (forged target)')
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('IDOR on category_id FK target (HG-01)', () => {
  it("the RAW insert ACCEPTS a forged foreign category_id (RLS does NOT close it)", async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: catB, // user B's category — the FK is satisfied globally
        amount_cents: 5000,
        occurred_on: '2026-06-10',
        description: 'forged target',
      })
      .select('id, category_id')
      .single()
    // This is the vulnerability the action-layer check exists to stop: the DB
    // happily links user A's transaction to user B's category.
    expect(error).toBeNull()
    expect(data!.category_id).toBe(catB)
    // cleanup so it does not pollute later assertions
    await a.from('transactions').delete().eq('id', data!.id)
  })

  it("the action ownership check REJECTS a foreign category_id (returns 0 owned)", async () => {
    const a = userClient(userA.jwt, config)
    expect(await ownsCategories(a, [catB])).toBe(false)
  })

  it('the action ownership check ACCEPTS the caller-owned category_id', async () => {
    const a = userClient(userA.jwt, config)
    expect(await ownsCategories(a, [catA])).toBe(true)
  })

  it('a mixed [own, foreign] bulk target is rejected (not all owned)', async () => {
    const a = userClient(userA.jwt, config)
    expect(await ownsCategories(a, [catA, catB])).toBe(false)
  })
})

describe('IDOR on reassign destination — hardened RPC (HG-02)', () => {
  it('reassign_and_delete_category(src, FOREIGN dst) aborts instead of reassigning', async () => {
    const a = userClient(userA.jwt, config)
    const src = await newCategory(a, userA.id, 'A src')
    const { data: tx } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: src,
        amount_cents: 7000,
        occurred_on: '2026-06-12',
        description: 'should not move to foreign',
      })
      .select('id')
      .single()

    // dst = user B's category. Under the hardened SECURITY INVOKER RPC the
    // `exists` check runs under user A's RLS, sees no such category, and aborts.
    const { error } = await a.rpc('reassign_and_delete_category', {
      src,
      dst: catB,
    })
    expect(error).not.toBeNull()

    // The transaction is untouched and src still exists (atomic abort).
    const { data: still } = await a
      .from('transactions')
      .select('category_id')
      .eq('id', tx!.id)
      .single()
    expect(still!.category_id).toBe(src)
    const { data: srcStill } = await a
      .from('categories')
      .select('id')
      .eq('id', src)
    expect(srcStill ?? []).toHaveLength(1)
  })
})
