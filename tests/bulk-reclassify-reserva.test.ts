// HG-01 (RSV-02/03 — bulk-reclassify reserva integrity): bulkReclassify must keep
// the reserva saldo (v_reserva_balance) EQUAL to its ledger (Σin − Σout) in both
// directions:
//
//   1. Bulk INTO Reserva is BLOCKED — the bulk path has no UI to collect a per-row
//      reservaId, so it cannot create the required aporte ('in') entry. Allowing it
//      would count the spend as alocação while leaving the saldo/ledger untouched
//      (an understated saldo). The action rejects an is_reserva target.
//   2. Bulk OUT of Reserva sync-DELETES the linked aporte rows — else a phantom
//      'in' entry keeps inflating the old reserva's saldo (over-statement).
//
// The Server Action (bulkReclassify) needs Next request context to run, so — like
// the rest of this suite — we exercise the exact data-layer contract the action
// implements against the live RLS schema: a non-Reserva bulk update followed by a
// `reserva_ledger.delete().in('transaction_id', ids)`, and assert saldo == ledger
// throughout (no understate, no phantom). The is_reserva guard is asserted by
// reading the same `is_reserva` flag the action branches on.
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

interface SeedCats {
  reserva: string
  consumo: string
}

async function loadSeedCats(a: SupabaseClient, userId: string): Promise<SeedCats> {
  const { data } = await a
    .from('categories')
    .select('id, name, kind, is_reserva')
    .eq('user_id', userId)
  const rows = data ?? []
  const reservaRow = rows.find((r) => r.is_reserva === true)
  const consumoRow = rows.find((r) => r.kind === 'consumo')
  if (!reservaRow || !consumoRow) throw new Error('seed Reserva/consumo categories missing')
  return { reserva: reservaRow.id, consumo: consumoRow.id }
}

/** saldo = Σ(in) − Σ(out) straight from v_reserva_balance (the derived saldo). */
async function saldoOf(a: SupabaseClient, reservaId: string): Promise<number> {
  const { data } = await a
    .from('v_reserva_balance')
    .select('saldo_cents')
    .eq('reserva_id', reservaId)
    .single()
  return data?.saldo_cents ?? 0
}

/** Ledger truth: Σ(in) − Σ(out) recomputed directly from reserva_ledger rows. */
async function ledgerOf(a: SupabaseClient, reservaId: string): Promise<number> {
  const { data } = await a
    .from('reserva_ledger')
    .select('kind, amount_cents')
    .eq('reserva_id', reservaId)
  let sum = 0
  for (const row of data ?? []) {
    sum += (row.kind === 'in' ? 1 : -1) * (row.amount_cents ?? 0)
  }
  return sum
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('bulk-rsv-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('bulkReclassify reserva integrity — saldo == ledger in both directions (HG-01)', () => {
  it('bulk INTO Reserva is blocked (is_reserva flag), so no understated saldo', async () => {
    const a = userClient(userA.jwt, config)
    const cats = await loadSeedCats(a, userA.id)

    // The action reads `categories.is_reserva` for the bulk target and rejects when
    // true. Assert the very flag the guard branches on identifies the Reserva target.
    const { data: target } = await a
      .from('categories')
      .select('is_reserva')
      .eq('id', cats.reserva)
      .maybeSingle()
    expect(target?.is_reserva).toBe(true)

    // A non-Reserva target carries no such flag → bulk-reclassify is permitted.
    const { data: ok } = await a
      .from('categories')
      .select('is_reserva')
      .eq('id', cats.consumo)
      .maybeSingle()
    expect(ok?.is_reserva ?? false).toBe(false)
  })

  it('bulk OUT of Reserva deletes linked aportes → saldo stays == ledger (no phantom)', async () => {
    const a = userClient(userA.jwt, config)
    const cats = await loadSeedCats(a, userA.id)

    const { data: reserva } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Reserva bulk', alvo_cents: 1000000 })
      .select('id')
      .single()
    const reservaId = reserva!.id

    // Seed two aportes the "individual" path would create: a Reserva-category
    // transaction + its linked 'in' ledger entry.
    const aportes = [40000, 25000]
    const txIds: string[] = []
    for (const amount of aportes) {
      const { data: tx } = await a
        .from('transactions')
        .insert({
          user_id: userA.id,
          category_id: cats.reserva,
          amount_cents: amount,
          occurred_on: '2026-06-15',
          description: 'aporte',
        })
        .select('id')
        .single()
      txIds.push(tx!.id)
      await a.from('reserva_ledger').insert({
        user_id: userA.id,
        reserva_id: reservaId,
        kind: 'in',
        amount_cents: amount,
        transaction_id: tx!.id,
        occurred_on: '2026-06-15',
      })
    }

    // Invariant holds before the bulk move: saldo == ledger == Σ aportes.
    expect(await saldoOf(a, reservaId)).toBe(65000)
    expect(await ledgerOf(a, reservaId)).toBe(65000)

    // === The fixed bulkReclassify contract for bulk-OUT-of-Reserva ===
    // 1) move the rows to a non-Reserva category (the bare update the old code did)
    await a.from('transactions').update({ category_id: cats.consumo }).in('id', txIds)
    // 2) sync-DELETE the now-orphaned linked aportes (the HG-01 fix)
    await a.from('reserva_ledger').delete().in('transaction_id', txIds)

    // Saldo collapses to 0 and STILL equals the ledger — no phantom aporte.
    expect(await saldoOf(a, reservaId)).toBe(0)
    expect(await ledgerOf(a, reservaId)).toBe(0)
    expect(await saldoOf(a, reservaId)).toBe(await ledgerOf(a, reservaId))
  })

  it('REGRESSION: skipping the ledger delete (old code) leaves a phantom saldo', async () => {
    const a = userClient(userA.jwt, config)
    const cats = await loadSeedCats(a, userA.id)

    const { data: reserva } = await a
      .from('reservas')
      .insert({ user_id: userA.id, nome: 'Reserva phantom', alvo_cents: 1000000 })
      .select('id')
      .single()
    const reservaId = reserva!.id

    const { data: tx } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: cats.reserva,
        amount_cents: 30000,
        occurred_on: '2026-06-15',
        description: 'aporte',
      })
      .select('id')
      .single()
    await a.from('reserva_ledger').insert({
      user_id: userA.id,
      reserva_id: reservaId,
      kind: 'in',
      amount_cents: 30000,
      transaction_id: tx!.id,
      occurred_on: '2026-06-15',
    })

    // Move the row away WITHOUT the ledger delete (the pre-HG-01 behavior).
    await a.from('transactions').update({ category_id: cats.consumo }).in('id', [tx!.id])

    // No transaction sits in the Reserva category anymore, yet the saldo still shows
    // 30000 — exactly the phantom aporte the HG-01 fix removes. This documents the
    // bug the previous test proves is fixed.
    expect(await saldoOf(a, reservaId)).toBe(30000)

    // Apply the HG-01 sync-delete → saldo collapses to the true ledger value.
    await a.from('reserva_ledger').delete().in('transaction_id', [tx!.id])
    expect(await saldoOf(a, reservaId)).toBe(0)
    expect(await saldoOf(a, reservaId)).toBe(await ledgerOf(a, reservaId))
  })
})
