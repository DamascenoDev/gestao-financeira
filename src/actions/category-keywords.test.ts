import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the keyword CRUD (KW-01/KW-06). Mirrors the
// makeBuilder/supabaseMock harness from categories.test.ts: it mocks
// @/lib/supabase/server and asserts the ACTION wrapper's behavior — Zod
// validation, normalization (via the REAL normalizeDescriptor, not mocked),
// the maybeSingle duplicate pre-check, the 23505 unique-violation backstop,
// the WR-06 uuid guard on row ids, the getClaims() owner/session gate, and
// revalidatePath('/categorias').
//
// Delta vs the categories.test.ts harness: the builder gains a settable
// `maybeSingle` (the dup pre-check) and `insertResult` carries a 23505 error
// variant so BOTH duplicate paths (pre-check + race backstop) are covered.

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

let insertResult: QueryResult = { data: { id: 'new-id' }, error: null }
let deleteResult: QueryResult = { data: null, error: null }
// The maybeSingle() dup pre-check result. Default = no existing row (happy add).
let dupPreCheckResult: QueryResult = { data: null, error: null }
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
  builder.delete = vi.fn(() => {
    record.op = 'delete'
    resolveResult = deleteResult
    return builder
  })
  // The dup pre-check terminal: select(...).eq(...).eq(...).maybeSingle().
  builder.maybeSingle = vi.fn(() => Promise.resolve(dupPreCheckResult))
  builder.single = vi.fn(() => Promise.resolve(resolveResult))
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

import { addKeyword, removeKeyword } from './category-keywords'
// REAL normalize fns — deterministic + already unit-tested. normalizeKeyword is
// what addKeyword now uses (KW-09): it keeps the glob `*` while staying in the
// same key space as descriptor_norm (Phase 20 match) for non-wildcard input.
import { normalizeDescriptor, normalizeKeyword } from '@/lib/normalize'

// Real UUIDs — the id-arg actions reject non-UUID ids (WR-06).
const CAT_ID = '11111111-1111-4111-8111-111111111111'
const KW_ID = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  calls.length = 0
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  insertResult = { data: { id: 'new-id' }, error: null }
  deleteResult = { data: null, error: null }
  dupPreCheckResult = { data: null, error: null }
  claimsSub = 'user-1'
})

// --- addKeyword -------------------------------------------------------------

