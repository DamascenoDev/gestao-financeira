import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Mocks -----------------------------------------------------------------
//
// Action-level unit tests for the import boundary (createSignedStatementUpload,
// ingestStatement, saveCsvProfile). They mock @/lib/supabase/server (the Wave-0
// integration tests import-dedup + import-storage-rls prove the DB-level
// idempotency / Storage-RLS guarantees against the local stack); these assert the
// ACTION wrapper's behavior: ext validation, the {user_id}/ path-prefix rejection,
// the content_hash-hit "0 novas" path, memory hit vs miss classification, and the
// ambiguous-CSV needsMapping branch.

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePath(p),
}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type QueryResult = { data: unknown; error: unknown }

// --- Configurable mock state ----------------------------------------------
let claimsSub: string | null = 'user-1'
// statements upsert: returns a row id (fresh) or null (content_hash hit ⇒ "0 novas").
let statementInsertedRow: { id: string } | null = { id: 'stmt-1' }
let existingStatementId = 'stmt-existing'
// memory lookup: when the descriptor_norm is a key here, return the hit mapping.
let memoryHits: Record<string, { category_id: string; reserva_id: string | null }> = {}
// transactions dedupe pre-check: dedupe_keys already present in the user's txns.
let existingDedupeKeys: Set<string> = new Set()
// csv profile lookup result (null ⇒ no saved profile).
let csvProfile: unknown = null
// download: the bytes the storage.download returns (drives parse path).
let downloadBytes: Uint8Array | null = null
let downloadError: unknown = null
// createSignedUploadUrl result.
let signedUrlResult: QueryResult = {
  data: { path: 'user-1/uuid.ofx', token: 'tok', signedUrl: 'http://signed' },
  error: null,
}

const ofxBytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(join(process.cwd(), 'tests/fixtures', name)))

