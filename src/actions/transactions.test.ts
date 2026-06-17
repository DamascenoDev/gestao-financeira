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
// When set, the HG-01 ownership check sees exactly these category ids as owned;
// null = echo back whatever was queried (the default "all owned" happy path).
let ownedCategoryIds: string[] | null = null
// Drives isReservaCategory: the is_reserva flag the categories(is_reserva) read
// returns for the queried category id. Default false (non-Reserva happy path).
let categoryIsReserva = false
// Drives assertOwnedReserva: the reserva ids the reservas(id) read sees as owned.
// null = echo back the queried id (the default "owned" happy path).
let ownedReservaIds: string[] | null = null
// Drives assertOwnedCarro (tri-state): the carro ids the carros(id) read sees as
// owned. null = echo back the queried id (the default 'owned' happy path).
let ownedCarroIds: string[] | null = null
// When true, the carros(id) ownership read resolves with a DB error so
// assertOwnedCarro maps to 'error' (WR-04 transient-failure path).
let carroOwnershipErrors = false

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
  builder.maybeSingle = vi.fn(() => {
    // isReservaCategory: `from('categories').select('is_reserva').eq('id', id).maybeSingle()`.
    if (from === 'categories' && record.op === 'select') {
      return Promise.resolve({
        data: { is_reserva: categoryIsReserva },
        error: null,
      } as QueryResult)
    }
    return Promise.resolve(resolveResult)
  })
  builder.then = (onF: (v: QueryResult) => unknown) => {
    // HG-01 ownership check: `from('categories').select('id').in('id', ids)`.
    // Echo back a row per queried id so assertOwnedCategories sees them as owned
    // (the integration test tests/category-idor.test.ts proves the real RLS path).
    if (from === 'categories' && record.op === 'select') {
      const owned: unknown[] = ownedCategoryIds ?? record.inFilter?.vals ?? []
      return Promise.resolve({
        data: owned.map((id) => ({ id })),
        error: null,
      } as QueryResult).then(onF)
    }
    // IDOR ownership check: `from('reservas').select('id').eq('id', id)`. Echo back
    // the queried id as owned unless ownedReservaIds restricts it (mirrors the
    // categories path; the live tests/reserva-idor.test.ts proves the real RLS path).
    if (from === 'reservas' && record.op === 'select') {
      const queried = record.filters.find(([col]) => col === 'id')?.[1]
      const owned =
        ownedReservaIds ?? (queried !== undefined ? [queried] : [])
      return Promise.resolve({
        data: owned.map((id) => ({ id })),
        error: null,
      } as QueryResult).then(onF)
    }
    // assertOwnedCarro tri-state: `from('carros').select('id').eq('id', id)`. Echo
    // back the queried id as owned unless ownedCarroIds restricts it (mirrors the
    // reservas path; the live tests/carro-tag-nondestructive.test.ts proves real RLS).
    // carroOwnershipErrors forces the WR-04 'error' branch (transient DB failure).
    if (from === 'carros' && record.op === 'select') {
      if (carroOwnershipErrors) {
        return Promise.resolve({
          data: null,
          error: { code: 'XX000' },
        } as QueryResult).then(onF)
      }
      const queried = record.filters.find(([col]) => col === 'id')?.[1]
      const owned = ownedCarroIds ?? (queried !== undefined ? [queried] : [])
      return Promise.resolve({
        data: owned.map((id) => ({ id })),
        error: null,
      } as QueryResult).then(onF)
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
  createTransaction,
  createTransactionWithReserva,
  updateTransaction,
  deleteTransaction,
  bulkReclassify,
} from './transactions'

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111'
const DEST_CATEGORY = '22222222-2222-4222-8222-222222222222'
const TX_ID = '33333333-3333-4333-8333-333333333333'
const RESERVA_ID = '77777777-7777-4777-8777-777777777777'
// Real transaction UUIDs for the bulk path (WR-06 rejects non-UUID ids).
const TX_IDS = [
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
]

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
  ownedCategoryIds = null
  categoryIsReserva = false
  ownedReservaIds = null
  ownedCarroIds = null
  carroOwnershipErrors = false
})

