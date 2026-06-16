// 3-W0-07 / 3-W0-03 (RSV-02/03 — THE #1 DOUBLE-COUNTING GUARD): an aporte is a
// transaction in a kind='alocacao' Reserva category + a linked reserva_ledger 'in'
// entry. It must raise the ALOCAÇÃO realized total in v_adherence_month and leave
// EVERY kind='consumo' total byte-identical. The same cents NEVER appear in a
// consumo line — an aporte is investment allocation, never consumption spend.
//
// GREEN as of 03-01: the alocação grouping lives IN THE VIEW (0014 alloc_total CTE),
// so this invariant holds NOW against the Plan-01 schema regardless of which Server
// Action writes the aporte. The linked-ledger 'in' half (the sub-flow that the UI
// drives) is exercised here at the data layer; the dialog UX is verified in 03-05.
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

interface SeedCats {
  reserva: { id: string; name: string }
  investimentos: { id: string; name: string }
  consumoCats: { id: string; name: string }[]
}

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

async function loadSeedCats(a: SupabaseClient, userId: string): Promise<SeedCats> {
  const { data } = await a
    .from('categories')
    .select('id, name, kind, is_reserva')
    .eq('user_id', userId)
  const rows = data ?? []
  const reservaRow = rows.find((r) => r.is_reserva === true)
  const investimentosRow = rows.find((r) => r.name === 'Investimentos')
  if (!reservaRow || !investimentosRow) throw new Error('seed Reserva/Investimentos categories missing')
  return {
    reserva: { id: reservaRow.id, name: reservaRow.name },
    investimentos: { id: investimentosRow.id, name: investimentosRow.name },
    consumoCats: rows
      .filter((r) => r.kind === 'consumo')
      .map((r) => ({ id: r.id, name: r.name })),
  }
}

/** Per-category realized cents keyed by category_id, from v_adherence_month. */
async function adherenceByCategory(
  a: SupabaseClient,
  monthKey: string,
): Promise<Map<string, number>> {
  const { data } = await a
    .from('v_adherence_month')
    .select('category_id, kind, realized_cents')
    .eq('month_key', monthKey)
  const m = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.category_id) m.set(row.category_id, row.realized_cents ?? 0)
  }
  return m
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('aporte-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('aporte counts as alocação, never consumo (RSV-03 — double-count guard)', () => {
  it('an aporte raises ONLY the alocação total; every consumo total is unchanged', async () => {
    const a = userClient(userA.jwt, config)
    const cats = await loadSeedCats(a, userA.id)

    // Seed income so income_cents > 0 (otherwise adherence rows can be sparse).
    await a.from('income_occurrences').insert({
      user_id: userA.id,
      template_id: null,
      source: 'Salário',
      amount_cents: 800000,
      month_key: MONTH,
      occurred_on: `${MONTH}-05`,
    })

    // Targets so each category surfaces in v_adherence_month: a teto on a consumo
    // category and an alvo on the Reserva (alocação) category.
    const consumo = cats.consumoCats[0]
    if (!consumo) throw new Error('expected at least one seed consumo category')
    await a.from('budget_targets').insert([
      { user_id: userA.id, category_id: consumo.id, percent_bp: 3000, direction: 'teto' },
      { user_id: userA.id, category_id: cats.reserva.id, percent_bp: 2000, direction: 'alvo' },
    ])

    // Seed an ordinary consumo expense so the consumo line has a baseline > 0.
    await a.from('transactions').insert({
      user_id: userA.id,
      category_id: consumo.id,
      amount_cents: 70000,
      occurred_on: `${MONTH}-08`,
      description: 'mercado',
    })

    const baseline = await adherenceByCategory(a, MONTH)
    const consumoBaseline = baseline.get(consumo.id) ?? 0
    const alocacaoBaseline = baseline.get(cats.reserva.id) ?? 0
    expect(consumoBaseline).toBe(70000)

    // === The aporte: a transaction in the Reserva (alocação) category + a linked
    // reserva_ledger 'in' entry. ===
    const APORTE = 25000
    const { data: reserva } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Reserva de emergência', alvo_cents: 1000000 })
      .select('id')
      .single()
    const { data: tx } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: cats.reserva.id, // the Reserva alocação category
        amount_cents: APORTE,
        occurred_on: `${MONTH}-15`,
        description: 'aporte reserva',
      })
      .select('id')
      .single()
    await a.from('reserva_ledger').insert({
      user_id: userA.id,
      reserva_id: reserva!.id,
      kind: 'in',
      amount_cents: APORTE,
      transaction_id: tx!.id,
      occurred_on: `${MONTH}-15`,
    })

    const after = await adherenceByCategory(a, MONTH)

    // The alocação total rose by exactly the aporte amount.
    expect(after.get(cats.reserva.id) ?? 0).toBe(alocacaoBaseline + APORTE)

    // EVERY consumo total is byte-identical to its baseline — the aporte did NOT
    // leak into any consumption line (the #1 double-counting pitfall).
    for (const c of cats.consumoCats) {
      expect(after.get(c.id) ?? 0).toBe(baseline.get(c.id) ?? 0)
    }
    expect(after.get(consumo.id) ?? 0).toBe(70000)
  })

  it('the aporte cents never appear in a kind=consumo adherence row', async () => {
    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('v_adherence_month')
      .select('kind, realized_cents')
      .eq('month_key', MONTH)
    // The 25000 aporte is only ever counted under a kind='alocacao' row.
    const consumoRows = (data ?? []).filter((r) => r.kind === 'consumo')
    for (const row of consumoRows) {
      expect(row.realized_cents).not.toBe(25000)
    }
  })
})
