import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the abastecimento boundary (CAR-03). They mock
// @/lib/supabase/server; the Wave-0 integration test (tests/abastecimento-action
// .test.ts) proves the DB-level dual-IDOR + XOR + carro_id link sync against the
// local stack. These assert the ACTION wrapper: Zod validation, the session gate,
// the dual ownership re-derive that issues NO write on a forged carroId/transactionId,
// the cost-source XOR, and the { ok } | { error } result shape that never throws.

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}))

type QueryResult = { data: unknown; error: unknown }

const calls: {
  from: string
  op: string
  payload?: unknown
  filters: Array<[string, unknown]>
}[] = []

// Per-table tunable results. `select` on a table returns its ownership/link probe
// result; insert/update return their write result.
let carrosSelect: QueryResult = { data: [{ id: 'owned' }], error: null }
let transactionsSelect: QueryResult = { data: [{ id: 'owned' }], error: null }
// The abastecimentos "already linked?" pre-check select returns 0 rows by default.
let abastecimentosSelect: QueryResult = { data: [], error: null }
let abastecimentosInsert: QueryResult = { data: { id: 'new-ab' }, error: null }
let transactionsUpdate: QueryResult = { data: null, error: null }
let abastecimentosUpdate: QueryResult = { data: null, error: null }
let abastecimentosDelete: QueryResult = { data: null, error: null }
let claimsSub: string | null = 'user-1'

function makeBuilder(from: string) {
  const record: (typeof calls)[number] = { from, op: '', filters: [] }
  let writeResult: QueryResult = { data: null, error: null }

  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => {
    if (!record.op) record.op = 'select'
    return builder
  })
  builder.eq = vi.fn((col: string, val: unknown) => {
    record.filters.push([col, val])
    return builder
  })
  builder.neq = vi.fn((col: string, val: unknown) => {
    record.filters.push([`neq:${col}`, val])
    return builder
  })
  builder.insert = vi.fn((payload: unknown) => {
    record.op = 'insert'
    record.payload = payload
    writeResult = from === 'abastecimentos' ? abastecimentosInsert : { data: null, error: null }
    return builder
  })
  builder.update = vi.fn((payload: unknown) => {
    record.op = 'update'
    record.payload = payload
    writeResult =
      from === 'transactions'
        ? transactionsUpdate
        : from === 'abastecimentos'
          ? abastecimentosUpdate
          : { data: null, error: null }
    return builder
  })
  builder.delete = vi.fn(() => {
    record.op = 'delete'
    writeResult = from === 'abastecimentos' ? abastecimentosDelete : { data: null, error: null }
    return builder
  })
  builder.single = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => builder)
  // WR-04: the 1:1 link pre-check now bounds the probe with .limit(1); the mock
  // returns the (thenable) builder so the select result still resolves unchanged.
  builder.limit = vi.fn(() => builder)

  function selectResultFor(table: string): QueryResult {
    if (table === 'carros') return carrosSelect
    if (table === 'transactions') return transactionsSelect
    if (table === 'abastecimentos') return abastecimentosSelect
    return { data: null, error: null }
  }

  builder.then = (onF: (v: QueryResult) => unknown) => {
    if (record.op === 'select') {
      return Promise.resolve(selectResultFor(from)).then(onF)
    }
    return Promise.resolve(writeResult).then(onF)
  }

  calls.push(record)
  return builder
}

const supabaseMock = {
  from: vi.fn((table: string) => makeBuilder(table)),
  auth: {
    getClaims: vi.fn(async () => ({
      data: claimsSub ? { claims: { sub: claimsSub } } : null,
    })),
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseMock),
}))

import {
  createAbastecimento,
  updateAbastecimento,
  deleteAbastecimento,
} from './abastecimentos'

const CARRO_ID = '44444444-4444-4444-8444-444444444444'
const TX_ID = '55555555-5555-5555-8555-555555555555'
const AB_ID = '66666666-6666-6666-8666-666666666666'

const manualInput = {
  carroId: CARRO_ID,
  occurredOn: '2026-06-17',
  odometroKm: 10000,
  litros: 40,
  tanqueCheio: true,
  combustivel: 'Gasolina' as const,
  amountCents: 25000,
}

const fromFaturaInput = {
  carroId: CARRO_ID,
  occurredOn: '2026-06-17',
  odometroKm: 10000,
  litros: 40,
  tanqueCheio: true,
  combustivel: 'Gasolina' as const,
  transactionId: TX_ID,
}

