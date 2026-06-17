// 6-W0-05 (SEC-01) — the named entry point 06-VALIDATION calls
// (`npx vitest run isolation-matrix`). This is the comprehensive 4-verb × 14-table
// isolation matrix, driven ENTIRELY by the central OWNED_TABLES +
// ISOLATION_INSERT_SHAPES (one shared source, not a second divergent matrix —
// rls-isolation.test.ts is the same data-driven proof under a different filename).
// User B cannot SELECT/INSERT/UPDATE/DELETE any of user A's rows across all 14
// owned tables. GREEN now: the substrate (owned-tables.ts) exists this plan.
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'
import { OWNED_TABLES, isolationInsertShape } from '../src/lib/data/owned-tables'
import type { SupabaseClient } from '@supabase/supabase-js'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }

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
  userA = await createUser('matrix-a')
  userB = await createUser('matrix-b')
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('isolation matrix — 4 verbs × 14 tables, data-driven over OWNED_TABLES (6-W0-05)', () => {
  it('covers all 14 canonical owned tables', () => {
    expect(OWNED_TABLES).toHaveLength(14)
  })

  for (const table of OWNED_TABLES) {
    const column = table === 'profiles' ? 'id' : 'user_id'

    describe(`${table}`, () => {
      it('SELECT: B sees 0 of A rows', async () => {
        const b = userClient(userB.jwt, config)
        const { data } = await b.from(table).select('*').eq(column, userA.id)
        expect(data ?? []).toHaveLength(0)
      })

      it('INSERT: B cannot create a row owned by A', async () => {
        const b = userClient(userB.jwt, config)
        const { error } = await b.from(table).insert(isolationInsertShape(table, userA.id))
        expect(error).not.toBeNull()
      })

      it('UPDATE: B targeting A affects 0 rows', async () => {
        const b = userClient(userB.jwt, config)
        const { data } = await b
          .from(table)
          .update({ user_id: userA.id })
          .eq(column, userA.id)
          .select()
        expect(data ?? []).toHaveLength(0)
      })

      it('DELETE: B targeting A affects 0 rows', async () => {
        const b = userClient(userB.jwt, config)
        const { data } = await b.from(table).delete().eq(column, userA.id).select()
        expect(data ?? []).toHaveLength(0)
      })
    })
  }
})
