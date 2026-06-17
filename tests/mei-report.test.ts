// 5-W0-05 (MEI-04/02, T-05-04 data-level): the v_mei_year_summary row is the exact DASN
// report — gross total + comércio/serviços split + has_employee — and its applicable
// limit / band / ratio match the src/lib/mei/limit.ts oracle for the seeded start date.
// This is the SQL↔TS parity at the data level: the SQL CASE and the TS formula must
// agree, so a drift in either fails here.
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

import { applicableLimitCents, bandCeilingCents } from '@/lib/mei/limit'

const YEAR = 2026
const START = `${YEAR}-03-15` // March open → 10 active months → R$67.500 applicable

// Seed amounts (centavos).
const COMERCIO_1 = 250000
const COMERCIO_2 = 150000
const SERVICOS_1 = 350000
const GROSS = COMERCIO_1 + COMERCIO_2 + SERVICOS_1 // 750000

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
  userA = await createUser('mei-report-a')

  const a = userClient(userA.jwt, config)
  await a.from('mei_settings').insert({ user_id: userA.id, mei_start_date: START })
  await a.from('mei_year_flags').insert({ user_id: userA.id, year: YEAR, has_employee: true })
  await a.from('mei_invoices').insert([
    {
      user_id: userA.id,
      issued_on: `${YEAR}-04-01`,
      amount_cents: COMERCIO_1,
      tomador: 'C1',
      descricao: '',
      activity_type: 'comercio_industria',
    },
    {
      user_id: userA.id,
      issued_on: `${YEAR}-06-01`,
      amount_cents: COMERCIO_2,
      tomador: 'C2',
      descricao: '',
      activity_type: 'comercio_industria',
    },
    {
      user_id: userA.id,
      issued_on: `${YEAR}-08-01`,
      amount_cents: SERVICOS_1,
      tomador: 'S1',
      descricao: '',
      activity_type: 'servicos',
    },
  ])
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('v_mei_year_summary = the DASN report row (MEI-04)', () => {
  it('gross + split + employee + limit/band/ratio match the TS oracle', async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('v_mei_year_summary')
      .select('*')
      .eq('year', YEAR)
      .single()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    const row = data!

    // gross + split.
    expect(Number(row.gross_cents)).toBe(GROSS)
    expect(Number(row.comercio_cents)).toBe(COMERCIO_1 + COMERCIO_2)
    expect(Number(row.servicos_cents)).toBe(SERVICOS_1)
    expect(Number(row.comercio_cents) + Number(row.servicos_cents)).toBe(Number(row.gross_cents))

    // DASN employee flag.
    expect(row.has_employee).toBe(true)

    // SQL↔TS parity: the view's applicable limit / band / ratio == the oracle.
    const expectedLimit = applicableLimitCents(YEAR, START) // 6_750_000
    const expectedBand = bandCeilingCents(expectedLimit) // 8_100_000
    const expectedRatio = Math.floor((GROSS * 10000) / expectedLimit)
    expect(Number(row.applicable_limit_cents)).toBe(expectedLimit)
    expect(Number(row.band_ceiling_cents)).toBe(expectedBand)
    expect(Number(row.ratio_bp)).toBe(expectedRatio)
  })
})
