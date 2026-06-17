// 8-W0-02 (CAR-01/06, T-08-02 / Pitfall 6): v_carro_resumo and v_abastecimento_consumo
// are security_invoker — a second user reads ZERO of the first user's rows. This is the
// proof both views inherit the caller's RLS instead of running as the definer (a DEFINER
// view would leak every user's carro spend + consumption). Clone of mei-view-leak.test.ts
// for the two Carro views.
//
// User A seeds a carro + two tanque-cheio abastecimentos forming ONE consumption interval
// (so a km/l row appears in v_abastecimento_consumo and the resumo carries averages).
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
  userA = await createUser('carro-leak-a')
  userB = await createUser('carro-leak-b')

  const a = userClient(userA.jwt, config)

  const { data: carro, error: carroErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Civic' })
    .select('id')
    .single()
  if (carroErr || !carro) throw new Error(`seed carro failed: ${carroErr?.message}`)
  carroAId = carro.id

  // Two tanque-cheio fills (manual cost) → one closed consumption interval.
  const { error: abErr } = await a.from('abastecimentos').insert([
    {
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-04-01',
      odometro_km: 20000,
      litros: 30,
      tanque_cheio: true,
      amount_cents: 18000,
    },
    {
      user_id: userA.id,
      carro_id: carroAId,
      occurred_on: '2026-04-15',
      odometro_km: 20400,
      litros: 32,
      tanque_cheio: true,
      amount_cents: 20000,
    },
  ])
  if (abErr) throw new Error(`seed abastecimentos failed: ${abErr.message}`)

  // A tagged transaction so v_carro_resumo carries a gasto_total for A.
  const { error: txErr } = await a.from('transactions').insert({
    user_id: userA.id,
    amount_cents: 38000,
    occurred_on: '2026-04-15',
    description: 'combustível',
    carro_id: carroAId,
  })
  if (txErr) throw new Error(`seed transaction failed: ${txErr.message}`)
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('v_abastecimento_consumo is security_invoker (T-08-02)', () => {
  it('user A sees its own interval km/l row', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('v_abastecimento_consumo')
      .select('km_rodados, km_por_litro')
      .eq('carro_id', carroAId)
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(data?.[0]?.km_rodados).toBe(400)
  })

  it('user B reads ZERO of user A v_abastecimento_consumo rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b
      .from('v_abastecimento_consumo')
      .select('*')
      .eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })
})

describe('v_carro_resumo is security_invoker (T-08-02)', () => {
  it('user A sees its own resumo row', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a.from('v_carro_resumo').select('*').eq('carro_id', carroAId)
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(data?.[0]?.gasto_total_cents).toBe(38000)
  })

  it('user B reads ZERO of user A v_carro_resumo rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('v_carro_resumo').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })
})
