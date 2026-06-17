// 10-W0-02 (CAR-03, T-10-04/05/06/07): the security-critical abastecimento ACTION
// invariants proven end-to-end against the local stack (not just unit mocks). The
// actions call createClient() from @/lib/supabase/server; here we mock that to
// return a JWT-authed userClient for the "current" session (swapped per call via
// `act()`), so the action's getClaims() decodes the real bearer token and every
// write runs under the caller's own RLS. revalidatePath is a no-op.
//
// Proves:
//   - From-fatura happy path: A links A's own unlinked tx → the abastecimento
//     persists (transaction_id set, amount_cents null) AND A's tx now carries
//     carro_id = A's carro (read back).
//   - Dual IDOR: A links B's tx (forged) → { error }, no abastecimento created,
//     B's tx carro_id stays null (carro_id never set on a foreign transaction).
//   - XOR both / XOR neither → { error }, no row.
//   - Already-linked: linking a tx already linked to another abastecimento → { error }.
//   - Manual path: amountCents only → amount_cents set, transaction_id null.
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

let config: LocalSupabaseConfig

// The JWT of the "current" session the mocked createClient authenticates as.
let activeJwt = ''

/** Decode the `sub` claim from a JWT without verifying (test-only). */
function subFromJwt(jwt: string): string | null {
  try {
    const payload = jwt.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return typeof json.sub === 'string' ? json.sub : null
  } catch {
    return null
  }
}

// The action calls createClient() then supabase.auth.getClaims() for the owner id
// and runs every query under RLS. We return the RLS-active userClient (real DB +
// real bearer-token RLS) but stub getClaims() to decode the bearer JWT's sub —
// getClaims() with no persisted session would otherwise return no claims.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const client = userClient(activeJwt, config) as unknown as {
      auth: { getClaims: () => Promise<{ data: { claims: { sub: string } } | null }> }
    }
    const sub = subFromJwt(activeJwt)
    client.auth.getClaims = async () =>
      sub ? { data: { claims: { sub } } } : { data: null }
    return client
  }),
}))

import {
  createAbastecimento,
  deleteAbastecimento,
} from '@/actions/abastecimentos'

let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }

let carroAId: string
let carroBId: string

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

/** Run an action as the given user (swaps the JWT the mocked createClient uses). */
async function act<T>(jwt: string, fn: () => Promise<T>): Promise<T> {
  activeJwt = jwt
  return fn()
}

