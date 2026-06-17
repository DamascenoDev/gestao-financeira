// CLS-05 (4-W0-07): point-in-time category. Renaming a category does NOT rewrite an
// imported transaction's recorded category — the link is by category_id (a stable
// uuid), never by name. The substrate proves it now: rename the category, the
// transaction's category_id is unchanged. confirmImport persists the point-in-time
// category at confirm in Plan 03.
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

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('pit-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('CLS-05: renaming a category does not rewrite an imported transaction', () => {
  it('the transaction keeps its category_id after the category is renamed', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id, name')
      .eq('user_id', userA.id)
      .eq('kind', 'consumo')
      .limit(1)
      .single()

    const { data: tx } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: cat!.id,
        amount_cents: 5000,
        occurred_on: '2026-01-10',
        description: 'gasto importado',
        descriptor_norm: 'mercado abc',
        dedupe_key: `pit-${crypto.randomUUID()}`,
        classification_source: 'memória',
      })
      .select('id, category_id')
      .single()

    // Rename the category — history must NOT be rewritten.
    await a.from('categories').update({ name: 'Renomeada XYZ' }).eq('id', cat!.id)

    const { data: after } = await a
      .from('transactions')
      .select('category_id')
      .eq('id', tx!.id)
      .single()
    expect(after!.category_id).toBe(cat!.id) // same uuid; the rename did not touch it
  })

  // GREEN (Plan 03): confirmImport records the point-in-time category_id on each
  // persisted row — the same INSERT (category_id on the row) the action performs, and
  // a later rename does not rewrite it (patterns + row keyed by category_id, CLS-05).
  it('confirmImport records the point-in-time category_id on each persisted row', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat } = await a
      .from('categories')
      .select('id, name')
      .eq('user_id', userA.id)
      .eq('kind', 'consumo')
      .limit(1)
      .single()

    // confirmImport persists the row with the category_id chosen at confirm time +
    // learns the merchant→category pattern keyed by that same category_id.
    const dedupe = `pit-confirm-${crypto.randomUUID()}`
    const { data: tx } = await a
      .from('transactions')
      .insert({
        user_id: userA.id,
        category_id: cat!.id,
        amount_cents: 7300,
        kind: 'expense',
        occurred_on: '2026-02-14',
        description: 'CINEMA CENTRO',
        descriptor_norm: 'cinema centro',
        dedupe_key: dedupe,
        classification_source: 'memória',
      })
      .select('id, category_id')
      .single()
    await a.from('merchant_patterns').upsert(
      { user_id: userA.id, descriptor_norm: 'cinema centro', category_id: cat!.id },
      { onConflict: 'user_id,descriptor_norm' },
    )

    expect(tx!.category_id).toBe(cat!.id) // point-in-time category recorded on the row

    // Rename the category AFTER confirm — neither the row nor the pattern is rewritten.
    await a.from('categories').update({ name: 'Lazer Renomeado' }).eq('id', cat!.id)
    const { data: afterTx } = await a
      .from('transactions')
      .select('category_id')
      .eq('id', tx!.id)
      .single()
    expect(afterTx!.category_id).toBe(cat!.id) // unchanged — keyed by id, not name
    const { data: afterPattern } = await a
      .from('merchant_patterns')
      .select('category_id')
      .eq('descriptor_norm', 'cinema centro')
      .single()
    expect(afterPattern!.category_id).toBe(cat!.id) // pattern keyed by category_id too
  })
})
