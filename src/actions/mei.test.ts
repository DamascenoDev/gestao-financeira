import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the MEI NF CRUD + settings boundary. They mock
// @/lib/supabase/server (the Wave-0 integration tests in tests/ prove the
// DB-level RLS / unique-constraint / view guarantees against the local stack;
// these assert the ACTION wrapper's behavior: Zod validation, money parsing,
// the GROSS positive-cents insert, the activity_type enum gate, the IDOR
// re-derive that issues NO write on a forged id, the settings/year-flag upsert
// shape, and the session gate). Cloned from actions/incomes.test.ts.

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}))

type QueryResult = { data: unknown; error: unknown }

const calls: {
  from: string
  op: string
  payload?: unknown
  options?: unknown
  filters: Array<[string, unknown]>
}[] = []

let insertResult: QueryResult = { data: null, error: null }
let upsertResult: QueryResult = { data: null, error: null }
let updateResult: QueryResult = { data: null, error: null }
let deleteResult: QueryResult = { data: null, error: null }
// The ownership-check select: assertOwnedMeiInvoice expects exactly 1 owned row.
let ownershipSelectResult: QueryResult = { data: [{ id: 'owned' }], error: null }
let claimsSub: string | null = 'user-1'

function makeBuilder(from: string) {
  const record: (typeof calls)[number] = { from, op: '', filters: [] }
  let resolveResult: QueryResult = { data: null, error: null }

  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => {
    if (!record.op) record.op = 'select'
    return builder
  })
  builder.eq = vi.fn((col: string, val: unknown) => {
    record.filters.push([col, val])
    return builder
  })
  builder.insert = vi.fn((payload: unknown) => {
    record.op = 'insert'
    record.payload = payload
    resolveResult = insertResult
    return builder
  })
  builder.upsert = vi.fn((payload: unknown, options: unknown) => {
    record.op = 'upsert'
    record.payload = payload
    record.options = options
    resolveResult = upsertResult
    return builder
  })
  builder.update = vi.fn((payload: unknown) => {
    record.op = 'update'
    record.payload = payload
    resolveResult = updateResult
    return builder
  })
  builder.delete = vi.fn(() => {
    record.op = 'delete'
    resolveResult = deleteResult
    return builder
  })
  // The ownership re-derive does `from('mei_invoices').select('id').eq('id', id)`
  // and awaits the builder — resolve that select path to the ownership result.
  builder.then = (onF: (v: QueryResult) => unknown) => {
    if (record.op === 'select') {
      return Promise.resolve(ownershipSelectResult).then(onF)
    }
    return Promise.resolve(resolveResult).then(onF)
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
  createMeiInvoice,
  updateMeiInvoice,
  deleteMeiInvoice,
  upsertMeiSettings,
  upsertMeiYearFlag,
} from './mei'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const NF_ID = '33333333-3333-4333-8333-333333333333'

function validNf(overrides: Record<string, string> = {}): FormData {
  return fd({
    issuedOn: '2026-06-15',
    amount: 'R$ 1.000,00',
    tomador: 'Cliente X',
    descricao: 'Serviço de consultoria',
    activityType: 'servicos',
    ...overrides,
  })
}

beforeEach(() => {
  calls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  insertResult = { data: null, error: null }
  upsertResult = { data: null, error: null }
  updateResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
  ownershipSelectResult = { data: [{ id: 'owned' }], error: null }
  claimsSub = 'user-1'
})

// --- createMeiInvoice (MEI-01) ----------------------------------------------

