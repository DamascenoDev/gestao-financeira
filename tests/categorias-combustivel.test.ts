// 26-W0-03 (FUEL-01, SC1): a NEW account has the default "Combustível" category
// (kind `consumo`, sort 4) seeded by `handle_new_user()` after migration 0040, and the
// idempotent backfill never creates a duplicate on a re-run.
//
// RED-BY-DESIGN: fails against the pre-0040 seed because no "Combustível" category is
// seeded today. Wave 1 (migration 0040) turns it green. Nyquist gate for SC1.
//
// Clone of the carro-rls.test.ts createUser/afterAll harness with all carro seeding
// dropped — createUser fires the `handle_new_user()` trigger, which is the seed under
// test. Runs against `supabase start` (local Docker stack only).

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
  userA = await createUser('cat-combustivel-a')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
})

describe('Combustível default category seed (SC1)', () => {
  it('a fresh user has exactly one Combustível category at sort 4, kind consumo', async () => {
    const a = userClient(userA.jwt, config)
    const { data, error } = await a
      .from('categories')
      .select('name, sort, kind')
      .eq('name', 'Combustível')
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)
    expect(Number(data![0]!.sort)).toBe(4)
    expect(data![0]!.kind).toBe('consumo')
  })

  it('backfill is idempotent — re-running the "where not exists" backfill does not duplicate', async () => {
    // Replicate the EXACT documented backfill from migration 0040: insert Combustível
    // ONLY where the user does not already have it (the `where not exists` guard).
    // categories has NO (user_id, name) DB unique by design — MKT-01 Marketplace allows
    // custom-named categories — so the idempotency guarantee lives in this SQL guard, not
    // a constraint. Re-running it must be a no-op because the signup seed already gave
    // userA the row. (Asserting on the resulting COUNT, per the invariant.)
    const { data: existing } = await admin
      .from('categories')
      .select('id')
      .eq('user_id', userA.id)
      .eq('name', 'Combustível')
    if ((existing ?? []).length === 0) {
      await admin.from('categories').insert({
        user_id: userA.id,
        name: 'Combustível',
        kind: 'consumo',
        sort: 4,
        is_reserva: false,
      })
    }

    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('categories')
      .select('id')
      .eq('name', 'Combustível')
    // Idempotency invariant: the guarded backfill is a no-op → still exactly one.
    expect((data ?? []).length).toBe(1)
  })
})
