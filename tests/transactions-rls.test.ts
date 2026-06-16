// 2-W0-06 (TXN-01/02): transaction create/update/delete round-trips for user A
// (amount_cents is a positive bigint), and user B cannot read/update/delete user A's
// transaction (four-verb two-user isolation).
//
// Exercises the transactions table + RLS delivered by 02-01. The CRUD ACTIONS ship in
// 02-04 (Extrato); this asserts the isolation guarantee they rely on.
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
let categoryA: string
let txId: string

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
  userA = await createUser('txn-a')
  userB = await createUser('txn-b')

  const a = userClient(userA.jwt, config)
  const { data: cat, error: catErr } = await a
    .from('categories')
    .insert({ user_id: userA.id, name: 'Gastos', kind: 'consumo' })
    .select('id')
    .single()
  if (catErr || !cat) throw new Error(`category seed failed: ${catErr?.message}`)
  categoryA = cat.id
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('transactions CRUD + two-user RLS (TXN-01/02)', () => {
  it('user A can create / update / round-trip a positive bigint amount', async () => {
    const a = userClient(userA.jwt, config)
    const { data: created, error: createErr } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: categoryA,
        amount_cents: 123456,
        occurred_on: '2026-06-10',
        description: 'Mercado',
      })
      .select('id, amount_cents')
      .single()
    expect(createErr).toBeNull()
    expect(Number(created!.amount_cents)).toBe(123456)
    txId = created!.id

    const { error: updErr } = await a
      .from('transactions')
      .update({ amount_cents: 200000 })
      .eq('id', txId)
    expect(updErr).toBeNull()

    const { data: read } = await a
      .from('transactions')
      .select('amount_cents')
      .eq('id', txId)
      .single()
    expect(Number(read!.amount_cents)).toBe(200000)
  })

  it('user B cannot read user A transaction', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('transactions').select('*').eq('id', txId)
    expect(data ?? []).toHaveLength(0)
  })

  it('user B UPDATE of user A transaction affects 0 rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b
      .from('transactions')
      .update({ amount_cents: 1 })
      .eq('id', txId)
      .select()
    expect(data ?? []).toHaveLength(0)
  })

  it('user B DELETE of user A transaction affects 0 rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('transactions').delete().eq('id', txId).select()
    expect(data ?? []).toHaveLength(0)
  })

  it('user A can delete its own transaction', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a.from('transactions').delete().eq('id', txId).select()
    expect((data ?? []).length).toBe(1)
  })
})
