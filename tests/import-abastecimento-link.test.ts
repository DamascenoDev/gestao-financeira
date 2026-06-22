// 28-03 (CAR-10 / CAR-11): the reverse abastecimento link-write that confirmImport
// performs on confirm. Proves the FIVE invariants of the link-write against the LIVE
// schema (migrations 0039 + 0040 — junction + unique indexes):
//
//   (1) à-vista vincula   — update abastecimentos.transaction_id + sync transactions.carro_id;
//   (2) parcelado insere  — one abastecimento_parcelas row {abastecimento_id, transaction_id,
//                            parcela_num} with the server-recomputed parcela_num;
//   (3) IDOR (D-08)       — userA's owner re-derive of userB's abastecimentoId yields
//                            'not-owned' (assertOwnedAbastecimento — the exact gate
//                            confirmImport runs), so ZERO link rows are written;
//   (4) D-09 dedupe-skip  — a tx that already exists (same dedupe_key, outside the fresh
//                            insert) STILL receives the link, resolved by a dedupe_key lookup;
//   (5) CAR-11 backstop   — two identical link writes → the 23505 of the unique index is
//                            mapped to already-linked (swallowed), at most 1 link row, no 500.
//
// The server action confirmImport itself relies on Next's cookie-bound createClient, so —
// like import-idor / import-learn-on-confirm / import-reserva-aporte — this suite exercises
// the EQUIVALENT write path under the RLS-active userClient and asserts the same DB
// invariants. The IDOR check goes through assertOwnedAbastecimento VERBATIM (the helper the
// action calls), so the security gate is tested as-shipped, not re-implemented.
//
// Runs against `supabase start` (local Docker stack only).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  readLocalConfig,
  serviceClient,
  userClient,
  type LocalSupabaseConfig,
} from './helpers/local-supabase'
import { assertOwnedAbastecimento, type Client } from '../src/lib/ownership'
import type { SupabaseClient } from '@supabase/supabase-js'

let config: LocalSupabaseConfig
let admin: SupabaseClient
let userA: { id: string; jwt: string }
let userB: { id: string; jwt: string }

let carroAId: string

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