describe('addKeyword', () => {
  it('inserts a normalized keyword with the owner and revalidates', async () => {
    const r = await addKeyword(CAT_ID, 'uber')
    expect(r).toEqual({ ok: true })
    const insert = calls.find(
      (c) => c.from === 'category_keywords' && c.op === 'insert',
    )
    expect(insert).toBeDefined()
    expect(insert!.payload).toMatchObject({
      user_id: 'user-1',
      category_id: CAT_ID,
      keyword: 'uber',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/categorias')
  })

  it('normalizes the input via the real normalizeKeyword before insert', async () => {
    // A non-wildcard input normalizes the SAME as descriptor (same key space).
    const raw = 'Mercado Livre  SAO PAULO BR'
    const r = await addKeyword(CAT_ID, raw)
    expect(r).toEqual({ ok: true })
    const insert = calls.find(
      (c) => c.from === 'category_keywords' && c.op === 'insert',
    )
    expect(insert).toBeDefined()
    const stored = (insert!.payload as { keyword: string }).keyword
    expect(stored).toBe(normalizeKeyword(raw))
    // For a non-wildcard keyword the key space matches descriptor_norm exactly.
    expect(stored).toBe(normalizeDescriptor(raw))
    // Sanity: the raw form is NOT what was stored.
    expect(stored).not.toBe(raw)
  })

  it('KW-09 GATE: a `UBER*` keyword reaches the DB STILL containing `*`', async () => {
    // The highest-value assertion of Phase 21: without normalizeKeyword the `*`
    // would be stripped and the wildcard could never be persisted.
    const r = await addKeyword(CAT_ID, 'UBER*')
    expect(r).toEqual({ ok: true })
    const insert = calls.find(
      (c) => c.from === 'category_keywords' && c.op === 'insert',
    )
    expect(insert).toBeDefined()
    const stored = (insert!.payload as { keyword: string }).keyword
    expect(stored).toContain('*')
    expect(stored).toBe('uber*')
  })

  it('regression: a plain `mercado` keyword is stored unchanged (substring v1.5 intact)', async () => {
    const r = await addKeyword(CAT_ID, 'mercado')
    expect(r).toEqual({ ok: true })
    const insert = calls.find((c) => c.op === 'insert')
    expect((insert!.payload as { keyword: string }).keyword).toBe('mercado')
  })

  it('rejects a lone `*` (literal-count-0) with a pt-BR message and NO insert', async () => {
    const r = await addKeyword(CAT_ID, '*')
    expect(r).toHaveProperty('error')
    // Not the empty-validation message — this is the dedicated literal-count-0 guard.
    expect((r as { error: string }).error).not.toBe('Informe uma palavra-chave.')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects `**` (only-wildcard, zero literals) with NO insert', async () => {
    const r = await addKeyword(CAT_ID, '**')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects an empty keyword via Zod before touching the DB', async () => {
    const r = await addKeyword(CAT_ID, '')
    expect(r).toEqual({ error: 'Informe uma palavra-chave.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects a whitespace-only keyword (empty) before touching the DB', async () => {
    const r = await addKeyword(CAT_ID, '   ')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects punctuation-only input that normalizes to an empty string', async () => {
    // "/" passes the raw min(1) Zod check but normalizes to '' (no `*` to keep).
    const r = await addKeyword(CAT_ID, '/')
    expect(r).toEqual({ error: 'Informe uma palavra-chave.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects `***` (only-wildcard) via the literal-count-0 guard, NOT the empty guard', async () => {
    // With normalizeKeyword the `*` survives, so this is the literal-count-0 case.
    const r = await addKeyword(CAT_ID, '***')
    expect(r).toHaveProperty('error')
    expect((r as { error: string }).error).not.toBe('Informe uma palavra-chave.')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('rejects a too-long keyword (>60) via Zod with no insert', async () => {
    const r = await addKeyword(CAT_ID, 'a'.repeat(61))
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('returns { duplicate: true } via the maybeSingle pre-check and does NOT insert', async () => {
    dupPreCheckResult = { data: { id: KW_ID }, error: null }
    const r = await addKeyword(CAT_ID, 'uber')
    expect(r).toEqual({ duplicate: true })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('returns { duplicate: true } via the 23505 backstop when the insert races', async () => {
    dupPreCheckResult = { data: null, error: null }
    insertResult = { data: null, error: { code: '23505', message: 'dup' } }
    const r = await addKeyword(CAT_ID, 'uber')
    expect(r).toEqual({ duplicate: true })
  })

  it('maps a non-23505 insert error to a friendly pt-BR message (no raw leak)', async () => {
    insertResult = { data: null, error: { code: '23502', message: 'boom' } }
    const r = await addKeyword(CAT_ID, 'uber')
    expect(r).toEqual({ error: 'Não foi possível salvar a palavra-chave.' })
  })

  it('rejects a non-uuid categoryId before the DB (WR-06)', async () => {
    const r = await addKeyword('not-a-uuid', 'uber')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('returns the session error when there is no authenticated user', async () => {
    claimsSub = null
    const r = await addKeyword(CAT_ID, 'uber')
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('carries user_id from getClaims on the insert payload (with-check half / owner)', async () => {
    await addKeyword(CAT_ID, 'uber')
    const insert = calls.find((c) => c.op === 'insert')
    expect((insert!.payload as { user_id: string }).user_id).toBe('user-1')
  })
})

// --- removeKeyword ----------------------------------------------------------

describe('removeKeyword', () => {
  it('deletes the keyword by id and revalidates', async () => {
    const r = await removeKeyword(KW_ID)
    expect(r).toEqual({ ok: true })
    const del = calls.find(
      (c) => c.from === 'category_keywords' && c.op === 'delete',
    )
    expect(del).toBeDefined()
    expect(del!.filters).toContainEqual(['id', KW_ID])
    expect(revalidatePath).toHaveBeenCalledWith('/categorias')
  })

  it('rejects a non-uuid keywordId before the DB (WR-06)', async () => {
    const r = await removeKeyword('not-a-uuid')
    expect(r).toHaveProperty('error')
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('maps a delete error to a friendly pt-BR message (no raw leak)', async () => {
    deleteResult = { data: null, error: { message: 'boom' } }
    const r = await removeKeyword(KW_ID)
    expect(r).toEqual({ error: 'Não foi possível remover a palavra-chave.' })
  })

  it('returns the session error when there is no authenticated user', async () => {
    claimsSub = null
    const r = await removeKeyword(KW_ID)
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'delete')).toBeUndefined()
  })
})
