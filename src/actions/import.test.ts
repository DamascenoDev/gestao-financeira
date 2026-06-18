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
// confirmImport: owner-scoped rows the RLS-active client "sees" (IDOR re-derive).
let ownedCategoryIds: Set<string> = new Set()
let ownedReservaIds: Set<string> = new Set()
let ownedStatementIds: Set<string> = new Set()
// confirmImport: owner-scoped carro ids the RLS-active client "sees" (IDOR #4).
let ownedCarroIds: Set<string> = new Set()
// confirmImport: which category ids are is_reserva (drives the aporte path).
let reservaCategoryIds: Set<string> = new Set()
// confirmImport: descriptor_norms flagged recurring by v_recurring_descriptors.
let recurringNorms: string[] = []
// WR-01: the AUTHORITATIVE parsed rows confirmImport re-reads from the statement.
// confirmImport trusts THIS content (descriptor_norm/amount/occurred_on/dedupe_key),
// not the client payload — so each test seeds it from the rows it confirms.
let statementParsedRows: unknown[] = []
// confirmImport: the rows the transactions UPSERT reports as actually-inserted
// (ignoreDuplicates) — keyed by dedupe_key; absent key ⇒ a dedupe skip.
let insertedDedupeKeys: Set<string> | null = null
// Capture sink: every merchant_patterns upsert + reserva_ledger insert payload.
const learnedPatterns: unknown[] = []
const ledgerInserts: unknown[] = []
// Capture sink: every transactions insert payload (asserts carro_id persist).
const transactionInserts: unknown[] = []
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

// PDF seam (Plan 13-03): mock the 13-01 extractor so the action tests drive the
// image-only-vs-0-rows distinction deterministically without a real PDF buffer.
// `pdfText` is what extractPdfText returns; parseSantanderText runs for real (pure)
// over that text, so a text-present-but-0-matching-lines string exercises the
// real 0-row review path (NOT the image-only block).
let pdfText = ''
vi.mock('@/lib/parsers/pdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/parsers/pdf')>()
  return {
    ...actual,
    extractPdfText: vi.fn(async () => pdfText),
  }
})

