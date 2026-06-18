// 10-W0-01 (CAR-04, T-10-03 / WR-05 / WR-06): the corrected consumption math of
// v_abastecimento_consumo + v_carro_resumo after migration 0028. One user A reads its
// own rows through the RLS-active user client (security_invoker scopes per caller).
//
// Three proofs:
//   1. Happy path — a full-tank interval with a positive odometer delta yields the
//      expected km_rodados, km_por_litro (Δkm ÷ Σlitros) and a non-null reais_por_km;
//      and v_carro_resumo.km_por_litro_medio equals that single interval's value.
//   2. Negative/zero-km guard (WR-06) — a carro that includes a rolled-back / tied
//      odometer NEVER surfaces a negative km_por_litro or reais_por_km, the non-positive
//      (km_rodados <= 0) interval is EXCLUDED from the view rows entirely, and the
//      resumo average is therefore built only off the valid intervals.
//   3. preco_litro is NEVER a stored column on abastecimentos — it is derived in the
//      view/presentation only.
//
// Clone of the createUser/userClient/serviceClient harness from carro-view-leak.test.ts.
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

// Carro 1: the clean happy-path interval (12.5 km/l). Carro 2: the bad-data guard.
// Carro 3 (WR-02 / DEBT-01): two tanque_cheio fills sharing the EXACT same odometro_km.
let carroHappyId: string
let carroGuardId: string
let carroSameOdoId: string

