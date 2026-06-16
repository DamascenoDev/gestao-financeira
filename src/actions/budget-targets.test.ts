import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for upsertBudgetTarget / deleteBudgetTarget (BUD-01).
// They mock @/lib/supabase/server (the Wave-0 integration tests in
// tests/budget-target-*.test.ts prove the DB-level unique-upsert / RLS / direction
// guarantees against the local stack); these assert the ACTION wrapper's behavior:
// Zod validation, the getClaims session gate, the category-ownership re-derive
// (carried Phase-2 IDOR fix — FKs are not RLS-aware), the upsert onConflict key,
// and the delete path. Mirrors categories.test.ts's chainable-builder mock style.

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}))

type QueryResult = { data: unknown; error: unknown }

const calls: {
  from: string
  op: string
  payload?: unknown
  conflict?: string
  filters: Array<[string, unknown]>
}[] = []

let ownedResult: QueryResult | null = null
let upsertResult: QueryResult = { data: null, error: null }
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
    // The categories ownership re-derive: select('id').eq('id', categoryId).
    if (from === 'categories' && record.op === 'select') {
      const def: QueryResult = { data: [{ id: val }], error: null }
      resolveResult = ownedResult ?? def
    }
    if (from === 'budget_targets' && record.op === 'delete') {
      resolveResult = deleteResult
    }
    return builder
  })
  builder.upsert = vi.fn((payload: unknown, opts?: { onConflict?: string }) => {
    record.op = 'upsert'
    record.payload = payload
    record.conflict = opts?.onConflict
    resolveResult = upsertResult
    return builder
  })
  builder.delete = vi.fn(() => {
    record.op = 'delete'
    resolveResult = deleteResult
    return builder
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

import { upsertBudgetTarget, deleteBudgetTarget } from './budget-targets'

// RFC-4122 v4 UUID fixtures — zod v4 .uuid() validates version/variant (Phase-2 lesson).
const CAT_ID = '11111111-1111-4111-8111-111111111111'
const FOREIGN_CAT_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  calls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  ownedResult = null
  upsertResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
  claimsSub = 'user-1'
})

// --- upsertBudgetTarget ------------------------------------------------------

describe('upsertBudgetTarget', () => {
  it('upserts on (user_id, category_id) for a valid owned target and returns { ok: true }', async () => {
    const r = await upsertBudgetTarget({
      categoryId: CAT_ID,
      percentBp: 3000,
      direction: 'teto',
    })
    expect(r).toEqual({ ok: true })
    const upsert = calls.find((c) => c.op === 'upsert')
    expect(upsert).toBeDefined()
    expect(upsert!.from).toBe('budget_targets')
    expect(upsert!.payload).toMatchObject({
      user_id: 'user-1',
      category_id: CAT_ID,
      percent_bp: 3000,
      direction: 'teto',
    })
    // One meta per category — the upsert keys on the unique pair.
    expect(upsert!.conflict).toBe('user_id,category_id')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('accepts an alvo direction (alocação meta)', async () => {
    const r = await upsertBudgetTarget({
      categoryId: CAT_ID,
      percentBp: 2000,
      direction: 'alvo',
    })
    expect(r).toEqual({ ok: true })
    const upsert = calls.find((c) => c.op === 'upsert')
    expect(upsert!.payload).toMatchObject({ direction: 'alvo' })
  })

  it('a second call for the same category UPDATES via the same conflict key (one meta per category)', async () => {
    await upsertBudgetTarget({ categoryId: CAT_ID, percentBp: 3000, direction: 'teto' })
    await upsertBudgetTarget({ categoryId: CAT_ID, percentBp: 4000, direction: 'teto' })
    const upserts = calls.filter((c) => c.op === 'upsert')
    expect(upserts).toHaveLength(2)
    // Both target the same conflict pair — the DB collapses them to one row.
    expect(upserts.every((u) => u.conflict === 'user_id,category_id')).toBe(true)
    expect(upserts[1]!.payload).toMatchObject({ percent_bp: 4000 })
  })

  it('rejects a forged/foreign categoryId (ownership re-derive returns 0 rows) — never written', async () => {
    ownedResult = { data: [], error: null }
    const r = await upsertBudgetTarget({
      categoryId: FOREIGN_CAT_ID,
      percentBp: 3000,
      direction: 'teto',
    })
    expect(r).toEqual({ error: 'Categoria inválida.' })
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined()
  })

  it('rejects a non-uuid categoryId via Zod, no write', async () => {
    const r = await upsertBudgetTarget({
      categoryId: 'not-a-uuid', // runtime Zod guard (a string-typed but invalid UUID)
      percentBp: 3000,
      direction: 'teto',
    })
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined()
  })

  it('rejects percentBp outside 0 < bp <= 10000 via Zod, no write', async () => {
    const tooHigh = await upsertBudgetTarget({
      categoryId: CAT_ID,
      percentBp: 10001,
      direction: 'teto',
    })
    expect(tooHigh).toHaveProperty('error')
    const zero = await upsertBudgetTarget({
      categoryId: CAT_ID,
      percentBp: 0,
      direction: 'teto',
    })
    expect(zero).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined()
  })

  it('rejects a bad direction via Zod, no write', async () => {
    const r = await upsertBudgetTarget({
      categoryId: CAT_ID,
      percentBp: 3000,
      // @ts-expect-error — runtime Zod guard
      direction: 'bogus',
    })
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined()
  })

  it('gates on the session: no claims → Sessão expirada.', async () => {
    claimsSub = null
    const r = await upsertBudgetTarget({
      categoryId: CAT_ID,
      percentBp: 3000,
      direction: 'teto',
    })
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'upsert')).toBeUndefined()
  })

  it('returns a friendly error when the upsert fails (never a raw DB error)', async () => {
    upsertResult = { data: null, error: { code: 'XXXXX', message: 'boom' } }
    const r = await upsertBudgetTarget({
      categoryId: CAT_ID,
      percentBp: 3000,
      direction: 'teto',
    })
    expect(r).toEqual({ error: 'Não foi possível salvar a meta.' })
  })
})

// --- deleteBudgetTarget ------------------------------------------------------

describe('deleteBudgetTarget', () => {
  it('deletes the meta for an owned category (RLS scopes the delete) and returns { ok: true }', async () => {
    const r = await deleteBudgetTarget(CAT_ID)
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.op === 'delete')
    expect(del!.from).toBe('budget_targets')
    expect(del!.filters).toContainEqual(['category_id', CAT_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('rejects a non-uuid categoryId before the delete (WR-06)', async () => {
    const r = await deleteBudgetTarget('not-a-uuid')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('gates on the session', async () => {
    claimsSub = null
    const r = await deleteBudgetTarget(CAT_ID)
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('returns a friendly error when the delete fails', async () => {
    deleteResult = { data: null, error: { message: 'boom' } }
    const r = await deleteBudgetTarget(CAT_ID)
    expect(r).toEqual({ error: 'Não foi possível remover a meta.' })
  })
})
