// 2-W0-05 (CAT-03): toggling a category kind consumo→alocacao and back persists.
//
// Exercises the categories.kind column (Phase 1) under the RLS-scoped user client.
// The setKind ACTION + UI switch ship in 02-03 (Categorias); this asserts the
// underlying persistence the action relies on.
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
let catId: string

async function createUser(): Promise<{ id: string; jwt: string }> {
  const email = `cat-kind-${crypto.randomUUID()}@example.test`
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
  user = await createUser()
  const u = userClient(user.jwt, config)
  const { data, error } = await u
    .from('categories')
    .insert({ user_id: user.id, name: 'Toggle', kind: 'consumo' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`category seed failed: ${error?.message}`)
  catId = data.id
})

afterAll(async () => {
  if (user?.id) await admin.auth.admin.deleteUser(user.id).catch(() => {})
})

describe('category kind toggle persists (CAT-03)', () => {
  it('toggles consumo → alocacao → consumo and persists each value', async () => {
    const u = userClient(user.jwt, config)

    await u.from('categories').update({ kind: 'alocacao' }).eq('id', catId)
    const { data: a } = await u.from('categories').select('kind').eq('id', catId).single()
    expect(a!.kind).toBe('alocacao')

    await u.from('categories').update({ kind: 'consumo' }).eq('id', catId)
    const { data: b } = await u.from('categories').select('kind').eq('id', catId).single()
    expect(b!.kind).toBe('consumo')
  })
})