// WR-02 fixture liters/cost: the closing fill of the ONLY valid interval (30000→30500)
// is L2/C2; its SIBLING at the same odometer (30500) is L3/C3 and must NOT be swept in.
const SAME_ODO_L2 = 40 // closing fill of the 30000→30500 interval
const SAME_ODO_C2 = 24000 // cents — its cost
const SAME_ODO_L3 = 25 // sibling fill at the SAME odometer — must be excluded
const SAME_ODO_C3 = 15000 // cents — sibling cost, must be excluded

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
  userA = await createUser('carro-consumo-a')

  const a = userClient(userA.jwt, config)

  // ── Carro 1 (happy path): two tanque-cheio fills, +500 km over 40 L → 12.5 km/l ──
  const { data: happy, error: happyErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Civic' })
    .select('id')
    .single()
  if (happyErr || !happy) throw new Error(`seed happy carro failed: ${happyErr?.message}`)
  carroHappyId = happy.id

  const { error: happyAbErr } = await a.from('abastecimentos').insert([
    {
      user_id: userA.id,
      carro_id: carroHappyId,
      occurred_on: '2026-01-01',
      odometro_km: 10000, // opening full tank — no prior interval
      litros: 30,
      tanque_cheio: true,
      amount_cents: 18000,
    },
    {
      user_id: userA.id,
      carro_id: carroHappyId,
      occurred_on: '2026-01-15',
      odometro_km: 10500, // +500 km, 40 L on the closing fill → 12.5 km/l
      litros: 40,
      tanque_cheio: true,
      amount_cents: 24000, // R$/km = 24000 / 500 = 48
    },
  ])
  if (happyAbErr) throw new Error(`seed happy abastecimentos failed: ${happyAbErr.message}`)

  // ── Carro 2 (WR-06 guard): a tied/rolled-back odometer produces a non-positive
  //    delta interval that must be EXCLUDED, never surfaced as a negative number ──
  const { data: guard, error: guardErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Gol' })
    .select('id')
    .single()
  if (guardErr || !guard) throw new Error(`seed guard carro failed: ${guardErr?.message}`)
  carroGuardId = guard.id

  const { error: guardAbErr } = await a.from('abastecimentos').insert([
    {
      user_id: userA.id,
      carro_id: carroGuardId,
      occurred_on: '2026-03-01',
      odometro_km: 20000, // opening full tank
      litros: 30,
      tanque_cheio: true,
      amount_cents: 18000,
    },
    {
      user_id: userA.id,
      carro_id: carroGuardId,
      occurred_on: '2026-03-15',
      odometro_km: 20600, // +600 km, 40 L → a single VALID interval (15 km/l)
      litros: 40,
      tanque_cheio: true,
      amount_cents: 24000,
    },
    {
      user_id: userA.id,
      carro_id: carroGuardId,
      occurred_on: '2026-04-01',
      odometro_km: 20600, // SAME odometer (tie / rolled-back reading) → zero delta, excluded
      litros: 25,
      tanque_cheio: true,
      amount_cents: 15000,
    },
  ])
  if (guardAbErr) throw new Error(`seed guard abastecimentos failed: ${guardAbErr.message}`)

  // ── Carro 3 (WR-02 / DEBT-01 same-odometer sweep-in): THREE tanque_cheio fills
  //    where fill #2 and fill #3 share the EXACT same odometro_km (30500). The ONLY
  //    valid interval is 30000→30500. The bug (0028): the closing-fill subquery bounds
  //    on `odometro_km <= 30500`, sweeping the sibling fill #3's liters AND cost into
  //    that interval — understating km/l and overstating R$/km. The fix anchors the
  //    interval membership on the prior full-tank fill's IDENTITY (ordering tuple), so
  //    only fill #2's L2/C2 count toward the interval, never fill #3's L3/C3. ──
  const { data: sameOdo, error: sameOdoErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Onix' })
    .select('id')
    .single()
  if (sameOdoErr || !sameOdo) throw new Error(`seed same-odo carro failed: ${sameOdoErr?.message}`)
  carroSameOdoId = sameOdo.id

  const { error: sameOdoAbErr } = await a.from('abastecimentos').insert([
    {
      user_id: userA.id,
      carro_id: carroSameOdoId,
      occurred_on: '2026-05-01',
      odometro_km: 30000, // opening full tank — no prior interval
      litros: 30,
      tanque_cheio: true,
      amount_cents: 18000,
    },
    {
      user_id: userA.id,
      carro_id: carroSameOdoId,
      occurred_on: '2026-05-15',
      odometro_km: 30500, // closing fill of the ONLY valid interval (30000→30500)
      litros: SAME_ODO_L2,
      tanque_cheio: true,
      amount_cents: SAME_ODO_C2,
    },
    {
      user_id: userA.id,
      carro_id: carroSameOdoId,
      occurred_on: '2026-05-16',
      odometro_km: 30500, // SIBLING at the EXACT same odometer — must NOT be swept in
      litros: SAME_ODO_L3,
      tanque_cheio: true,
      amount_cents: SAME_ODO_C3,
    },
  ])
  if (sameOdoAbErr) throw new Error(`seed same-odo abastecimentos failed: ${sameOdoAbErr.message}`)
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('v_abastecimento_consumo full-tank math (CAR-04)', () => {
  it('a positive-delta interval yields km_rodados=500, km/l≈12.5, non-null R$/km', async () => {
    const a = userClient(userA.jwt, config) // RLS-active read (security_invoker scopes to A)
    const { data, error } = await a
      .from('v_abastecimento_consumo')
      .select('km_rodados, litros_intervalo, custo_intervalo_cents, km_por_litro, reais_por_km')
      .eq('carro_id', carroHappyId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)

    const row = data![0]!
    expect(Number(row.km_rodados)).toBe(500)
    expect(Number(row.km_por_litro)).toBeCloseTo(12.5, 4) // 500 / 40
    expect(row.reais_por_km).not.toBeNull()
    expect(Number(row.reais_por_km)).toBeCloseTo(48, 4) // 24000 / 500
  })

  it('v_carro_resumo.km_por_litro_medio equals the single valid interval (≈12.5)', async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('v_carro_resumo')
      .select('km_por_litro_medio, reais_por_km_medio')
      .eq('carro_id', carroHappyId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
    expect(Number(data![0]!.km_por_litro_medio)).toBeCloseTo(12.5, 4)
    expect(Number(data![0]!.reais_por_km_medio)).toBeCloseTo(48, 4)
  })
})

describe('v_abastecimento_consumo non-positive km guard (WR-05/06, T-10-03)', () => {
  it('never surfaces a negative km_por_litro or reais_por_km', async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('v_abastecimento_consumo')
      .select('km_rodados, km_por_litro, reais_por_km')
      .eq('carro_id', carroGuardId)
    expect(error).toBeNull()

    for (const row of data ?? []) {
      // The guard turns a non-positive delta to null AND drops it from the row set —
      // either way, no negative number is ever exposed.
      expect(Number(row.km_rodados)).toBeGreaterThan(0)
      if (row.km_por_litro !== null) expect(Number(row.km_por_litro)).toBeGreaterThan(0)
      if (row.reais_por_km !== null) expect(Number(row.reais_por_km)).toBeGreaterThan(0)
    }
  })

  it('excludes the non-positive (km_rodados<=0) interval from the rows entirely', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('v_abastecimento_consumo')
      .select('km_rodados')
      .eq('carro_id', carroGuardId)
    const nonPositive = (data ?? []).filter((r) => Number(r.km_rodados) <= 0)
    expect(nonPositive).toHaveLength(0)
  })

  it('resumo average for the guard carro is a positive number built off valid intervals only', async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('v_carro_resumo')
      .select('km_por_litro_medio, reais_por_km_medio')
      .eq('carro_id', carroGuardId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
    // The bad interval is excluded, so the average is finite and strictly positive,
    // never dragged negative by a rolled-back odometer.
    expect(data![0]!.km_por_litro_medio).not.toBeNull()
    expect(Number(data![0]!.km_por_litro_medio)).toBeGreaterThan(0)
    expect(Number(data![0]!.reais_por_km_medio)).toBeGreaterThan(0)
  })
})

describe('preco_litro is derived, never stored (D2 / CONTEXT)', () => {
  it('abastecimentos has no preco_litro column — the value is only ever derived', async () => {
    const a = userClient(userA.jwt, config)
    const { error } = await a.from('abastecimentos').select('preco_litro').limit(1)
    // Selecting a non-existent column must error (column absent), proving it is not stored.
    expect(error).not.toBeNull()
  })
})

describe('v_abastecimento_consumo same-odometer sweep-in guard (WR-02, DEBT-01)', () => {
  it('does not sweep a sibling fill at the same odometer into the prior interval', async () => {
    const a = userClient(userA.jwt, config) // RLS-active read (security_invoker scopes to A)
    const { data, error } = await a
      .from('v_abastecimento_consumo')
      .select('km_rodados, litros_intervalo, custo_intervalo_cents, km_por_litro, reais_por_km')
      .eq('carro_id', carroSameOdoId)
    expect(error).toBeNull()
    // The 30000→30500 interval is the ONLY surfaced row: the 30500→30500 sibling has a
    // zero odometer delta and is dropped by the WR-06 km_rodados>0 guard.
    expect((data ?? []).length).toBe(1)

    const row = data![0]!
    expect(Number(row.km_rodados)).toBe(500)

    // The closing fill's OWN liters/cost count toward its interval; the sibling at the
    // SAME odometer does NOT. (Bug on 0028: litros = L2+L3, custo = C2+C3.)
    expect(Number(row.litros_intervalo)).toBe(SAME_ODO_L2)
    expect(Number(row.custo_intervalo_cents)).toBe(SAME_ODO_C2)

    // Therefore km/l is 500/L2 (NOT understated by the sibling's liters) and R$/km is
    // C2/500 (NOT overstated by the sibling's cost).
    expect(Number(row.km_por_litro)).toBeCloseTo(500 / SAME_ODO_L2, 4) // 12.5
    expect(Number(row.reais_por_km)).toBeCloseTo(SAME_ODO_C2 / 500, 4) // 48
  })
})