const CARRO_ID = '88888888-8888-4888-8888-888888888888'

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

  it('rejects a forged/foreign category before inserting (HG-01)', async () => {
    // Ownership check returns 0 owned for the (well-formed but foreign) id.
    ownedCategoryIds = []
    const r = await createTransaction(
      fd({
        description: 'x',
        amount: 'R$ 10,00',
        categoryId: CATEGORY_ID,
        occurredOn: '2026-06-10',
      }),
    )
    expect(r).toEqual({ error: 'Categoria inválida.' })
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

  it('rejects a Reserva category — no ledger sync on this path (LW-01)', async () => {
    // This plain path cannot create the aporte ('in') entry, so a Reserva target is
    // blocked rather than half-recorded (the saldo/ledger divergence of HG-01).
    categoryIsReserva = true
    const r = await createTransaction(
      fd({
        description: 'x',
        amount: 'R$ 10,00',
        categoryId: CATEGORY_ID,
        occurredOn: '2026-06-10',
      }),
    )
    expect(r).toEqual({
      error: 'Use o lançamento de aporte para classificar como Reserva.',
    })
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })
})

// --- createTransactionWithReserva (RSV-02/03) ------------------------------

describe('createTransactionWithReserva', () => {
  function aporteFd(extra: Record<string, string> = {}): FormData {
    return fd({
      description: 'Aporte mensal',
      amount: 'R$ 500,00',
      categoryId: CATEGORY_ID,
      occurredOn: '2026-06-10',
      reservaId: RESERVA_ID,
      ...extra,
    })
  }

  it('inserts the transaction AND a linked in ledger entry for a Reserva category (aporte → alocação)', async () => {
    categoryIsReserva = true
    const r = await createTransactionWithReserva(aporteFd())
    expect(r).toEqual({ ok: true })

    const insert = calls.find(
      (c) => c.from === 'transactions' && c.op === 'insert',
    )
    expect(insert).toBeDefined()
    // The aporte is a normal transaction row (kind 'expense' is the txn's own
    // kind; the alocação-vs-consumo accounting is the category's kind, applied in
    // the adherence view — pinned by tests/reserva-aporte.test.ts).
    expect(insert!.payload).toMatchObject({
      category_id: CATEGORY_ID,
      amount_cents: 50000,
    })

    const ledger = calls.find(
      (c) => c.from === 'reserva_ledger' && c.op === 'insert',
    )
    expect(ledger).toBeDefined()
    expect(ledger!.payload).toMatchObject({
      user_id: 'user-1',
      reserva_id: RESERVA_ID,
      kind: 'in', // an aporte is an entrada — raises the saldo + alocação total
      amount_cents: 50000,
      transaction_id: 'new-id', // linked to the just-inserted transaction
      occurred_on: '2026-06-10',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/extrato')
    expect(revalidatePath).toHaveBeenCalledWith('/reservas')
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard')
  })

  it('requires a reservaId when the category is Reserva', async () => {
    categoryIsReserva = true
    const r = await createTransactionWithReserva(
      aporteFd({ reservaId: '' }),
    )
    expect(r).toEqual({ error: 'Selecione uma reserva.' })
    // No ledger write happens without a chosen reserva.
    expect(calls.some((c) => c.from === 'reserva_ledger')).toBe(false)
  })

  it('rejects a forged/foreign reservaId before the ledger write (IDOR)', async () => {
    categoryIsReserva = true
    ownedReservaIds = [] // ownership check returns 0 owned for the foreign id
    const r = await createTransactionWithReserva(aporteFd())
    expect(r).toEqual({ error: 'Reserva inválida.' })
    expect(calls.some((c) => c.from === 'reserva_ledger' && c.op === 'insert')).toBe(
      false,
    )
  })

  it('takes the plain createTransaction path (no ledger entry) for a non-Reserva category', async () => {
    categoryIsReserva = false
    const r = await createTransactionWithReserva(
      aporteFd({ reservaId: '' }), // reservaId irrelevant for a non-Reserva category
    )
    expect(r).toEqual({ ok: true })
    const insert = calls.find(
      (c) => c.from === 'transactions' && c.op === 'insert',
    )
    expect(insert).toBeDefined()
    expect(calls.some((c) => c.from === 'reserva_ledger')).toBe(false)
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await createTransactionWithReserva(aporteFd())
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })

  // --- carro_id tagging (CAR-02) ---------------------------------------------

  it('writes carro_id when an owned carro is chosen (free of category)', async () => {
    const r = await createTransactionWithReserva(
      aporteFd({ reservaId: '', carroId: CARRO_ID }),
    )
    expect(r).toEqual({ ok: true })
    const insert = calls.find(
      (c) => c.from === 'transactions' && c.op === 'insert',
    )
    expect(insert).toBeDefined()
    expect(insert!.payload).toMatchObject({ carro_id: CARRO_ID })
  })

  it('inserts carro_id null when no carro is chosen', async () => {
    const r = await createTransactionWithReserva(aporteFd({ reservaId: '' }))
    expect(r).toEqual({ ok: true })
    const insert = calls.find(
      (c) => c.from === 'transactions' && c.op === 'insert',
    )
    expect((insert!.payload as { carro_id: unknown }).carro_id).toBeNull()
    // No carro ownership read happens when there is no carro to tag.
    expect(calls.some((c) => c.from === 'carros')).toBe(false)
  })

  it('rejects a forged/foreign carro before inserting (IDOR no-write)', async () => {
    ownedCarroIds = [] // assertOwnedCarro → 'not-owned'
    const r = await createTransactionWithReserva(
      aporteFd({ reservaId: '', carroId: CARRO_ID }),
    )
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(calls.some((c) => c.from === 'transactions' && c.op === 'insert')).toBe(
      false,
    )
  })

  it('returns a generic retry error on a transient carro ownership failure (WR-04)', async () => {
    carroOwnershipErrors = true // assertOwnedCarro → 'error'
    const r = await createTransactionWithReserva(
      aporteFd({ reservaId: '', carroId: CARRO_ID }),
    )
    expect(r).toEqual({
      error: 'Não foi possível salvar a transação. Tente novamente.',
    })
    expect(calls.some((c) => c.from === 'transactions' && c.op === 'insert')).toBe(
      false,
    )
  })
})

// --- updateTransaction (TXN-02) --------------------------------------------

describe('updateTransaction', () => {
  it('updates the row by id (RLS scopes it to the owner)', async () => {
    const r = await updateTransaction(
      TX_ID,
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
    expect(upd!.filters).toContainEqual(['id', TX_ID])
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
      TX_ID,
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

  it('deletes any linked ledger entry when re-classified AWAY from Reserva (undo)', async () => {
    categoryIsReserva = false // the NEW category is not Reserva
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'Agora um gasto',
        amount: 'R$ 50,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
      }),
    )
    expect(r).toEqual({ ok: true })
    // The sync helper deletes the ledger row for this txn (no orphan, balance
    // re-derives) and inserts NO replacement because the new category isn't Reserva.
    const del = calls.find(
      (c) => c.from === 'reserva_ledger' && c.op === 'delete',
    )
    expect(del).toBeDefined()
    expect(del!.filters).toContainEqual(['transaction_id', TX_ID])
    expect(
      calls.some((c) => c.from === 'reserva_ledger' && c.op === 'insert'),
    ).toBe(false)
    expect(revalidatePath).toHaveBeenCalledWith('/reservas')
  })

  it('re-links a fresh in ledger entry when re-classified INTO Reserva', async () => {
    categoryIsReserva = true
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'Vira aporte',
        amount: 'R$ 80,00',
        categoryId: CATEGORY_ID,
        occurredOn: '2026-06-11',
        reservaId: RESERVA_ID,
      }),
    )
    expect(r).toEqual({ ok: true })
    // Delete-old (idempotent re-link) then insert the fresh 'in' entry.
    const del = calls.find(
      (c) => c.from === 'reserva_ledger' && c.op === 'delete',
    )
    expect(del).toBeDefined()
    expect(del!.filters).toContainEqual(['transaction_id', TX_ID])
    const ins = calls.find(
      (c) => c.from === 'reserva_ledger' && c.op === 'insert',
    )
    expect(ins).toBeDefined()
    expect(ins!.payload).toMatchObject({
      reserva_id: RESERVA_ID,
      kind: 'in',
      amount_cents: 8000,
      transaction_id: TX_ID,
    })
  })

  it('requires a reservaId when re-classified into Reserva', async () => {
    categoryIsReserva = true
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'Vira aporte sem reserva',
        amount: 'R$ 80,00',
        categoryId: CATEGORY_ID,
        occurredOn: '2026-06-11',
      }),
    )
    expect(r).toEqual({ error: 'Selecione uma reserva.' })
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'x',
        amount: 'R$ 10,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
      }),
    )
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })

  // --- carro_id tagging (CAR-02) ---------------------------------------------

  it('writes carro_id when an owned carro is chosen; D4 — other fields unchanged', async () => {
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'Atualizado',
        amount: 'R$ 50,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
        carroId: CARRO_ID,
      }),
    )
    expect(r).toEqual({ ok: true })
    const upd = calls.find((c) => c.from === 'transactions' && c.op === 'update')
    expect(upd!.payload).toMatchObject({
      carro_id: CARRO_ID,
      // D4: tagging does not perturb the accounting fields from the inputs.
      category_id: DEST_CATEGORY,
      amount_cents: 5000,
      occurred_on: '2026-06-11',
      description: 'Atualizado',
    })
  })

  it('clears carro_id to null on an explicit empty carroId without an ownership read', async () => {
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'Atualizado',
        amount: 'R$ 50,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
        carroId: '',
      }),
    )
    expect(r).toEqual({ ok: true })
    const upd = calls.find((c) => c.from === 'transactions' && c.op === 'update')
    expect((upd!.payload as { carro_id: unknown }).carro_id).toBeNull()
    // Clearing is always allowed on own rows — no assertOwnedCarro call.
    expect(calls.some((c) => c.from === 'carros')).toBe(false)
  })

  it('rejects a forged/foreign carro before updating (IDOR no-write)', async () => {
    ownedCarroIds = [] // assertOwnedCarro → 'not-owned'
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'Atualizado',
        amount: 'R$ 50,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
        carroId: CARRO_ID,
      }),
    )
    expect(r).toEqual({ error: 'Carro inválido.' })
    expect(calls.some((c) => c.from === 'transactions' && c.op === 'update')).toBe(
      false,
    )
  })

  it('returns a generic retry error on a transient carro ownership failure (WR-04)', async () => {
    carroOwnershipErrors = true // assertOwnedCarro → 'error'
    const r = await updateTransaction(
      TX_ID,
      fd({
        description: 'Atualizado',
        amount: 'R$ 50,00',
        categoryId: DEST_CATEGORY,
        occurredOn: '2026-06-11',
        carroId: CARRO_ID,
      }),
    )
    expect(r).toEqual({
      error: 'Não foi possível atualizar a transação. Tente novamente.',
    })
    expect(calls.some((c) => c.from === 'transactions' && c.op === 'update')).toBe(
      false,
    )
  })
})

