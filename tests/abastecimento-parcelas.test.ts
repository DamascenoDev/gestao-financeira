// 26-W0-02 (FUEL-01, SC4): the `abastecimento_parcelas` junction constraints after
// migration 0039 creates the table. Proves the parcelamento links are unique per
// transaction and per (abastecimento, parcela_num), that attach-later (re-link) is legal
// at the DB layer, and that RLS isolates the junction per user.
//
// Junction shape (26-RESEARCH.md Pattern 2):
//   abastecimento_parcelas (user_id, abastecimento_id, transaction_id, parcela_num)
//   unique (transaction_id)                  — a tx is at most ONE parcela (no double-link)
//   unique (abastecimento_id, parcela_num)   — no two "parcela 1" on the same abastecimento
//
// RED-BY-DESIGN: fails against the pre-0039 schema because the `abastecimento_parcelas`
// table does not yet exist. Wave 1 (migration 0039) turns it green. Nyquist gate for SC4.
//
// Clone of the carro-rls.test.ts two-user harness (createUser → {id, jwt}; beforeAll
// seeds carro + parcelado abastecimento + txs as userA via the RLS-active userClient;
// afterAll deletes both users).
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
// The only legal parcelado abastecimento shape under the relaxed CHECK
// (parcelas_total=3, valor_total_cents set, transaction_id null, amount_cents null).
let abParceladoId: string
// A second pre-existing abastecimento used to prove attach-later (re-link) is legal.
let abPreexistingId: string
let txParcela1Id: string
let txParcela2Id: string
let txRelinkId: string

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

async function seedTx(jwt: string, userId: string, description: string): Promise<string> {
  const c = userClient(jwt, config)
  const { data, error } = await c
    .from('transactions')
    .insert({ user_id: userId, amount_cents: 20000, occurred_on: '2026-05-10', description })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedTx failed: ${error?.message}`)
  return data.id as string
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('ab-parcelas-a')
  userB = await createUser('ab-parcelas-b')

  const a = userClient(userA.jwt, config)

  const { data: carro, error: carroErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Gol', modelo: 'VW Gol', placa: 'ABC1D23', ano: 2020 })
    .select('id')
    .single()
  if (carroErr || !carro) throw new Error(`seed carro failed: ${carroErr?.message}`)
  carroAId = carro.id

  // Parcelado abastecimento — the only legal parcelado shape under the relaxed CHECK.
  const { data: ab, error: abErr } = await a
    .from('abastecimentos')
    .insert({
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-06-01',
      odometro_km: 10000,
      litros: 40.5,
      tanque_cheio: true,
      combustivel: 'Gasolina',
      parcelas_total: 3,
      valor_total_cents: 60000,
    })
    .select('id')
    .single()
  if (abErr || !ab) throw new Error(`seed parcelado abastecimento failed: ${abErr?.message}`)
  abParceladoId = ab.id

  // A second, pre-existing abastecimento created EARLIER (different moment) so we can
  // prove attach-later: a tx links to it after it already exists (SC4 re-link).
  const { data: abPre, error: abPreErr } = await a
    .from('abastecimentos')
    .insert({
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-05-01',
      odometro_km: 9000,
      litros: 38,
      tanque_cheio: true,
      combustivel: 'Gasolina',
      parcelas_total: 2,
      valor_total_cents: 40000,
    })
    .select('id')
    .single()
  if (abPreErr || !abPre) throw new Error(`seed pre-existing abastecimento failed: ${abPreErr?.message}`)
  abPreexistingId = abPre.id

  txParcela1Id = await seedTx(userA.jwt, userA.id, 'parcela 1')
  txParcela2Id = await seedTx(userA.jwt, userA.id, 'parcela 2')
  txRelinkId = await seedTx(userA.jwt, userA.id, 're-link parcela')
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('abastecimento_parcelas junction unique constraints (SC4)', () => {
  it('first parcela link succeeds', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimento_parcelas').insert({
      user_id: userA.id,
      abastecimento_id: abParceladoId,
      transaction_id: txParcela1Id,
      parcela_num: 1,
    })
    expect(error).toBeNull()
  })

  it('unique(transaction_id): a second parcela reusing the same transaction_id is rejected', async () => {
    const a = userClient(userA.jwt, config)
    // Same tx, different parcela_num — still illegal: a tx is at most one parcela.
    const { error } = await a.from('abastecimento_parcelas').insert({
      user_id: userA.id,
      abastecimento_id: abParceladoId,
      transaction_id: txParcela1Id,
      parcela_num: 2,
    })
    expect(error).not.toBeNull()
  })

  it('unique(abastecimento_id, parcela_num): a second "parcela 1" on the same abastecimento is rejected', async () => {
    const a = userClient(userA.jwt, config)
    // Different tx, but parcela_num 1 already taken on abParceladoId.
    const { error } = await a.from('abastecimento_parcelas').insert({
      user_id: userA.id,
      abastecimento_id: abParceladoId,
      transaction_id: txParcela2Id,
      parcela_num: 1,
    })
    expect(error).not.toBeNull()
  })
})

describe('abastecimento_parcelas re-link / attach-later enablement (SC4)', () => {
  it('a transaction can be attached to a PRE-EXISTING abastecimento (attach-later is legal)', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimento_parcelas').insert({
      user_id: userA.id,
      abastecimento_id: abPreexistingId, // created earlier, not at the same moment
      transaction_id: txRelinkId,
      parcela_num: 1,
    })
    expect(error).toBeNull()
  })
})

describe('abastecimento_parcelas RLS isolation (SC4)', () => {
  it('user B reads ZERO of user A parcelas', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('abastecimento_parcelas').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })
})

// NOTE (cross-table double-link residual): a transaction that is BOTH an à-vista
// `abastecimentos.transaction_id` AND a junction parcela on a different abastecimento is
// NOT prevented by any DB constraint here (the junction's unique(transaction_id) only
// covers the junction itself). Per 26-RESEARCH A1 this residual is enforced as an
// ACTION-LAYER invariant in Phases 27/28 — it is deliberately NOT asserted at the DB
// level in this test.
