// RSV-06 (4-W0-06): confirming an is_reserva import row saves merchant→reserva AND
// creates the aporte 'in' ledger entry (reusing the proven Phase-3 path). The
// substrate proof ships now: merchant_patterns can store a reserva_id mapping, and
// the reserva_ledger 'in' aporte path already exists (Phase 3). confirmImport ties
// them together — learn the merchant→reserva on confirm + fire the aporte — in Plan 03.
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
  userA = await createUser('imp-aporte-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('RSV-06 substrate: merchant→reserva memory + the aporte ledger path', () => {
  it('merchant_patterns can store a descriptor_norm → (category, reserva) mapping', async () => {
    const a = userClient(userA.jwt, config)
    const { data: reservaCat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .eq('is_reserva', true)
      .single()
    const { data: reserva } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Emergência' })
      .select('id')
      .single()

    const { error } = await a.from('merchant_patterns').insert({
      user_id: userA.id,
      descriptor_norm: 'aporte mensal',
      category_id: reservaCat!.id,
      reserva_id: reserva!.id,
    })
    expect(error).toBeNull()

    // The learned mapping is point-read back (CLS-01 lookup basis).
    const { data: hit } = await a
      .from('merchant_patterns')
      .select('category_id, reserva_id')
      .eq('descriptor_norm', 'aporte mensal')
      .maybeSingle()
    expect(hit?.reserva_id).toBe(reserva!.id)
  })

  it('a Reserva-category transaction + linked reserva_ledger "in" entry forms the aporte', async () => {
    const a = userClient(userA.jwt, config)
    const { data: reservaCat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .eq('is_reserva', true)
      .single()
    const { data: reserva } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Viagem' })
      .select('id')
      .single()
    const { data: tx } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: reservaCat!.id,
        amount_cents: 25000,
        occurred_on: '2026-01-31',
        description: 'aporte importado',
        descriptor_norm: 'aporte mensal',
        dedupe_key: `ofx-aporte-${crypto.randomUUID()}`,
        classification_source: 'memória',
      })
      .select('id')
      .single()
    const { error } = await a.from('reserva_ledger').insert({
      user_id: userA.id,
      reserva_id: reserva!.id,
      kind: 'in',
      amount_cents: 25000,
      transaction_id: tx!.id,
      occurred_on: '2026-01-31',
    })
    expect(error).toBeNull()
  })

  // GREEN in Plan 03 — confirmImport learns merchant→reserva + fires the aporte.
  it.todo('confirmImport of an is_reserva row upserts merchant→reserva AND creates the aporte "in" [Plan 03]')
})
