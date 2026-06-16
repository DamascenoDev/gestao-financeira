import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the income materialize-on-read + CRUD boundary.
// They mock @/lib/supabase/server (the Wave-0 integration tests in tests/ prove
// the DB-level RLS / unique-constraint / view guarantees against the local stack;
// these assert the ACTION wrapper's behavior: Zod validation, money parsing,
// occurred_on derivation/clamping, the idempotent upsert shape (onConflict +
// ignoreDuplicates), INC-02 occurrence-only edits, avulsa month_key derivation).

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}))

// Chainable Supabase query-builder mock. Each table op records the call and
// returns a thenable resolving to the configured result.
type QueryResult = { data: unknown; error: unknown }

const calls: {
  from: string
  op: string
  payload?: unknown
  options?: unknown
  filters: Array<[string, unknown]>
}[] = []

let templatesResult: QueryResult = { data: [], error: null }
let upsertResult: QueryResult = { data: null, error: null }
let insertResult: QueryResult = { data: { id: 'new-id' }, error: null }
let updateResult: QueryResult = { data: null, error: null }
let deleteResult: QueryResult = { data: null, error: null }
let claimsSub: string | null = 'user-1'

function makeBuilder(from: string) {
  const record: (typeof calls)[number] = { from, op: '', filters: [] }
  let resolveResult: QueryResult = { data: null, error: null }

  const builder: Record<string, unknown> = {}
  const chain = () => builder

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
  builder.single = vi.fn(() => {
    if (record.op === 'insert') return Promise.resolve(insertResult)
    return Promise.resolve(resolveResult)
  })
  // Make the builder awaitable for the non-.single() paths (select templates,
  // update/upsert/delete terminal calls).
  builder.then = (onF: (v: QueryResult) => unknown) => {
    if (record.op === 'select' && from === 'income_templates') {
      return Promise.resolve(templatesResult).then(onF)
    }
    return Promise.resolve(resolveResult).then(onF)
  }

  calls.push(record)
  void chain
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
  ensureMonthOccurrences,
  createIncomeTemplate,
  createAdhocIncome,
  updateOccurrence,
  updateTemplate,
  deleteOccurrence,
} from './incomes'

function fd(fields: Record<string, string>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeEach(() => {
  calls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  templatesResult = { data: [], error: null }
  upsertResult = { data: null, error: null }
  insertResult = { data: { id: 'new-id' }, error: null }
  updateResult = { data: null, error: null }
  deleteResult = { data: null, error: null }
  claimsSub = 'user-1'
})

// --- ensureMonthOccurrences (INC-01 materialize-on-read) --------------------

describe('ensureMonthOccurrences', () => {
  it('is a no-op when there are no active templates', async () => {
    templatesResult = { data: [], error: null }
    await ensureMonthOccurrences('2026-06')
    const upserts = calls.filter((c) => c.op === 'upsert')
    expect(upserts).toHaveLength(0)
  })

  it('upserts one occurrence per active template with the idempotent conflict shape', async () => {
    templatesResult = {
      data: [
        { id: 't1', user_id: 'user-1', source: 'Salário', amount_cents: 500000, day_of_month: 5 },
        { id: 't2', user_id: 'user-1', source: 'Pensão', amount_cents: 120000, day_of_month: 31 },
      ],
      error: null,
    }
    await ensureMonthOccurrences('2026-06')
    const upsert = calls.find((c) => c.op === 'upsert')
    expect(upsert).toBeDefined()
    expect(upsert!.from).toBe('income_occurrences')
    // Idempotent materialize: ignoreDuplicates so re-open never clobbers an INC-02 edit.
    expect(upsert!.options).toMatchObject({
      onConflict: 'user_id,template_id,month_key',
      ignoreDuplicates: true,
    })
    const rows = upsert!.payload as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      template_id: 't1',
      source: 'Salário',
      amount_cents: 500000,
      month_key: '2026-06',
      occurred_on: '2026-06-05',
    })
  })

  it('clamps day_of_month to the last civil day of a short month (Feb)', async () => {
    templatesResult = {
      data: [
        { id: 't1', user_id: 'user-1', source: 'Salário', amount_cents: 100, day_of_month: 31 },
      ],
      error: null,
    }
    await ensureMonthOccurrences('2026-02')
    const upsert = calls.find((c) => c.op === 'upsert')
    const rows = upsert!.payload as Array<Record<string, unknown>>
    expect(rows[0]!.occurred_on).toBe('2026-02-28')
  })
})

