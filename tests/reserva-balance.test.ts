// 3-W0-05 (RSV-05): the reserva balance is DERIVED — v_reserva_balance.saldo_cents
// == Σ(in) − Σ(out) computed live from reserva_ledger, never a stored column. A
// reserva with no ledger reads 0. The reservas table has no balance/saldo column.
//
// GREEN as of 03-01: the 0013 tables + 0015 security_invoker view make this pass NOW
// (data-layer guarantee — no Server Action or UI required).
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
  userA = await createUser('rbal-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('reserva balance is derived Σin − Σout (RSV-05)', () => {
  it('reads 0 for a reserva with no ledger entries', async () => {
    const a = userClient(userA.jwt, config)
    const { data: r, error: rErr } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Empty fund' })
      .select('id')
      .single()
    expect(rErr).toBeNull()
    const { data: bal } = await a
      .from('v_reserva_balance')
      .select('saldo_cents')
      .eq('reserva_id', r!.id)
      .single()
    expect(bal!.saldo_cents).toBe(0)
  })

  it('computes saldo = Σin − Σout from the ledger', async () => {
    const a = userClient(userA.jwt, config)
    const { data: r } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Viagem', alvo_cents: 500000 })
      .select('id')
      .single()

    // 100000 + 50000 in − 30000 out = 120000.
    await a.from('reserva_ledger').insert([
      { user_id: userA.id, reserva_id: r!.id, kind: 'in', amount_cents: 100000, occurred_on: '2026-06-01' },
      { user_id: userA.id, reserva_id: r!.id, kind: 'in', amount_cents: 50000, occurred_on: '2026-06-02' },
      { user_id: userA.id, reserva_id: r!.id, kind: 'out', amount_cents: 30000, occurred_on: '2026-06-03' },
    ])

    const { data: bal } = await a
      .from('v_reserva_balance')
      .select('saldo_cents, alvo_cents, nome')
      .eq('reserva_id', r!.id)
      .single()
    expect(bal!.saldo_cents).toBe(120000)
    expect(bal!.alvo_cents).toBe(500000)
    expect(bal!.nome).toBe('Viagem')
  })

  it('the reservas table exposes NO stored balance/saldo column (balance is derived)', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('reservas').select('saldo_cents').limit(1)
    // Selecting a non-existent column errors → proves there is no stored balance.
    expect(error).not.toBeNull()
  })
})