// Parcelado (27-02): no transactionId/amountCents — the cost-of-record is
// valorTotalCents + parcelasTotal (>= 2). transaction_id/amount_cents must be NULL
// in the write so the cost is counted ONCE (no double-count, no tx 1:1 pre-check).
const parceladoInput = {
  carroId: CARRO_ID,
  occurredOn: '2026-06-17',
  odometroKm: 10000,
  litros: 40,
  tanqueCheio: true,
  combustivel: 'Gasolina' as const,
  valorTotalCents: 60000,
  parcelasTotal: 3,
}

beforeEach(() => {
  calls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  carrosSelect = { data: [{ id: 'owned' }], error: null }
  transactionsSelect = { data: [{ id: 'owned' }], error: null }
  abastecimentosSelect = { data: [], error: null }
  abastecimentosInsert = { data: { id: 'new-ab' }, error: null }
  transactionsUpdate = { data: null, error: null }
  abastecimentosUpdate = { data: null, error: null }
  abastecimentosDelete = { data: null, error: null }
  claimsSub = 'user-1'
})

const insertOn = (table: string) => calls.find((c) => c.from === table && c.op === 'insert')
const updateOn = (table: string) => calls.find((c) => c.from === table && c.op === 'update')

// --- createAbastecimento — manual path -------------------------------------