// --- deleteTransaction (TXN-02) --------------------------------------------

describe('deleteTransaction', () => {
  it('deletes the row by id', async () => {
    const r = await deleteTransaction(TX_ID)
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.from === 'transactions' && c.op === 'delete')
    expect(del).toBeDefined()
    expect(del!.filters).toContainEqual(['id', TX_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/extrato')
  })

  it('also deletes any linked ledger entry so the saldo drops immediately', async () => {
    const r = await deleteTransaction(TX_ID)
    expect(r).toEqual({ ok: true })
    const ledgerDel = calls.find(
      (c) => c.from === 'reserva_ledger' && c.op === 'delete',
    )
    expect(ledgerDel).toBeDefined()
    expect(ledgerDel!.filters).toContainEqual(['transaction_id', TX_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/reservas')
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await deleteTransaction(TX_ID)
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})

// --- bulkReclassify (TXN-04) -----------------------------------------------

describe('bulkReclassify', () => {
  it('updates all selected ids to one category in a single .in() update', async () => {
    const ids = TX_IDS
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
    const r = await bulkReclassify([TX_IDS[0]!], 'not-a-uuid')
    expect('error' in r).toBe(true)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('rejects a non-uuid selected id before updating (WR-06)', async () => {
    const r = await bulkReclassify(['not-a-uuid'], DEST_CATEGORY)
    expect('error' in r).toBe(true)
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('rejects a forged/foreign target category before updating (HG-01)', async () => {
    // The ownership check returns 0 owned for the queried target → rejected.
    ownedCategoryIds = []
    const r = await bulkReclassify([TX_IDS[0]!], DEST_CATEGORY)
    expect(r).toEqual({ error: 'Categoria inválida.' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await bulkReclassify([TX_IDS[0]!], DEST_CATEGORY)
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})
