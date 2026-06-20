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
//
// Delta for KW-08 (this plan): getKeywordSuggestions issues THREE select reads
// (merchant_patterns, category_keywords, categories). A settable per-table
// `readResults` map lets a test supply each read's data; a select-only builder
// resolves its terminal to `readResults[from]` when present, else falls back to
// the prior shared `resolveResult` (so the existing addKeyword/removeKeyword
// suites are unaffected). insert/delete ops still win via their own results.

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
// KW-08: per-table read data for the three getKeywordSuggestions selects. A table
// with no entry falls back to the shared resolveResult (prior behavior).
let readResults: Record<string, QueryResult> = {}
// KW-08: a per-call dup pre-check override (FIFO). Lets approveKeywordSuggestions
// tests make ONLY the first item a duplicate while a later item is novel. Each
// maybeSingle() shifts one entry; when empty it falls back to dupPreCheckResult.
let dupPreCheckQueue: QueryResult[] = []
// KW-08: a per-insert result override (FIFO), same idea for the insert terminal —
// lets one item's insert race (23505) while another succeeds. Falls back to
// insertResult when empty.
let insertResultQueue: QueryResult[] = []

function makeBuilder(from: string) {
  const record: (typeof calls)[number] = { from, op: '', filters: [] }
  let resolveResult: QueryResult = { data: null, error: null }
  // True once insert/delete ran — those terminal results win over any read map.
  let isWrite = false

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
    isWrite = true
    // Per-insert override (FIFO) for batch tests, else the shared insertResult.
    resolveResult = insertResultQueue.length > 0 ? insertResultQueue.shift()! : insertResult
    return builder
  })
  builder.delete = vi.fn(() => {
    record.op = 'delete'
    isWrite = true
    resolveResult = deleteResult
    return builder
  })
  // The dup pre-check terminal: select(...).eq(...).eq(...).maybeSingle().
  // Per-call override (FIFO) for batch tests, else the shared dupPreCheckResult.
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve(
      dupPreCheckQueue.length > 0 ? dupPreCheckQueue.shift()! : dupPreCheckResult,
    ),
  )
  builder.single = vi.fn(() => Promise.resolve(resolveResult))
  // A select read resolves to its per-table entry (KW-08) unless this builder did
  // an insert/delete (those win); writes and unmapped tables keep prior behavior.
  builder.then = (onF: (v: QueryResult) => unknown) => {
    const mapped = !isWrite ? readResults[from] : undefined
    const result = mapped ?? resolveResult
    return Promise.resolve(result).then(onF)
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
  addKeyword,
  removeKeyword,
  getKeywordSuggestions,
  approveKeywordSuggestions,
} from './category-keywords'
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
  readResults = {}
  dupPreCheckQueue = []
  insertResultQueue = []
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

// --- getKeywordSuggestions --------------------------------------------------

const CAT_ID_2 = '22222222-2222-4222-8222-222222222222'

