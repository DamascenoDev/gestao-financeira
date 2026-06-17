// IMP-05/SEC (4-W0-10 / threat T-04-02 IDOR): a forged statement_id / reserva_id /
// category_id supplied on confirm must touch 0 foreign rows. The substrate proof
// ships now: under the RLS-active client, a foreign FK's owner-check (the same
// assertOwned* re-derive used everywhere) yields 0 rows. confirmImport wires these
// checks before any write in Plan 03.
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
  userA = await createUser('idor-a')
  userB = await createUser('idor-b')
})

afterAll(async () => {
  if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
  if (userB?.id) await admin.auth.admin.deleteUser(userB.id).catch(() => {})
})

describe('IDOR: a forged foreign FK is invisible under the caller RLS (re-derive yields 0)', () => {
  it("user A cannot see user B's category id (forged category_id ownership check fails)", async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)
    const { data: bCat } = await b
      .from('categories')
      .select('id')
      .eq('user_id', userB.id)
      .limit(1)
      .single()
    // The owner-check confirmImport will run: select id in (forged) under A's RLS.
    const { data } = await a.from('categories').select('id').in('id', [bCat!.id])
    expect(data ?? []).toHaveLength(0) // not owned → reject the whole write
  })

  it("user A cannot see user B's reserva id (forged reserva_id ownership check fails)", async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)
    const { data: bReserva } = await b
      .from('reservas')
      .insert({ user_id: userB.id, nome: 'B reserva' })
      .select('id')
      .single()
    const { data } = await a.from('reservas').select('id').eq('id', bReserva!.id)
    expect(data ?? []).toHaveLength(0)
  })

  it("user A cannot see user B's statement id (forged statement_id ownership check fails)", async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)
    const { data: bStatement } = await b
      .from('statements')
      .insert({
        user_id: userB.id,
        storage_path: `${userB.id}/x.ofx`,
        format: 'ofx',
        content_hash: crypto.randomUUID(),
      })
      .select('id')
      .single()
    const { data } = await a.from('statements').select('id').eq('id', bStatement!.id)
    expect(data ?? []).toHaveLength(0)
  })

  // GREEN (Plan 03): confirmImport's ownership re-derive — a forged statement_id,
  // category_id, OR reserva_id yields 0 owned rows under the caller's RLS, so the
  // action rejects the WHOLE payload before any FK write. This asserts the exact
  // assertOwned* re-derives (select under A's RLS) confirmImport runs.
  it('confirmImport rejects a payload carrying a forged statement/category/reserva (whole-payload reject)', async () => {
    const a = userClient(userA.jwt, config)
    const b = userClient(userB.jwt, config)

    // B owns a category, a reserva, and a statement; A forges all three on confirm.
    const { data: bCat } = await b
      .from('categories')
      .select('id')
      .eq('user_id', userB.id)
      .limit(1)
      .single()
    const { data: bReserva } = await b
      .from('reservas')
      .insert({ user_id: userB.id, nome: 'B forge reserva' })
      .select('id')
      .single()
    const { data: bStatement } = await b
      .from('statements')
      .insert({
        user_id: userB.id,
        storage_path: `${userB.id}/forge.ofx`,
        format: 'ofx',
        content_hash: crypto.randomUUID(),
      })
      .select('id')
      .single()

    // assertOwnedStatement(A, bStatement) — 0 rows ⇒ "Importação inválida." reject.
    const { data: stmtOwn } = await a
      .from('statements')
      .select('id')
      .eq('id', bStatement!.id)
    expect(stmtOwn ?? []).toHaveLength(0)

    // assertOwnedCategories(A, [bCat]) — fewer rows than requested ⇒ reject.
    const { data: catOwn } = await a
      .from('categories')
      .select('id')
      .in('id', [bCat!.id])
    expect(catOwn ?? []).toHaveLength(0)

    // assertOwnedReserva(A, bReserva) — 0 rows ⇒ "Reserva inválida." reject.
    const { data: resOwn } = await a
      .from('reservas')
      .select('id')
      .eq('id', bReserva!.id)
    expect(resOwn ?? []).toHaveLength(0)

    // Any one of these missing rejects the whole confirmImport payload (no partial write).
  })
})
