// MD-01 + MD-02 (v_adherence_month correctness):
//
//   MD-01: a kind='consumo' (teto) meta with INCOME but ZERO spend this month must
//          still appear as a row — realized 0, adherence_bp 0 ("No limite"), with a
//          non-NULL month_key — instead of vanishing (the old income mis-join left
//          month_key NULL when there was no spend row to carry the period key, and
//          the dashboard's .eq('month_key', …) then dropped the meta entirely).
//
//   MD-02: adherence_bp is computed against the SAME rounded meta_cents the user (and
//          the dashboard combined-alocação line) sees, so a borderline value lands on
//          the same side of the 80/100% thresholds in both places.
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
  userA = await createUser('adh-zero')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('zero-spend teto stays visible + rounded ratio (MD-01/MD-02)', () => {
  it('a teto meta with income but ZERO spend appears at 0% (not dropped)', async () => {
    const a = userClient(userA.jwt, config)
    const INCOME = 500000

    const { data: cat } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'Lazer', kind: 'consumo' })
      .select('id')
      .single()

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
      category_id: cat!.id,
      percent_bp: 1000, // 10% teto
      direction: 'teto',
    })
    // NOTE: deliberately NO transaction in this category — zero spend.

    const { data } = await a
      .from('v_adherence_month')
      .select('month_key, income_cents, realized_cents, meta_cents, adherence_bp')
      .eq('month_key', MONTH)
      .eq('category_id', cat!.id)
      .single()

    // The row materializes with the correct period key — it is NOT dropped.
    expect(data).not.toBeNull()
    expect(data!.month_key).toBe(MONTH)
    expect(data!.income_cents).toBe(INCOME)
    expect(data!.realized_cents).toBe(0) // zero spend
    expect(data!.meta_cents).toBe(50000) // 10% of 500000
    expect(data!.adherence_bp).toBe(0) // 0% — the best possible teto adherence
  })

  it('adherence_bp uses the rounded meta_cents denominator (MD-02)', async () => {
    // Fresh user so income is exactly INCOME (v_income_month sums per user/month).
    const u = await createUser('adh-md02')
    const a = userClient(u.jwt, config)
    // Choose income*bp so the half-up rounding actually moves meta_cents, making the
    // rounded vs un-rounded denominator measurably different.
    const INCOME = 333333
    const PERCENT_BP = 1500 // 15%
    const SPEND = 40000

    const { data: cat } = await a
      .from('categories')
      .insert({ user_id: u.id, name: 'Mercado-md02', kind: 'consumo' })
      .select('id')
      .single()
    await a.from('income_occurrences').insert({
      user_id: u.id,
      template_id: null,
      source: 'Extra',
      amount_cents: INCOME,
      month_key: MONTH,
      occurred_on: `${MONTH}-06`,
    })
    await a.from('budget_targets').insert({
      user_id: u.id,
      category_id: cat!.id,
      percent_bp: PERCENT_BP,
      direction: 'teto',
    })
    await a.from('transactions').insert({
      user_id: u.id,
      category_id: cat!.id,
      amount_cents: SPEND,
      occurred_on: `${MONTH}-10`,
      description: 'compras',
    })

    const { data } = await a
      .from('v_adherence_month')
      .select('meta_cents, realized_cents, adherence_bp')
      .eq('month_key', MONTH)
      .eq('category_id', cat!.id)
      .single()

    // meta_cents is half-up rounded; adherence_bp must divide by THAT exact value
    // (same basis the dashboard combined line uses), not by the un-rounded income*bp.
    const roundedMeta = Math.trunc((INCOME * PERCENT_BP + 5000) / 10000)
    expect(data!.meta_cents).toBe(roundedMeta)
    const expectedBp = Math.trunc((SPEND * 10000) / roundedMeta)
    expect(data!.adherence_bp).toBe(expectedBp)
    await admin.auth.admin.deleteUser(u.id).catch(() => {})
  })
})
