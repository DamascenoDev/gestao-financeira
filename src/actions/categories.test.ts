import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the category CRUD + delete-block + atomic
// reassign boundary. They mock @/lib/supabase/server (the Wave-0 integration
// tests in tests/category-delete.test.ts + tests/category-kind.test.ts prove
// the DB-level FK RESTRICT / RPC / RLS guarantees against the local stack);
// these assert the ACTION wrapper's behavior: Zod validation, the v_category_totals
// pre-check that returns { blocked, txCount } when tx_count > 0, the 23503 backstop,
// the atomic reassign_and_delete_category RPC call, kind/color/archive single-field
// edits, and the session gate.

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

const rpcCalls: { fn: string; args: unknown }[] = []

let totalsResult: QueryResult = { data: [], error: null }
let insertResult: QueryResult = { data: { id: 'new-id' }, error: null }
let updateResult: QueryResult = { data: null, error: null }
let deleteResult: QueryResult = { data: null, error: null }
let rpcResult: QueryResult = { data: null, error: null }
let claimsSub: string | null = 'user-1'
// HG-02/MD-01: result of the `categories.select('id, kind').in('id',[src,dst])`
// ownership+kind check reassignAndDelete runs before the RPC. Defaults to both
// ids owned and same kind (the happy path).
let reassignOwnedResult: QueryResult | null = null

function makeBuilder(from: string) {
  const record: (typeof calls)[number] = { from, op: '', filters: [] }
  let resolveResult: QueryResult = { data: null, error: null }

  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => {
    if (!record.op) record.op = 'select'
    if (from === 'v_category_totals') resolveResult = totalsResult
    return builder
  })
  builder.eq = vi.fn((col: string, val: unknown) => {
    record.filters.push([col, val])
    return builder
  })
  builder.in = vi.fn((col: string, vals: unknown[]) => {
    record.inFilter = { col, vals }
    // The reassign ownership+kind pre-check: categories.select('id,kind').in(...).
    if (from === 'categories' && record.op === 'select') {
      const def: QueryResult = {
        data: (record.inFilter.vals as string[]).map((id) => ({
          id,
          kind: 'consumo',
        })),
        error: null,
      }
      resolveResult = reassignOwnedResult ?? def
    }
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
  rpc: vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve(rpcResult)
  }),
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
  createCategory,
  renameCategory,
  setKind,
  setColor,
  archiveCategory,
  deleteCategory,
  reassignAndDelete,
} from './categories'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

// Real UUIDs — the id-arg actions now reject non-UUID ids (WR-06).
const CAT_ID = '11111111-1111-4111-8111-111111111111'
const SRC_ID = '22222222-2222-4222-8222-222222222222'
const DST_ID = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  supabaseMock.rpc.mockClear()
  totalsResult = { data: [], error: null }
  insertResult = { data: { id: 'new-id' }, error: null }
  updateResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
  rpcResult = { data: null, error: null }
  claimsSub = 'user-1'
  reassignOwnedResult = null
})

// --- createCategory ---------------------------------------------------------

describe('createCategory', () => {
  it('inserts a category with the owner, default kind consumo and optional color', async () => {
    const r = await createCategory(
      fd({ name: 'Pets', kind: 'consumo', color: 'teal' }),
    )
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.from === 'categories' && c.op === 'insert')
    expect(insert).toBeDefined()
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      name: 'Pets',
      kind: 'consumo',
      color: 'teal',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/categorias')
  })

  it('rejects an empty name via Zod before touching the DB', async () => {
    const r = await createCategory(fd({ name: '', kind: 'consumo' }))
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects an invalid kind via Zod', async () => {
    const r = await createCategory(fd({ name: 'X', kind: 'bogus' }))
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects a free-hex / non-swatch color via Zod', async () => {
    const r = await createCategory(
      fd({ name: 'X', kind: 'consumo', color: '#ff0000' }),
    )
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })
})

// --- renameCategory / setKind / setColor (single-field edits) ---------------

describe('renameCategory', () => {
  it('updates only the name on the categories row', async () => {
    const r = await renameCategory(CAT_ID, 'Novo nome')
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('categories')
    expect(update!.payload).toMatchObject({ name: 'Novo nome' })
    expect(update!.filters).toContainEqual(['id', CAT_ID])
  })

  it('rejects an empty name', async () => {
    const r = await renameCategory(CAT_ID, '   ')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })
})

