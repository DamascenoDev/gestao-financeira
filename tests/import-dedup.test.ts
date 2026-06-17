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

  // GREEN in Plan 02-03 — the end-to-end counts via the actions.
  it.todo('ingestStatement returns "0 novas" on a byte-identical re-upload [Plan 02]')
  it.todo('confirmImport inserts M novas and skips J duplicadas across overlapping statements [Plan 03]')
})