describe('createAbastecimento — manual', () => {
  it('writes amount_cents with transaction_id null and returns { ok }', async () => {
    const r = await createAbastecimento(manualInput)
    expect(r).toEqual({ ok: true })
    const ins = insertOn('abastecimentos')
    expect(ins).toBeDefined()
    expect(ins!.payload).toMatchObject({
      user_id: 'user-1',
      carro_id: CARRO_ID,
      odometro_km: 10000,
      tanque_cheio: true,
      transaction_id: null,
      // Non-regression (27-02): an à-vista row never carries a parcelado total.
      valor_total_cents: null,
    })
    expect((ins!.payload as { amount_cents: unknown }).amount_cents).toBeDefined()
    // No transactions.carro_id sync on the manual path.
    expect(updateOn('transactions')).toBeUndefined()
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('rejects a forged (not-owned) carroId with NO write', async () => {
    carrosSelect = { data: [], error: null }
    const r = await createAbastecimento(manualInput)
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(insertOn('abastecimentos')).toBeUndefined()
  })

  it('surfaces a generic retry message on a transient carro ownership error (WR-04)', async () => {
    carrosSelect = { data: null, error: { code: '08006' } }
    const r = await createAbastecimento(manualInput)
    expect(r).toHaveProperty('error')
    expect(r).not.toEqual({ error: 'Carro inválido.' })
    expect(insertOn('abastecimentos')).toBeUndefined()
  })
})

// --- createAbastecimento — XOR ----------------------------------------------

describe('createAbastecimento — cost-source XOR', () => {
  it('rejects BOTH transactionId and amountCents with NO write', async () => {
    const r = await createAbastecimento({ ...manualInput, transactionId: TX_ID })
    expect(r).toHaveProperty('error')
    expect(insertOn('abastecimentos')).toBeUndefined()
  })

  it('rejects NEITHER source with NO write', async () => {
    const { amountCents: _drop, ...rest } = manualInput
    const r = await createAbastecimento(rest)
    expect(r).toHaveProperty('error')
    expect(insertOn('abastecimentos')).toBeUndefined()
  })
})

// --- createAbastecimento — from-fatura path (dual IDOR + carro_id sync) -----

describe('createAbastecimento — from-fatura', () => {
  it('writes transaction_id (amount_cents null) AND sets carro_id on the linked tx', async () => {
    const r = await createAbastecimento(fromFaturaInput)
    expect(r).toEqual({ ok: true })
    const ins = insertOn('abastecimentos')
    expect(ins!.payload).toMatchObject({
      user_id: 'user-1',
      carro_id: CARRO_ID,
      transaction_id: TX_ID,
      amount_cents: null,
      // Non-regression (27-02): the from-fatura row carries no parcelado total.
      valor_total_cents: null,
    })
    // carro_id sync: transactions.carro_id set on the linked tx, ONLY carro_id.
    const upd = updateOn('transactions')
    expect(upd).toBeDefined()
    expect(upd!.payload).toEqual({ carro_id: CARRO_ID })
    expect(upd!.filters).toContainEqual(['id', TX_ID])
  })

  it('rejects a forged (foreign) transactionId — NO write, carro_id never set', async () => {
    transactionsSelect = { data: [], error: null } // assertOwnedTransaction → false
    const r = await createAbastecimento(fromFaturaInput)
    expect(r).toHaveProperty('error')
    expect(insertOn('abastecimentos')).toBeUndefined()
    expect(updateOn('transactions')).toBeUndefined()
  })

  it('rejects a transaction already linked to another abastecimento (pre-check)', async () => {
    abastecimentosSelect = { data: [{ id: 'other-ab' }], error: null }
    const r = await createAbastecimento(fromFaturaInput)
    expect(r).toEqual({
      error: 'Este lançamento já está vinculado a um abastecimento.',
    })
    expect(insertOn('abastecimentos')).toBeUndefined()
    expect(updateOn('transactions')).toBeUndefined()
  })

  it('maps the partial-unique insert violation (race) to the already-linked error, no carro_id', async () => {
    abastecimentosInsert = { data: null, error: { code: '23505' } }
    const r = await createAbastecimento(fromFaturaInput)
    expect(r).toEqual({
      error: 'Este lançamento já está vinculado a um abastecimento.',
    })
    expect(updateOn('transactions')).toBeUndefined()
  })
})

// --- createAbastecimento — parcelado (27-02: write + IDOR + no double-count) -

describe('createAbastecimento — parcelado', () => {
  it('writes parcelas_total + valor_total_cents with transaction_id AND amount_cents null', async () => {
    const r = await createAbastecimento(parceladoInput)
    expect(r).toEqual({ ok: true })
    const ins = insertOn('abastecimentos')
    expect(ins).toBeDefined()
    expect(ins!.payload).toMatchObject({
      user_id: 'user-1',
      carro_id: CARRO_ID,
      parcelas_total: 3,
      valor_total_cents: 60000,
      // Cost is counted ONCE (valor_total_cents) — both à-vista sources are NULL.
      transaction_id: null,
      amount_cents: null,
    })
  })

  it('does NOT sync carro_id on any transaction (no transactionId → no 1:1 pre-check)', async () => {
    const r = await createAbastecimento(parceladoInput)
    expect(r).toEqual({ ok: true })
    // No transactions update, and no abastecimentos "already linked?" select probe.
    expect(updateOn('transactions')).toBeUndefined()
    expect(
      calls.find((c) => c.from === 'transactions' && c.op === 'select'),
    ).toBeUndefined()
  })

  it('rejects a forged (not-owned) carroId with NO write (assertOwnedCarro covers parcelado)', async () => {
    carrosSelect = { data: [], error: null }
    const r = await createAbastecimento(parceladoInput)
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(insertOn('abastecimentos')).toBeUndefined()
  })
})

// --- session + result-shape guards ------------------------------------------

describe('createAbastecimento — guards', () => {
  it('returns the session error when unauthenticated, NO write', async () => {
    claimsSub = null
    const r = await createAbastecimento(manualInput)
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(insertOn('abastecimentos')).toBeUndefined()
  })

  it('rejects invalid Zod input with NO write', async () => {
    const r = await createAbastecimento({ ...manualInput, odometroKm: -1 })
    expect(r).toHaveProperty('error')
    expect(insertOn('abastecimentos')).toBeUndefined()
  })
})

// --- updateAbastecimento / deleteAbastecimento (carro ownership re-derive) ---

describe('updateAbastecimento', () => {
  it('rejects a non-uuid id before any DB work', async () => {
    const r = await updateAbastecimento('garbage', manualInput)
    expect(r).toEqual({ error: 'Identificador inválido.' })
    expect(updateOn('abastecimentos')).toBeUndefined()
  })

  it('rejects a forged (not-owned) carroId with NO write', async () => {
    carrosSelect = { data: [], error: null }
    const r = await updateAbastecimento(AB_ID, manualInput)
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(updateOn('abastecimentos')).toBeUndefined()
  })

  it('updates an owned abastecimento (manual)', async () => {
    const r = await updateAbastecimento(AB_ID, manualInput)
    expect(r).toEqual({ ok: true })
    const upd = updateOn('abastecimentos')
    expect(upd!.filters).toContainEqual(['id', AB_ID])
  })
})

describe('deleteAbastecimento', () => {
  it('rejects a non-uuid id', async () => {
    const r = await deleteAbastecimento('garbage')
    expect(r).toEqual({ error: 'Identificador inválido.' })
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('deletes an owned abastecimento', async () => {
    const r = await deleteAbastecimento(AB_ID)
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.from === 'abastecimentos' && c.op === 'delete')
    expect(del).toBeDefined()
    expect(del!.filters).toContainEqual(['id', AB_ID])
  })

  it('returns the session error when unauthenticated, NO delete', async () => {
    claimsSub = null
    const r = await deleteAbastecimento(AB_ID)
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })
})
