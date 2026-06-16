// 3-W0-06 (RSV-04): register_reserva_saida is the atomic, never-negative saída
// RPC. A saída ≤ saldo inserts an 'out' row and returns its id; a saída > saldo
// raises (error message mentions 'saldo'); after an overdraw attempt the balance
// is unchanged and never negative. Two near-concurrent oversized saídas (Promise.all)
// leave saldo_cents >= 0 — the TOCTOU guard (Pitfall 4).
//
// GREEN as of 03-01: the 0016 SECURITY INVOKER RPC + 0015 view enforce this at the
// data layer NOW (no Server Action required — the RPC IS the contract).
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

async function newReserva(a: SupabaseClient, balanceCents: number): Promise<string> {
  const { data: r, error } = await a
    .from('reservas')
    .insert({ user_id: userA.id, nome: `fund-${crypto.randomUUID()}` })
    .select('id')
    .single()
  if (error || !r) throw new Error(`reserva insert failed: ${error?.message}`)
  if (balanceCents > 0) {
    await a.from('reserva_ledger').insert({
      user_id: userA.id,
      reserva_id: r.id,
      kind: 'in',
      amount_cents: balanceCents,
      occurred_on: '2026-06-01',
    })
  }
  return r.id
}

async function saldoOf(a: SupabaseClient, reservaId: string): Promise<number> {
  const { data } = await a
    .from('v_reserva_balance')
    .select('saldo_cents')
    .eq('reserva_id', reservaId)
    .single()
  return data!.saldo_cents as number
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('saida-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('register_reserva_saida is atomic + never-negative (RSV-04)', () => {
  it('a saída ≤ saldo inserts an out and returns an id', async () => {
    const a = userClient(userA.jwt, config)
    const reserva = await newReserva(a, 100000)
    const { data: id, error } = await a.rpc('register_reserva_saida', {
      p_reserva_id: reserva,
      p_amount_cents: 40000,
      p_occurred_on: '2026-06-10',
      p_note: 'saque parcial',
    })
    expect(error).toBeNull()
    expect(typeof id).toBe('string')
    expect(await saldoOf(a, reserva)).toBe(60000)
  })

  it('a saída > saldo raises with a message that mentions saldo, balance unchanged', async () => {
    const a = userClient(userA.jwt, config)
    const reserva = await newReserva(a, 50000)
    const { error } = await a.rpc('register_reserva_saida', {
      p_reserva_id: reserva,
      p_amount_cents: 90000,
      p_occurred_on: '2026-06-11',
      p_note: 'overdraw',
    })
    expect(error).not.toBeNull()
    expect((error?.message ?? '').toLowerCase()).toContain('saldo')
    // Balance unchanged and never negative.
    expect(await saldoOf(a, reserva)).toBe(50000)
  })

  it('a saída of 0 / negative is rejected (P0001 Valor inválido)', async () => {
    const a = userClient(userA.jwt, config)
    const reserva = await newReserva(a, 50000)
    const { error: zeroErr } = await a.rpc('register_reserva_saida', {
      p_reserva_id: reserva,
      p_amount_cents: 0,
      p_occurred_on: '2026-06-11',
    })
    expect(zeroErr).not.toBeNull()
    const { error: negErr } = await a.rpc('register_reserva_saida', {
      p_reserva_id: reserva,
      p_amount_cents: -100,
      p_occurred_on: '2026-06-11',
    })
    expect(negErr).not.toBeNull()
    expect(await saldoOf(a, reserva)).toBe(50000)
  })

  it('two near-concurrent oversized saídas leave saldo_cents >= 0 (no negative balance)', async () => {
    const a = userClient(userA.jwt, config)
    const reserva = await newReserva(a, 100000)
    // Each saída is 60000; together 120000 > 100000. At most one can succeed.
    const results = await Promise.allSettled([
      a.rpc('register_reserva_saida', {
        p_reserva_id: reserva,
        p_amount_cents: 60000,
        p_occurred_on: '2026-06-12',
      }),
      a.rpc('register_reserva_saida', {
        p_reserva_id: reserva,
        p_amount_cents: 60000,
        p_occurred_on: '2026-06-12',
      }),
    ])
    // The harness never throws (errors come back in the result object), but assert
    // the invariant that actually matters: the balance is never driven negative.
    void results
    const saldo = await saldoOf(a, reserva)
    expect(saldo).toBeGreaterThanOrEqual(0)
  })
})
