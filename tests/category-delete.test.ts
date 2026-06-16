// 2-W0-04 (CAT-02): a category WITH transactions cannot be hard-deleted (FK
// ON DELETE RESTRICT → error 23503); reassign_and_delete_category(src,dst) moves the
// transactions then removes the source atomically; an archived category keeps its
// transactions and is excluded by an is_archived=false picker query.
//
// Exercises the FK + RPC delivered by 02-01. The deleteCategory/archive ACTIONS ship
// in 02-03 (Categorias); this asserts the DB-level guarantees they rely on.
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
let user: { id: string; jwt: string }

async function createUser(): Promise<{ id: string; jwt: string }> {
  const email = `cat-delete-${crypto.randomUUID()}@example.test`
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

async function newCategory(u: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await u
    .from('categories')
    .insert({ user_id: user.id, name, kind: 'consumo' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`category insert failed: ${error?.message}`)
  return data.id
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  user = await createUser()
})

afterAll(async () => {
  if (user?.id) await admin.auth.admin.deleteUser(user.id).catch(() => {})
})

describe('category delete-block + reassign + archive (CAT-02)', () => {
  it('blocks a direct delete of a category with transactions (FK 23503)', async () => {
    const u = userClient(user.jwt, config)
    const catId = await newCategory(u, 'Bloqueada')
    const { error: txErr } = await u.from('transactions').insert({
      user_id: user.id,
      category_id: catId,
      amount_cents: 5000,
      occurred_on: '2026-06-10',
      description: 'gasto',
    })
    expect(txErr).toBeNull()

    const { error } = await u.from('categories').delete().eq('id', catId)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23503') // foreign_key_violation (RESTRICT)
  })

  it('reassign_and_delete_category moves transactions to dst then removes src', async () => {
    const u = userClient(user.jwt, config)
    const src = await newCategory(u, 'Origem')
    const dst = await newCategory(u, 'Destino')
    const { data: tx } = await u
      .from('transactions')
      .insert({
        user_id: user.id,
        category_id: src,
        amount_cents: 7000,
        occurred_on: '2026-06-12',
        description: 'mover',
      })
      .select('id')
      .single()

    const { error } = await u.rpc('reassign_and_delete_category', { src, dst })
    expect(error).toBeNull()

    const { data: moved } = await u
      .from('transactions')
      .select('category_id')
      .eq('id', tx!.id)
      .single()
    expect(moved!.category_id).toBe(dst)

    const { data: gone } = await u.from('categories').select('id').eq('id', src)
    expect(gone ?? []).toHaveLength(0)
  })

  it('archived category keeps transactions and is excluded by an is_archived=false picker', async () => {
    const u = userClient(user.jwt, config)
    const cat = await newCategory(u, 'Arquivar')
    await u.from('transactions').insert({
      user_id: user.id,
      category_id: cat,
      amount_cents: 3000,
      occurred_on: '2026-06-14',
      description: 'arquivada',
    })

    const { error: archErr } = await u
      .from('categories')
      .update({ is_archived: true })
      .eq('id', cat)
    expect(archErr).toBeNull()

    // History preserved.
    const { data: stillThere } = await u
      .from('transactions')
      .select('id')
      .eq('category_id', cat)
    expect((stillThere ?? []).length).toBeGreaterThan(0)

    // Excluded by a picker that filters is_archived=false.
    const { data: picker } = await u
      .from('categories')
      .select('id')
      .eq('is_archived', false)
      .eq('id', cat)
    expect(picker ?? []).toHaveLength(0)
  })
})
