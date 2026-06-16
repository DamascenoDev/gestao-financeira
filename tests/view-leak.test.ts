// 2-W0-08 (INC-04/TXN-03): the aggregate views v_income_month and v_category_totals
// are security_invoker — a second user reads ZERO of the first user's sums. This is the
// proof that the views inherit RLS instead of running as the definer (T-02-VIEW).
//
// GREEN as of 02-01: the migrated stack + security_invoker views make this pass NOW.
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
let userB: { id: string; jwt: string }

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
  userA = await createUser('leak-a')
  userB = await createUser('leak-b')

  const a = userClient(userA.jwt, config)
  // Seed income for user A.
  await a.from('income_occurrences').insert({
    user_id: userA.id,
    template_id: null,
    source: 'Salário',
    amount_cents: 800000,
    month_key: MONTH,
    occurred_on: `${MONTH}-05`,
  })
  // Seed a transaction for user A.
  const { data: cat } = await a
    .from('categories')
    .insert({ user_id: userA.id, name: 'Gastos', kind: 'consumo' })
    .select('id')
    .single()
  await a.from('transactions').insert({
    user_id: userA.id,
    category_id: cat!.id,
    amount_cents: 50000,
    occurred_on: `${MONTH}-12`,
    description: 'gasto A',
  })

  // Phase-3 substrate for user A: a budget_target (so adherence rows exist) and a
  // reserva + ledger (so a balance row exists) — the new security_invoker views.
  await a.from('budget_targets').insert({
    user_id: userA.id,
    category_id: cat!.id,
    percent_bp: 3000,
    direction: 'teto',
  })
  const { data: reserva } = await a
    .from('reservas')
    .insert({ user_id: userA.id, nome: 'Reserva A', alvo_cents: 100000 })
    .select('id')
    .single()
  await a.from('reserva_ledger').insert({
    user_id: userA.id,
    reserva_id: reserva!.id,
    kind: 'in',
    amount_cents: 40000,
    occurred_on: `${MONTH}-03`,
  })
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('aggregate views are security_invoker (T-02-VIEW)', () => {
  it('user A sees its own income/category totals', async () => {
    const a = userClient(userA.jwt, config)
    const { data: inc } = await a.from('v_income_month').select('*').eq('month_key', MONTH)
    expect((inc ?? []).length).toBeGreaterThan(0)
    const { data: tot } = await a.from('v_category_totals').select('*').eq('month_key', MONTH)
    expect((tot ?? []).length).toBeGreaterThan(0)
  })

  it('user B reads ZERO of user A income-month rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('v_income_month').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('user B reads ZERO of user A category-totals rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('v_category_totals').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })
})

describe('Phase-3 adherence/balance views are security_invoker (T-03-T1)', () => {
  it('user A sees its own adherence + reserva-balance rows', async () => {
    const a = userClient(userA.jwt, config)
    const { data: month } = await a.from('v_adherence_month').select('*').eq('month_key', MONTH)
    expect((month ?? []).length).toBeGreaterThan(0)
    const { data: bal } = await a.from('v_reserva_balance').select('*')
    expect((bal ?? []).length).toBeGreaterThan(0)
  })

  it('user B reads ZERO of user A v_adherence_month rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('v_adherence_month').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('user B reads ZERO of user A v_adherence_ytd rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('v_adherence_ytd').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })

  it('user B reads ZERO of user A v_reserva_balance rows', async () => {
    const b = userClient(userB.jwt, config)
    const { data } = await b.from('v_reserva_balance').select('*').eq('user_id', userA.id)
    expect(data ?? []).toHaveLength(0)
  })
})