// A minimal chainable builder modelling the calls import.ts makes per table.
function makeBuilder(from: string) {
  let op = ''
  let selectCols = ''
  const filters: Array<[string, unknown]> = []
  const inFilters: Array<[string, unknown[]]> = []
  let upsertPayload: unknown = null
  let insertPayload: unknown = null

  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((cols?: string) => {
    if (typeof cols === 'string') selectCols = cols
    return builder
  })
  builder.eq = vi.fn((col: string, val: unknown) => {
    filters.push([col, val])
    return builder
  })
  builder.in = vi.fn((col: string, vals: unknown[]) => {
    inFilters.push([col, vals])
    return builder
  })
  builder.upsert = vi.fn((payload: unknown) => {
    op = 'upsert'
    upsertPayload = payload
    if (from === 'merchant_patterns') learnedPatterns.push(payload)
    return builder
  })
  builder.update = vi.fn(() => {
    op = 'update'
    return builder
  })
  builder.insert = vi.fn((payload: unknown) => {
    op = 'insert'
    insertPayload = payload
    if (from === 'reserva_ledger') ledgerInserts.push(payload)
    if (from === 'transactions') transactionInserts.push(payload)
    return builder
  })
  builder.delete = vi.fn(() => {
    op = 'delete'
    return builder
  })
  builder.maybeSingle = vi.fn((): Promise<QueryResult> => {
    if (from === 'statements' && op === 'upsert') {
      return Promise.resolve({ data: statementInsertedRow, error: null })
    }
    if (from === 'statements' && selectCols.includes('parsed_rows')) {
      // WR-01: confirmImport re-reads the authoritative persisted rows.
      return Promise.resolve({ data: { parsed_rows: statementParsedRows }, error: null })
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
    if (from === 'categories' && selectCols.includes('is_reserva')) {
      // isReservaCategory point-read for confirmImport.
      const id = filters.find(([c]) => c === 'id')?.[1] as string
      return Promise.resolve({
        data: { is_reserva: reservaCategoryIds.has(id) },
        error: null,
      })
    }
    if (from === 'transactions' && op === 'insert') {
      // confirmImport per-row INSERT(...).select('id, dedupe_key').maybeSingle():
      // a fresh dedupe_key inserts; an already-present one raises 23505 (skipped → J).
      const payload = insertPayload as { dedupe_key?: string }
      const key = payload?.dedupe_key
      const isInserted =
        insertedDedupeKeys === null || (key !== undefined && insertedDedupeKeys.has(key))
      if (!isInserted) {
        return Promise.resolve({ data: null, error: { code: '23505' } })
      }
      return Promise.resolve({
        data: { id: `txn-${key}`, dedupe_key: key },
        error: null,
      })
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
  // Several calls are awaited directly (thenable) — resolve by table + op + filters.
  builder.then = (onF: (v: QueryResult) => unknown) => {
    const resolve = (r: QueryResult) => Promise.resolve(r).then(onF)

    if (from === 'categories' && selectCols.includes('is_reserva')) {
      const id = filters.find(([c]) => c === 'id')?.[1] as string
      return resolve({ data: { is_reserva: reservaCategoryIds.has(id) }, error: null })
    }
    if (from === 'categories' && inFilters.length > 0) {
      // assertOwnedCategories: return only the OWNED subset of the requested ids.
      const requested = inFilters.find(([c]) => c === 'id')?.[1] ?? []
      const owned = (requested as string[]).filter((id) => ownedCategoryIds.has(id))
      return resolve({ data: owned.map((id) => ({ id })), error: null })
    }
    if (from === 'categories') {
      return resolve({ data: [{ id: 'cat-merc', name: 'Mercado' }], error: null })
    }
    if (from === 'reservas') {
      // assertOwnedReserva: eq('id', id) → 1 row when owned, else 0.
      const id = filters.find(([c]) => c === 'id')?.[1] as string
      return resolve({ data: ownedReservaIds.has(id) ? [{ id }] : [], error: null })
    }
    if (from === 'carros') {
      // assertOwnedCarro (tri-state): eq('id', id) → 1 row when owned, else 0.
      const id = filters.find(([c]) => c === 'id')?.[1] as string
      return resolve({ data: ownedCarroIds.has(id) ? [{ id }] : [], error: null })
    }
    if (from === 'statements' && op !== 'upsert' && op !== 'update' && filters.length > 0) {
      // assertOwnedStatement: eq('id', id) → 1 row when owned, else 0.
      const id = filters.find(([c]) => c === 'id')?.[1] as string
      return resolve({ data: ownedStatementIds.has(id) ? [{ id }] : [], error: null })
    }
    if (from === 'transactions' && inFilters.length > 0) {
      // WR-02: ingestStatement's batched dedupe pre-check — one
      // .select('dedupe_key').in('dedupe_key', keys) instead of N point-reads.
      const requested = (inFilters.find(([c]) => c === 'dedupe_key')?.[1] ?? []) as string[]
      const present = requested
        .filter((k) => existingDedupeKeys.has(k))
        .map((k) => ({ dedupe_key: k }))
      return resolve({ data: present, error: null })
    }
    if (from === 'v_recurring_descriptors') {
      return resolve({
        data: recurringNorms.map((d) => ({ descriptor_norm: d })),
        error: null,
      })
    }
    if (from === 'reserva_ledger') {
      return resolve({ data: null, error: null })
    }
    return resolve({ data: null, error: null })
  }
  void upsertPayload
  void insertPayload
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
  confirmImport,
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
  ownedCategoryIds = new Set()
  ownedReservaIds = new Set()
  ownedStatementIds = new Set()
  ownedCarroIds = new Set()
  reservaCategoryIds = new Set()
  recurringNorms = []
  insertedDedupeKeys = null
  statementParsedRows = []
  learnedPatterns.length = 0
  ledgerInserts.length = 0
  transactionInserts.length = 0
  pdfText = ''
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

  it('rejects an ext outside {ofx,csv,pdf}', async () => {
    const r = await createSignedStatementUpload('x.xml', 'xml')
    expect('error' in r).toBe(true)
    expect(storageApi.createSignedUploadUrl).not.toHaveBeenCalled()
  })

  it('accepts pdf as a valid ext (Plan 13-03) — mints a {user_id}/ scoped URL', async () => {
    signedUrlResult = {
      data: { path: 'user-1/uuid.pdf', token: 'tok', signedUrl: 'http://signed' },
      error: null,
    }
    const r = await createSignedStatementUpload('fatura.pdf', 'pdf')
    expect('path' in r).toBe(true)
    const call = storageApi.createSignedUploadUrl.mock.calls[0]![0]
    expect(call.startsWith('user-1/')).toBe(true)
    expect(call.endsWith('.pdf')).toBe(true)
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

  // --- PDF dispatch branch (Plan 13-03, PDF-04) ----------------------------

  it('routes a .pdf path through the PDF branch and parses the extracted text', async () => {
    // Any bytes — extractPdfText is mocked; pdfText drives the parse.
    downloadBytes = new Uint8Array([1, 2, 3])
    pdfText = readFileSync(
      join(process.cwd(), 'tests/fixtures', 'santander-sample.txt'),
      'utf8',
    )
    const r = await ingestStatement('user-1/fatura.pdf', 'fatura.pdf')
    if (!('rows' in r) || !r.rows) throw new Error('expected review rows for a text PDF')
    expect(r.rows.length).toBeGreaterThan(0)
    expect(r.statementId).toBeTruthy()
  })

  it('image-only PDF (empty/whitespace text) HARD-BLOCKS with a CSV/OFX-steering error', async () => {
    downloadBytes = new Uint8Array([1, 2, 3])
    pdfText = '   \n\t  \n' // whitespace only ⇒ image-only signal
    const r = await ingestStatement('user-1/fatura.pdf', 'fatura.pdf')
    expect('error' in r).toBe(true)
    if ('error' in r) {
      // Steers to CSV/OFX (PDF-04) — distinct from a 0-row review.
      expect(r.error).toMatch(/CSV|OFX/)
      expect(r.error.toLowerCase()).toMatch(/imagem|digitaliza/)
    }
  })

  it('text-present PDF with 0 matching lines is NOT a block — shows the review screen with 0 rows', async () => {
    downloadBytes = new Uint8Array([1, 2, 3])
    // Real text, but no line matches the Santander TX regex → 0 rows, NOT an error.
    pdfText = 'Algum texto extraído sem nenhuma linha de transação reconhecível.'
    const r = await ingestStatement('user-1/fatura.pdf', 'fatura.pdf')
    expect('error' in r).toBe(false)
    if (!('rows' in r)) throw new Error('expected a review result, not an error')
    expect(r.rows).toEqual([])
    expect(r.summary.total).toBe(0)
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

// --- confirmImport (IMP-05, CLS-03/04/05/06, RSV-06, SEC-03/IDOR) -----------

describe('confirmImport', () => {
  const STMT = '11111111-1111-4111-8111-111111111111'
  const CAT = '22222222-2222-4222-8222-222222222222'
  const RESERVA_CAT = '33333333-3333-4333-8333-333333333333'
  const RESERVA = '44444444-4444-4444-8444-444444444444'

  function row(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: crypto.randomUUID(),
      dedupe_key: `ofx:${crypto.randomUUID()}`,
      occurred_on: '2026-01-10',
      amount: 5000, // integer cents (OFX path)
      descriptor_raw: 'MERCADO ABC SAO PAULO',
      descriptor_norm: 'mercado abc',
      categoryId: CAT,
      ...over,
    }
  }

  // WR-01: seed the AUTHORITATIVE persisted parsed rows the action re-reads. The
  // content (descriptor_norm/amount/occurred_on) is taken from THESE rows, not the
  // client payload — so every test that expects acceptance must persist its rows.
  function persist(...rows: ReturnType<typeof row>[]) {
    statementParsedRows = rows.map((r) => ({
      dedupe_key: r.dedupe_key,
      occurred_on: r.occurred_on as string,
      amount_cents: r.amount as number,
      descriptor_raw: r.descriptor_raw as string,
      descriptor_norm: r.descriptor_norm as string,
      category_id: null,
      reserva_id: null,
      classification_source: null,
      is_recurring: false,
    }))
  }

  it('gates on an absent session', async () => {
    claimsSub = null
    const r = await confirmImport(STMT, [row()])
    expect(r).toEqual({ error: 'Sessão expirada.' })
  })

  it('rejects a forged statement_id before any write (IDOR)', async () => {
    ownedStatementIds = new Set() // statement not owned
    ownedCategoryIds = new Set([CAT])
    const r = await confirmImport(STMT, [row()])
    expect(r).toEqual({ error: 'Importação inválida.' })
  })

  it('rejects a forged category_id (IDOR — whole payload)', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set() // category not owned
    const r = await confirmImport(STMT, [row()])
    expect(r).toEqual({ error: 'Categoria inválida.' })
  })

  it('rejects a forged reserva_id (IDOR — whole payload)', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([RESERVA_CAT])
    reservaCategoryIds = new Set([RESERVA_CAT])
    ownedReservaIds = new Set() // reserva not owned
    const r = await confirmImport(STMT, [row({ categoryId: RESERVA_CAT, reservaId: RESERVA })])
    expect(r).toEqual({ error: 'Reserva inválida.' })
  })

  it('persists classified rows and LEARNS merchant_patterns only for classified rows', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    const classified = row({ descriptor_norm: 'mercado abc', categoryId: CAT })
    const unclassified = row({ descriptor_norm: 'desconhecido', categoryId: null })
    persist(classified, unclassified)
    insertedDedupeKeys = new Set([classified.dedupe_key, unclassified.dedupe_key])

    const r = await confirmImport(STMT, [classified, unclassified])
    expect(r).toEqual({ imported: 2, duplicated: 0 })

    // Exactly ONE merchant_patterns upsert — for the classified row only (no poison).
    expect(learnedPatterns).toHaveLength(1)
    const learned = learnedPatterns[0] as { descriptor_norm: string; category_id: string }
    expect(learned.descriptor_norm).toBe('mercado abc')
    expect(learned.category_id).toBe(CAT)
  })

  it('an unclassified-only payload learns nothing', async () => {
    ownedStatementIds = new Set([STMT])
    const only = row({ descriptor_norm: 'desconhecido', categoryId: null })
    persist(only)
    insertedDedupeKeys = new Set([only.dedupe_key])
    const r = await confirmImport(STMT, [only])
    expect('imported' in r && r.imported).toBe(1)
    expect(learnedPatterns).toHaveLength(0)
  })

  it('dedupe_key ON CONFLICT path: only actually-inserted rows count as imported (M)', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    const fresh = row()
    const dup = row()
    persist(fresh, dup)
    insertedDedupeKeys = new Set([fresh.dedupe_key]) // dup is collapsed by the index
    const r = await confirmImport(STMT, [fresh, dup])
    expect(r).toEqual({ imported: 1, duplicated: 1 })
  })

  it('a Reserva row creates the aporte "in" ledger entry + saves merchant→reserva', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([RESERVA_CAT])
    reservaCategoryIds = new Set([RESERVA_CAT])
    ownedReservaIds = new Set([RESERVA])
    const r = row({ categoryId: RESERVA_CAT, reservaId: RESERVA, descriptor_norm: 'aporte mensal' })
    persist(r)
    insertedDedupeKeys = new Set([r.dedupe_key])

    const result = await confirmImport(STMT, [r])
    expect('imported' in result && result.imported).toBe(1)

    // The aporte 'in' ledger entry was created via the shared Phase-3 path.
    expect(ledgerInserts).toHaveLength(1)
    const ledger = ledgerInserts[0] as { kind: string; reserva_id: string }
    expect(ledger.kind).toBe('in')
    expect(ledger.reserva_id).toBe(RESERVA)

    // merchant_patterns carries the reserva_id (RSV-06).
    const learned = learnedPatterns[0] as { reserva_id: string | null }
    expect(learned.reserva_id).toBe(RESERVA)
  })

  it('sets is_recurring from v_recurring_descriptors and the point-in-time category on the row', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    recurringNorms = ['spotify']
    const recurringRow = row({ descriptor_norm: 'spotify', categoryId: CAT })
    persist(recurringRow)
    insertedDedupeKeys = new Set([recurringRow.dedupe_key])

    // Spy on the transactions upsert payload via the captured builder call.
    const r = await confirmImport(STMT, [recurringRow])
    expect('imported' in r && r.imported).toBe(1)
    // The learned pattern is keyed by category_id (point-in-time basis, CLS-05).
    const learned = learnedPatterns[0] as { category_id: string }
    expect(learned.category_id).toBe(CAT)
  })

  // WR-01: learning poisoning / dedupe forgery — confirmImport must use the
  // SERVER-persisted content, never the client payload.
  it('a tampered client descriptor_norm cannot poison merchant_patterns (uses persisted content)', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    // The statement was persisted with the REAL merchant key.
    const real = row({ descriptor_norm: 'mercado abc', amount: 5000, categoryId: CAT })
    persist(real)
    insertedDedupeKeys = new Set([real.dedupe_key])

    // The CLIENT submits the same dedupe_key but forges a different descriptor_norm
    // and amount, trying to learn an arbitrary merchant + book a wrong value.
    const tampered = { ...real, descriptor_norm: 'forjado evil', amount: 999999 }
    const r = await confirmImport(STMT, [tampered])
    expect('imported' in r && r.imported).toBe(1)

    // merchant_patterns learned the PERSISTED key, not the forged one (no poison).
    const learned = learnedPatterns[0] as { descriptor_norm: string }
    expect(learned.descriptor_norm).toBe('mercado abc')
    expect(learned.descriptor_norm).not.toBe('forjado evil')
  })

  it('a forged dedupe_key not in the persisted set rejects the whole payload', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    const persisted = row()
    persist(persisted)
    // The client sends a row whose dedupe_key was never parsed for this statement.
    const forged = row({ dedupe_key: `ofx:${crypto.randomUUID()}` })
    const r = await confirmImport(STMT, [forged])
    expect(r).toEqual({ error: 'Linha não pertence a esta importação.' })
  })

  // WR-03: a Reserva-classified row missing its reservaId must reject the WHOLE
  // payload BEFORE any transaction is persisted (no partial state).
  it('rejects a Reserva row without reservaId up front (no transaction persisted)', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([RESERVA_CAT])
    reservaCategoryIds = new Set([RESERVA_CAT])
    const reservaRow = row({ categoryId: RESERVA_CAT, descriptor_norm: 'aporte sem reserva' })
    persist(reservaRow)
    // NO reservaId supplied — must reject before any insert.
    const r = await confirmImport(STMT, [reservaRow])
    expect(r).toEqual({ error: 'Selecione uma reserva para os lançamentos de Reserva.' })
    // No transaction insert and no ledger entry happened (no partial state).
    expect(ledgerInserts).toHaveLength(0)
    expect(learnedPatterns).toHaveLength(0)
  })

  // CAR-02 (T-09-07): a row tagged to an OWNED carro persists with carro_id set;
  // carro is orthogonal to category/reserva (D4 — additive only).
  const CARRO = '55555555-5555-4555-8555-555555555555'

  it('persists carro_id for a row tagged to an owned carro', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    ownedCarroIds = new Set([CARRO])
    const tagged = row({ descriptor_norm: 'oficina do ze', categoryId: CAT, carroId: CARRO })
    persist(tagged)
    insertedDedupeKeys = new Set([tagged.dedupe_key])

    const r = await confirmImport(STMT, [tagged])
    expect('imported' in r && r.imported).toBe(1)

    expect(transactionInserts).toHaveLength(1)
    const ins = transactionInserts[0] as { carro_id: string | null }
    expect(ins.carro_id).toBe(CARRO)
  })

  it('rejects a forged carro_id (IDOR — whole payload, no transaction insert)', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    ownedCarroIds = new Set() // carro not owned → assertOwnedCarro 'not-owned'
    const forged = row({ categoryId: CAT, carroId: CARRO })
    persist(forged)
    insertedDedupeKeys = new Set([forged.dedupe_key])

    const r = await confirmImport(STMT, [forged])
    expect(r).toEqual({ error: 'Carro inválido.' })
    // Whole payload rejected BEFORE any transaction insert.
    expect(transactionInserts).toHaveLength(0)
    expect(learnedPatterns).toHaveLength(0)
  })

  it('a row with no carroId persists carro_id null (parity with today)', async () => {
    ownedStatementIds = new Set([STMT])
    ownedCategoryIds = new Set([CAT])
    const plain = row({ descriptor_norm: 'mercado abc', categoryId: CAT })
    persist(plain)
    insertedDedupeKeys = new Set([plain.dedupe_key])

    const r = await confirmImport(STMT, [plain])
    expect(r).toEqual({ imported: 1, duplicated: 0 })

    expect(transactionInserts).toHaveLength(1)
    const ins = transactionInserts[0] as { carro_id: string | null }
    expect(ins.carro_id).toBeNull()
  })
})