describe('createMeiInvoice', () => {
  it('inserts a NF with the gross positive cents + DASN bucket', async () => {
    const r = await createMeiInvoice(validNf())
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.from === 'mei_invoices' && c.op === 'insert')
    expect(insert).toBeDefined()
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      issued_on: '2026-06-15',
      amount_cents: 100000,
      tomador: 'Cliente X',
      activity_type: 'servicos',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/mei')
  })

  it('rejects an invalid money string before inserting', async () => {
    const r = await createMeiInvoice(validNf({ amount: 'abc' }))
    expect(r).toEqual({ error: 'Valor monetário inválido.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects a bad activity_type via Zod before touching the DB', async () => {
    const r = await createMeiInvoice(validNf({ activityType: 'outro' }))
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects a missing tomador via Zod', async () => {
    const r = await createMeiInvoice(validNf({ tomador: '' }))
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('accepts the comercio_industria bucket too', async () => {
    const r = await createMeiInvoice(validNf({ activityType: 'comercio_industria' }))
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert!.payload).toMatchObject({ activity_type: 'comercio_industria' })
  })
})

// --- updateMeiInvoice (IDOR re-derive, T-05-05) -----------------------------

describe('updateMeiInvoice', () => {
  it('rejects a non-uuid id before any DB work', async () => {
    const r = await updateMeiInvoice('not-a-uuid', validNf())
    expect(r).toEqual({ error: 'Identificador inválido.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })

  it('updates an owned NF', async () => {
    const r = await updateMeiInvoice(NF_ID, validNf({ amount: 'R$ 2.000,00' }))
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('mei_invoices')
    expect(update!.payload).toMatchObject({ amount_cents: 200000 })
    expect(update!.filters).toContainEqual(['id', NF_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/mei')
  })

  it('rejects a forged (not-owned) id and issues NO update', async () => {
    ownershipSelectResult = { data: [], error: null } // assertOwnedMeiInvoice → false
    const r = await updateMeiInvoice(NF_ID, validNf())
    expect(r).toEqual({ error: 'Nota fiscal inválida.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })
})

// --- deleteMeiInvoice -------------------------------------------------------

describe('deleteMeiInvoice', () => {
  it('rejects a non-uuid id', async () => {
    const r = await deleteMeiInvoice('garbage')
    expect(r).toEqual({ error: 'Identificador inválido.' })
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('deletes an owned NF by id', async () => {
    const r = await deleteMeiInvoice(NF_ID)
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.op === 'delete')
    expect(del!.from).toBe('mei_invoices')
    expect(del!.filters).toContainEqual(['id', NF_ID])
  })

  it('rejects a forged id and issues NO delete', async () => {
    ownershipSelectResult = { data: [], error: null }
    const r = await deleteMeiInvoice(NF_ID)
    expect(r).toEqual({ error: 'Nota fiscal inválida.' })
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })
})

// --- upsertMeiSettings ------------------------------------------------------

describe('upsertMeiSettings', () => {
  it('upserts the single settings row with the start date', async () => {
    const r = await upsertMeiSettings(fd({ meiStartDate: '2026-04-01' }))
    expect(r).toEqual({ ok: true })
    const upsert = calls.find((c) => c.from === 'mei_settings' && c.op === 'upsert')
    expect(upsert).toBeDefined()
    expect(upsert!.payload).toMatchObject({
      user_id: 'user-1',
      mei_start_date: '2026-04-01',
    })
    expect(upsert!.options).toMatchObject({ onConflict: 'user_id' })
    expect(revalidatePath).toHaveBeenCalledWith('/mei')
  })

  it('rejects a malformed start date via Zod', async () => {
    const r = await upsertMeiSettings(fd({ meiStartDate: '01/04/2026' }))
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined()
  })
})

// --- upsertMeiYearFlag ------------------------------------------------------

describe('upsertMeiYearFlag', () => {
  it('upserts the per-year employee flag', async () => {
    const r = await upsertMeiYearFlag(2026, true)
    expect(r).toEqual({ ok: true })
    const upsert = calls.find((c) => c.from === 'mei_year_flags' && c.op === 'upsert')
    expect(upsert).toBeDefined()
    expect(upsert!.payload).toMatchObject({
      user_id: 'user-1',
      year: 2026,
      has_employee: true,
    })
    expect(upsert!.options).toMatchObject({ onConflict: 'user_id,year' })
  })

  it('rejects an out-of-range year', async () => {
    const r = await upsertMeiYearFlag(1800, false)
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined()
  })
})

// --- session gate -----------------------------------------------------------

describe('session gate', () => {
  it('returns a friendly error when there is no authenticated user', async () => {
    claimsSub = null
    const r = await createMeiInvoice(validNf())
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})
