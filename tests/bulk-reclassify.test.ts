// 2-W0-07 (TXN-04): a single .update().in('id', ids) reclassifies all N selected
// transactions to one category in one action; the same forged .in() update issued by
// user B touches 0 of user A's rows (RLS scopes the UPDATE even with forged ids).
//
// Exercises the transactions table + RLS delivered by 02-01. The bulkReclassify ACTION
// + SelectionActionBar UX ship in 02-04 (Extrato); this asserts the guarantee they rely on.
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
let srcCat: string
let dstCat: string
let txIds: string[] = []

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

async function newCategory(u: SupabaseClient, userId: string, name: string): Promise<string> {
  const { data, error } = await u
    .from('categories')
    .insert({ user_id: userId, name, kind: 'consumo' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`category insert failed: ${error?.message}`)
  return data.id
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('bulk-a')
  userB = await createUser('bulk-b')

  const a = userClient(userA.jwt, config)
  srcCat = await newCategory(a, userA.id, 'Origem')
  dstCat = await newCategory(a, userA.id, 'Destino')

  const rows = Array.from({ length: 4 }, (_, i) => ({
    user_id: userA.id,
    category_id: srcCat,
    amount_cents: 1000 * (i + 1),
    occurred_on: '2026-06-10',
    description: `tx ${i}`,
  }))
  const { data, error } = await a.from('transactions').insert(rows).select('id')
  if (error || !data) throw new Error(`tx seed failed: ${error?.message}`)
  txIds = data.map((r) => r.id)
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('bulk reclassify (TXN-04)', () => {
  it('user A reclassifies all N selected transactions to one category', async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('transactions')
      .update({ category_id: dstCat })
      .in('id', txIds)
      .select('id, category_id')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(txIds.length)
    for (const row of data ?? []) {
      expect(row.category_id).toBe(dstCat)
    }
  })

  it("user B's same forged .in() update touches 0 of user A's rows", async () => {
    const b = userClient(userB.jwt, config)
    // user B owns no dst category; even using user A's dst id, RLS scopes the UPDATE
    // to user B's own rows → zero matched.
    const { data } = await b
      .from('transactions')
      .update({ category_id: dstCat })
      .in('id', txIds)
      .select()
    expect(data ?? []).toHaveLength(0)
  })
})
