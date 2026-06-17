// 5-W0-08 (MEI-01, T-05-03 — IDOR on mei_invoice_id): a forged mei_invoice_id pointing
// at ANOTHER user's NF must be rejected by the ownership re-derive before any edit/delete.
// Clones the reserva-idor two-half proof:
//  (1) the ownership re-derive (assertOwnedMeiInvoice, `select id where id=$1` under the
//      caller's RLS) returns false for the foreign id and true for the owned id;
//  (2) under user A's RLS-active client, user B's invoice id is simply invisible (0 rows)
//      — the FK is not RLS-aware, so the action-layer re-derive is what stops the IDOR.
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

import { assertOwnedMeiInvoice, type Client } from '@/lib/ownership'

const YEAR = 2026

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }
let invoiceA: string
let invoiceB: string // user B's NF — the forged target

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

async function newInvoice(a: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await a
    .from('mei_invoices')
    .insert({
      user_id: userId,
      issued_on: `${YEAR}-04-10`,
      amount_cents: 100000,
      tomador: 'T',
      descricao: '',
      activity_type: 'servicos',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`invoice insert failed: ${error?.message}`)
  return data.id
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('mei-idor-a')
  userB = await createUser('mei-idor-b')
  const a = userClient(userA.jwt, config)
  const b = userClient(userB.jwt, config)
  invoiceA = await newInvoice(a, userA.id)
  invoiceB = await newInvoice(b, userB.id)
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('IDOR on mei_invoice_id (T-05-03, Pitfall 7)', () => {
  it('assertOwnedMeiInvoice REJECTS a foreign invoice id (0 owned)', async () => {
    const a = userClient(userA.jwt, config) as unknown as Client
    expect(await assertOwnedMeiInvoice(a, invoiceB)).toBe(false)
  })

  it('assertOwnedMeiInvoice ACCEPTS the caller-owned invoice id', async () => {
    const a = userClient(userA.jwt, config) as unknown as Client
    expect(await assertOwnedMeiInvoice(a, invoiceA)).toBe(true)
  })
})
