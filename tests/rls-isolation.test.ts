// RED until Wave 2: requires the `profiles` + `categories` migrations (with RLS
// USING/WITH CHECK) to exist on the local Supabase stack. Until then this test
// fails because the relations/policies do not exist yet — that is the EXPECTED
// failure reason (not a helper crash). Goes green when Wave 2 applies the
// migrations. (AUTH-03 / threats T2 + T4)
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

const TABLES = [
  'categories',
  'profiles',
  'income_templates',
  'income_occurrences',
  'transactions',
  'budget_targets',
  'reservas',
  'reserva_ledger',
] as const

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string; email: string }
let userB: { id: string; jwt: string; email: string }

async function createUser(admin: SupabaseClient) {
  const email = `rls-${crypto.randomUUID()}@example.test`
  const password = 'test-password-123!'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)

  // Obtain a real JWT for this user (RLS evaluates auth.uid() from the JWT).
  const signIn = userClient('', config)
  const { data: session, error: signInErr } = await signIn.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr || !session.session) {
    throw new Error(`signIn failed: ${signInErr?.message}`)
  }
  return { id: data.user.id, jwt: session.session.access_token, email }
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser(admin)
  userB = await createUser(admin)
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('RLS two-user isolation (AUTH-03)', () => {
  for (const table of TABLES) {
    describe(`${table}`, () => {
      it('user B cannot SELECT user A rows (0 rows)', async () => {
        const b = userClient(userB.jwt, config)
        const { data } = await b.from(table).select('*').eq('user_id', userA.id)
        expect(data ?? []).toHaveLength(0)
      })

      it('user B cannot INSERT a row owned by user A', async () => {
        const b = userClient(userB.jwt, config)
        // The row shape differs per table, so use a neutral record for the insert
        // call. RLS WITH CHECK must reject every attempt to insert a row owned by
        // user A regardless of which other NOT NULL columns are present.
        const rowByTable: Record<(typeof TABLES)[number], Record<string, unknown>> = {
          categories: { user_id: userA.id, name: 'Hack', kind: 'consumo' },
          profiles: { id: userA.id, user_id: userA.id },
          income_templates: {
            user_id: userA.id,
            source: 'Hack',
            amount_cents: 100,
            day_of_month: 1,
          },
          income_occurrences: {
            user_id: userA.id,
            source: 'Hack',
            amount_cents: 100,
            month_key: '2026-06',
            occurred_on: '2026-06-01',
          },
          transactions: {
            user_id: userA.id,
            amount_cents: 100,
            occurred_on: '2026-06-01',
          },
          // RLS WITH CHECK rejects on user_id = userA.id BEFORE any FK is resolved,
          // so a placeholder category_id/reserva_id is sufficient to prove isolation.
          budget_targets: {
            user_id: userA.id,
            category_id: crypto.randomUUID(),
            percent_bp: 3000,
            direction: 'teto',
          },
          reservas: {
            user_id: userA.id,
            nome: 'Hack',
          },
          reserva_ledger: {
            user_id: userA.id,
            reserva_id: crypto.randomUUID(),
            kind: 'in',
            amount_cents: 100,
            occurred_on: '2026-06-01',
          },
        }
        const { error } = await b.from(table).insert(rowByTable[table])
        expect(error).not.toBeNull()
      })

      it('user B UPDATE targeting user A affects 0 rows', async () => {
        const b = userClient(userB.jwt, config)
        const { data } = await b
          .from(table)
          .update({ user_id: userA.id })
          .eq('user_id', userA.id)
          .select()
        expect(data ?? []).toHaveLength(0)
      })

      it('user B DELETE targeting user A affects 0 rows', async () => {
        const b = userClient(userB.jwt, config)
        const { data } = await b.from(table).delete().eq('user_id', userA.id).select()
        expect(data ?? []).toHaveLength(0)
      })
    })
  }
})
