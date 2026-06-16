// 3-W0-08 (RSV-04/RSV-02 — IDOR on reserva_id): a forged reserva_id pointing at
// ANOTHER user's reserva must be rejected server-side before the write. This clones
// the category-idor two-half proof:
//  (1) a RAW reserva_ledger insert with a foreign reserva_id is ACCEPTED by RLS
//      alone IF the row is owned by the caller — RLS checks user_id, NOT the FK
//      target's owner — so an ownership re-derive of the reserva is mandatory;
//  (2) the ownership check (`select id from reservas where id = $1` under the
//      caller's RLS) returns 0 for the foreign id and 1 for the owned id;
//  (3) register_reserva_saida(foreign reserva) ABORTS (the RPC re-derives the
//      balance under the caller's RLS → null → raises).
//
// The RPC half is GREEN now (0016). The action-layer ownership re-derive that the
// aporte Server Action runs ships in Plan 03-05 — the select-based guard tested
// here proves the guard the action will use is correct and sufficient.
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
let reservaA: string
let reservaB: string // user B's reserva — the forged FK target

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

async function newReserva(a: SupabaseClient, userId: string, nome: string): Promise<string> {
  const { data, error } = await a
    .from('reservas')
    .insert({ user_id: userId, nome })
    .select('id')
    .single()
  if (error || !data) throw new Error(`reserva insert failed: ${error?.message}`)
  return data.id
}

/** The ownership re-derive the aporte/saída actions run before any ledger write. */
async function ownsReserva(a: SupabaseClient, reservaId: string): Promise<boolean> {
  const { data, error } = await a.from('reservas').select('id').eq('id', reservaId)
  if (error || !data) return false
  return data.length === 1
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('ridor-a')
  userB = await createUser('ridor-b')
  const a = userClient(userA.jwt, config)
  const b = userClient(userB.jwt, config)
  reservaA = await newReserva(a, userA.id, 'A own')
  reservaB = await newReserva(b, userB.id, 'B own (forged target)')
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('IDOR on reserva_id (carry the Phase-2 category-idor lesson)', () => {
  it('a RAW caller-owned ledger insert pointing at a FOREIGN reserva_id is ACCEPTED (RLS does not re-derive the FK owner)', async () => {
    const a = userClient(userA.jwt, config)
    // user_id = A (passes RLS WITH CHECK) but reserva_id = B's reserva.
    const { data, error } = await a
      .from('reserva_ledger')
      .insert({
        user_id: userA.id,
        reserva_id: reservaB, // forged: another user's reserva
        kind: 'in',
        amount_cents: 5000,
        occurred_on: '2026-06-10',
      })
      .select('id, reserva_id')
      .single()
    // This is the vulnerability the action-layer ownership re-derive exists to stop:
    // RLS only checks the row's own user_id, not the FK target's owner.
    expect(error).toBeNull()
    expect(data!.reserva_id).toBe(reservaB)
    // cleanup so it does not pollute the balance views.
    await a.from('reserva_ledger').delete().eq('id', data!.id)
  })

  it('the ownership re-derive REJECTS the foreign reserva_id (0 owned)', async () => {
    const a = userClient(userA.jwt, config)
    expect(await ownsReserva(a, reservaB)).toBe(false)
  })

  it('the ownership re-derive ACCEPTS the caller-owned reserva_id', async () => {
    const a = userClient(userA.jwt, config)
    expect(await ownsReserva(a, reservaA)).toBe(true)
  })

  it('register_reserva_saida on a FOREIGN reserva aborts (RPC re-derives balance under caller RLS → null)', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.rpc('register_reserva_saida', {
      p_reserva_id: reservaB,
      p_amount_cents: 1,
      p_occurred_on: '2026-06-10',
    })
    expect(error).not.toBeNull()
  })
})
