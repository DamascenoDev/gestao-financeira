import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for createReserva / updateReserva / deleteReserva /
// registerSaida (RSV-01/04/05). They mock @/lib/supabase/server (the Wave-0
// integration tests in tests/reserva-*.test.ts prove the DB-level derived-balance /
// never-negative saída / RLS / IDOR guarantees against the live stack); these assert
// the ACTION wrapper's behavior: Zod validation, the parseBRLToCents money guard, the
// getClaims session gate, the reserva-ownership re-derive before the saída RPC (the
// carried Phase-2 IDOR fix — FKs are not RLS-aware), the rpc call shape, and the
// overdraw → friendly-copy mapping. Mirrors budget-targets.test.ts's chainable-builder
// mock style, extended with rpc().

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

const rpcCalls: { name: string; args: unknown }[] = []

let ownedResult: QueryResult | null = null
let insertResult: QueryResult = { data: null, error: null }
let updateResult: QueryResult = { data: null, error: null }
let deleteResult: QueryResult = { data: null, error: null }
let rpcResult: QueryResult = { data: null, error: null }
let claimsSub: string | null = 'user-1'

function makeBuilder(from: string) {
  const record: (typeof calls)[number] = { from, op: '', filters: [] }
  let resolveResult: QueryResult = { data: null, error: null }

  const builder: Record<string, unknown> = {}

  builder.select = vi.fn(() => {
    if (!record.op) record.op = 'select'
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
  builder.eq = vi.fn((col: string, val: unknown) => {
    record.filters.push([col, val])
    // The reservas ownership re-derive: select('id').eq('id', reservaId).
    if (from === 'reservas' && record.op === 'select') {
      const def: QueryResult = { data: [{ id: val }], error: null }
      resolveResult = ownedResult ?? def
    }
    if (from === 'reservas' && record.op === 'update') resolveResult = updateResult
    if (from === 'reservas' && record.op === 'delete') resolveResult = deleteResult
    return builder
  })
  builder.then = (onF: (v: QueryResult) => unknown) =>
    Promise.resolve(resolveResult).then(onF)

  calls.push(record)
  return builder
}

const supabaseMock = {
  from: vi.fn((table: string) => makeBuilder(table)),
  rpc: vi.fn(async (name: string, args: unknown) => {
    rpcCalls.push({ name, args })
    return rpcResult
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
  createReserva,
  updateReserva,
  deleteReserva,
  registerSaida,
} from './reservas'

// RFC-4122 v4 UUID fixtures — zod v4 .uuid() validates version/variant (Phase-2 lesson).
const RESERVA_ID = '11111111-1111-4111-8111-111111111111'
const FOREIGN_RESERVA_ID = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  supabaseMock.rpc.mockClear()
  ownedResult = null
  insertResult = { data: null, error: null }
  updateResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
  rpcResult = { data: null, error: null }
  claimsSub = 'user-1'
})

// --- createReserva -----------------------------------------------------------

describe('createReserva', () => {
  it('inserts a reserva with a parsed alvo and returns { ok: true }', async () => {
    const r = await createReserva({ nome: 'Apê', alvo: '10.000,00' })
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert!.from).toBe('reservas')
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      nome: 'Apê',
      alvo_cents: 1000000,
    })
    expect(revalidatePath).toHaveBeenCalledWith('/reservas')
  })

  it('stores alvo_cents null when no alvo is provided (no progress bar)', async () => {
    const r = await createReserva({ nome: 'Carro' })
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert!.payload).toMatchObject({ nome: 'Carro', alvo_cents: null })
  })

  it('stores alvo_cents null when alvo is a blank string', async () => {
    const r = await createReserva({ nome: 'Viagem', alvo: '   ' })
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.op === 'insert')
    expect(insert!.payload).toMatchObject({ alvo_cents: null })
  })

  it('rejects an empty nome via Zod, no write', async () => {
    const r = await createReserva({ nome: '   ' })
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('maps a bad alvo money string to the friendly money error, no write', async () => {
    const r = await createReserva({ nome: 'Apê', alvo: 'abc' })
    expect(r).toEqual({ error: 'Valor monetário inválido.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('gates on the session: no claims → Sessão expirada.', async () => {
    claimsSub = null
    const r = await createReserva({ nome: 'Apê' })
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('returns a friendly error when the insert fails (never a raw DB error)', async () => {
    insertResult = { data: null, error: { message: 'boom' } }
    const r = await createReserva({ nome: 'Apê' })
    expect(r).toEqual({ error: 'Não foi possível salvar a reserva.' })
  })
})

// --- updateReserva -----------------------------------------------------------

describe('updateReserva', () => {
  it('updates nome + alvo for an owned reserva and returns { ok: true }', async () => {
    const r = await updateReserva(RESERVA_ID, { nome: 'Apê novo', alvo: '20.000,00' })
    expect(r).toEqual({ ok: true })
    const upd = calls.find((c) => c.op === 'update')
    expect(upd!.from).toBe('reservas')
    expect(upd!.payload).toMatchObject({ nome: 'Apê novo', alvo_cents: 2000000 })
    expect(upd!.filters).toContainEqual(['id', RESERVA_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/reservas')
  })

  it('setting alvo empty stores null (removes the progress bar)', async () => {
    const r = await updateReserva(RESERVA_ID, { nome: 'Apê', alvo: '' })
    expect(r).toEqual({ ok: true })
    const upd = calls.find((c) => c.op === 'update')
    expect(upd!.payload).toMatchObject({ alvo_cents: null })
  })

  it('rejects a non-uuid id before the update', async () => {
    const r = await updateReserva('not-a-uuid', { nome: 'Apê' })
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'update')).toBeUndefined()
  })

  it('gates on the session', async () => {
    claimsSub = null
    const r = await updateReserva(RESERVA_ID, { nome: 'Apê' })
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })

  it('returns a friendly error when the update fails', async () => {
    updateResult = { data: null, error: { message: 'boom' } }
    const r = await updateReserva(RESERVA_ID, { nome: 'Apê' })
    expect(r).toEqual({ error: 'Não foi possível atualizar a reserva.' })
  })
})

// --- deleteReserva -----------------------------------------------------------

describe('deleteReserva', () => {
  it('deletes an owned reserva (RLS scopes the delete, ledger cascades)', async () => {
    const r = await deleteReserva(RESERVA_ID)
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.op === 'delete')
    expect(del!.from).toBe('reservas')
    expect(del!.filters).toContainEqual(['id', RESERVA_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/reservas')
  })

  it('rejects a non-uuid id before the delete', async () => {
    const r = await deleteReserva('not-a-uuid')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('gates on the session', async () => {
    claimsSub = null
    const r = await deleteReserva(RESERVA_ID)
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })

  it('returns a friendly error when the delete fails', async () => {
    deleteResult = { data: null, error: { message: 'boom' } }
    const r = await deleteReserva(RESERVA_ID)
    expect(r).toEqual({ error: 'Não foi possível excluir a reserva.' })
  })
})

// --- registerSaida -----------------------------------------------------------

describe('registerSaida', () => {
  it('re-derives ownership then calls the atomic RPC and returns { ok: true }', async () => {
    const r = await registerSaida({
      reservaId: RESERVA_ID,
      amount: '300,00',
      occurredOn: '2026-06-16',
      note: 'Emergência',
    })
    expect(r).toEqual({ ok: true })
    // Ownership re-derive happened (select on reservas) BEFORE the rpc.
    expect(calls.some((c) => c.from === 'reservas' && c.op === 'select')).toBe(true)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0]!.name).toBe('register_reserva_saida')
    expect(rpcCalls[0]!.args).toMatchObject({
      p_reserva_id: RESERVA_ID,
      p_amount_cents: 30000,
      p_occurred_on: '2026-06-16',
      p_note: 'Emergência',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/reservas')
  })

  it('defaults p_note to an empty string when no note is given', async () => {
    await registerSaida({ reservaId: RESERVA_ID, amount: '10,00', occurredOn: '2026-06-16' })
    expect(rpcCalls[0]!.args).toMatchObject({ p_note: '' })
  })

  it('rejects a forged/foreign reservaId via the ownership re-derive — RPC never called', async () => {
    ownedResult = { data: [], error: null }
    const r = await registerSaida({
      reservaId: FOREIGN_RESERVA_ID,
      amount: '10,00',
      occurredOn: '2026-06-16',
    })
    expect(r).toEqual({ error: 'Reserva inválida.' })
    expect(rpcCalls).toHaveLength(0)
  })

  it('maps the RPC overdraw raise (SQLSTATE P0002) to the friendly copy (LW-02)', async () => {
    // LW-02: the action branches on the structured error.code, not the message text.
    rpcResult = {
      data: null,
      error: { code: 'P0002', message: 'Saída maior que o saldo da reserva' },
    }
    const r = await registerSaida({
      reservaId: RESERVA_ID,
      amount: '999,00',
      occurredOn: '2026-06-16',
    })
    expect(r).toEqual({ error: 'A saída não pode ser maior que o saldo da reserva.' })
  })

  it('maps any other RPC error to the generic fallback (never raw)', async () => {
    rpcResult = { data: null, error: { message: 'connection reset' } }
    const r = await registerSaida({
      reservaId: RESERVA_ID,
      amount: '10,00',
      occurredOn: '2026-06-16',
    })
    expect(r).toEqual({ error: 'Não foi possível registrar a saída.' })
  })

  it('rejects a non-uuid reservaId via Zod, no ownership read, no RPC', async () => {
    const r = await registerSaida({
      reservaId: 'not-a-uuid',
      amount: '10,00',
      occurredOn: '2026-06-16',
    })
    expect(r).toHaveProperty('error')
    expect(rpcCalls).toHaveLength(0)
  })

  it('maps a bad amount money string to the friendly money error, no RPC', async () => {
    const r = await registerSaida({
      reservaId: RESERVA_ID,
      amount: 'abc',
      occurredOn: '2026-06-16',
    })
    expect(r).toEqual({ error: 'Valor monetário inválido.' })
    expect(rpcCalls).toHaveLength(0)
  })

  it('rejects a bad occurredOn via Zod, no RPC', async () => {
    const r = await registerSaida({
      reservaId: RESERVA_ID,
      amount: '10,00',
      occurredOn: '16/06/2026',
    })
    expect(r).toHaveProperty('error')
    expect(rpcCalls).toHaveLength(0)
  })

  it('gates on the session', async () => {
    claimsSub = null
    const r = await registerSaida({
      reservaId: RESERVA_ID,
      amount: '10,00',
      occurredOn: '2026-06-16',
    })
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(rpcCalls).toHaveLength(0)
  })
})
