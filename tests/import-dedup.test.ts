// IMP-04 (4-W0-03): two-layer dedup against the LIVE schema. The substrate-level
// guarantees ship NOW: statements.unique(user_id, content_hash) collapses a
// re-upload ("0 novas"), and the partial unique transactions_dedupe_uniq collapses
// the cross-statement (itau ∩ nubank) overlap. The end-to-end "0 novas" toast +
// the ingestStatement/confirmImport counts go GREEN in Plans 02-03.
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
import { contentHash, dedupeKey } from '../src/lib/dedupe'
import { parseOfx } from '../src/lib/parsers/ofx'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

const ofx = (name: string) => readFileSync(join(process.cwd(), 'tests/fixtures', name), 'latin1')

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('dedup-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('IMP-04 file-level idempotency: re-upload same bytes ⇒ "0 novas"', () => {
  it('statements.unique(user_id, content_hash) rejects a second identical-hash insert', async () => {
    const a = userClient(userA.jwt, config)
    const hash = contentHash(Buffer.from(ofx('itau-sample.ofx'), 'latin1'))

    const first = await a
      .from('statements')
      .insert({
        user_id: userA.id,
        storage_path: `${userA.id}/s1.ofx`,
        original_filename: 'itau.ofx',
        format: 'ofx',
        content_hash: hash,
      })
      .select('id')
      .single()
    expect(first.error).toBeNull()

    // Re-upload of byte-identical content → same hash → unique violation (23505).
    const second = await a.from('statements').insert({
      user_id: userA.id,
      storage_path: `${userA.id}/s1-again.ofx`,
      original_filename: 'itau.ofx',
      format: 'ofx',
      content_hash: hash,
    })
    expect(second.error?.code).toBe('23505') // the "0 novas" basis
  })
})

describe('IMP-04 transaction-level: cross-statement dedupe_key collapse', () => {
  it('the same OFX FITID yields the same dedupe_key across itau and nubank', () => {
    const itauRows = parseOfx(ofx('itau-sample.ofx'))
    const nuRows = parseOfx(ofx('nubank-sample.ofx'))
    const itauUber = itauRows.find((r) => r.fitid === '20260120003')!
    const nuUber = nuRows.find((r) => r.fitid === '20260120003')!
    expect(itauUber).toBeTruthy()
    expect(nuUber).toBeTruthy()
    // The overlapping txn collapses: identical dedupe_key for the same user.
    expect(dedupeKey(userA.id, itauUber)).toBe(dedupeKey(userA.id, nuUber))
  })

  it('the partial unique index transactions_dedupe_uniq rejects a duplicate dedupe_key', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .limit(1)
      .single()
    const key = dedupeKey(userA.id, {
      occurred_on: '2026-01-20',
      amount_cents: 8900,
      descriptor_norm: 'uber trip',
    })
    const base = {
      user_id: userA.id,
      category_id: cat!.id,
      amount_cents: 8900,
      occurred_on: '2026-01-20',
      description: 'uber',
      dedupe_key: key,
      descriptor_norm: 'uber trip',
    }
    const first = await a.from('transactions').insert(base)
    expect(first.error).toBeNull()
    const dup = await a.from('transactions').insert(base)
    expect(dup.error?.code).toBe('23505') // duplicate dedupe_key collapsed
  })

  it('manual rows (null dedupe_key) are unaffected by the partial unique index', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .limit(1)
      .single()
    const manual = {
      user_id: userA.id,
      category_id: cat!.id,
      amount_cents: 1000,
      occurred_on: '2026-01-01',
      description: 'manual',
    }
    const r1 = await a.from('transactions').insert(manual)
    const r2 = await a.from('transactions').insert(manual)
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull() // two null-dedupe_key rows coexist
  })

  // Plan 02 GREEN: the "0 novas" mechanism ingestStatement uses is an upsert with
  // onConflict (user_id, content_hash) + ignoreDuplicates — a byte-identical
  // re-upload yields NO returned row, which the action reads as alreadyImported
  // (the unit test src/actions/import.test.ts proves the action's branch on it).
  it('a re-upload upsert (ignoreDuplicates) returns no row ⇒ the "0 novas" signal', async () => {
    const a = userClient(userA.jwt, config)
    const hash = contentHash(Buffer.from(ofx('nubank-sample.ofx'), 'latin1'))
    const base = {
      user_id: userA.id,
      original_filename: 'nubank.ofx',
      format: 'ofx' as const,
      content_hash: hash,
    }

    const first = await a
      .from('statements')
      .upsert(
        { ...base, storage_path: `${userA.id}/n1.ofx` },
        { onConflict: 'user_id,content_hash', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    expect(first.error).toBeNull()
    expect(first.data?.id).toBeTruthy() // fresh file ⇒ a new statement row

    const second = await a
      .from('statements')
      .upsert(
        { ...base, storage_path: `${userA.id}/n1-again.ofx` },
        { onConflict: 'user_id,content_hash', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle()
    expect(second.error).toBeNull()
    expect(second.data).toBeNull() // re-upload ⇒ no row ⇒ "0 novas"
  })

  // GREEN (Plan 03): confirmImport persists with ON CONFLICT (user_id, dedupe_key)
  // DO NOTHING semantics. The dedupe constraint is a PARTIAL unique index (where
  // dedupe_key is not null), which PostgREST's .upsert({ onConflict }) cannot target
  // (42P10), so confirmImport INSERTs per-row and SWALLOWS the 23505 unique-violation:
  // a fresh key inserts (M novas), an already-present one is skipped (J duplicadas) —
  // re-confirming or an overlapping statement never duplicates. This asserts that
  // exact per-row insert + 23505-skip mechanic against the live partial index.
  it('confirmImport inserts M novas and skips J duplicadas across overlapping statements', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .limit(1)
      .single()

    const mk = (key: string, desc: string) => ({
      user_id: userA.id,
      category_id: cat!.id,
      amount_cents: 4200,
      kind: 'expense' as const,
      occurred_on: '2026-01-20',
      description: desc,
      descriptor_norm: desc,
      dedupe_key: key,
    })

    // The per-row persist confirmImport runs: insert, swallow 23505, count inserted.
    async function persist(rows: { key: string; desc: string }[]) {
      let imported = 0
      let duplicated = 0
      for (const r of rows) {
        const { data, error } = await a
          .from('transactions')
          .insert(mk(r.key, r.desc))
          .select('id, dedupe_key')
          .maybeSingle()
        if (error?.code === '23505') duplicated++
        else if (data) imported++
        else throw new Error(`unexpected insert error: ${error?.message}`)
      }
      return { imported, duplicated }
    }

    const keyA = `confirm-dedup-a-${crypto.randomUUID()}`
    const keyB = `confirm-dedup-b-${crypto.randomUUID()}`
    const keyC = `confirm-dedup-c-${crypto.randomUUID()}`

    // First confirm: both rows new ⇒ M = 2, J = 0.
    const first = await persist([
      { key: keyA, desc: 'row a' },
      { key: keyB, desc: 'row b' },
    ])
    expect(first).toEqual({ imported: 2, duplicated: 0 })

    // Overlapping re-confirm: keyA already present, keyC new ⇒ M = 1, J = 1.
    const second = await persist([
      { key: keyA, desc: 'row a again' },
      { key: keyC, desc: 'row c' },
    ])
    expect(second).toEqual({ imported: 1, duplicated: 1 })
  })
})
