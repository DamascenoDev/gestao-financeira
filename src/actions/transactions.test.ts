import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the transaction CRUD + bulkReclassify boundary.
// They mock @/lib/supabase/server (the Wave-0 integration tests transactions-rls
// + bulk-reclassify prove the DB-level RLS / .in() scoping guarantees against the
// local stack); these assert the ACTION wrapper's behavior: Zod validation, money
// parsing, kind 'expense' + positive amount_cents, the .in('id', ids) bulk shape,
// the empty-selection guard, and the session gate.

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
  inFilter?: { col: string; vals: unknown[] }
}[] = []

let insertResult: QueryResult = { data: { id: 'new-id' }, error: null }
let updateResult: QueryResult = { data: null, error: null }
let deleteResult: QueryResult = { data: null, error: null }
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
  builder.in = vi.fn((col: string, vals: unknown[]) => {
    record.inFilter = { col, vals }
    return builder
  })
  builder.insert = vi.fn((payload: unknown) => {
    record.op = 'insert'
    record.payload = payload
    resolveResult = insertResult
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
  builder.single = vi.fn(() => {
    if (record.op === 'insert') return Promise.resolve(insertResult)
    return Promise.resolve(resolveResult)
  })
  builder.then = (onF: (v: QueryResult) => unknown) =>
    Promise.resolve(resolveResult).then(onF)

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
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkReclassify,
} from './transactions'

const CATEGORY_ID = '11111111-1111-1111-1111-111111111111'
const DEST_CATEGORY = '22222222-2222-2222-2222-222222222222'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  calls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  insertResult = { data: { id: 'new-id' }, error: null }
  updateResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
  claimsSub = 'user-1'
})

// --- createTransaction (TXN-01) --------------------------------------------

describe('createTransaction', () => {
  it('inserts a positive-bigint expense for the owner', async () => {
    const r = await createTransaction(
      fd({
        description: 'Mercado',
        amount: 'R$ 1.234,56',
        categoryId: CATEGORY_ID,
        occurredOn: '2026-06-10',
      }),
    )
    expect(r).toEqual({ ok: true })
    const insert = calls.find(
      (c) => c.from === 'transactions' && c.op === 'insert',
    )
    expect(insert).toBeDefined()
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      category_id: CATEGORY_ID,
      amount_cents: 123456,
      kind: 'expense',
      occurred_on: '2026-06-10',
      description: 'Mercado',
    })
    // Sign derives from kind — the stored amount is always positive.
    expect(
      (insert!.payload as { amount_cents: number }).amount_cents,
    ).toBeGreaterThan(0)
    expect(revalidatePath).toHaveBeenCalledWith('/extrato')
  })

  it('rejects an invalid money string before inserting', async () => {
    const r = await createTransaction(
      fd({
        description: 'x',
        amount: 'abc',
        categoryId: CATEGORY_ID,
        occurredOn: '2026-06-10',
      }),
    )
    expect(r).toEqual({ error: 'Valor monetário inválido.' })
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('rejects a non-uuid category before inserting', async () => {
    const r = await createTransaction(
      fd({
        description: 'x',
        amount: 'R$ 10,00',
        categoryId: 'not-a-uuid',
        occurredOn: '2026-06-10',
      }),
    )
    expect('error' in r).toBe(true)
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('rejects a malformed date before inserting', async () => {
    const r = await createTransaction(
      fd({
        description: 'x',
        amount: 'R$ 10,00',
        categoryId: CATEGORY_ID,
        occurredOn: '10/06/2026',
      }),
    )
    expect('error' in r).toBe(true)
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await createTransaction(
      fd({
        description: 'x',
        amount: 'R$ 10,00',
        categoryId: CATEGORY_ID,
        occurredOn: '2026-06-10',
      }),
    )
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})

// --- updateTransaction (TXN-02) --------------------------------------------

describe('updateTransaction', () => {
  it('updates the row by id (RLS scopes it to the owner)', async () => {
    const r = await updateTransaction(
      'tx-1',
      fd({
        description: 'Atualizado',
        amount: 'R$ 50,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
      }),
    )
    expect(r).toEqual({ ok: true })
    const upd = calls.find((c) => c.from === 'transactions' && c.op === 'update')
    expect(upd).toBeDefined()
    expect(upd!.filters).toContainEqual(['id', 'tx-1'])
    expect(upd!.payload).toMatchObject({
      description: 'Atualizado',
      amount_cents: 5000,
      category_id: DEST_CATEGORY,
      occurred_on: '2026-06-11',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/extrato')
  })

  it('rejects invalid money on update', async () => {
    const r = await updateTransaction(
      'tx-1',
      fd({
        description: 'x',
        amount: 'xyz',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
      }),
    )
    expect(r).toEqual({ error: 'Valor monetário inválido.' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await updateTransaction(
      'tx-1',
      fd({
        description: 'x',
        amount: 'R$ 10,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
      }),
    )
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})

// --- deleteTransaction (TXN-02) --------------------------------------------

describe('deleteTransaction', () => {
  it('deletes the row by id', async () => {
    const r = await deleteTransaction('tx-1')
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.from === 'transactions' && c.op === 'delete')
    expect(del).toBeDefined()
    expect(del!.filters).toContainEqual(['id', 'tx-1'])
    expect(revalidatePath).toHaveBeenCalledWith('/extrato')
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await deleteTransaction('tx-1')
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})

// --- bulkReclassify (TXN-04) -----------------------------------------------

describe('bulkReclassify', () => {
  it('updates all selected ids to one category in a single .in() update', async () => {
    const ids = ['a', 'b', 'c']
    const r = await bulkReclassify(ids, DEST_CATEGORY)
    expect(r).toEqual({ ok: true })
    const upd = calls.find((c) => c.from === 'transactions' && c.op === 'update')
    expect(upd).toBeDefined()
    expect(upd!.payload).toMatchObject({ category_id: DEST_CATEGORY })
    // Single .in('id', ids) — not N per-row updates (RLS scopes it to the caller).
    expect(upd!.inFilter).toEqual({ col: 'id', vals: ids })
    const updates = calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(revalidatePath).toHaveBeenCalledWith('/extrato')
  })

  it('guards an empty selection without touching the DB', async () => {
    const r = await bulkReclassify([], DEST_CATEGORY)
    expect(r).toEqual({ error: 'Nenhuma transação selecionada.' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('rejects a non-uuid target category before updating', async () => {
    const r = await bulkReclassify(['a'], 'not-a-uuid')
    expect('error' in r).toBe(true)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await bulkReclassify(['a'], DEST_CATEGORY)
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})
