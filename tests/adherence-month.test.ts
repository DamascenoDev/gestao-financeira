// 3-W0 (BUD-02): v_adherence_month math. For known income + spend:
//   meta_cents   == (income_cents * percent_bp + 5000) / 10000   (integer half-up)
//   adherence_bp == realized * 10000 * 10000 / (income * percent_bp)   (guarded /0)
//   income 0     → adherence_bp null (never NaN), meta_cents 0.
//
// GREEN as of 03-01: the 0014 view computes this NOW.
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

const MONTH = '2026-06'
const INCOME = 800000
const PERCENT_BP = 3000 // 30%
const SPEND = 180000

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let consumoCat: string

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
  userA = await createUser('admth-a')
  const a = userClient(userA.jwt, config)

  const { data: cat } = await a
    .from('categories')
    .insert({ user_id: userA.id, name: 'Mercado', kind: 'consumo' })
    .select('id')
    .single()
  consumoCat = cat!.id

  await a.from('income_occurrences').insert({
    user_id: userA.id,
    template_id: null,
    source: 'Salário',
    amount_cents: INCOME,
    month_key: MONTH,
    occurred_on: `${MONTH}-05`,
  })
  await a.from('budget_targets').insert({
    user_id: userA.id,
    category_id: consumoCat,
    percent_bp: PERCENT_BP,
    direction: 'teto',
  })
  await a.from('transactions').insert({
    user_id: userA.id,
    category_id: consumoCat,
    amount_cents: SPEND,
    occurred_on: `${MONTH}-10`,
    description: 'compras',
  })
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('v_adherence_month math (BUD-02)', () => {
  it('meta_cents = (income*bp + 5000)/10000 integer half-up', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('v_adherence_month')
      .select('meta_cents, realized_cents, income_cents, adherence_bp')
      .eq('month_key', MONTH)
      .eq('category_id', consumoCat)
      .single()
    const expectedMeta = Math.trunc((INCOME * PERCENT_BP + 5000) / 10000)
    expect(data!.meta_cents).toBe(expectedMeta) // 240000
    expect(data!.income_cents).toBe(INCOME)
    expect(data!.realized_cents).toBe(SPEND)
  })

  it('adherence_bp = realized*1e8 / (income*bp)', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('v_adherence_month')
      .select('adherence_bp')
      .eq('month_key', MONTH)
      .eq('category_id', consumoCat)
      .single()
    // realized 180000 of meta 240000 = 75% = 7500 bp.
    const expectedBp = Math.trunc((SPEND * 10000 * 10000) / (INCOME * PERCENT_BP))
    expect(data!.adherence_bp).toBe(expectedBp) // 7500
  })

  it('no income in the month → no adherence row (period is income-driven, MD-01)', async () => {
    // MD-01: the view drives the period off income (income always exists per
    // user/month a meta can be measured in). A user with a target + spend but NO
    // income for that month has no computable meta, so the view yields NO row —
    // never a NaN/Infinity adherence_bp, and never a phantom 0-income row.
    const u = await createUser('admth-zero')
    const ua = userClient(u.jwt, config)
    const { data: cat } = await ua
      .from('categories')
      .insert({ user_id: u.id, name: 'Sem receita', kind: 'consumo' })
      .select('id')
      .single()
    await ua.from('budget_targets').insert({
      user_id: u.id,
      category_id: cat!.id,
      percent_bp: 3000,
      direction: 'teto',
    })
    await ua.from('transactions').insert({
      user_id: u.id,
      category_id: cat!.id,
      amount_cents: 5000,
      occurred_on: `${MONTH}-09`,
      description: 'gasto sem receita',
    })
    const { data } = await ua
      .from('v_adherence_month')
      .select('income_cents, meta_cents, adherence_bp')
      .eq('category_id', cat!.id)
    expect(data ?? []).toHaveLength(0)
    await admin.auth.admin.deleteUser(u.id).catch(() => {})
  })
})
