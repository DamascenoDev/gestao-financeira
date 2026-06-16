// 3-W0 (RSV-01): reservas CRUD round-trip. A reserva can be created with or without
// an alvo (target optional — null allowed); update mutates nome/alvo; delete cascades
// its ledger (reserva_ledger.reserva_id ON DELETE CASCADE).
//
// GREEN as of 03-01: the 0013 tables enforce this NOW at the data layer.
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
  userA = await createUser('rcrud-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('reservas CRUD (RSV-01)', () => {
  it('creates a reserva WITHOUT an alvo (target optional → null)', async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Sem alvo' })
      .select('id, nome, alvo_cents, is_archived')
      .single()
    expect(error).toBeNull()
    expect(data!.nome).toBe('Sem alvo')
    expect(data!.alvo_cents).toBeNull()
    expect(data!.is_archived).toBe(false)
  })

  it('creates a reserva WITH an alvo and updates it', async () => {
    const a = userClient(userA.jwt, config)
    const { data: created } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Carro', alvo_cents: 2000000 })
      .select('id')
      .single()
    const { data: updated, error } = await a
      .from('reservas')
      .update({ nome: 'Carro novo', alvo_cents: 3000000 })
      .eq('id', created!.id)
      .select('nome, alvo_cents')
      .single()
    expect(error).toBeNull()
    expect(updated!.nome).toBe('Carro novo')
    expect(updated!.alvo_cents).toBe(3000000)
  })

  it('rejects a non-positive alvo (alvo_cents > 0 domain check)', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Inválida', alvo_cents: 0 })
    expect(error).not.toBeNull()
  })

  it('deleting a reserva cascades its ledger entries', async () => {
    const a = userClient(userA.jwt, config)
    const { data: r } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Com ledger' })
      .select('id')
      .single()
    await a.from('reserva_ledger').insert({
      user_id: userA.id,
      reserva_id: r!.id,
      kind: 'in',
      amount_cents: 10000,
      occurred_on: '2026-06-01',
    })
    // sanity: ledger row exists
    const { data: before } = await a
      .from('reserva_ledger')
      .select('id')
      .eq('reserva_id', r!.id)
    expect((before ?? []).length).toBe(1)

    await a.from('reservas').delete().eq('id', r!.id)

    const { data: after } = await a
      .from('reserva_ledger')
      .select('id')
      .eq('reserva_id', r!.id)
    expect(after ?? []).toHaveLength(0)
  })
})
