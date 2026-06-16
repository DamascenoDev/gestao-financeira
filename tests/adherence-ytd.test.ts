// 3-W0 (BUD-03): v_adherence_ytd accumulates income + spend across MULTIPLE civil
// months of the year [YYYY-01-01..YYYY-12-31]. income_cents == Σ monthly income;
// realized_cents == Σ monthly spend for the category; the meta uses the YTD income.
//
// GREEN as of 03-01: the 0014 YTD view sums over the civil year.
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

const YEAR = '2026'
const PERCENT_BP = 3000

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
  userA = await createUser('ytd-a')
  const a = userClient(userA.jwt, config)

  const { data: cat } = await a
    .from('categories')
    .insert({ user_id: userA.id, name: 'Mercado YTD', kind: 'consumo' })
    .select('id')
    .single()
  consumoCat = cat!.id

  // Income across two months: 500000 (Mar) + 700000 (Jun) = 1200000 YTD.
  await a.from('income_occurrences').insert([
    { user_id: userA.id, template_id: null, source: 'Salário', amount_cents: 500000, month_key: '2026-03', occurred_on: '2026-03-05' },
    { user_id: userA.id, template_id: null, source: 'Salário', amount_cents: 700000, month_key: '2026-06', occurred_on: '2026-06-05' },
  ])
  await a.from('budget_targets').insert({
    user_id: userA.id,
    category_id: consumoCat,
    percent_bp: PERCENT_BP,
    direction: 'teto',
  })
  // Spend across two months: 80000 (Mar) + 120000 (Jun) = 200000 YTD.
  await a.from('transactions').insert([
    { user_id: userA.id, category_id: consumoCat, amount_cents: 80000, occurred_on: '2026-03-10', description: 'mar' },
    { user_id: userA.id, category_id: consumoCat, amount_cents: 120000, occurred_on: '2026-06-10', description: 'jun' },
  ])
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('v_adherence_ytd accumulates over the civil year (BUD-03)', () => {
  it('income_cents and realized_cents are the YTD sums', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('v_adherence_ytd')
      .select('income_cents, realized_cents, meta_cents, adherence_bp')
      .eq('year', YEAR)
      .eq('category_id', consumoCat)
      .single()
    expect(data!.income_cents).toBe(1200000) // 500000 + 700000
    expect(data!.realized_cents).toBe(200000) // 80000 + 120000
    // meta = (1200000 * 3000 + 5000)/10000 = 360000.
    expect(data!.meta_cents).toBe(Math.trunc((1200000 * PERCENT_BP + 5000) / 10000))
    // adherence_bp = 200000 * 1e8 / (1200000 * 3000).
    expect(data!.adherence_bp).toBe(Math.trunc((200000 * 10000 * 10000) / (1200000 * PERCENT_BP)))
  })
})