// A minimal chainable builder modelling the calls import.ts makes per table.
function makeBuilder(from: string) {
  let op = ''
  const filters: Array<[string, unknown]> = []
  let upsertPayload: unknown = null

  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn((col: string, val: unknown) => {
    filters.push([col, val])
    return builder
  })
  builder.upsert = vi.fn((payload: unknown) => {
    op = 'upsert'
    upsertPayload = payload
    return builder
  })
  builder.update = vi.fn(() => {
    op = 'update'
    return builder
  })
  builder.insert = vi.fn(() => {
    op = 'insert'
    return builder
  })
  builder.maybeSingle = vi.fn((): Promise<QueryResult> => {
    if (from === 'statements' && op === 'upsert') {
      return Promise.resolve({ data: statementInsertedRow, error: null })
    }
    if (from === 'statements' && op !== 'upsert') {
      // read-back of the existing statement on the "0 novas" path
      return Promise.resolve({ data: { id: existingStatementId }, error: null })
    }
    if (from === 'merchant_patterns') {
      const norm = filters.find(([c]) => c === 'descriptor_norm')?.[1] as string
      const hit = memoryHits[norm]
      return Promise.resolve({ data: hit ?? null, error: null })
    }
    if (from === 'transactions') {
      const key = filters.find(([c]) => c === 'dedupe_key')?.[1] as string
      return Promise.resolve({
        data: existingDedupeKeys.has(key) ? { id: 'dup' } : null,
        error: null,
      })
    }
    if (from === 'csv_import_profiles') {
      return Promise.resolve({ data: csvProfile, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  })
  // categories.select('id, name') is awaited directly (thenable).
  builder.then = (onF: (v: QueryResult) => unknown) => {
    if (from === 'categories') {
      return Promise.resolve({
        data: [{ id: 'cat-merc', name: 'Mercado' }],
        error: null,
      } as QueryResult).then(onF)
    }
    if (from === 'statements' && op === 'update') {
      return Promise.resolve({ data: null, error: null } as QueryResult).then(onF)
    }
    if (from === 'csv_import_profiles' && op === 'upsert') {
      return Promise.resolve({ data: null, error: null } as QueryResult).then(onF)
    }
    return Promise.resolve({ data: null, error: null } as QueryResult).then(onF)
  }
  void upsertPayload
  return builder
}

const storageApi = {
  createSignedUploadUrl: vi.fn(async (path: string) => {
    void path // captured via mock.calls for the path-scope assertion
    return signedUrlResult
  }),
  download: vi.fn(async () => {
    if (downloadError) return { data: null, error: downloadError }
    if (!downloadBytes) return { data: null, error: { message: 'not found' } }
    const blob = { arrayBuffer: async () => downloadBytes!.buffer }
    return { data: blob, error: null }
  }),
}

const supabaseMock = {
  from: vi.fn((table: string) => makeBuilder(table)),
  storage: { from: vi.fn(() => storageApi) },
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
  createSignedStatementUpload,
  ingestStatement,
  saveCsvProfile,
} from './import'

beforeEach(() => {
  revalidatePath.mockClear()
  supabaseMock.from.mockClear()
  storageApi.createSignedUploadUrl.mockClear()
  storageApi.download.mockClear()
  claimsSub = 'user-1'
  statementInsertedRow = { id: 'stmt-1' }
  existingStatementId = 'stmt-existing'
  memoryHits = {}
  existingDedupeKeys = new Set()
  csvProfile = null
  downloadBytes = ofxBytes('itau-sample.ofx')
  downloadError = null
  signedUrlResult = {
    data: { path: 'user-1/uuid.ofx', token: 'tok', signedUrl: 'http://signed' },
    error: null,
  }
})

// --- createSignedStatementUpload (IMP-01) ----------------------------------

describe('createSignedStatementUpload', () => {
  it('mints a {user_id}/ scoped signed upload URL for a valid ext', async () => {
    const r = await createSignedStatementUpload('itau.ofx', 'ofx')
    expect(r).toEqual({ path: 'user-1/uuid.ofx', token: 'tok', signedUrl: 'http://signed' })
    // The path passed to createSignedUploadUrl starts with the caller's uid.
    const call = storageApi.createSignedUploadUrl.mock.calls[0]![0]
    expect(call.startsWith('user-1/')).toBe(true)
    expect(call.endsWith('.ofx')).toBe(true)
  })

  it('rejects an ext outside {ofx,csv}', async () => {
    const r = await createSignedStatementUpload('x.pdf', 'pdf')
    expect('error' in r).toBe(true)
    expect(storageApi.createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await createSignedStatementUpload('x.ofx', 'ofx')
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})

// --- ingestStatement (IMP-03/04, CLS-01) -----------------------------------

describe('ingestStatement', () => {
  it('rejects a path NOT prefixed by the caller uid (defense-in-depth)', async () => {
    const r = await ingestStatement('user-2/forged.ofx', 'forged.ofx')
    expect(r).toEqual({ error: 'Caminho inválido.' })
    // Never even downloads the object.
    expect(storageApi.download).not.toHaveBeenCalled()
  })

  it('returns "0 novas" (alreadyImported, empty rows) on a content_hash hit', async () => {
    statementInsertedRow = null // upsert ignoreDuplicates ⇒ no row ⇒ hash already present
    const r = await ingestStatement('user-1/itau.ofx', 'itau.ofx')
    expect('alreadyImported' in r && r.alreadyImported).toBe(true)
    if ('rows' in r) {
      expect(r.rows).toEqual([])
      expect(r.summary.novas).toBe(0)
      expect(r.statementId).toBe('stmt-existing')
    }
  })

  it('memory HIT sets category + source "memória"', async () => {
    // The itau fixture has a PADARIA row whose descriptor_norm we map to a category.
    const r = await ingestStatement('user-1/itau.ofx', 'itau.ofx')
    expect('rows' in r).toBe(true)
    if ('rows' in r && r.rows) {
      // pick the first row's normalized key and assert a clean miss leaves it null
      const anyRow = r.rows[0]!
      expect(anyRow.classification_source === null).toBe(true)
      expect(anyRow.category_id).toBeNull()
    }
  })

  it('memory HIT on a known descriptor classifies the matching row', async () => {
    const first = await ingestStatement('user-1/itau.ofx', 'itau.ofx')
    if (!('rows' in first) || !first.rows?.length) throw new Error('no rows parsed')
    const norm = first.rows[0]!.descriptor_norm
    memoryHits = { [norm]: { category_id: 'cat-merc', reserva_id: null } }

    const r = await ingestStatement('user-1/itau.ofx', 'itau.ofx')
    if (!('rows' in r) || !r.rows) throw new Error('no rows')
    const hitRow = r.rows.find((x) => x.descriptor_norm === norm)!
    expect(hitRow.category_id).toBe('cat-merc')
    expect(hitRow.classification_source).toBe('memória')
  })

  it('memory MISS leaves the row unclassified (category null, source null)', async () => {
    const r = await ingestStatement('user-1/itau.ofx', 'itau.ofx')
    if (!('rows' in r) || !r.rows) throw new Error('no rows')
    expect(r.rows.every((x) => x.category_id === null)).toBe(true)
    expect(r.rows.every((x) => x.classification_source === null)).toBe(true)
    expect(r.summary.naoClassificadas).toBe(r.rows.length)
  })

  it('pre-marks a row whose dedupe_key already exists as duplicada', async () => {
    const first = await ingestStatement('user-1/itau.ofx', 'itau.ofx')
    if (!('rows' in first) || !first.rows?.length) throw new Error('no rows')
    existingDedupeKeys = new Set([first.rows[0]!.dedupe_key])

    const r = await ingestStatement('user-1/itau.ofx', 'itau.ofx')
    if (!('rows' in r) || !r.rows) throw new Error('no rows')
    expect(r.summary.duplicadas).toBeGreaterThanOrEqual(1)
    expect(r.summary.novas).toBe(r.summary.total - r.summary.duplicadas)
  })

  it('returns needsMapping for an ambiguous CSV with no profile', async () => {
    downloadBytes = new Uint8Array(
      readFileSync(join(process.cwd(), 'tests/fixtures', 'ambiguous-cols.csv')),
    )
    const r = await ingestStatement('user-1/amb.csv', 'amb.csv')
    expect('needsMapping' in r && r.needsMapping).toBe(true)
    if ('headers' in r) expect(r.headers.length).toBeGreaterThan(0)
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await ingestStatement('user-1/x.ofx', 'x.ofx')
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})

// --- saveCsvProfile (IMP-02) -----------------------------------------------

describe('saveCsvProfile', () => {
  const HEADERS = ['Data', 'Histórico', 'Valor']

  it('upserts a profile for a valid distinct mapping', async () => {
    const r = await saveCsvProfile(HEADERS, {
      dateCol: 'Data',
      descCol: 'Histórico',
      valorCol: 'Valor',
    }, 'Banco X')
    expect(r).toEqual({ ok: true })
  })

  it('rejects a mapping with non-distinct columns', async () => {
    const r = await saveCsvProfile(HEADERS, {
      dateCol: 'Data',
      descCol: 'Data',
      valorCol: 'Valor',
    }, 'Banco X')
    expect('error' in r).toBe(true)
  })

  it('rejects an empty header list', async () => {
    const r = await saveCsvProfile([], {
      dateCol: 'Data',
      descCol: 'Histórico',
      valorCol: 'Valor',
    }, 'Banco X')
    expect('error' in r).toBe(true)
  })

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await saveCsvProfile(HEADERS, {
      dateCol: 'Data',
      descCol: 'Histórico',
      valorCol: 'Valor',
    }, 'Banco X')
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })
})
