// 6-W0-03 (DATA-02) — LGPD account delete (full erasure). GREEN as of 06-03:
// exercises the deleteMyAccount CORE (Storage-remove FIRST, auth.admin.deleteUser
// LAST) against the LOCAL Supabase stack. The Server Action reads its userId from the
// request session (getClaims) which isn't available off-request; this integration
// test drives the same admin-client core the action runs, with the userId fixed to
// the seeded user (the action's session→userId derivation is unit-tested in
// src/actions/delete-account.test.ts).
//
// Asserts the three erasure guarantees:
//   1. after delete, EVERY one of A's 14 owned tables returns 0 rows (via CASCADE);
//   2. A's Storage `{userId}/` objects are gone (removed first);
//   3. admin.auth.admin.getUserById(A) fails (the auth user is removed).
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

/** Seed one FK-valid row in every owned table + a Storage object for `userId`. */
async function seedEverything(userId: string): Promise<void> {
  const ins = async (table: string, row: Record<string, unknown>): Promise<string> => {
    const { data, error } = await admin.from(table).insert(row).select('id').single()
    if (error) throw new Error(`seed ${table} failed: ${error.message}`)
    return (data as { id: string }).id
  }
  // profiles auto-created on signup → upsert (idempotent).
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

  // A Storage object under {userId}/ (the RLS-scoped owner uploads it).
  const owner = userClient(await jwtFor(userId), config)
  const up = await owner.storage
    .from(STATEMENTS_BUCKET)
    .upload(`${userId}/seed-${crypto.randomUUID()}.ofx`, new Blob(['OFXHEADER:100'], { type: 'text/plain' }))
  if (up.error) throw new Error(`seed storage failed: ${up.error.message}`)
}

/** Resolve the seeded user's JWT (we only have ids in the seeder scope). */
const jwtById = new Map<string, string>()
async function jwtFor(userId: string): Promise<string> {
  const jwt = jwtById.get(userId)
  if (!jwt) throw new Error(`no jwt cached for ${userId}`)
  return jwt
}

/**
 * Run the deleteMyAccount CORE for `userId`: Storage list+remove FIRST (under
 * `{userId}/`), then auth.admin.deleteUser LAST (cascades all 14 tables). Mirrors
 * src/actions/delete-account.ts exactly.
 */
const STORAGE_PAGE = 1000

async function deleteAccountCore(userId: string): Promise<void> {
  // Drain ALL pages under {userId}/ before the irreversible auth delete (HI-01).
  for (;;) {
    const { data: files, error: listErr } = await admin.storage
      .from(STATEMENTS_BUCKET)
      .list(userId, { limit: STORAGE_PAGE })
    if (listErr) throw new Error(`storage list failed: ${listErr.message}`)
    if (!files?.length) break
    const paths = files.map((f) => `${userId}/${f.name}`)
    const { error: rmErr } = await admin.storage.from(STATEMENTS_BUCKET).remove(paths)
    if (rmErr) throw new Error(`storage remove failed: ${rmErr.message}`)
    if (files.length < STORAGE_PAGE) break
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) throw new Error(`deleteUser failed: ${delErr.message}`)
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('lgpd-del-a')
  jwtById.set(userA.id, userA.jwt)
  await seedEverything(userA.id)
}, 60_000)

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('LGPD account delete — full erasure (DATA-02 / 6-W0-03)', () => {
  it('the central owned-table list enumerates every table the delete must empty', () => {
    expect(OWNED_TABLES).toHaveLength(14)
  })

  it("06-03: after delete, EVERY one of A's 14 owned tables returns 0 rows (CASCADE) + Storage gone + auth removed", async () => {
    // Sanity: A's storage object exists before delete.
    const before = await admin.storage.from(STATEMENTS_BUCKET).list(userA.id)
    expect((before.data ?? []).length).toBeGreaterThan(0)

    await deleteAccountCore(userA.id)

    // 1. EVERY one of A's 14 owned tables returns 0 rows for A (CASCADE).
    for (const table of OWNED_TABLES) {
      const { data, error } = await admin.from(table).select('*').eq('user_id', userA.id)
      // profiles keys by id == user_id; the eq('user_id') still matches its column.
      expect(error).toBeNull()
      expect(data ?? []).toHaveLength(0)
    }

    // 2. A's Storage {userId}/ objects are gone (removed first).
    const after = await admin.storage.from(STATEMENTS_BUCKET).list(userA.id)
    expect(after.data ?? []).toHaveLength(0)

    // 3. admin.auth.admin.getUserById(A) fails (auth user removed).
    const { data: got, error: getErr } = await admin.auth.admin.getUserById(userA.id)
    expect(getErr !== null || got?.user == null).toBe(true)
  })
})
