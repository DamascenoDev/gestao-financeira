// CLS-03/04 (4-W0-05): learn-on-confirm. Confirming a row UPSERTs merchant_patterns
// (only on human confirm, only for classified rows — no poisoning); a second ingest
// of the same descriptor auto-classifies via lookupMemory. The substrate proof
// ships now: an upsert on (user_id, descriptor_norm) is idempotent and a point-read
// returns the learned mapping. confirmImport drives the upsert in Plan 03.
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
import { lookupMemory } from '../src/lib/classifier/memory'

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

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('learn-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('CLS-03/04 substrate: learn-on-confirm upsert + lookupMemory auto-classify', () => {
  it('a confirmed mapping is point-read back by lookupMemory (auto-classify basis)', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .eq('kind', 'consumo')
      .limit(1)
      .single()

    // Simulate the learn-on-confirm write (Plan 03 confirmImport does this).
    await a.from('merchant_patterns').insert({
      user_id: userA.id,
      descriptor_norm: 'mercado livre',
      category_id: cat!.id,
    })

    // The next ingest of the same descriptor auto-classifies via lookupMemory.
    const hit = await lookupMemory(a, 'mercado livre')
    expect(hit?.category_id).toBe(cat!.id)
  })

  it('a never-seen descriptor is a memory miss (null → unclassified, manual pick)', async () => {
    const a = userClient(userA.jwt, config)
    const miss = await lookupMemory(a, 'estabelecimento nunca visto')
    expect(miss).toBeNull()
  })

  it('the upsert is idempotent on (user_id, descriptor_norm) — one mapping per merchant', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cats } = await a
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .eq('kind', 'consumo')
      .limit(2)
    const c1 = cats![0]!.id
    const c2 = cats![1]?.id ?? c1

    await a
      .from('merchant_patterns')
      .upsert(
        { user_id: userA.id, descriptor_norm: 'farmacia sao paulo', category_id: c1 },
        { onConflict: 'user_id,descriptor_norm' },
      )
    // A correction re-points the same merchant to a different category (no dup row).
    await a
      .from('merchant_patterns')
      .upsert(
        { user_id: userA.id, descriptor_norm: 'farmacia sao paulo', category_id: c2 },
        { onConflict: 'user_id,descriptor_norm' },
      )

    const { data } = await a
      .from('merchant_patterns')
      .select('category_id')
      .eq('descriptor_norm', 'farmacia sao paulo')
    expect(data).toHaveLength(1) // exactly one mapping per merchant
    expect(data![0]!.category_id).toBe(c2)
  })

  // GREEN in Plan 03 — confirmImport learns ONLY on confirm, ONLY classified rows.
  it.todo('confirmImport upserts merchant_patterns only on human confirm (no poisoning) [Plan 03]')
  it.todo('a second ingestStatement auto-classifies the learned descriptor via lookupMemory [Plan 02-03]')
})
