import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the Carro CRUD/archive boundary (CAR-01). They
// mock @/lib/supabase/server (the Wave-0 integration tests in tests/ prove the
// DB-level RLS guarantees against the local stack); these assert the ACTION
// wrapper's behavior: Zod validation, the session gate, the IDOR re-derive that
// issues NO write on a forged id, and the { ok } | { error } result shape that
// never throws. Cloned from actions/mei.test.ts.

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

let insertResult: QueryResult = { data: null, error: null }
let updateResult: QueryResult = { data: null, error: null }
// The ownership-check select: assertOwnedCarro expects exactly 1 owned row.
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
  builder.update = vi.fn((payload: unknown) => {
    record.op = 'update'
    record.payload = payload
    resolveResult = updateResult
    return builder
  })
  // assertOwnedCarro does `from('carros').select('id').eq('id', id)` and awaits
  // the builder — resolve that select path to the ownership result.
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
  createCarro,
  updateCarro,
  archiveCarro,
  unarchiveCarro,
} from './carros'

const CARRO_ID = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  calls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  insertResult = { data: null, error: null }
  updateResult = { data: null, error: null }
  ownershipSelectResult = { data: [{ id: 'owned' }], error: null }
  claimsSub = 'user-1'
})

// --- createCarro (CAR-01) ---------------------------------------------------

describe('createCarro', () => {
  it('inserts a carro with user_id, apelido and optional fields', async () => {
    const r = await createCarro({
      apelido: 'Carro da família',
      modelo: 'Onix',
      placa: 'ABC1D23',
      ano: 2020,
      combustivel_padrao: 'Flex',
    })
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.from === 'carros' && c.op === 'insert')
    expect(insert).toBeDefined()
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      apelido: 'Carro da família',
      modelo: 'Onix',
      placa: 'ABC1D23',
      ano: 2020,
      combustivel_padrao: 'Flex',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/carros')
  })

  it('inserts with apelido alone (optionals stored null)', async () => {
    const r = await createCarro({ apelido: 'Só apelido' })
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      apelido: 'Só apelido',
      modelo: null,
      placa: null,
      ano: null,
      combustivel_padrao: null,
    })
  })

  it('rejects an empty apelido via Zod with NO insert', async () => {
    const r = await createCarro({ apelido: '' })
    expect(r).toEqual({ error: 'Informe o apelido' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects a bad combustivel via Zod with NO insert', async () => {
    const r = await createCarro({
      apelido: 'A',
      combustivel_padrao: 'Hidrogênio' as never,
    })
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('returns a friendly error when there is no authenticated user', async () => {
    claimsSub = null
    const r = await createCarro({ apelido: 'A' })
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('maps a DB insert error to a friendly string (never throws)', async () => {
    insertResult = { data: null, error: { code: '23505' } }
    const r = await createCarro({ apelido: 'A' })
    expect(r).toEqual({ error: 'Não foi possível salvar o carro.' })
  })
})

// --- updateCarro (IDOR re-derive, T-08-06) ----------------------------------

describe('updateCarro', () => {
  it('rejects a non-uuid id before any DB work', async () => {
    const r = await updateCarro('not-a-uuid', { apelido: 'A' })
    expect(r).toEqual({ error: 'Identificador inválido.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })

  it('rejects invalid input via Zod with NO update', async () => {
    const r = await updateCarro(CARRO_ID, { apelido: '' })
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })

  it('updates an owned carro', async () => {
    const r = await updateCarro(CARRO_ID, { apelido: 'Novo apelido', ano: 2021 })
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('carros')
    expect(update!.payload).toMatchObject({ apelido: 'Novo apelido', ano: 2021 })
    expect(update!.filters).toContainEqual(['id', CARRO_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/carros')
  })

  it('rejects a forged (not-owned) id and issues NO update', async () => {
    ownershipSelectResult = { data: [], error: null } // assertOwnedCarro → false
    const r = await updateCarro(CARRO_ID, { apelido: 'A' })
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })

  it('returns the session error when unauthenticated', async () => {
    claimsSub = null
    const r = await updateCarro(CARRO_ID, { apelido: 'A' })
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })
})

// --- archiveCarro / unarchiveCarro ------------------------------------------

describe('archiveCarro', () => {
  it('rejects a non-uuid id', async () => {
    const r = await archiveCarro('garbage')
    expect(r).toEqual({ error: 'Identificador inválido.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })

  it('sets is_archived true on the owned carro', async () => {
    const r = await archiveCarro(CARRO_ID)
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('carros')
    expect(update!.payload).toMatchObject({ is_archived: true })
    expect(update!.filters).toContainEqual(['id', CARRO_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/carros')
  })

  it('rejects a forged id and issues NO write', async () => {
    ownershipSelectResult = { data: [], error: null }
    const r = await archiveCarro(CARRO_ID)
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })
})

describe('unarchiveCarro', () => {
  it('sets is_archived false on the owned carro', async () => {
    const r = await unarchiveCarro(CARRO_ID)
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.payload).toMatchObject({ is_archived: false })
    expect(update!.filters).toContainEqual(['id', CARRO_ID])
  })

  it('rejects a forged id and issues NO write', async () => {
    ownershipSelectResult = { data: [], error: null }
    const r = await unarchiveCarro(CARRO_ID)
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })
})
