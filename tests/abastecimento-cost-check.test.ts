// 26-W0-01 (FUEL-01, SC2/SC3): the 9-row relaxed-CHECK truth table for the
// abastecimentos cost constraint after migration 0039 relaxes `abastecimentos_cost_xor`
// and adds the parcelamento columns (`parcelas_total`, `valor_total_cents`).
//
// Let P = parcelas_total > 1, T = transaction_id not null, A = amount_cents not null,
// V = valor_total_cents not null. Each row below is ONE insert into `abastecimentos`
// via the RLS-active user client, asserting PASS (`error` null) or REJECT (Postgres
// `23514` check_violation). Truth table (26-VALIDATION.md lines 60-70):
//
//   | Case                  | P | T | A | V | Expected |
//   |-----------------------|---|---|---|---|----------|
//   | à-vista manual (v1.2) | F | F | T | F | PASS     |
//   | à-vista linked (v1.2) | F | T | F | F | PASS     |
//   | attach-later (D-01)   | F | T | T | F | PASS     |
//   | à-vista neither       | F | F | F | F | REJECT   |
//   | à-vista with V leak   | F | T | F | T | REJECT   |
//   | parcelado valid (D-05)| T | F | F | T | PASS     |
//   | parcelado + tx        | T | T | F | T | REJECT   |
//   | parcelado + amount    | T | F | T | T | REJECT   |
//   | parcelado no V        | T | F | F | F | REJECT   |
//
// RED-BY-DESIGN: this test fails against the pre-0039 schema because the
// `parcelas_total` / `valor_total_cents` columns and the relaxed CHECK do not yet
// exist. Wave 1 (migration 0039) turns it green. This is the Nyquist gate for SC2/SC3.
//
// Clone of the carro-rls.test.ts harness (createUser → signInWithPassword → {id, jwt};
// beforeAll seeds a carro + real txs via the RLS-active userClient; afterAll deletes
// the user) plus the seedTx helper from abastecimento-action.test.ts.
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

let carroAId: string
// Each linked tx must be UNIQUE so the preserved abastecimentos_transaction_uniq partial
// index (1:1 à-vista link) never trips and masks the CHECK behavior under test.
let txLinkedId: string // à-vista linked PASS row
let txAttachId: string // attach-later PASS row (T+A both present)
let txParceladoId: string // parcelado+tx REJECT row

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

/** Insert an unlinked expense transaction for the given user; returns its id. */
async function seedTx(jwt: string, userId: string, description: string): Promise<string> {
  const c = userClient(jwt, config)
  const { data, error } = await c
    .from('transactions')
    .insert({ user_id: userId, amount_cents: 30000, occurred_on: '2026-05-10', description })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedTx failed: ${error?.message}`)
  return data.id as string
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('ab-cost-a')

  const a = userClient(userA.jwt, config)

  const { data: carro, error: carroErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Gol', modelo: 'VW Gol', placa: 'ABC1D23', ano: 2020 })
    .select('id')
    .single()
  if (carroErr || !carro) throw new Error(`seed carro failed: ${carroErr?.message}`)
  carroAId = carro.id

  txLinkedId = await seedTx(userA.jwt, userA.id, 'fuel linked à-vista')
  txAttachId = await seedTx(userA.jwt, userA.id, 'fuel attach-later')
  txParceladoId = await seedTx(userA.jwt, userA.id, 'fuel parcelado leak')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

// Common valid non-cost fields for an abastecimento row. Each insert overrides
// odometro_km so no two inserts collide on the consumo interval math.
function base(odometro_km: number) {
  return {
    user_id: userA.id,
    carro_id: carroAId,
    occurred_on: '2026-06-01',
    odometro_km,
    litros: 40.5,
    tanque_cheio: true,
    combustivel: 'Gasolina',
  }
}

describe('abastecimentos relaxed-CHECK truth table — PASS rows (SC2/SC3)', () => {
  it('à-vista manual (F/F/T/F): amount_cents only → PASS', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10000),
      amount_cents: 25000,
    })
    expect(error).toBeNull()
  })

  it('à-vista linked (F/T/F/F): transaction_id only → PASS', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10100),
      transaction_id: txLinkedId,
    })
    expect(error).toBeNull()
  })

  it('attach-later (F/T/T/F): transaction_id + amount_cents both present, V null → PASS', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10200),
      transaction_id: txAttachId,
      amount_cents: 25000,
    })
    expect(error).toBeNull()
  })

  it('parcelado valid (T/F/F/V): parcelas_total=3 + valor_total_cents, T+A null → PASS', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10300),
      parcelas_total: 3,
      valor_total_cents: 60000,
    })
    expect(error).toBeNull()
  })
})

describe('abastecimentos relaxed-CHECK truth table — REJECT rows (SC2/SC3)', () => {
  it('à-vista neither (F/F/F/F): all cost sources null → REJECT (23514)', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10400),
    })
    expect(error).not.toBeNull()
    // Pin that it is the CHECK firing, not some other constraint.
    expect(error?.code).toBe('23514')
  })

  it('à-vista with V leak (F/T/F/T): valor_total_cents set on a non-parcelado row → REJECT', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10500),
      transaction_id: txParceladoId,
      valor_total_cents: 40000,
    })
    expect(error).not.toBeNull()
  })

  it('parcelado + tx (T/T/F/V): parcelas_total>1 with transaction_id → REJECT', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10600),
      parcelas_total: 3,
      valor_total_cents: 60000,
      transaction_id: txParceladoId,
    })
    expect(error).not.toBeNull()
  })

  it('parcelado + amount (T/F/T/V): parcelas_total>1 with amount_cents → REJECT', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10700),
      parcelas_total: 3,
      valor_total_cents: 60000,
      amount_cents: 25000,
    })
    expect(error).not.toBeNull()
  })

  it('parcelado no V (T/F/F/F): parcelas_total>1 with valor_total_cents null → REJECT', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').insert({
      ...base(10800),
      parcelas_total: 3,
    })
    expect(error).not.toBeNull()
  })
})
