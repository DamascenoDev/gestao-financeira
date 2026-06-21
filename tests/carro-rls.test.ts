// 8-W0-01 (CAR-01/06, T-08-01 / T-08-03): two-user RLS isolation across the three new
// Carro schema objects (carros, abastecimentos, transactions.carro_id) PLUS the DB-level
// cost constraints. User A inserts a carro, a carro-linked abastecimento (manual
// amount_cents cost source, transaction_id null), and a transaction tagged with the
// carro's id via carro_id; all persist for A. User B reads ZERO of A's carros, ZERO of
// A's abastecimentos, and ZERO transactions carrying A's carro_id (the uniform
// USING+WITH CHECK auth.uid()=user_id policies isolate per user).
//
// Cost-constraint block (T-08-03): after 0039 (FUEL-01) relaxed the strict XOR to the
// attach-later truth table, an À-VISTA abastecimento supplying BOTH transaction_id and
// amount_cents is now ACCEPTED (attach-later), while one supplying NEITHER is still
// rejected; the preserved partial unique index (abastecimentos_transaction_uniq, 0027 —
// untouched by 0039) rejects a second abastecimento linking an already-linked
// transaction_id. These are DB-level constraints, not app-level.
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

let carroAId: string
let txAId: string

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
  userA = await createUser('carro-rls-a')
  userB = await createUser('carro-rls-b')

  const a = userClient(userA.jwt, config)

  const { data: carro, error: carroErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Gol', modelo: 'VW Gol', placa: 'ABC1D23', ano: 2020 })
    .select('id')
    .single()
  if (carroErr || !carro) throw new Error(`seed carro failed: ${carroErr?.message}`)
  carroAId = carro.id

  // A transaction tagged with the carro (the non-accounting carro_id tag, D4).
  const { data: tx, error: txErr } = await a
    .from('transactions')
    .insert({
      user_id: userA.id,
      amount_cents: 30000,
      occurred_on: '2026-05-10',
      description: 'troca de óleo',
      carro_id: carroAId,
    })
    .select('id')
    .single()
  if (txErr || !tx) throw new Error(`seed transaction failed: ${txErr?.message}`)
  txAId = tx.id

  // A carro-linked abastecimento with a MANUAL cost source (amount_cents, no transaction_id).
  const { error: abErr } = await a.from('abastecimentos').insert({
    user_id: userA.id,
    carro_id: carroAId,
    occurred_on: '2026-05-12',
    odometro_km: 10000,
    litros: 40.5,
    tanque_cheio: true,
    combustivel: 'Gasolina',
    amount_cents: 25000,
  })
  if (abErr) throw new Error(`seed abastecimento failed: ${abErr.message}`)
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('Carro tables RLS isolation (T-08-01)', () => {
  it("user A's carro, abastecimento (manual cost), and tagged transaction persist", async () => {
    const a = userClient(userA.jwt, config)

    const { data: carros } = await a.from('carros').select('apelido')
    expect((carros ?? []).length).toBe(1)
    expect(carros?.[0]?.apelido).toBe('Gol')

    const { data: abs } = await a.from('abastecimentos').select('amount_cents, transaction_id')
    expect((abs ?? []).length).toBe(1)
    expect(abs?.[0]?.amount_cents).toBe(25000)
    expect(abs?.[0]?.transaction_id).toBeNull()

    const { data: txs } = await a.from('transactions').select('carro_id').eq('carro_id', carroAId)
    expect((txs ?? []).length).toBe(1)
  })

  it('user B reads ZERO of user A carros', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('carros').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('user B reads ZERO of user A abastecimentos', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('abastecimentos').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it("user B reads ZERO transactions carrying user A's carro_id", async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('transactions').select('*').eq('carro_id', carroAId)
    expect(data ?? []).toHaveLength(0)
  })
})

describe('abastecimentos cost constraints (T-08-03)', () => {
  it('à-vista CHECK now ACCEPTS BOTH transaction_id and amount_cents (0039 attach-later relax)', async () => {
    // 0039 (FUEL-01) relaxed the strict cost XOR to the attach-later truth table: for an
    // à-vista fuel-up (parcelas_total null/<=1) supplying BOTH transaction_id AND
    // amount_cents is now VALID (documented at 0039 sub-part A). Only "neither" is still
    // rejected. Use a FRESH transaction so the preserved abastecimentos_transaction_uniq
    // partial index does not collide with another test's link.
    const a = userClient(userA.jwt, config)
    const { data: tx, error: txErr } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        amount_cents: 20000,
        occurred_on: '2026-05-20',
        description: 'abastecimento à-vista (both)',
        carro_id: carroAId,
      })
      .select('id')
      .single()
    expect(txErr).toBeNull()
    const { error } = await a.from('abastecimentos').insert({
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-05-20',
      odometro_km: 10500,
      litros: 38,
      tanque_cheio: true,
      transaction_id: tx!.id,
      amount_cents: 20000, // both → now ACCEPTED under the relaxed à-vista CHECK
    })
    expect(error).toBeNull()
  })

  it('XOR CHECK rejects an abastecimento with NEITHER cost source', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-05-21',
      odometro_km: 11000,
      litros: 35,
      tanque_cheio: true,
      // neither transaction_id nor amount_cents → must violate the XOR CHECK
    })
    expect(error).not.toBeNull()
  })

  it('partial unique index rejects a second abastecimento linking the same transaction_id', async () => {
    const a = userClient(userA.jwt, config)
    // Use a FRESH dedicated transaction so this test owns its link in isolation — the
    // preserved abastecimentos_transaction_uniq (0027, untouched by 0039) is what we
    // exercise here, decoupled from the shared txAId used by other cases.
    const { data: linkTx, error: linkTxErr } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        amount_cents: 18000,
        occurred_on: '2026-05-22',
        description: 'abastecimento à-vista (uniq link)',
        carro_id: carroAId,
      })
      .select('id')
      .single()
    expect(linkTxErr).toBeNull()

    // First link is valid (transaction_id source, amount_cents null).
    const { error: firstErr } = await a.from('abastecimentos').insert({
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-05-22',
      odometro_km: 11500,
      litros: 30,
      tanque_cheio: true,
      transaction_id: linkTx!.id,
    })
    expect(firstErr).toBeNull()

    // Second link to the SAME transaction_id → must violate the partial unique index.
    const { error: dupErr } = await a.from('abastecimentos').insert({
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-05-23',
      odometro_km: 12000,
      litros: 28,
      tanque_cheio: true,
      transaction_id: linkTx!.id,
    })
    expect(dupErr).not.toBeNull()
  })
})
