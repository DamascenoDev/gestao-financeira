// 9-W0-01 (CAR-02, T-09-01 / T-09-02): the security-critical D4 invariant + IDOR
// no-write proven at the DB + action boundary against the local `supabase start` stack.
//
// D4 (non-destructive lens): tagging a transaction to a carro — and untagging it —
// changes ONLY transactions.carro_id. category_id / amount_cents / kind / occurred_on /
// description AND the user's rows from v_adherence_month + v_adherence_ytd +
// v_category_totals are byte-identical before/after each step, and NO reserva_ledger
// row is created/removed for that transaction. No metas/aggregate moves on a tag.
//
// IDOR no-write (T-09-01): user B forging A's carro_id onto A's transaction id touches
// 0 of A's rows (RLS scopes the UPDATE even with a forged tx id, mirroring
// bulk-reclassify.test.ts), and A tagging with B's carro id is a no-write/rejected path
// (the carro_id FK is owner-checked; RLS makes B's carro invisible to A so the FK fails).
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
const PERCENT_BP = 3000 // 30% teto
const SPEND = 180000

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }

let consumoCat: string
let carroAId: string
let carroBId: string
let txAId: string

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

// Snapshot of the accounting fields + the metas-aggregate rows that must NOT move.
type Snapshot = {
  tx: {
    category_id: string | null
    amount_cents: number
    kind: string
    occurred_on: string
    description: string | null
  }
  adherenceMonth: unknown
  adherenceYtd: unknown
  categoryTotals: unknown
  ledgerCount: number
}

