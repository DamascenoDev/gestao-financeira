// 11-03 (CAR-05.2, T-11-05 / T-11-06): the inline gasto-por-categoria aggregation on
// /carros/[id] is RLS-scoped, point-in-time-correct, and D4-non-destructive.
//
// The detail RSC sums the caller's own carro_id-tagged transactions, grouped by the
// point-in-time category_id on each row (never by name). This test proves, against the
// local `supabase start` stack, the exact query the page runs:
//
//   transactions.select('amount_cents, category_id, categories(name)').eq('carro_id', id)
//
//   (a) per-category sums equal the seeded amounts grouped by category_id, in integer cents;
//   (b) an UNTAGGED transaction (carro_id null) is excluded from the carro's totals;
//   (c) RLS isolation — user B reading the same carro_id aggregation sees ZERO rows (no leak);
//   (d) D4 non-destructive — after the aggregation read, the transactions' category_id /
//       amount_cents AND the user's budget_targets rows are byte-identical (the read changed
//       nothing), mirroring the invariant proven in carro-tag-nondestructive.test.ts.
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
let catManutencao: string
let catCombustivel: string

// Seeded tagged spend (integer cents), grouped by category:
//   Manutenção: 50000 + 30000 = 80000
//   Combustível: 20000
//   (one untagged transaction of 99999 cents that must NOT appear in the carro total)
const MANUTENCAO_TOTAL = 80000
const COMBUSTIVEL_TOTAL = 20000

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

/** The exact aggregation the /carros/[id] RSC runs: per-category integer-cent sums. */
async function aggregateByCategoria(
  client: SupabaseClient,
  carroId: string,
): Promise<Map<string, { categoria: string; valorCents: number }>> {
  const { data } = await client
    .from('transactions')
    .select('amount_cents, category_id, categories(name)')
    .eq('carro_id', carroId)
  const sums = new Map<string, { categoria: string; valorCents: number }>()
  for (const tx of data ?? []) {
    const key = (tx.category_id as string | null) ?? '__sem_categoria__'
    const embed = tx.categories as unknown as { name: string } | { name: string }[] | null
    const nome =
      (Array.isArray(embed) ? embed[0]?.name : embed?.name) ?? 'Sem categoria'
    const prev = sums.get(key)
    sums.set(key, {
      categoria: prev?.categoria ?? nome,
      valorCents: (prev?.valorCents ?? 0) + (tx.amount_cents as number),
    })
  }
  return sums
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('carro-cat-a')
  userB = await createUser('carro-cat-b')

  const a = userClient(userA.jwt, config)

  const { data: carro, error: carroErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Civic' })
    .select('id')
    .single()
  if (carroErr || !carro) throw new Error(`seed carro failed: ${carroErr?.message}`)
  carroAId = carro.id

  const { data: catM, error: catMErr } = await a
    .from('categories')
    .insert({ user_id: userA.id, name: 'Manutenção', kind: 'consumo' })
    .select('id')
    .single()
  if (catMErr || !catM) throw new Error(`seed cat Manutenção failed: ${catMErr?.message}`)
  catManutencao = catM.id

  const { data: catC, error: catCErr } = await a
    .from('categories')
    .insert({ user_id: userA.id, name: 'Combustível', kind: 'consumo' })
    .select('id')
    .single()
  if (catCErr || !catC) throw new Error(`seed cat Combustível failed: ${catCErr?.message}`)
  catCombustivel = catC.id

  // budget_targets: a metas row that the aggregation must NEVER read or move (D4).
  const { error: btErr } = await a.from('budget_targets').insert({
    user_id: userA.id,
    category_id: catManutencao,
    percent_bp: 1500,
    direction: 'teto',
  })
  if (btErr) throw new Error(`seed budget_targets failed: ${btErr.message}`)

  // Three carro_id-tagged transactions across both categories + one UNTAGGED.
  const { error: txErr } = await a.from('transactions').insert([
    { user_id: userA.id, category_id: catManutencao, amount_cents: 50000, occurred_on: '2026-04-02', description: 'troca de óleo', carro_id: carroAId },
    { user_id: userA.id, category_id: catManutencao, amount_cents: 30000, occurred_on: '2026-04-20', description: 'pastilhas', carro_id: carroAId },
    { user_id: userA.id, category_id: catCombustivel, amount_cents: 20000, occurred_on: '2026-04-15', description: 'gasolina', carro_id: carroAId },
    // UNTAGGED (carro_id null) — must NOT appear in the carro's category totals.
    { user_id: userA.id, category_id: catCombustivel, amount_cents: 99999, occurred_on: '2026-04-16', description: 'mercado', carro_id: null },
  ])
  if (txErr) throw new Error(`seed transactions failed: ${txErr.message}`)
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('gasto-por-categoria inline aggregation (CAR-05.2)', () => {
  it('sums by point-in-time category_id, in integer cents, excluding untagged', async () => {
    const a = userClient(userA.jwt, config)
    const sums = await aggregateByCategoria(a, carroAId)

    expect(sums.get(catManutencao)?.valorCents).toBe(MANUTENCAO_TOTAL)
    expect(sums.get(catManutencao)?.categoria).toBe('Manutenção')
    expect(sums.get(catCombustivel)?.valorCents).toBe(COMBUSTIVEL_TOTAL)
    expect(sums.get(catCombustivel)?.categoria).toBe('Combustível')

    // Only the two seeded categories — the untagged 99999 spend is excluded entirely,
    // so the carro's combustível bucket is 20000, not 119999.
    expect(sums.size).toBe(2)
    const total = Array.from(sums.values()).reduce((s, c) => s + c.valorCents, 0)
    expect(total).toBe(MANUTENCAO_TOTAL + COMBUSTIVEL_TOTAL)
  })

  it('RLS isolation — user B sees ZERO rows for user A carro_id (no leak)', async () => {
    const b = userClient(userB.jwt, config)
    const sums = await aggregateByCategoria(b, carroAId)
    expect(sums.size).toBe(0)
  })

  it('is D4 non-destructive — transactions + budget_targets byte-identical after the read', async () => {
    const a = userClient(userA.jwt, config)

    const snapshot = async () => {
      const { data: tx } = await a
        .from('transactions')
        .select('id, category_id, amount_cents')
        .eq('carro_id', carroAId)
        .order('amount_cents', { ascending: true })
      const { data: bt } = await a
        .from('budget_targets')
        .select('category_id, percent_bp, direction')
        .eq('user_id', userA.id)
        .order('category_id', { ascending: true })
      return JSON.stringify({ tx: tx ?? [], bt: bt ?? [] })
    }

    const before = await snapshot()
    // The aggregation read (the only thing the page does for this feature).
    await aggregateByCategoria(a, carroAId)
    const after = await snapshot()

    expect(after).toBe(before)
  })
})
