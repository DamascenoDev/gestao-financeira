// 6-W0-04 (DATA-02 / SEC-01) — delete-A-leaves-B-intact. GREEN as of 06-03. This is
// the load-bearing "doesn't touch B" guarantee: deleting user A must leave EVERY one
// of user B's 14 rows + B's Storage object fully intact (no collateral erasure). The
// auth-level ON DELETE CASCADE only ever reaches A's subtree; B is never referenced.
//
// Exercises the deleteMyAccount CORE (Storage-remove FIRST, auth.admin.deleteUser
// LAST) for A against the LOCAL stack, then asserts:
//   1. after deleting A, EVERY one of B's 14 owned-table rows still exists;
//   2. after deleting A, B's Storage object under {userB.id}/ is still downloadable;
//   3. after deleting A, B's auth user is unaffected (getUserById(B) succeeds).
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { OWNED_TABLES } from '../src/lib/data/owned-tables'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }
let bStoragePath: string

const STATEMENTS_BUCKET = 'statements'

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

/** Seed one FK-valid row in every owned table for `userId`; returns nothing. */
async function seedTables(userId: string): Promise<void> {
  const ins = async (table: string, row: Record<string, unknown>): Promise<string> => {
    const { data, error } = await admin.from(table).insert(row).select('id').single()
    if (error) throw new Error(`seed ${table} failed: ${error.message}`)
    return (data as { id: string }).id
  }
  {
    const { error } = await admin
      .from('profiles')
      .upsert({ id: userId, user_id: userId, display_name: 'Seed' })
    if (error) throw new Error(`seed profiles failed: ${error.message}`)
  }
  const categoryId = await ins('categories', { user_id: userId, name: 'Mercado', kind: 'consumo' })
  const reservaId = await ins('reservas', { user_id: userId, nome: 'Viagem' })
  await ins('income_templates', { user_id: userId, source: 'Salário', amount_cents: 500000, day_of_month: 5 })
  await ins('income_occurrences', { user_id: userId, source: 'Salário', amount_cents: 500000, month_key: '2026-06', occurred_on: '2026-06-05' })
  await ins('transactions', { user_id: userId, amount_cents: 123456, occurred_on: '2026-06-10', description: 'seed', category_id: categoryId })
  await ins('budget_targets', { user_id: userId, category_id: categoryId, percent_bp: 3000, direction: 'teto' })
  await ins('reserva_ledger', { user_id: userId, reserva_id: reservaId, kind: 'in', amount_cents: 10000, occurred_on: '2026-06-01' })
  await ins('statements', { user_id: userId, storage_path: `${userId}/seed.ofx`, format: 'ofx', content_hash: `hash-${userId}` })
  await ins('merchant_patterns', { user_id: userId, descriptor_norm: `m-${userId.slice(0, 8)}`, category_id: categoryId })
  await ins('csv_import_profiles', { user_id: userId, header_signature: `sig-${userId.slice(0, 8)}`, mapping: { date: 0 } })
  await ins('mei_settings', { user_id: userId, mei_start_date: '2026-01-01' })
  await ins('mei_year_flags', { user_id: userId, year: 2026, has_employee: false })
  await ins('mei_invoices', { user_id: userId, issued_on: '2026-06-15', amount_cents: 80000, tomador: 'Cliente X', activity_type: 'servicos' })
}

/** Mirrors src/actions/delete-account.ts: Storage remove FIRST, deleteUser LAST. */
async function deleteAccountCore(userId: string): Promise<void> {
  const { data: files, error: listErr } = await admin.storage
    .from(STATEMENTS_BUCKET)
    .list(userId, { limit: 1000 })
  if (listErr) throw new Error(`storage list failed: ${listErr.message}`)
  if (files?.length) {
    const paths = files.map((f) => `${userId}/${f.name}`)
    const { error: rmErr } = await admin.storage.from(STATEMENTS_BUCKET).remove(paths)
    if (rmErr) throw new Error(`storage remove failed: ${rmErr.message}`)
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) throw new Error(`deleteUser failed: ${delErr.message}`)
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('lgpd-deliso-a')
  userB = await createUser('lgpd-deliso-b')
  await seedTables(userA.id)
  await seedTables(userB.id)

  // Both A and B get a Storage object under their own prefix.
  const a = userClient(userA.jwt, config)
  const upA = await a.storage
    .from(STATEMENTS_BUCKET)
    .upload(`${userA.id}/a-${crypto.randomUUID()}.ofx`, new Blob(['A'], { type: 'text/plain' }))
  if (upA.error) throw new Error(`A storage upload failed: ${upA.error.message}`)

  const b = userClient(userB.jwt, config)
  bStoragePath = `${userB.id}/b-${crypto.randomUUID()}.ofx`
  const upB = await b.storage
    .from(STATEMENTS_BUCKET)
    .upload(bStoragePath, new Blob(['B-payload'], { type: 'text/plain' }))
  if (upB.error) throw new Error(`B storage upload failed: ${upB.error.message}`)
}, 60_000)

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('LGPD delete isolation — A gone, B intact (DATA-02 / SEC-01 / 6-W0-04)', () => {
  it("the central owned-table list enumerates every table B's rows must survive in", () => {
    expect(OWNED_TABLES).toHaveLength(14)
  })

  it("06-03: after deleting A — EVERY one of B's 14 rows survives, B's Storage object downloads, B's auth is intact", async () => {
    // Delete A entirely (the dangerous op).
    await deleteAccountCore(userA.id)

    // Cross-check A is actually gone (so the B-intact assertion is meaningful).
    {
      const { data } = await admin.from('transactions').select('id').eq('user_id', userA.id)
      expect(data ?? []).toHaveLength(0)
    }

    // 1. EVERY one of B's 14 owned-table rows still exists.
    for (const table of OWNED_TABLES) {
      const { data, error } = await admin.from(table).select('*').eq('user_id', userB.id)
      expect(error).toBeNull()
      expect((data ?? []).length).toBeGreaterThanOrEqual(1)
    }

    // 2. B's Storage object under {userB.id}/ is still downloadable (still present
    //    after A's delete — the load-bearing "doesn't touch B" guarantee). We assert
    //    the object downloads with content, not an exact byte string (jsdom's Blob
    //    upload path doesn't round-trip raw bytes the way a real browser would).
    const { data: blob, error: dlErr } = await admin.storage
      .from(STATEMENTS_BUCKET)
      .download(bStoragePath)
    expect(dlErr).toBeNull()
    expect(blob).not.toBeNull()
    expect(blob!.size).toBeGreaterThan(0)
    // And the object is still listed under B's prefix.
    const { data: bList } = await admin.storage.from(STATEMENTS_BUCKET).list(userB.id)
    expect((bList ?? []).length).toBeGreaterThan(0)

    // 3. B's auth user is unaffected.
    const { data: gotB, error: getErrB } = await admin.auth.admin.getUserById(userB.id)
    expect(getErrB).toBeNull()
    expect(gotB?.user?.id).toBe(userB.id)
  })
})