// --- createIncomeTemplate (INC-01) ------------------------------------------

describe('createIncomeTemplate', () => {
  it('inserts a template then materializes the current month occurrence', async () => {
    const r = await createIncomeTemplate(
      fd({ source: 'Salário', amount: 'R$ 5.000,00', dayOfMonth: '5', monthKey: '2026-06' }),
    )
    expect(r).toEqual({ ok: true })
    const tplInsert = calls.find((c) => c.from === 'income_templates' && c.op === 'insert')
    expect(tplInsert).toBeDefined()
    expect(tplInsert!.payload).toMatchObject({
      user_id: 'user-1',
      source: 'Salário',
      amount_cents: 500000,
      day_of_month: 5,
    })
    // The new template's occurrence is materialized for the month.
    const occUpsert = calls.find((c) => c.from === 'income_occurrences' && c.op === 'upsert')
    expect(occUpsert).toBeDefined()
    expect(revalidatePath).toHaveBeenCalledWith('/receitas')
  })

  it('rejects an invalid money string before inserting', async () => {
    const r = await createIncomeTemplate(
      fd({ source: 'Salário', amount: 'abc', dayOfMonth: '5', monthKey: '2026-06' }),
    )
    expect(r).toEqual({ error: 'Valor monetário inválido.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects a missing source via Zod before touching the DB', async () => {
    const r = await createIncomeTemplate(
      fd({ source: '', amount: 'R$ 10,00', dayOfMonth: '5', monthKey: '2026-06' }),
    )
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })
})

// --- createAdhocIncome (INC-03) ---------------------------------------------

describe('createAdhocIncome', () => {
  it('inserts an occurrence with template_id NULL and month_key derived from occurred_on', async () => {
    const r = await createAdhocIncome(
      fd({ source: 'Venda', amount: 'R$ 100,00', occurredOn: '2026-06-15' }),
    )
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.from === 'income_occurrences' && c.op === 'insert')
    expect(insert).toBeDefined()
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      template_id: null,
      source: 'Venda',
      amount_cents: 10000,
      month_key: '2026-06', // derived server-side, never user-set
      occurred_on: '2026-06-15',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/receitas')
  })

  it('rejects a malformed date via Zod', async () => {
    const r = await createAdhocIncome(
      fd({ source: 'Venda', amount: 'R$ 100,00', occurredOn: '15/06/2026' }),
    )
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })
})

// --- updateOccurrence (INC-02 — touches only the occurrence) ----------------

describe('updateOccurrence', () => {
  it('updates only the income_occurrences row, never the template', async () => {
    const r = await updateOccurrence('occ-1', fd({ amount: 'R$ 4.500,00' }))
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('income_occurrences')
    expect(update!.payload).toMatchObject({ amount_cents: 450000 })
    expect(update!.filters).toContainEqual(['id', 'occ-1'])
    // No write ever lands on income_templates.
    expect(calls.find((c) => c.from === 'income_templates' && c.op !== 'select')).toBeUndefined()
  })
})

// --- updateTemplate ---------------------------------------------------------

describe('updateTemplate', () => {
  it('updates the template row (future months) and not occurrences', async () => {
    const r = await updateTemplate(
      't1',
      fd({ source: 'Salário', amount: 'R$ 6.000,00', dayOfMonth: '10' }),
    )
    expect(r).toEqual({ ok: true })
    const update = calls.find((c) => c.op === 'update')
    expect(update!.from).toBe('income_templates')
    expect(update!.payload).toMatchObject({
      source: 'Salário',
      amount_cents: 600000,
      day_of_month: 10,
    })
    expect(update!.filters).toContainEqual(['id', 't1'])
  })
})

// --- deleteOccurrence -------------------------------------------------------

describe('deleteOccurrence', () => {
  it('deletes a single occurrence by id', async () => {
    const r = await deleteOccurrence('occ-9')
    expect(r).toEqual({ ok: true })
    const del = calls.find((c) => c.op === 'delete')
    expect(del!.from).toBe('income_occurrences')
    expect(del!.filters).toContainEqual(['id', 'occ-9'])
    expect(revalidatePath).toHaveBeenCalledWith('/receitas')
  })
})

// --- auth gate --------------------------------------------------------------

describe('session gate', () => {
  it('returns a friendly error when there is no authenticated user', async () => {
    claimsSub = null
    const r = await createAdhocIncome(
      fd({ source: 'Venda', amount: 'R$ 100,00', occurredOn: '2026-06-15' }),
    )
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})