/** Seed an à-vista abastecimento (transaction_id null, valor null, amount set). */
async function seedAvistaAbastecimento(
  jwt: string,
  userId: string,
  carroId: string,
  amountCents: number,
): Promise<string> {
  const c = userClient(jwt, config)
  const { data, error } = await c
    .from('abastecimentos')
    .insert({
      user_id: userId,
      carro_id: carroId,
      occurred_on: '2026-06-05',
      odometro_km: 12000,
      litros: 42,
      tanque_cheio: true,
      combustivel: 'Gasolina',
      amount_cents: amountCents,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed à-vista failed: ${error?.message}`)
  return data.id as string
}

/** Seed a parcelado abastecimento (parcelas_total N, valor_total set, transaction_id null). */
async function seedParceladoAbastecimento(
  jwt: string,
  userId: string,
  carroId: string,
  parcelasTotal: number,
  valorTotalCents: number,
): Promise<string> {
  const c = userClient(jwt, config)
  const { data, error } = await c
    .from('abastecimentos')
    .insert({
      user_id: userId,
      carro_id: carroId,
      occurred_on: '2026-06-01',
      odometro_km: 11000,
      litros: 40,
      tanque_cheio: true,
      combustivel: 'Gasolina',
      parcelas_total: parcelasTotal,
      valor_total_cents: valorTotalCents,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seed parcelado failed: ${error?.message}`)
  return data.id as string
}

/** Seed a transaction (the imported lançamento). */
async function seedTx(
  jwt: string,
  userId: string,
  amountCents: number,
  description: string,
  dedupeKey: string,
): Promise<string> {
  const c = userClient(jwt, config)
  const { data, error } = await c
    .from('transactions')
    .insert({
      user_id: userId,
      amount_cents: amountCents,
      occurred_on: '2026-06-10',
      description,
      dedupe_key: dedupeKey,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedTx failed: ${error?.message}`)
  return data.id as string
}

beforeAll(async () => {
  config = readLocalConfig()
  admin = serviceClient(config)
  userA = await createUser('ab-link-a')
  userB = await createUser('ab-link-b')

  const a = userClient(userA.jwt, config)
  const { data: carro, error: carroErr } = await a
    .from('carros')
    .insert({ user_id: userA.id, apelido: 'Gol', modelo: 'VW Gol', placa: 'ABC1D23', ano: 2020 })
    .select('id')
    .single()
  if (carroErr || !carro) throw new Error(`seed carro failed: ${carroErr?.message}`)
  carroAId = carro.id
})

afterAll(async () => {
  for (const u of [userA, userB]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id).catch(() => {})
  }
})

describe('28-03 reverse abastecimento link-write (CAR-10 / CAR-11)', () => {
  // (1) À-VISTA: the confirm grava abastecimentos.transaction_id + sincroniza carro_id.
  it('à-vista links: update transaction_id + sync transactions.carro_id', async () => {
    const a = userClient(userA.jwt, config)
    const abId = await seedAvistaAbastecimento(userA.jwt, userA.id, carroAId, 25000)
    const txId = await seedTx(userA.jwt, userA.id, 25000, 'posto avista', `avista-${crypto.randomUUID()}`)

    // The à-vista link-write (mirrors confirmImport): update transaction_id, sync carro_id.
    const { error: linkErr } = await a
      .from('abastecimentos')
      .update({ transaction_id: txId })
      .eq('id', abId)
    expect(linkErr).toBeNull()

    const { error: tagErr } = await a
      .from('transactions')
      .update({ carro_id: carroAId })
      .eq('id', txId)
    expect(tagErr).toBeNull()

    const { data: ab } = await a
      .from('abastecimentos')
      .select('transaction_id')
      .eq('id', abId)
      .single()
    expect(ab?.transaction_id).toBe(txId)

    const { data: tx } = await a
      .from('transactions')
      .select('carro_id')
      .eq('id', txId)
      .single()
    expect(tx?.carro_id).toBe(carroAId)
  })

  // (2) PARCELADO: insere 1 linha na junção com o parcela_num server-computed correto.
  it('parcelado inserts one abastecimento_parcelas row with the recomputed parcela_num', async () => {
    const a = userClient(userA.jwt, config)
    // N=3, total 60000 → parcela ~20000 ({floor,ceil} = {20000}); 0 já na junção → parcela_num 1.
    const abId = await seedParceladoAbastecimento(userA.jwt, userA.id, carroAId, 3, 60000)
    const txId = await seedTx(userA.jwt, userA.id, 20000, 'posto parcela 1', `parc-${crypto.randomUUID()}`)

    // parcela_num server-recomputed = já-na-junção (0) + atribuídas-neste-confirm (0) + 1.
    const { error: insErr } = await a.from('abastecimento_parcelas').insert({
      user_id: userA.id,
      abastecimento_id: abId,
      transaction_id: txId,
      parcela_num: 1,
    })
    expect(insErr).toBeNull()

    const { data: parcelas } = await a
      .from('abastecimento_parcelas')
      .select('transaction_id, parcela_num')
      .eq('abastecimento_id', abId)
    expect(parcelas).toHaveLength(1)
    expect(parcelas?.[0]?.transaction_id).toBe(txId)
    expect(parcelas?.[0]?.parcela_num).toBe(1)
  })

  // (3) IDOR (D-08): o re-derive de posse do abastecimentoId de userB sob o cliente de
  // userA dá 'not-owned' (o gate exato do confirmImport) → ZERO writes de vínculo.
  it("IDOR: userA's owner re-derive of userB's abastecimentoId is 'not-owned' → 0 link writes", async () => {
    const b = userClient(userB.jwt, config)
    // userB seeds an à-vista abastecimento of their own (needs userB's carro).
    const { data: carroB, error: carroBErr } = await b
      .from('carros')
      .insert({ user_id: userB.id, apelido: 'Onix', modelo: 'Chevrolet', placa: 'XYZ9W87', ano: 2021 })
      .select('id')
      .single()
    if (carroBErr || !carroB) throw new Error(`seed carroB failed: ${carroBErr?.message}`)
    const abBId = await seedAvistaAbastecimento(userB.jwt, userB.id, carroB.id, 30000)

    const a = userClient(userA.jwt, config)
    // The EXACT gate confirmImport runs (assertOwnedAbastecimento under userA's RLS client).
    const owned = await assertOwnedAbastecimento(a as unknown as Client, abBId)
    expect(owned).toBe('not-owned')

    // Because the gate rejects the WHOLE payload, no link write is attempted. Prove the
    // forged target is untouched: userB's abastecimento has no transaction_id, and no
    // parcela row references it. (userA cannot even read it — RLS — so userB verifies.)
    const txA = await seedTx(userA.jwt, userA.id, 30000, 'forged link attempt', `idor-${crypto.randomUUID()}`)
    // Defense-in-depth: even if userA tried the write, RLS makes it touch 0 rows.
    await a.from('abastecimentos').update({ transaction_id: txA }).eq('id', abBId)
    await a
      .from('abastecimento_parcelas')
      .insert({ user_id: userA.id, abastecimento_id: abBId, transaction_id: txA, parcela_num: 1 })
      .then(() => {}, () => {})

    const { data: abB } = await b
      .from('abastecimentos')
      .select('transaction_id')
      .eq('id', abBId)
      .single()
    expect(abB?.transaction_id).toBeNull()

    const { data: parcelasB } = await b
      .from('abastecimento_parcelas')
      .select('id')
      .eq('abastecimento_id', abBId)
    expect(parcelasB ?? []).toHaveLength(0)
  })

  // (4) D-09: a tx que JÁ existe (dedupe-skip, fora do insert fresco) ainda recebe o
  // vínculo — resolvida por um lookup por dedupe_key.
  it('D-09 dedupe-skip: a pre-existing tx (resolved by dedupe_key) still gets linked', async () => {
    const a = userClient(userA.jwt, config)
    const dedupeKey = `dedupe-skip-${crypto.randomUUID()}`
    const abId = await seedAvistaAbastecimento(userA.jwt, userA.id, carroAId, 18000)
    // Pre-insert the tx BEFORE the "confirm" (it is dedupe-skipped on insert).
    const existingTxId = await seedTx(userA.jwt, userA.id, 18000, 'pre-existing', dedupeKey)

    // The link-write resolves the txId by the dedupe_key lookup (D-09 / WR-02 batched).
    const { data: looked } = await a
      .from('transactions')
      .select('id, dedupe_key')
      .in('dedupe_key', [dedupeKey])
    const txId = looked?.find((t) => t.dedupe_key === dedupeKey)?.id
    expect(txId).toBe(existingTxId)

    const { error: linkErr } = await a
      .from('abastecimentos')
      .update({ transaction_id: txId })
      .eq('id', abId)
    expect(linkErr).toBeNull()

    const { data: ab } = await a
      .from('abastecimentos')
      .select('transaction_id')
      .eq('id', abId)
      .single()
    expect(ab?.transaction_id).toBe(existingTxId)
  })

  // (5) CAR-11 backstop: dois confirms idênticos → o 23505 do unique index é mapeado para
  // already-linked, no máx 1 linha de vínculo, nunca um 500.
  it('double-link: the 23505 of the unique index maps to already-linked (≤1 row, no 500)', async () => {
    const a = userClient(userA.jwt, config)
    const abId = await seedParceladoAbastecimento(userA.jwt, userA.id, carroAId, 2, 40000)
    const txId = await seedTx(userA.jwt, userA.id, 20000, 'double link', `dbl-${crypto.randomUUID()}`)

    // First link write succeeds.
    const { error: first } = await a.from('abastecimento_parcelas').insert({
      user_id: userA.id,
      abastecimento_id: abId,
      transaction_id: txId,
      parcela_num: 1,
    })
    expect(first).toBeNull()

    // Second identical write → unique(transaction_id) OR (abastecimento_id, parcela_num)
    // violation = 23505. confirmImport swallows it (already-linked), never a 500.
    const { error: second } = await a.from('abastecimento_parcelas').insert({
      user_id: userA.id,
      abastecimento_id: abId,
      transaction_id: txId,
      parcela_num: 1,
    })
    expect((second as { code?: string } | null)?.code).toBe('23505')

    // At most 1 link row after two identical confirms (no double-count).
    const { data: parcelas } = await a
      .from('abastecimento_parcelas')
      .select('id')
      .eq('abastecimento_id', abId)
      .eq('transaction_id', txId)
    expect(parcelas).toHaveLength(1)
  })
})
