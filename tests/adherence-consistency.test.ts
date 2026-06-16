// 3-W0-02 (BUD-02/03 — THE CONSISTENCY PROOF, Pitfall 7): for a civil year with
// exactly ONE populated month, per-category adherence_bp from v_adherence_month must
// EQUAL adherence_bp from v_adherence_ytd. Both views share one percent_bp, one
// half-up rounding, and one alocação grouping — only the window differs. A single-
// month year makes the two windows coincide, so any divergence is a bug.
//
// GREEN as of 03-01: the 0014 views are built to be window-only-different.
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
const MONTH = '2026-06'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let consumoCat: string
let reservaCat: string

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
  userA = await createUser('cons-a')
  const a = userClient(userA.jwt, config)

  const { data: cats } = await a
    .from('categories')
    .select('id, name, kind, is_reserva')
    .eq('user_id', userA.id)
  const consumo = (cats ?? []).find((c) => c.kind === 'consumo')
  const reserva = (cats ?? []).find((c) => c.is_reserva === true)
  if (!consumo || !reserva) throw new Error('seed categories missing')
  consumoCat = consumo.id
  reservaCat = reserva.id

  // ONE populated civil month only.
  await a.from('income_occurrences').insert({
    user_id: userA.id,
    template_id: null,
    source: 'Salário',
    amount_cents: 1000000,
    month_key: MONTH,
    occurred_on: `${MONTH}-05`,
  })
  await a.from('budget_targets').insert([
    { user_id: userA.id, category_id: consumoCat, percent_bp: 3000, direction: 'teto' },
    { user_id: userA.id, category_id: reservaCat, percent_bp: 2000, direction: 'alvo' },
  ])
  await a.from('transactions').insert([
    { user_id: userA.id, category_id: consumoCat, amount_cents: 220000, occurred_on: `${MONTH}-08`, description: 'consumo' },
    { user_id: userA.id, category_id: reservaCat, amount_cents: 150000, occurred_on: `${MONTH}-12`, description: 'aporte' },
  ])
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

async function bpByCategory(
  a: SupabaseClient,
  view: 'v_adherence_month' | 'v_adherence_ytd',
): Promise<Map<string, number | null>> {
  const filter = view === 'v_adherence_month' ? { col: 'month_key', val: MONTH } : { col: 'year', val: YEAR }
  const { data } = await a
    .from(view)
    .select('category_id, adherence_bp')
    .eq(filter.col, filter.val)
  const m = new Map<string, number | null>()
  for (const row of data ?? []) {
    if (row.category_id) m.set(row.category_id, row.adherence_bp)
  }
  return m
}

describe('monthly↔YTD consistency for a single-month year (BUD-02/03)', () => {
  it('per-category adherence_bp from v_adherence_month == v_adherence_ytd', async () => {
    const a = userClient(userA.jwt, config)
    const monthBp = await bpByCategory(a, 'v_adherence_month')
    const ytdBp = await bpByCategory(a, 'v_adherence_ytd')

    // Both categories present in both views with the same bp.
    for (const cat of [consumoCat, reservaCat]) {
      expect(monthBp.has(cat)).toBe(true)
      expect(ytdBp.has(cat)).toBe(true)
      expect(ytdBp.get(cat)).toBe(monthBp.get(cat))
    }
  })

  it('realized + meta also match between the two windows', async () => {
    const a = userClient(userA.jwt, config)
    const { data: month } = await a
      .from('v_adherence_month')
      .select('category_id, realized_cents, meta_cents')
      .eq('month_key', MONTH)
    const { data: ytd } = await a
      .from('v_adherence_ytd')
      .select('category_id, realized_cents, meta_cents')
      .eq('year', YEAR)
    const ytdByCat = new Map((ytd ?? []).map((r) => [r.category_id, r]))
    for (const row of month ?? []) {
      const y = ytdByCat.get(row.category_id)
      expect(y).toBeDefined()
      expect(y!.realized_cents).toBe(row.realized_cents)
      expect(y!.meta_cents).toBe(row.meta_cents)
    }
  })
})