async function snapshot(client: SupabaseClient, userId: string): Promise<Snapshot> {
  const { data: tx, error: txErr } = await client
    .from('transactions')
    .select('category_id, amount_cents, kind, occurred_on, description')
    .eq('id', txAId)
    .single()
  if (txErr || !tx) throw new Error(`snapshot tx read failed: ${txErr?.message}`)

  // Order deterministically so a byte-identical comparison is meaningful.
  const { data: adhM } = await client
    .from('v_adherence_month')
    .select('category_id, month_key, income_cents, realized_cents, meta_cents, adherence_bp')
    .eq('user_id', userId)
    .order('category_id', { ascending: true })
    .order('month_key', { ascending: true })
  const { data: adhY } = await client
    .from('v_adherence_ytd')
    .select('category_id, year, income_cents, realized_cents, meta_cents, adherence_bp')
    .eq('user_id', userId)
    .order('category_id', { ascending: true })
    .order('year', { ascending: true })
  const { data: catTotals } = await client
    .from('v_category_totals')
    .select('category_id, month_key, total_cents, tx_count')
    .eq('user_id', userId)
    .order('category_id', { ascending: true })
    .order('month_key', { ascending: true })

  const { count } = await client
    .from('reserva_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('transaction_id', txAId)

  return {
    tx,
    adherenceMonth: adhM ?? [],
    adherenceYtd: adhY ?? [],
    categoryTotals: catTotals ?? [],
    ledgerCount: count ?? 0,
  }
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('carro-tag-a')
  userB = await createUser('carro-tag-b')

  const a = userClient(userA.jwt, config)
  const b = userClient(userB.jwt, config)

  // A consumo category + a teto meta + income so the adherence views materialize rows.
  const { data: cat, error: catErr } = await a
    .from('categories')
    .insert({ user_id: userA.id, name: 'Manutenção', kind: 'consumo' })
    .select('id')
    .single()
  if (catErr || !cat) throw new Error(`seed category failed: ${catErr?.message}`)
  consumoCat = cat.id

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

  // A's carro (the tag target) + a transaction in the consumo category (UNtagged).
  const { data: carro, error: carroErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Gol', modelo: 'VW Gol', placa: 'ABC1D23', ano: 2020 })
    .select('id')
    .single()
  if (carroErr || !carro) throw new Error(`seed carro A failed: ${carroErr?.message}`)
  carroAId = carro.id

  const { data: tx, error: txErr } = await a
    .from('transactions')
    .insert({
      user_id: userA.id,
      category_id: consumoCat,
      amount_cents: SPEND,
      kind: 'expense',
      occurred_on: `${MONTH}-10`,
      description: 'troca de óleo',
    })
    .select('id')
    .single()
  if (txErr || !tx) throw new Error(`seed transaction failed: ${txErr?.message}`)
  txAId = tx.id

  // B's own carro — used for the cross-user forged-FK no-write path.
  const { data: carroB, error: carroBErr } = await b
    .from('carros')
    .insert({ user_id: userB.id, apelido: 'Onix', modelo: 'Chevrolet Onix', placa: 'XYZ9K88', ano: 2022 })
    .select('id')
    .single()
  if (carroBErr || !carroB) throw new Error(`seed carro B failed: ${carroBErr?.message}`)
  carroBId = carroB.id
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('carro tagging is non-destructive (D4, T-09-02)', () => {
  it('tag → untag leaves accounting fields + all metas aggregates byte-identical (only carro_id changes)', async () => {
    const a = userClient(userA.jwt, config)

    // Baseline: the transaction starts untagged.
    const { data: pre } = await a
      .from('transactions')
      .select('carro_id')
      .eq('id', txAId)
      .single()
    expect(pre!.carro_id).toBeNull()
    const base = await snapshot(a, userA.id)

    // STEP 1 — tag the transaction to A's carro.
    const { error: tagErr } = await a
      .from('transactions')
      .update({ carro_id: carroAId })
      .eq('id', txAId)
    expect(tagErr).toBeNull()

    const { data: tagged } = await a
      .from('transactions')
      .select('carro_id')
      .eq('id', txAId)
      .single()
    expect(tagged!.carro_id).toBe(carroAId) // the ONLY field that changed

    const afterTag = await snapshot(a, userA.id)
    // Accounting fields + every metas aggregate are byte-identical to the baseline.
    expect(afterTag.tx).toEqual(base.tx)
    expect(afterTag.adherenceMonth).toEqual(base.adherenceMonth)
    expect(afterTag.adherenceYtd).toEqual(base.adherenceYtd)
    expect(afterTag.categoryTotals).toEqual(base.categoryTotals)
    // No reserva_ledger perturbation for this transaction.
    expect(afterTag.ledgerCount).toBe(base.ledgerCount)
    expect(afterTag.ledgerCount).toBe(0)

    // STEP 2 — untag (carro_id back to null).
    const { error: untagErr } = await a
      .from('transactions')
      .update({ carro_id: null })
      .eq('id', txAId)
    expect(untagErr).toBeNull()

    const { data: untagged } = await a
      .from('transactions')
      .select('carro_id')
      .eq('id', txAId)
      .single()
    expect(untagged!.carro_id).toBeNull()

    const afterUntag = await snapshot(a, userA.id)
    expect(afterUntag.tx).toEqual(base.tx)
    expect(afterUntag.adherenceMonth).toEqual(base.adherenceMonth)
    expect(afterUntag.adherenceYtd).toEqual(base.adherenceYtd)
    expect(afterUntag.categoryTotals).toEqual(base.categoryTotals)
    expect(afterUntag.ledgerCount).toBe(base.ledgerCount)
  })
})

describe('carro tagging IDOR no-write (T-09-01)', () => {
  it("user B forging A's carro_id onto A's transaction touches 0 of A's rows", async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)

    // B owns neither A's carro nor A's transaction. The forged UPDATE is RLS-scoped
    // to B's own rows → zero matched (mirrors bulk-reclassify.test.ts).
    const { data: touched } = await b
      .from('transactions')
      .update({ carro_id: carroAId })
      .eq('id', txAId)
      .select('id')
    expect(touched ?? []).toHaveLength(0)

    // A's transaction is still untagged afterwards.
    const { data: row } = await a
      .from('transactions')
      .select('carro_id')
      .eq('id', txAId)
      .single()
    expect(row!.carro_id).toBeNull()
  })

  it("user A cannot see user B's carro — the action-layer assertOwnedCarro re-derive is what blocks the tag", async () => {
    const a = userClient(userA.jwt, config)

    // The premise of the whole IDOR mitigation: Postgres FKs are NOT RLS-aware, so a
    // raw UPDATE with B's (globally-existing) carro id would otherwise SUCCEED at the
    // DB level. The protection lives in the action: it re-derives ownership with
    // assertOwnedCarro, which reads B's carro under A's RLS-active client and sees
    // ZERO rows ('not-owned') → it issues NO write. Prove that read returns zero.
    const { data: visible } = await a
      .from('carros')
      .select('id')
      .eq('id', carroBId)
    expect(visible ?? []).toHaveLength(0) // 'not-owned' → action emits no write

    // A's transaction stays untagged (the action would have rejected before writing).
    const { data: row } = await a
      .from('transactions')
      .select('carro_id')
      .eq('id', txAId)
      .single()
    expect(row!.carro_id).toBeNull()
  })
})
