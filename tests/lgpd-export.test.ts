// 6-W0-02 (DATA-02) — LGPD export completeness. GREEN as of 06-03: exercises
// buildExportBundle (the core of the exportMyData Server Action) against the LOCAL
// Supabase stack. Seeds users A and B a real, FK-valid row in EVERY one of the 14
// OWNED_TABLES, then runs the export for A via A's RLS-scoped client and asserts:
//   1. completeness — the bundle has a key for every entry in OWNED_TABLES (driven
//      by the central list so the proof can't drift from the schema, Pitfall 3);
//   2. only-my-rows — A's export contains ONLY A's rows; no B row leaks into any
//      table (RLS-scoped, NOT a manual user_id filter);
//   3. CSVs embedded — csv.transactions (pt-BR, resolved category name) + csv.mei
//      (reuses meiReportToCsv); the JSON tables.transactions keeps the raw
//      category_id (lossless — Open Question #2).
//
// Runs against `supabase start` (local Docker stack only). Hard-guarded to localhost
// via tests/helpers/local-supabase.ts.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { OWNED_TABLES } from '../src/lib/data/owned-tables'
import { buildExportBundle } from '../src/lib/export/bundle'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: SeededUser
let userB: SeededUser

interface SeededUser {
  id: string
  jwt: string
  /** A stable marker on this user's transaction description, to detect leaks. */
  marker: string
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

/**
 * Seed one FK-valid row in every owned table for `userId`, in dependency order
 * (profiles + categories first, then the dependents that FK them). Returns the
 * marker stamped on this user's transaction so leak detection is unambiguous.
 * Uses the SERVICE client to seed (bypasses RLS) so we can plant B's rows too;
 * the export itself reads via the per-user RLS client (the actual guarantee).
 */
async function seedAllTables(userId: string): Promise<string> {
  const marker = `tx-${userId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`
  const ins = async (table: string, row: Record<string, unknown>): Promise<string> => {
    const { data, error } = await admin
      .from(table)
      .insert(row)
      .select('id')
      .single()
    if (error) throw new Error(`seed ${table} failed: ${error.message}`)
    return (data as { id: string }).id
  }

  // profiles: PK id == user_id. A profiles row is auto-created on signup (DB
  // trigger), so upsert rather than insert to stay idempotent.
  {
    const { error } = await admin
      .from('profiles')
      .upsert({ id: userId, user_id: userId, display_name: 'Seed' })
    if (error) throw new Error(`seed profiles failed: ${error.message}`)
  }
  const categoryId = await ins('categories', {
    user_id: userId,
    name: 'Mercado',
    kind: 'consumo',
  })
  const reservaId = await ins('reservas', { user_id: userId, nome: 'Viagem' })

  await ins('income_templates', {
    user_id: userId,
    source: 'Salário',
    amount_cents: 500000,
    day_of_month: 5,
  })
  await ins('income_occurrences', {
    user_id: userId,
    source: 'Salário',
    amount_cents: 500000,
    month_key: '2026-06',
    occurred_on: '2026-06-05',
  })
  await ins('transactions', {
    user_id: userId,
    amount_cents: 123456,
    occurred_on: '2026-06-10',
    description: marker,
    category_id: categoryId,
  })
  await ins('budget_targets', {
    user_id: userId,
    category_id: categoryId,
    percent_bp: 3000,
    direction: 'teto',
  })
  await ins('reserva_ledger', {
    user_id: userId,
    reserva_id: reservaId,
    kind: 'in',
    amount_cents: 10000,
    occurred_on: '2026-06-01',
  })
  await ins('statements', {
    user_id: userId,
    storage_path: `${userId}/seed.ofx`,
    format: 'ofx',
    content_hash: `hash-${userId}`,
  })
  await ins('merchant_patterns', {
    user_id: userId,
    descriptor_norm: `merchant-${userId.slice(0, 8)}`,
    category_id: categoryId,
  })
  await ins('csv_import_profiles', {
    user_id: userId,
    header_signature: `sig-${userId.slice(0, 8)}`,
    mapping: { date: 0, amount: 1 },
  })
  await ins('mei_settings', { user_id: userId, mei_start_date: '2026-01-01' })
  await ins('mei_year_flags', { user_id: userId, year: 2026, has_employee: false })
  await ins('mei_invoices', {
    user_id: userId,
    issued_on: '2026-06-15',
    amount_cents: 80000,
    tomador: 'Cliente X',
    activity_type: 'servicos',
  })

  return marker
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  const a = await createUser('lgpd-export-a')
  const b = await createUser('lgpd-export-b')
  const markerA = await seedAllTables(a.id)
  const markerB = await seedAllTables(b.id)
  userA = { ...a, marker: markerA }
  userB = { ...b, marker: markerB }
}, 60_000)

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('LGPD export bundle completeness (DATA-02 / 6-W0-02)', () => {
  // Guard the central contract NOW so the assertions below reference a real 14-table set.
  it('the central owned-table list has all 14 tables the export must cover', () => {
    expect(OWNED_TABLES).toHaveLength(14)
    expect(new Set(OWNED_TABLES).size).toBe(14) // no dupes
  })

  it('06-03: exportMyData() returns a bundle with a key for EVERY entry in OWNED_TABLES', async () => {
    const supaA = userClient(userA.jwt, config) as unknown as SupabaseClient
    const bundle = await buildExportBundle(supaA as never, userA.id)

    for (const table of OWNED_TABLES) {
      expect(bundle.tables).toHaveProperty(table)
      expect(Array.isArray(bundle.tables[table])).toBe(true)
    }
    expect(Object.keys(bundle.tables).sort()).toEqual([...OWNED_TABLES].sort())
    // Every table seeded → every table non-empty for A.
    for (const table of OWNED_TABLES) {
      expect(bundle.tables[table].length).toBeGreaterThan(0)
    }
  })

  it("06-03: the bundle contains ONLY the calling user's rows (RLS-scoped, no B rows)", async () => {
    const supaA = userClient(userA.jwt, config) as unknown as SupabaseClient
    const bundle = await buildExportBundle(supaA as never, userA.id)

    // No row in any table belongs to B (every owned table has a user_id except
    // profiles whose PK id == user_id).
    for (const table of OWNED_TABLES) {
      for (const row of bundle.tables[table]) {
        const r = row as Record<string, unknown>
        const owner = (r.user_id as string | undefined) ?? (r.id as string | undefined)
        expect(owner).toBe(userA.id)
        expect(owner).not.toBe(userB.id)
      }
    }
    // B's transaction marker must never appear in A's export.
    const serialized = JSON.stringify(bundle.tables.transactions)
    expect(serialized).toContain(userA.marker)
    expect(serialized).not.toContain(userB.marker)
  })

  it('06-03: the bundle embeds the transactions CSV (transactionsToCsv) + the MEI CSV', async () => {
    const supaA = userClient(userA.jwt, config) as unknown as SupabaseClient
    const bundle = await buildExportBundle(supaA as never, userA.id)

    const BOM = String.fromCharCode(0xfeff)
    // Transactions CSV: BOM + `;` header + the resolved category NAME (not the id).
    expect(bundle.csv.transactions.startsWith(BOM)).toBe(true)
    expect(bundle.csv.transactions).toContain('Data;Descrição;Categoria;Tipo;Valor')
    expect(bundle.csv.transactions).toContain('Mercado') // resolved category name
    expect(bundle.csv.transactions).toContain('Consumo') // resolved Tipo
    // The JSON keeps the RAW category_id (lossless) — not just the resolved name.
    const txRow = bundle.tables.transactions[0] as Record<string, unknown>
    expect(typeof txRow.category_id).toBe('string')

    // MEI CSV: BOM + the DASN header + a data row for 2026 (R$ 800,00 serviços).
    expect(bundle.csv.mei.startsWith(BOM)).toBe(true)
    expect(bundle.csv.mei).toContain(
      'Ano;Receita bruta total;Comércio/Indústria;Serviços;Funcionário;Limite aplicável',
    )
    expect(bundle.csv.mei).toContain('2026')
  })

  it("06-03: a seeded row in each of the 14 tables for user A appears in A's export", async () => {
    const supaA = userClient(userA.jwt, config) as unknown as SupabaseClient
    const bundle = await buildExportBundle(supaA as never, userA.id)
    for (const table of OWNED_TABLES) {
      expect(bundle.tables[table].length).toBeGreaterThanOrEqual(1)
    }
  })
})
