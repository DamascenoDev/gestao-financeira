// RED until Wave 2: requires the `categories` table + `handle_new_user` seed
// trigger (Code Examples §7-8) on the local Supabase stack. Until then this test
// fails because the trigger/relation does not exist — the EXPECTED failure
// reason. Goes green when Wave 2 applies the migrations. (CAT-01)
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readLocalConfig, serviceClient, type LocalSupabaseConfig } from './helpers/local-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

const EXPECTED_COUNT = 11
const ALOCACAO = new Set(['Investimentos', 'Reserva'])

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userId: string

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  const email = `seed-${crypto.randomUUID()}@example.test`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123!',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  userId = data.user.id
})

afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {})
})

describe('signup seeds the 11 BR categories (CAT-01)', () => {
  it('creates exactly 11 categories for the new user', async () => {
    const { data, error } = await admin
      .from('categories')
      .select('name, kind')
      .eq('user_id', userId)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(EXPECTED_COUNT)
  })

  it('marks Investimentos + Reserva as alocacao and the rest as consumo', async () => {
    const { data } = await admin.from('categories').select('name, kind').eq('user_id', userId)
    for (const row of data ?? []) {
      const expected = ALOCACAO.has(row.name) ? 'alocacao' : 'consumo'
      expect(row.kind).toBe(expected)
    }
  })
})
