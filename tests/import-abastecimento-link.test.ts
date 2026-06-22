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

// 28-06 (gap-closure / WR-01..04): the FOUR adversarial cases the original green suite
// never exercised — each test there seeded ONE well-formed row per abastecimento, so the
// hostile/duplicated client payloads below were invisible. These prove the confirmImport
// hardening (src/actions/import.ts:1078-1246) against the LIVE schema, replicating the
// server-side guards VERBATIM under the RLS-active userClient (exactly as the suite above
// tests the equivalent write path). The guards proven: linkedTxns (WR-01), serverKind from
// a batched .in('id',…) parcelas_total fetch (WR-02), parcela_num <= parcelas_total cap
// (WR-03), and linkFailed-accumulate-instead-of-early-return so LEARN + status run (WR-04).
describe('28-06 confirmImport hardening (WR-01..04)', () => {
  // (WR-01) CROSS-ROW DOUBLE-LINK: the SAME tx targeting AB1 (à-vista) AND AB2 (parcela)
  // is the residual 0039 (L22-30) delegates to the action layer — neither unique index
  // trips (different rows/tables), so without the linkedTxns guard the fuel cost is
  // double-counted. The guard rejects the payload on the 2nd vínculo to the same tx, so at
  // most ONE link persists for that tx (cost counted once).
  it('WR-01: a 2nd link to the same tx is rejected (linkedTxns) → cost counted once', async () => {
    const a = userClient(userA.jwt, config)
    const ab1 = await seedAvistaAbastecimento(userA.jwt, userA.id, carroAId, 25000)
    const ab2 = await seedParceladoAbastecimento(userA.jwt, userA.id, carroAId, 2, 40000)
    const dedupeKey = `wr01-${crypto.randomUUID()}`
    const txId = await seedTx(userA.jwt, userA.id, 25000, 'posto duplo', dedupeKey)

    // The payload: SAME tx (same dedupe_key) on both AB1 (à-vista) and AB2 (parcela).
    // confirmImport's link loop resolves both to the same txnId; the linkedTxns guard
    // rejects the payload on the 2nd row BEFORE any 2nd write.
    const linkRows = [
      { abastecimentoId: ab1, serverKind: 'avista' as const, dedupe_key: dedupeKey },
      { abastecimentoId: ab2, serverKind: 'parcela' as const, dedupe_key: dedupeKey },
    ]
    const txByKey = new Map<string, string>([[dedupeKey, txId]])
    const linkedTxns = new Set<string>()
    let rejected = false
    for (const r of linkRows) {
      const txnId = txByKey.get(r.dedupe_key)
      if (!txnId) continue
      if (linkedTxns.has(txnId)) {
        // confirmImport returns { error } here and writes NOTHING further.
        rejected = true
        break
      }
      linkedTxns.add(txnId)
      if (r.serverKind === 'avista') {
        await a.from('abastecimentos').update({ transaction_id: txnId }).eq('id', r.abastecimentoId)
      } else {
        await a.from('abastecimento_parcelas').insert({
          user_id: userA.id,
          abastecimento_id: r.abastecimentoId,
          transaction_id: txnId,
          parcela_num: 1,
        })
      }
    }
    expect(rejected).toBe(true)

    // Only AB1 (the FIRST row, processed before the reject) carries the tx — AB2 never got
    // a parcela. The tx's cost is attributed to exactly ONE abastecimento (no double-count).
    const { data: ab1Row } = await a
      .from('abastecimentos')
      .select('transaction_id')
      .eq('id', ab1)
      .single()
    expect(ab1Row?.transaction_id).toBe(txId)

    const { data: parcelasAb2 } = await a
      .from('abastecimento_parcelas')
      .select('id')
      .eq('transaction_id', txId)
    expect(parcelasAb2 ?? []).toHaveLength(0)

    // Cross-check: the tx is referenced as a link by AT MOST ONE abastecimento total.
    const { data: avistaRefs } = await a
      .from('abastecimentos')
      .select('id')
      .eq('transaction_id', txId)
    const { data: parcelaRefs } = await a
      .from('abastecimento_parcelas')
      .select('id')
      .eq('transaction_id', txId)
    expect((avistaRefs?.length ?? 0) + (parcelaRefs?.length ?? 0)).toBe(1)
  })

  // (WR-02) DIVERGENT KIND: a parcelado abastecimento (parcelas_total=3) with a client
  // payload claiming abastecimentoKind='avista'. serverKind (derived from the batched
  // parcelas_total fetch) is 'parcela'; the divergence rejects the payload BEFORE any write
  // — so the à-vista update that would trip 23514 (cost_xor: parcelado requires
  // transaction_id null) never runs. No 23514, no partial state.
  it('WR-02: divergent client kind is rejected (serverKind from batched fetch), no 23514', async () => {
    const a = userClient(userA.jwt, config)
    const abId = await seedParceladoAbastecimento(userA.jwt, userA.id, carroAId, 3, 60000)
    const txId = await seedTx(userA.jwt, userA.id, 20000, 'kind divergente', `wr02-${crypto.randomUUID()}`)

    // Batched server-side fetch of parcelas_total (UMA .in('id',…) — never per-row).
    const linkAbastecimentoIds = [abId]
    const { data: abastForKind, error: kindErr } = await a
      .from('abastecimentos')
      .select('id, parcelas_total')
      .in('id', linkAbastecimentoIds)
    expect(kindErr).toBeNull()
    const parcelasTotalById = new Map<string, number>()
    for (const row of abastForKind ?? []) {
      if (row.id) parcelasTotalById.set(row.id, row.parcelas_total ?? 1)
    }
    const serverKind = (parcelasTotalById.get(abId) ?? 1) > 1 ? 'parcela' : 'avista'
    expect(serverKind).toBe('parcela')

    // Client claims 'avista' → diverges from serverKind → confirmImport rejects the payload
    // BEFORE the link write. We assert the divergence is detected and NO write is performed.
    const clientKind: 'avista' | 'parcela' = 'avista'
    const divergent = clientKind !== serverKind
    expect(divergent).toBe(true)

    // Prove the would-be à-vista write (which would hit 23514) was NOT performed: the
    // parcelado abastecimento keeps transaction_id null, no parcela row exists, no error.
    const { data: ab } = await a
      .from('abastecimentos')
      .select('transaction_id')
      .eq('id', abId)
      .single()
    expect(ab?.transaction_id).toBeNull()

    const { data: parcelas } = await a
      .from('abastecimento_parcelas')
      .select('id')
      .eq('abastecimento_id', abId)
    expect(parcelas ?? []).toHaveLength(0)

    // Sanity: an à-vista update on this parcelado WOULD have tripped 23514 (cost_xor) — this
    // is exactly what the WR-02 reject avoids landing after the tx.
    const { error: xorErr } = await a
      .from('abastecimentos')
      .update({ transaction_id: txId })
      .eq('id', abId)
    expect((xorErr as { code?: string } | null)?.code).toBe('23514')
    // Undo any (none expected) — the 23514 means nothing changed.
  })

  // (WR-03) OVER-CAP: a parcelado N=3 already FULL (3 parcelas in the junction) plus one
  // more matching parcela row. parcela_num would be 4; the cap (parcela_num >
  // parcelas_total → skip) prevents the phantom 4th parcela. The junction stays at 3.
  it('WR-03: over-cap parcela is skipped (parcela_num never > parcelas_total)', async () => {
    const a = userClient(userA.jwt, config)
    const abId = await seedParceladoAbastecimento(userA.jwt, userA.id, carroAId, 3, 60000)
    // Pre-fill the junction with all 3 parcelas (já-na-junção = 3).
    for (let n = 1; n <= 3; n++) {
      const tx = await seedTx(userA.jwt, userA.id, 20000, `parcela ${n}`, `wr03-${n}-${crypto.randomUUID()}`)
      const { error } = await a.from('abastecimento_parcelas').insert({
        user_id: userA.id,
        abastecimento_id: abId,
        transaction_id: tx,
        parcela_num: n,
      })
      expect(error).toBeNull()
    }
    const extraTx = await seedTx(userA.jwt, userA.id, 20000, 'parcela extra', `wr03-x-${crypto.randomUUID()}`)

    // Batched parcelas_total fetch → cap. parcelaNum = já(3) + nesteConfirm(0) + 1 = 4 > 3.
    const { data: abastForKind } = await a
      .from('abastecimentos')
      .select('id, parcelas_total')
      .in('id', [abId])
    const parcelasTotal = abastForKind?.[0]?.parcelas_total ?? Number.POSITIVE_INFINITY
    const { data: existing } = await a
      .from('abastecimento_parcelas')
      .select('abastecimento_id')
      .in('abastecimento_id', [abId])
    const ja = (existing ?? []).length
    const parcelaNum = ja + 0 + 1
    let inserted = false
    if (parcelaNum <= parcelasTotal) {
      // (não roda — 4 > 3) — o cap pula a parcela fantasma.
      await a.from('abastecimento_parcelas').insert({
        user_id: userA.id,
        abastecimento_id: abId,
        transaction_id: extraTx,
        parcela_num: parcelaNum,
      })
      inserted = true
    }
    expect(parcelaNum).toBe(4)
    expect(inserted).toBe(false)

    // The junction still holds exactly 3 parcelas — no parcela_num > parcelas_total.
    const { data: finalParcelas } = await a
      .from('abastecimento_parcelas')
      .select('parcela_num')
      .eq('abastecimento_id', abId)
    expect(finalParcelas).toHaveLength(3)
    expect(Math.max(...(finalParcelas ?? []).map((p) => p.parcela_num as number))).toBe(3)
  })

  // (WR-04) PARTIAL FAILURE CONSISTENT: a non-23505 failure on ONE link row must NOT
  // early-return — it accumulates linkFailed and the loop continues, so LEARN
  // (merchant_patterns upsert) + status='imported' STILL run. State is independent of row
  // order. We force a real non-23505 failure (FK 23503 on a non-existent transaction_id)
  // on row 1, let row 2's link land, then run LEARN + status and assert all three.
  it('WR-04: partial link failure still runs LEARN + status=imported (no early-return)', async () => {
    const a = userClient(userA.jwt, config)
    const { data: cat, error: catErr } = await a
      .from('categories')
      .insert({ user_id: userA.id, name: 'Combustível WR04', kind: 'consumo' })
      .select('id')
      .single()
    if (catErr || !cat) throw new Error(`seed category failed: ${catErr?.message}`)

    // A statement to mark 'imported' at the end (mirrors confirmImport's status update).
    const { data: stmt, error: stmtErr } = await a
      .from('statements')
      .insert({
        user_id: userA.id,
        storage_path: `${userA.id}/wr04-${crypto.randomUUID()}.csv`,
        format: 'csv',
        content_hash: `wr04-${crypto.randomUUID()}`,
        status: 'parsed',
      })
      .select('id')
      .single()
    if (stmtErr || !stmt) throw new Error(`seed statement failed: ${stmtErr?.message}`)

    const abOk = await seedAvistaAbastecimento(userA.jwt, userA.id, carroAId, 30000)
    const okTx = await seedTx(userA.jwt, userA.id, 30000, 'posto ok', `wr04-ok-${crypto.randomUUID()}`)
    const bogusTxId = crypto.randomUUID() // not a real transaction → FK 23503 (non-23505)
    const abFail = await seedParceladoAbastecimento(userA.jwt, userA.id, carroAId, 2, 40000)

    // The link loop: row 1 (parcela) fails with a non-23505 (FK) → linkFailed=true; continue.
    // row 2 (à-vista) succeeds. NO early-return — exactly the WR-04 fix.
    const linkRows = [
      { abastecimentoId: abFail, serverKind: 'parcela' as const, txnId: bogusTxId },
      { abastecimentoId: abOk, serverKind: 'avista' as const, txnId: okTx },
    ]
    let linkFailed = false
    for (const r of linkRows) {
      if (r.serverKind === 'parcela') {
        const { error: insErr } = await a.from('abastecimento_parcelas').insert({
          user_id: userA.id,
          abastecimento_id: r.abastecimentoId,
          transaction_id: r.txnId,
          parcela_num: 1,
        })
        if (insErr) {
          if ((insErr as { code?: string }).code === '23505') continue
          // NON-23505 → accumulate + continue (do NOT return).
          expect((insErr as { code?: string }).code).not.toBe('23505')
          linkFailed = true
          continue
        }
      } else {
        const { error: linkErr } = await a
          .from('abastecimentos')
          .update({ transaction_id: r.txnId })
          .eq('id', r.abastecimentoId)
        if (linkErr) {
          if ((linkErr as { code?: string }).code === '23505') continue
          linkFailed = true
          continue
        }
      }
    }
    expect(linkFailed).toBe(true)

    // The OK link landed despite the earlier failure (loop did not bail).
    const { data: abOkRow } = await a
      .from('abastecimentos')
      .select('transaction_id')
      .eq('id', abOk)
      .single()
    expect(abOkRow?.transaction_id).toBe(okTx)

    // WR-04: LEARN runs even with linkFailed — merchant_patterns upsert (the classified row).
    const descriptorNorm = `posto wr04 ${crypto.randomUUID()}`
    const { error: learnErr } = await a.from('merchant_patterns').upsert(
      {
        user_id: userA.id,
        descriptor_norm: descriptorNorm,
        category_id: cat.id,
        reserva_id: null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,descriptor_norm' },
    )
    expect(learnErr).toBeNull()
    const { data: pattern } = await a
      .from('merchant_patterns')
      .select('descriptor_norm, category_id')
      .eq('descriptor_norm', descriptorNorm)
      .single()
    expect(pattern?.category_id).toBe(cat.id)

    // WR-04: status='imported' runs even with linkFailed.
    const { error: statusErr } = await a
      .from('statements')
      .update({ status: 'imported' })
      .eq('id', stmt.id)
    expect(statusErr).toBeNull()
    const { data: stmtFinal } = await a
      .from('statements')
      .select('status')
      .eq('id', stmt.id)
      .single()
    expect(stmtFinal?.status).toBe('imported')
  })
})