describe('setKind', () => {
  it('persists consumo → alocacao (CAT-03)', async () => {
    const r = await setKind(CAT_ID, 'alocacao')
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('categories')
    expect(update!.payload).toMatchObject({ kind: 'alocacao' })
    expect(update!.filters).toContainEqual(['id', CAT_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/categorias')
  })

  it('rejects an invalid kind value', async () => {
    // @ts-expect-error — invalid kind rejected at runtime by Zod
    const r = await setKind(CAT_ID, 'bogus')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })
})

describe('setColor', () => {
  it('persists a swatch color', async () => {
    const r = await setColor(CAT_ID, 'violet')
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.payload).toMatchObject({ color: 'violet' })
  })

  it('rejects a non-swatch color', async () => {
    // @ts-expect-error — invalid swatch rejected at runtime by Zod
    const r = await setColor(CAT_ID, 'chartreuse')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })
})

// --- archiveCategory --------------------------------------------------------

describe('archiveCategory', () => {
  it('flips is_archived=true (keeps history, hides from pickers)', async () => {
    const r = await archiveCategory(CAT_ID)
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('categories')
    expect(update!.payload).toMatchObject({ is_archived: true })
    expect(update!.filters).toContainEqual(['id', CAT_ID])
  })
})

// --- deleteCategory (delete-block pre-check + 23503 backstop) ----------------

describe('deleteCategory', () => {
  it('returns { blocked, txCount } when the category has transactions (pre-check)', async () => {
    totalsResult = { data: [{ tx_count: 3 }], error: null }
    const r = await deleteCategory(CAT_ID)
    expect(r).toEqual({ blocked: true, txCount: 3 })
    // Never attempts the delete when blocked.
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('sums tx_count across multiple v_category_totals rows (per-month)', async () => {
    totalsResult = { data: [{ tx_count: 2 }, { tx_count: 4 }], error: null }
    const r = await deleteCategory(CAT_ID)
    expect(r).toEqual({ blocked: true, txCount: 6 })
  })

  it('deletes the category when it has no transactions', async () => {
    totalsResult = { data: [], error: null }
    const r = await deleteCategory(CAT_ID)
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.op === 'delete')
    expect(del!.from).toBe('categories')
    expect(del!.filters).toContainEqual(['id', CAT_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/categorias')
  })

  it('returns a friendly error (never a raw 23503) if the FK backstop fires', async () => {
    totalsResult = { data: [], error: null }
    deleteResult = { data: null, error: { code: '23503', message: 'fk' } }
    const r = await deleteCategory(CAT_ID)
    expect(r).toHaveProperty('error')
    expect(r).not.toHaveProperty('blocked')
  })
})

// --- reassignAndDelete (atomic RPC) -----------------------------------------

describe('reassignAndDelete', () => {
  it('invokes the reassign_and_delete_category RPC with { src, dst }', async () => {
    const r = await reassignAndDelete(SRC_ID, DST_ID)
    expect(r).toEqual({ ok: true })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0]!.fn).toBe('reassign_and_delete_category')
    expect(rpcCalls[0]!.args).toEqual({ src: SRC_ID, dst: DST_ID })
    expect(revalidatePath).toHaveBeenCalledWith('/categorias')
  })

  it('rejects reassigning a category to itself', async () => {
    const r = await reassignAndDelete(SRC_ID, SRC_ID)
    expect(r).toHaveProperty('error')
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects a non-uuid src/dst before the RPC (WR-06)', async () => {
    const r = await reassignAndDelete('not-a-uuid', DST_ID)
    expect(r).toHaveProperty('error')
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects a forged/foreign dst not owned by the caller (HG-02)', async () => {
    // Ownership pre-check sees only src (dst is foreign) → length !== 2.
    reassignOwnedResult = { data: [{ id: SRC_ID, kind: 'consumo' }], error: null }
    const r = await reassignAndDelete(SRC_ID, DST_ID)
    expect(r).toHaveProperty('error')
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects reassigning across kinds consumo↔alocação (MD-01)', async () => {
    reassignOwnedResult = {
      data: [
        { id: SRC_ID, kind: 'consumo' },
        { id: DST_ID, kind: 'alocacao' },
      ],
      error: null,
    }
    const r = await reassignAndDelete(SRC_ID, DST_ID)
    expect(r).toHaveProperty('error')
    expect(rpcCalls).toHaveLength(0)
  })

  it('returns a friendly error when the RPC fails', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    const r = await reassignAndDelete(SRC_ID, DST_ID)
    expect(r).toHaveProperty('error')
  })
})

// --- session gate -----------------------------------------------------------

describe('session gate', () => {
  it('returns a friendly error when there is no authenticated user', async () => {
    claimsSub = null
    const r = await createCategory(fd({ name: 'X', kind: 'consumo' }))
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})