/** Insert an unlinked expense transaction for the given user; returns its id. */
async function seedTx(
  jwt: string,
  userId: string,
  description: string,
): Promise<string> {
  const c = userClient(jwt, config)
  const { data, error } = await c
    .from('transactions')
    .insert({
      user_id: userId,
      amount_cents: 30000,
      occurred_on: '2026-05-10',
      description,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedTx failed: ${error?.message}`)
  return data.id as string
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('ab-action-a')
  userB = await createUser('ab-action-b')

  const a = userClient(userA.jwt, config)
  const b = userClient(userB.jwt, config)

  const { data: carroA, error: carroAErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Civic' })
    .select('id')
    .single()
  if (carroAErr || !carroA) throw new Error(`seed carro A failed: ${carroAErr?.message}`)
  carroAId = carroA.id

  const { data: carroB, error: carroBErr } = await b
    .from('carros')
    .insert({ user_id: userB.id, apelido: 'Gol' })
    .select('id')
    .single()
  if (carroBErr || !carroB) throw new Error(`seed carro B failed: ${carroBErr?.message}`)
  carroBId = carroB.id
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

const baseInput = {
  occurredOn: '2026-06-17',
  odometroKm: 10000,
  litros: 40,
  tanqueCheio: true,
  combustivel: 'Gasolina' as const,
}

describe('createAbastecimento — from-fatura happy path (carro_id sync)', () => {
  it('links A own unlinked tx → abastecimento persists + sets carro_id on the tx', async () => {
    const txId = await seedTx(userA.jwt, userA.id, 'posto ipiranga')

    const r = await act(userA.jwt, () =>
      createAbastecimento({ ...baseInput, carroId: carroAId, transactionId: txId }),
    )
    expect(r).toEqual({ ok: true })

    const a = userClient(userA.jwt, config)
    const { data: ab } = await a
      .from('abastecimentos')
      .select('transaction_id, amount_cents, carro_id')
      .eq('transaction_id', txId)
    expect((ab ?? []).length).toBe(1)
    expect(ab![0]!.transaction_id).toBe(txId)
    expect(ab![0]!.amount_cents).toBeNull()
    expect(ab![0]!.carro_id).toBe(carroAId)

    // carro_id sync: A's transaction now carries A's carro.
    const { data: tx } = await a.from('transactions').select('carro_id').eq('id', txId).single()
    expect(tx!.carro_id).toBe(carroAId)
  })
})

describe('createAbastecimento — dual IDOR (forged foreign transactionId)', () => {
  it('A linking B tx → { error }, no abastecimento, B tx carro_id stays null', async () => {
    const txB = await seedTx(userB.jwt, userB.id, 'posto do B')

    const r = await act(userA.jwt, () =>
      createAbastecimento({ ...baseInput, carroId: carroAId, transactionId: txB }),
    )
    expect(r).toHaveProperty('error')

    // No abastecimento referencing B's tx exists for A.
    const a = userClient(userA.jwt, config)
    const { data: abA } = await a
      .from('abastecimentos')
      .select('id')
      .eq('transaction_id', txB)
    expect((abA ?? []).length).toBe(0)

    // B's transaction was never stamped with A's carro_id (read as B).
    const b = userClient(userB.jwt, config)
    const { data: txRow } = await b.from('transactions').select('carro_id').eq('id', txB).single()
    expect(txRow!.carro_id).toBeNull()
  })
})

describe('createAbastecimento — cost-source XOR', () => {
  it('rejects BOTH transactionId and amountCents with no row', async () => {
    const txId = await seedTx(userA.jwt, userA.id, 'xor both')
    const r = await act(userA.jwt, () =>
      createAbastecimento({
        ...baseInput,
        carroId: carroAId,
        transactionId: txId,
        amountCents: 25000,
      }),
    )
    expect(r).toHaveProperty('error')

    const a = userClient(userA.jwt, config)
    const { data } = await a.from('abastecimentos').select('id').eq('transaction_id', txId)
    expect((data ?? []).length).toBe(0)
  })

  it('rejects NEITHER source with no row', async () => {
    const before = await countAbastecimentos(userA.jwt)
    const r = await act(userA.jwt, () =>
      createAbastecimento({ ...baseInput, carroId: carroAId }),
    )
    expect(r).toHaveProperty('error')
    expect(await countAbastecimentos(userA.jwt)).toBe(before)
  })
})

describe('createAbastecimento — 1:1 already-linked guard', () => {
  it('rejects linking a tx already linked to another abastecimento, no second link', async () => {
    const txId = await seedTx(userA.jwt, userA.id, 'double link')

    const first = await act(userA.jwt, () =>
      createAbastecimento({ ...baseInput, carroId: carroAId, transactionId: txId }),
    )
    expect(first).toEqual({ ok: true })

    const second = await act(userA.jwt, () =>
      createAbastecimento({
        ...baseInput,
        odometroKm: 11000,
        carroId: carroAId,
        transactionId: txId,
      }),
    )
    expect(second).toEqual({
      error: 'Este lançamento já está vinculado a um abastecimento.',
    })

    const a = userClient(userA.jwt, config)
    const { data } = await a.from('abastecimentos').select('id').eq('transaction_id', txId)
    expect((data ?? []).length).toBe(1)
  })
})

describe('createAbastecimento — manual path', () => {
  it('writes amount_cents with transaction_id null', async () => {
    const r = await act(userA.jwt, () =>
      createAbastecimento({
        ...baseInput,
        odometroKm: 12345,
        carroId: carroAId,
        amountCents: 25000,
      }),
    )
    expect(r).toEqual({ ok: true })

    const a = userClient(userA.jwt, config)
    const { data } = await a
      .from('abastecimentos')
      .select('amount_cents, transaction_id')
      .eq('carro_id', carroAId)
      .eq('odometro_km', 12345)
    expect((data ?? []).length).toBe(1)
    expect(Number(data![0]!.amount_cents)).toBe(25000)
    expect(data![0]!.transaction_id).toBeNull()
  })
})

describe('deleteAbastecimento — owner can remove', () => {
  it('A deletes A own abastecimento', async () => {
    const created = await act(userA.jwt, () =>
      createAbastecimento({
        ...baseInput,
        odometroKm: 54321,
        carroId: carroAId,
        amountCents: 10000,
      }),
    )
    expect(created).toEqual({ ok: true })

    const a = userClient(userA.jwt, config)
    const { data: row } = await a
      .from('abastecimentos')
      .select('id')
      .eq('carro_id', carroAId)
      .eq('odometro_km', 54321)
      .single()

    const r = await act(userA.jwt, () => deleteAbastecimento(row!.id as string))
    expect(r).toEqual({ ok: true })

    const { data: after } = await a.from('abastecimentos').select('id').eq('id', row!.id)
    expect((after ?? []).length).toBe(0)
  })
})

async function countAbastecimentos(jwt: string): Promise<number> {
  const c = userClient(jwt, config)
  const { data } = await c.from('abastecimentos').select('id')
  return (data ?? []).length
}