describe('getKeywordSuggestions', () => {
  it('excludes descriptors already covered by an existing keyword (matchKeyword) and returns the candidate shape', async () => {
    readResults = {
      merchant_patterns: {
        data: [
          { descriptor_norm: 'uber trip sp', category_id: CAT_ID, hit_count: 3 },
          { descriptor_norm: 'padaria centro', category_id: CAT_ID, hit_count: 1 },
        ],
        error: null,
      },
      // An existing keyword 'uber' covers 'uber trip sp' via the real matchKeyword.
      category_keywords: {
        data: [{ category_id: CAT_ID, keyword: 'uber' }],
        error: null,
      },
      categories: {
        data: [{ id: CAT_ID, name: 'Transporte', sort: 0 }],
        error: null,
      },
    }

    const r = await getKeywordSuggestions()
    expect('suggestions' in r).toBe(true)
    const { suggestions } = r as { suggestions: unknown[] }
    // 'uber trip sp' is covered → excluded; only 'padaria centro' remains.
    expect(suggestions).toEqual([
      {
        descriptorNorm: 'padaria centro',
        categoryId: CAT_ID,
        categoryName: 'Transporte',
        hitCount: 1,
      },
    ])
    // Read-only: no revalidate.
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('sorts remaining candidates by hit_count desc', async () => {
    readResults = {
      merchant_patterns: {
        data: [
          { descriptor_norm: 'mercado a', category_id: CAT_ID, hit_count: 2 },
          { descriptor_norm: 'mercado b', category_id: CAT_ID, hit_count: 5 },
        ],
        error: null,
      },
      category_keywords: { data: [], error: null },
      categories: {
        data: [{ id: CAT_ID, name: 'Mercado', sort: 0 }],
        error: null,
      },
    }

    const r = await getKeywordSuggestions()
    const { suggestions } = r as { suggestions: { hitCount: number }[] }
    expect(suggestions.map((s) => s.hitCount)).toEqual([5, 2])
  })

  it('returns the session error when there is no authenticated user', async () => {
    claimsSub = null
    const r = await getKeywordSuggestions()
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

// --- approveKeywordSuggestions ----------------------------------------------

describe('approveKeywordSuggestions', () => {
  it('creates the selected candidates with the owner and revalidates ONCE', async () => {
    const r = await approveKeywordSuggestions([
      { categoryId: CAT_ID, keyword: 'uber' },
      { categoryId: CAT_ID_2, keyword: 'ifood' },
    ])
    expect(r).toEqual({ ok: true, created: 2, skipped: 0 })

    const inserts = calls.filter(
      (c) => c.from === 'category_keywords' && c.op === 'insert',
    )
    expect(inserts).toHaveLength(2)
    expect(inserts[0]!.payload).toMatchObject({
      user_id: 'user-1',
      category_id: CAT_ID,
      keyword: 'uber',
    })
    expect(inserts[1]!.payload).toMatchObject({
      user_id: 'user-1',
      category_id: CAT_ID_2,
      keyword: 'ifood',
    })
    // ONE revalidate for the whole batch.
    expect(revalidatePath).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/categorias')
  })

  it('a duplicate item is counted as skipped and never aborts the batch', async () => {
    // First item's dup pre-check finds an existing row → skipped; second is novel.
    dupPreCheckQueue = [
      { data: { id: KW_ID }, error: null }, // item 1: existing → skip
      { data: null, error: null }, // item 2: novel → insert
    ]
    const r = await approveKeywordSuggestions([
      { categoryId: CAT_ID, keyword: 'uber' },
      { categoryId: CAT_ID, keyword: 'ifood' },
    ])
    expect(r).toEqual({ ok: true, created: 1, skipped: 1 })

    const inserts = calls.filter((c) => c.op === 'insert')
    expect(inserts).toHaveLength(1)
    expect((inserts[0]!.payload as { keyword: string }).keyword).toBe('ifood')
    expect(revalidatePath).toHaveBeenCalledTimes(1)
  })

  it('a 23505 insert race is counted as skipped while a sibling still inserts', async () => {
    // Both novel at pre-check; the FIRST insert races (23505) → skip, second ok.
    insertResultQueue = [
      { data: null, error: { code: '23505', message: 'dup' } },
      { data: { id: 'new-id' }, error: null },
    ]
    const r = await approveKeywordSuggestions([
      { categoryId: CAT_ID, keyword: 'uber' },
      { categoryId: CAT_ID, keyword: 'ifood' },
    ])
    expect(r).toEqual({ ok: true, created: 1, skipped: 1 })
  })

  it('an invalid item (bad uuid / literal-count-0 term) is skipped, the rest proceed', async () => {
    const r = await approveKeywordSuggestions([
      { categoryId: 'not-a-uuid', keyword: 'x' }, // bad uuid → skip, no DB
      { categoryId: CAT_ID, keyword: '*' }, // literal-count-0 → skip, no DB
      { categoryId: CAT_ID, keyword: 'mercado' }, // valid → insert
    ])
    expect(r).toEqual({ ok: true, created: 1, skipped: 2 })

    const inserts = calls.filter((c) => c.op === 'insert')
    expect(inserts).toHaveLength(1)
    expect((inserts[0]!.payload as { keyword: string }).keyword).toBe('mercado')
  })

  it('empty items array → { ok: true, created: 0, skipped: 0 } with no DB call and no revalidate', async () => {
    const r = await approveKeywordSuggestions([])
    expect(r).toEqual({ ok: true, created: 0, skipped: 0 })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns the session error with no authenticated user and writes nothing', async () => {
    claimsSub = null
    const r = await approveKeywordSuggestions([
      { categoryId: CAT_ID, keyword: 'uber' },
    ])
    expect(r).toEqual({ error: 'Sessão expirada.' })
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined()
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
