'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { classifyDescriptors } from '@/lib/ai/classify'
import { getDecryptedAiSettings } from '@/lib/ai/settings.server'
import { matchKeyword, type KeywordRule } from '@/lib/classifier/keywords'
import { lookupMemory } from '@/lib/classifier/memory'
import { csvHeaderSignature } from '@/lib/csv-profile'
import { lookupCsvProfile } from '@/lib/csv-profile.server'
import { contentHash, dedupeKey } from '@/lib/dedupe'
import { parseBRLToCents } from '@/lib/money'
import { CATEGORY_KINDS, type CategoryKind } from '@/lib/schemas/category'
import {
  assertOwnedCarro,
  assertOwnedCategories,
  assertOwnedReserva,
  assertOwnedStatement,
  isReservaCategory,
  syncReservaLedgerForTransaction,
} from '@/lib/ownership'
import { parseCsv, parseCsvRaw, readCsvHeaders } from '@/lib/parsers/csv'
import { parseOfx } from '@/lib/parsers/ofx'
import {
  extractPdfText,
  findStatementVencimento,
  parseSantanderText,
} from '@/lib/parsers/pdf'
import {
  MAX_PARSED_ROWS,
  type ParsedReviewRow,
  type RawTransaction,
} from '@/lib/parsers/types'
import {
  confirmImportRowSchema,
  csvMappingSchema,
  type CsvMapping,
} from '@/lib/schemas/import'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'

// maxDuration NOTE (CLSAI-06 / RESEARCH Open Q1): a `'use server'` module may ONLY
// export async functions — a `export const maxDuration` here makes Next.js reject the
// whole module ("has no exports at all") and the build fails. So the timeout is bound
// on the importing route SEGMENT instead: `src/app/(app)/importar/page.tsx` sets
// `maxDuration = 60`, which covers the action invoked from that page (parse + ONE
// batched LLM classify). The live-PROD inheritance confirmation is a manual-only verify.

/**
 * Import Server Actions (IMP-01/02/03/04, CLS-01) — the upload vertical slice.
 * Mirrors actions/transactions.ts VERBATIM in shape: Zod safeParse at the
 * boundary → { error } (never throws/leaks), getClaims() for the owner, a
 * server-side ownership re-derive before any FK-bearing write, revalidatePath on
 * success.
 *
 * The browser uploads the file bytes DIRECT to the private `statements` bucket via
 * a signed upload URL scoped to `${userId}/` (createSignedStatementUpload) — these
 * actions only ever receive the storage PATH, never the bytes (sidesteps the 4.5MB
 * function-body limit; threat T-04-07 accepted for LOCAL v1 with small files).
 *
 * ingestStatement is SYNCHRONOUS (download + parse inside the action): adequate for
 * LOCAL synthetic file sizes (RESEARCH A5 / Open Question 3). It is kept pure enough
 * to later move behind a Route Handler + after() if files grow — the only Supabase
 * touchpoints are the download, the statements upsert, and the per-row memory read.
 *
 * IDOR discipline (Pitfall 6/7): ingestStatement writes ONLY the statement row
 * (own user_id, no client FK), and rejects a path not prefixed by the caller's uid
 * as defense-in-depth atop the Storage RLS. The FK-bearing transaction writes +
 * pattern learning are ALL in Plan 03's confirmImport — NOTHING lands in
 * `transactions` here.
 */

export type CreateUploadResult =
  | { error: string }
  | { path: string; token: string; signedUrl: string }

/** N/M/K/J summary the review screen renders (UI-SPEC ImportSummaryHeader). */
export interface IngestSummary {
  /** N — total parsed rows. */
  total: number
  /** M — genuinely new (dedupe_key not already in the user's transactions). */
  novas: number
  /** K — memory-miss / unclassified (category null). */
  naoClassificadas: number
  /** J — pre-marked duplicates (dedupe_key already present). */
  duplicadas: number
  /**
   * CR-01: rows the parser SKIPPED because a field (date/amount) failed to parse.
   * Surfaced so a file that parsed 0 usable rows (all malformed) reports honestly
   * instead of silently importing nothing.
   */
  descartadas: number
  /**
   * CLSAI-06: the AI suggestion pass was skipped or degraded (no key, or
   * `classifyDescriptors` returned an empty Map). NON-BLOCKING — the upload + review
   * grid stay fully usable; Phase 16 surfaces this hint in the UI. Optional/absent
   * when there was no miss set OR the AI returned at least one suggestion.
   */
  iaIndisponivel?: boolean
}

export type IngestResult =
  | { error: string }
  // Re-upload hit: content_hash already present → "0 novas", no re-parse side effects.
  | { statementId: string; rows: []; summary: IngestSummary; alreadyImported: true }
  // CSV with ambiguous headers and no usable mapping/profile → mapper dialog branch.
  | { needsMapping: true; headers: string[]; sample: Record<string, string>[] }
  // Normal parse: review rows + summary (nothing persisted to transactions yet).
  | { statementId: string; rows: ParsedReviewRow[]; summary: IngestSummary; alreadyImported?: false }

export type SaveCsvProfileResult = { error: string } | { ok: true }

/** confirmImport outcome: how many rows actually landed vs were dedupe-skipped. */
export type ConfirmImportResult =
  | { error: string }
  | { imported: number; duplicated: number }

const BUCKET = 'statements'
const IMPORTAR_PATH = '/importar'
const EXTRATO_PATH = '/extrato'
const RESERVAS_PATH = '/reservas'
const DASHBOARD_PATH = '/dashboard'

/** OFX, CSV and PDF are accepted (the bucket path ext + the parser dispatch key). */
const extSchema = z.enum(['ofx', 'csv', 'pdf'])

/** A non-empty original filename; defaults handled by the caller. */
const filenameSchema = z.string().min(1, 'Informe o nome do arquivo').max(255)

/** A storage path string — re-validated against the caller's uid prefix below. */
const pathSchema = z.string().min(1)

/** The CSV header names a profile is keyed by (server derives the signature). */
const headersSchema = z.array(z.string()).min(1, 'Cabeçalho inválido.')

/**
 * Decode statement bytes (Pitfall 1). pt-BR bank exports are frequently latin1
 * (ISO-8859-1); decoding them as UTF-8 corrupts accented merchant names into
 * U+FFFD, which then produces a WRONG descriptor_norm and a wrong memory key. We
 * try UTF-8 first; if the result carries the replacement char, fall back to
 * latin1. Normalize happens AFTER this so the key is stable across encodings.
 */
function decodeStatement(bytes: Buffer): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (utf8.includes('�')) {
    return new TextDecoder('latin1').decode(bytes)
  }
  return utf8
}

/**
 * Heuristic auto-map: if exactly one header each plausibly names date / descritor /
 * valor, we can skip the mapper. Ambiguity (0 or >1 candidate for any role) → the
 * CsvColumnMapper dialog. Deliberately conservative — a wrong silent map is worse
 * than asking once.
 */
function autoMapCsv(headers: string[]): CsvMapping | null {
  const norm = (h: string) => h.trim().toLowerCase()
  const find = (patterns: RegExp[]): string[] =>
    headers.filter((h) => patterns.some((p) => p.test(norm(h))))

  const dateCandidates = find([/\bdata\b/, /\bdate\b/, /\bdt\b/])
  const descCandidates = find([/hist[oó]rico/, /descri/, /lan[cç]amento/, /memo/, /detalh/])
  const valorCandidates = find([/\bvalor\b/, /\bamount\b/, /\bvlr\b/, /^valor/])

  if (
    dateCandidates.length === 1 &&
    descCandidates.length === 1 &&
    valorCandidates.length === 1
  ) {
    const dateCol = dateCandidates[0]!
    const descCol = descCandidates[0]!
    const valorCol = valorCandidates[0]!
    if (new Set([dateCol, descCol, valorCol]).size === 3) {
      return { dateCol, descCol, valorCol }
    }
  }
  return null
}

/**
 * Read up to `n` raw sample rows (header mode, no value coercion) to drive the
 * mapper's live preview. Parses with papaparse's header mode and returns the first
 * `n` records as-is so the dialog can show "this column's first value" per header.
 */
function csvSampleRows(text: string, n: number): Record<string, string>[] {
  const headers = readCsvHeaders(text)
  if (headers.length === 0) return []
  const records = parseCsvRaw(text)
  return records.slice(0, n)
}

/**
 * Mint a per-user-scoped signed upload URL for a statement (IMP-01, Pattern 1).
 * The path MUST start with `${userId}/` so the existing Storage RLS (migration
 * 0003, "own statement files insert") permits the browser's direct upload. The
 * client then calls `uploadToSignedUrl(path, token, file)` — the bytes never
 * touch this function. Rejects an ext outside {ofx,csv}.
 */
export async function createSignedStatementUpload(
  filename: string,
  ext: string,
): Promise<CreateUploadResult> {
  const parsedName = filenameSchema.safeParse(filename)
  if (!parsedName.success) {
    return { error: parsedName.error.issues[0]?.message ?? 'Arquivo inválido.' }
  }
  const parsedExt = extSchema.safeParse(ext.toLowerCase())
  if (!parsedExt.success) {
    return { error: 'Formato não suportado. Envie um arquivo OFX, CSV ou PDF.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // Path scoped to the caller's uid (Pitfall 7): the Storage insert policy denies
  // any path whose first segment is not the caller's auth.uid().
  const path = `${userId}/${crypto.randomUUID()}.${parsedExt.data}`
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) {
    return { error: 'Não foi possível preparar o upload. Tente de novo.' }
  }
  return { path: data.path, token: data.token, signedUrl: data.signedUrl }
}

/**
 * Download the uploaded object, hash it, idempotently record the statement, then
 * (on a fresh file) decode → parse → normalize → dedup → memory-classify, returning
 * the review rows WITHOUT persisting any transaction (IMP-02/03/04, CLS-01).
 *
 * Re-upload of byte-identical content hits the statements unique(user_id,
 * content_hash) → returns { rows: [], alreadyImported: true } (the "0 novas" path)
 * with NO re-parse side effects.
 *
 * A CSV with ambiguous headers and no usable mapping/profile returns
 * { needsMapping, headers, sample } (no statement rows yet) so the client opens the
 * CsvColumnMapper.
 */
export async function ingestStatement(
  path: string,
  originalFilename: string,
  mapping?: CsvMapping,
): Promise<IngestResult> {
  if (!pathSchema.safeParse(path).success) return { error: 'Caminho inválido.' }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // Defense-in-depth atop Storage RLS (T-04-03): a path not prefixed by the
  // caller's uid is rejected before we ever touch Storage.
  if (!path.startsWith(`${userId}/`)) return { error: 'Caminho inválido.' }

  // 3-way ext detection (Plan 13-03): `.csv` → csv, `.pdf` → pdf, else ofx.
  const lowerPath = path.toLowerCase()
  const ext = lowerPath.endsWith('.csv')
    ? 'csv'
    : lowerPath.endsWith('.pdf')
      ? 'pdf'
      : 'ofx'

  // Download the object the browser uploaded direct to Storage.
  const { data: blob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(path)
  if (dlError || !blob) {
    return { error: 'Não foi possível ler este arquivo. Verifique se é um extrato OFX, CSV ou PDF válido e tente de novo.' }
  }
  const bytes = Buffer.from(await blob.arrayBuffer())
  const hash = contentHash(bytes)

  // Idempotency (IMP-04, "0 novas"): insert the statement ON CONFLICT DO NOTHING.
  // A returned row → fresh; an empty result → the file was already imported.
  const { data: inserted, error: insError } = await supabase
    .from('statements')
    .upsert(
      {
        user_id: userId,
        storage_path: path,
        original_filename: originalFilename,
        format: ext,
        content_hash: hash,
        status: 'parsed',
      },
      { onConflict: 'user_id,content_hash', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()
  if (insError) {
    // Surface the real Postgres error (code + message + constraint) server-side so
    // a CHECK/RLS violation is diagnosable instead of hidden behind the generic
    // message — e.g. a format/kind constraint not yet widened on the target DB.
    console.error(
      `[ingestStatement] statements insert failed (format=${ext}, file=${originalFilename}):`,
      insError,
    )
    return { error: 'Não foi possível registrar o arquivo. Tente de novo.' }
  }

  let statementId: string
  if (!inserted) {
    // content_hash hit. Read back the existing statement + its status.
    const { data: existing } = await supabase
      .from('statements')
      .select('id, status')
      .eq('content_hash', hash)
      .maybeSingle()
    if (!existing) {
      // Conflict reported but the row is unreadable (race / RLS) — fail safe.
      return { error: 'Não foi possível registrar o arquivo. Tente de novo.' }
    }
    // Only treat the file as "already imported" (0 novas, no re-parse) when the prior
    // import was actually CONFIRMED (status 'imported'). An UNCONFIRMED statement
    // (parsed/uploaded/parsing/failed) created ZERO transactions, so the same file must
    // be allowed to re-review — otherwise a file you opened but never confirmed could
    // never be re-imported (the "0 novas / já importado" UX bug).
    if (existing.status === 'imported') {
      return {
        statementId: existing.id,
        rows: [],
        summary: { total: 0, novas: 0, naoClassificadas: 0, duplicadas: 0, descartadas: 0 },
        alreadyImported: true,
      }
    }
    // Unconfirmed re-upload: reuse the existing statement row and RE-PARSE below; the
    // persist step refreshes its parsed_rows + resets status to 'parsed'.
    statementId = existing.id
  } else {
    statementId = inserted.id
  }

  // Parse by extension. CSV needs a mapping; resolve it from the argument, a saved
  // profile, or auto-map — else return the needsMapping branch.
  //
  // CR-01: the parsers skip malformed rows internally, but belt-and-suspenders we
  // wrap the dispatch so ANY residual throw becomes the documented friendly
  // { error } instead of escaping the 'use server' boundary as an opaque 500. The
  // PDF extraction lives INSIDE this wrapper too (T-13-06 / V12): a pdf.js throw
  // degrades to the same friendly { error }, never a 500.
  //
  // Pitfall 7: decodeStatement (latin1) is CSV/OFX-only — PDF text is already
  // Unicode (pdf.js), so it must NOT pass through the latin1 heuristic.
  let rawRows: RawTransaction[]
  let dropped: number
  let capped: boolean
  try {
    if (ext === 'pdf') {
      // PDF (PDF-02/04): extract straight from the buffer (no decodeStatement). An
      // empty/whitespace extract is the image-only HARD BLOCK (PDF-04) — DISTINCT
      // from a text-present 0-row parse, which flows to the review grid below.
      const pdfTextContent = await extractPdfText(bytes)
      if (pdfTextContent.trim().length === 0) {
        return {
          error:
            'Não foi possível ler o texto deste PDF — provavelmente é uma imagem/digitalização. ' +
            'Envie o extrato em CSV ou OFX desse banco.',
        }
      }
      const venc = findStatementVencimento(pdfTextContent) ?? {
        // No full DD/MM/YYYY anchor (layout drift): fall back to today's civil
        // month/year so the tx DD/MM still resolve. Honest counts + the review
        // grid remain the safety net (D-01); we never silently drop the file.
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      }
      const result = parseSantanderText(pdfTextContent, venc)
      rawRows = result.rows
      dropped = result.dropped
      capped = result.capped
    } else if (ext === 'ofx') {
      const text = decodeStatement(bytes)
      const result = parseOfx(text)
      rawRows = result.rows
      dropped = result.dropped
      capped = result.capped
    } else {
      const text = decodeStatement(bytes)
      const headers = readCsvHeaders(text)
      let resolved: CsvMapping | undefined = mapping
      if (!resolved) {
        const signature = csvHeaderSignature(headers)
        const profile = await lookupCsvProfile(signature)
        if (profile) resolved = profile
      }
      if (!resolved) {
        resolved = autoMapCsv(headers) ?? undefined
      }
      if (!resolved) {
        return { needsMapping: true, headers, sample: csvSampleRows(text, 5) }
      }
      const result = parseCsv(text, resolved)
      rawRows = result.rows
      dropped = result.dropped
      capped = result.capped
    }
  } catch (err) {
    // Best-effort parsing: a residual throw becomes the friendly { error } instead
    // of an opaque 500. Log it server-side so a real failure (e.g. a bundler/worker
    // resolution issue in a PDF dependency) is diagnosable rather than silently
    // swallowed — the message the user sees is intentionally generic.
    console.error(`[ingestStatement] parse failed (ext=${ext}, file=${originalFilename}):`, err)
    return {
      error:
        'Não foi possível ler este arquivo. Verifique se é um extrato OFX, CSV ou PDF válido e tente de novo.',
    }
  }

  // WR-02: reject (rather than silently truncate) a statement over the row cap so a
  // hostile/huge file cannot drive an unbounded jsonb persist + N serial queries.
  if (capped) {
    return {
      error: `Arquivo muito grande (mais de ${MAX_PARSED_ROWS} lançamentos). Divida o extrato em períodos menores.`,
    }
  }

  // Pre-fetch the user's categories once for the AI suggestion pass (id: name lines).
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
  // database.types tipa `kind` como `string` (NOT NULL + check-constrained no DB para
  // 'consumo'|'alocacao'); narrow para CategoryKind via o enum canônico em vez de um cast
  // cego (WR-01). Um valor inesperado (ex.: um CHECK futuro mais amplo) cai em 'alocacao'
  // — fail-safe: o kind gate o rejeita para um gasto em vez de rotulá-lo como gastável.
  const isCategoryKind = (k: string): k is CategoryKind =>
    (CATEGORY_KINDS as readonly string[]).includes(k)
  const categoryList = (categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    kind: isCategoryKind(c.kind) ? c.kind : 'alocacao',
  }))

  // PALAVRA-CHAVE (KW-02/03/04): pre-fetch the user's keyword rules ONCE (mirror the
  // batched categoryList fetch — never a per-row query, the WR-02 anti-pattern). The
  // join to categories(sort) carries the deterministic tie-break for equal-length
  // matches. RLS on category_keywords (0036) scopes this to the caller — NO app-layer
  // user_id filter (same as categories/merchant_patterns). The category_id is, by FK,
  // one of the user's own categories.
  const { data: kwRows } = await supabase
    .from('category_keywords')
    .select('category_id, keyword, categories(sort)')
  // WR-01: no .order() needed here — matchKeyword's final tie-break on categoryId
  // makes the winner deterministic regardless of fetch/row order (proven order-
  // independent in keywords.test.ts). The matcher is the single source of determinism.
  const keywordRules: KeywordRule[] = (kwRows ?? []).map((k) => ({
    categoryId: k.category_id,
    keyword: k.keyword,
    // FK guarantees a categories row; ?? 0 satisfies strict-null (sort default is 0).
    sort: k.categories?.sort ?? 0,
  }))

  // Pre-mark cross-statement duplicates: a row whose dedupe_key already exists in
  // the user's transactions is `duplicada` (Plan 03's confirm collapses them via
  // the partial unique index; we surface the count here for the summary).
  //
  // WR-02: compute every dedupe_key up front and resolve the duplicates in ONE
  // `.in('dedupe_key', keys)` query instead of N point-reads inside the loop.
  const keysByRaw = rawRows.map((raw) => dedupeKey(userId, raw))
  const dupSet = new Set<string>()
  if (keysByRaw.length > 0) {
    const { data: existingTxns } = await supabase
      .from('transactions')
      .select('dedupe_key')
      .in('dedupe_key', [...new Set(keysByRaw)])
    for (const t of existingTxns ?? []) {
      if (t.dedupe_key) dupSet.add(t.dedupe_key)
    }
  }

  // PASS 1 — memory-first (CLS-01 / CLSAI-02): the unchanged per-row `lookupMemory`
  // front door. A HIT auto-classifies with ZERO external calls; a MISS leaves the row
  // unclassified AND its descriptor_norm is collected into the unique miss set for the
  // single batched AI call below. NO AI function is called inside this loop.
  const rows: ParsedReviewRow[] = []
  const missNorms = new Set<string>()
  for (let i = 0; i < rawRows.length; i += 1) {
    const raw = rawRows[i]!
    const key = keysByRaw[i]!
    const isDuplicate = dupSet.has(key)

    const hit = await lookupMemory(supabase, raw.descriptor_norm)
    let categoryId: string | null = null
    let reservaId: string | null = null
    let source: ParsedReviewRow['classification_source'] = null
    if (hit) {
      categoryId = hit.category_id
      reservaId = hit.reserva_id
      source = 'memória'
    } else {
      // PALAVRA-CHAVE (KW-02/03/04): memory prevailed first; now try the deterministic
      // keyword layer BEFORE the AI. A hit is a BINDING pre-fill (mirrors memory) — it
      // sets category_id + source and is EXCLUDED from missNorms so the AI batch shrinks.
      const kw = matchKeyword(raw.descriptor_norm, keywordRules)
      if (kw) {
        categoryId = kw.categoryId
        // reservaId stays null — category-only (CONTEXT.md); reserva tagging is manual.
        source = 'palavra-chave'
      } else {
        // TRUE miss — only now collect for the ONE batched classify; row unclassified.
        missNorms.add(raw.descriptor_norm)
      }
    }

    rows.push({
      ...raw,
      dedupe_key: key,
      category_id: categoryId,
      reserva_id: reservaId,
      classification_source: source,
      is_recurring: false,
      duplicate: isDuplicate,
    })
  }

  // ONE call (CLSAI-03) — exactly one `classifyDescriptors` over the DEDUPED unique
  // miss `descriptor_norm` set. Memory-first: when there is NO miss, skip the AI path
  // ENTIRELY (no key read, no call). On no-key OR a degraded empty Map, set the
  // non-blocking `iaIndisponivel` note (CLSAI-06) — the upload never fails on the AI.
  let suggestions = new Map<string, { categoryId: string | null; confidence: number }>()
  let iaIndisponivel = false
  if (missNorms.size > 0) {
    try {
      const aiSettings = await getDecryptedAiSettings()
      if (!aiSettings) {
        iaIndisponivel = true // no key — expected pre-IA fallback
      } else {
        suggestions = await classifyDescriptors([...missNorms], categoryList, aiSettings)
        if (suggestions.size === 0) iaIndisponivel = true // provider error degraded to {}
      }
    } catch {
      // `getDecryptedAiSettings` runs a Supabase query + `get_ai_api_key` RPC, which
      // can throw on a network/decrypt/RPC error. The upload must NEVER fail on the AI
      // path (CLSAI-06) — degrade to the same non-blocking fallback as a provider error.
      iaIndisponivel = true
      suggestions = new Map()
    }
  }

  // PASS 2 — map the AI results back to the miss rows (CLSAI-01/05). A suggestion is a
  // NON-BINDING hint: it is attached as `row.suggestion` and NEVER written to
  // `row.category_id` (no auto-commit), and a memory hit is never overwritten.
  if (suggestions.size > 0) {
    for (const row of rows) {
      if (row.category_id !== null) continue // never overwrite a memory hit
      const s = suggestions.get(row.descriptor_norm)
      if (s && s.categoryId !== null) {
        row.suggestion = { categoryId: s.categoryId, confidence: s.confidence, source: 'ia' }
      }
    }
  }

  const duplicadas = rows.filter((r) => r.duplicate).length
  const summary: IngestSummary = {
    total: rows.length,
    novas: rows.length - duplicadas,
    naoClassificadas: rows.filter((r) => r.category_id === null).length,
    duplicadas,
    descartadas: dropped, // CR-01: rows skipped as malformed (surfaced honestly)
    ...(iaIndisponivel ? { iaIndisponivel: true } : {}),
  }

  // Persist the review payload on the statement so the review RSC (Plan 03) reads
  // it back by statementId without re-downloading/re-parsing (additive jsonb
  // columns, 0024). NOTHING lands in `transactions` until confirm.
  await supabase
    .from('statements')
    .update({
      parsed_rows: rows as unknown as Json,
      summary: summary as unknown as Json,
      tx_count: rows.length,
      status: 'parsed', // (re)parsed and awaiting review; confirmImport sets 'imported'
    })
    .eq('id', statementId)

  revalidatePath(IMPORTAR_PATH)
  return { statementId, rows, summary, alreadyImported: false }
}

/**
 * Persist a reusable CSV column-mapping profile keyed by header signature so the
 * next file of the same layout skips the mapper (IMP-02, RESEARCH Open Question 2).
 * UPSERT ON CONFLICT (user_id, header_signature).
 */
export async function saveCsvProfile(
  headers: string[],
  mapping: CsvMapping,
  name: string,
): Promise<SaveCsvProfileResult> {
  const parsedHeaders = headersSchema.safeParse(headers)
  if (!parsedHeaders.success) {
    return { error: 'Cabeçalho inválido.' }
  }
  const parsedMapping = csvMappingSchema.safeParse(mapping)
  if (!parsedMapping.success) {
    return { error: parsedMapping.error.issues[0]?.message ?? 'Mapeamento inválido.' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  const { error } = await supabase.from('csv_import_profiles').upsert(
    {
      user_id: userId,
      header_signature: csvHeaderSignature(parsedHeaders.data),
      mapping: parsedMapping.data as unknown as Json,
      name: name.trim(),
    },
    { onConflict: 'user_id,header_signature' },
  )
  if (error) return { error: 'Não foi possível salvar o perfil.' }
  return { ok: true }
}

/** Resolve a confirm row's amount to positive integer cents (OFX cents | CSV BRL). */
function rowAmountCents(amount: string | number): number | null {
  if (typeof amount === 'number') {
    return Number.isInteger(amount) && amount > 0 ? amount : null
  }
  try {
    return parseBRLToCents(amount)
  } catch {
    return null
  }
}

/**
 * Persist the reviewed rows into `transactions` and — ONLY THEN, ONLY on this human
 * confirm — LEARN the merchant→category (and merchant→reserva) patterns. This is the
 * phase's core value: confirm once, auto-classify the same merchant on the next
 * upload (CLS-03/04). Mirrors actions/transactions.ts: Zod safeParse at the boundary
 * → { error } (never throws/leaks), getClaims() for the owner, a server-side
 * ownership re-derive of EVERY FK before any write, revalidatePath on success.
 *
 * IDOR (T-04-02, Pitfall 6): the statement_id + every category_id + every reserva_id
 * are re-derived as owner-scoped under the RLS-active client BEFORE any FK write — a
 * single forged id rejects the WHOLE payload (FKs are not RLS-aware).
 *
 * Dedupe (T-04-04, Pitfall 4): rows persist via UPSERT ON CONFLICT (user_id,
 * dedupe_key) DO NOTHING (ignoreDuplicates) — re-confirming or an overlapping
 * statement never duplicates. The count actually inserted = imported (M novas); the
 * rest were already present = duplicated (J, silently skipped). Manual rows elsewhere
 * carry a null dedupe_key and are untouched by the partial unique index.
 *
 * Point-in-time (CLS-05): the category_id lands on the transaction row at confirm and
 * is NEVER rewritten by a later rename — patterns are keyed by category_id, not name.
 *
 * Reserva (RSV-06): an is_reserva row (by the FLAG, never the name) reuses the proven
 * Phase-3 syncReservaLedgerForTransaction so the aporte 'in' ledger entry is created
 * IDENTICALLY to manual entry (no new ledger write — T-04-09), and merchant→reserva
 * is saved onto the learned merchant_patterns row.
 *
 * Recurring (CLS-06): is_recurring is set at confirm from v_recurring_descriptors
 * (≥3 distinct civil months) — the just-imported rows now count toward the months.
 */
export async function confirmImport(
  statementId: string,
  rows: unknown[],
): Promise<ConfirmImportResult> {
  // Validate every row at the boundary (confirmImportRowSchema). A malformed row
  // rejects the whole payload — we never half-persist a statement.
  const parsedRows: import('@/lib/schemas/import').ConfirmImportRow[] = []
  for (const raw of rows) {
    const parsed = confirmImportRowSchema.safeParse(raw)
    if (!parsed.success) {
      return { error: 'Não foi possível confirmar a importação. Revise as linhas.' }
    }
    parsedRows.push(parsed.data)
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return { error: 'Sessão expirada.' }

  // IDOR re-derive #1 — the statement must belong to the caller.
  if (!(await assertOwnedStatement(supabase, statementId))) {
    return { error: 'Importação inválida.' }
  }

  // IDOR re-derive #2 — every classified row's category_id must be owned.
  const categoryIds = [
    ...new Set(
      parsedRows
        .map((r) => r.categoryId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ]
  if (categoryIds.length > 0 && !(await assertOwnedCategories(supabase, categoryIds))) {
    return { error: 'Categoria inválida.' }
  }

  // IDOR re-derive #3 — every chosen reserva_id must be owned.
  const reservaIds = [
    ...new Set(
      parsedRows
        .map((r) => r.reservaId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ]
  for (const reservaId of reservaIds) {
    if (!(await assertOwnedReserva(supabase, reservaId))) {
      return { error: 'Reserva inválida.' }
    }
  }

  // IDOR re-derive #4 (T-09-07) — every chosen carro_id must be owned. carro is a
  // client CHOICE (like reservaId), free of category; the tri-state assertOwnedCarro
  // distinguishes a transient backend hiccup ('error' → generic retry) from a genuine
  // not-owned/forged id ('not-owned' → 'Carro inválido.'). Either rejects the WHOLE
  // payload before any insert (FKs are NOT RLS-aware).
  const carroIds = [
    ...new Set(
      parsedRows
        .map((r) => r.carroId)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ]
  for (const carroId of carroIds) {
    const owned = await assertOwnedCarro(supabase, carroId)
    if (owned === 'not-owned') return { error: 'Carro inválido.' }
    if (owned === 'error') {
      return { error: 'Não foi possível confirmar a importação. Tente novamente.' }
    }
  }

  // WR-01 (learning poisoning / dedupe forgery): NEVER trust client-supplied row
  // CONTENT. Re-read the authoritative parsed rows that ingestStatement persisted on
  // the statement and key them by dedupe_key. The client payload contributes ONLY
  // the user's category/reserva CHOICE; descriptor_norm / amount / occurred_on /
  // dedupe_key come from the SERVER-side parse, so a tampered payload can neither
  // poison merchant_patterns with a forged descriptor_norm nor forge a dedupe_key.
  const { data: stmt } = await supabase
    .from('statements')
    .select('parsed_rows')
    .eq('id', statementId)
    .maybeSingle()
  const persistedRows = (stmt?.parsed_rows ?? []) as unknown as ParsedReviewRow[]
  const persistedByKey = new Map<string, ParsedReviewRow>(
    persistedRows
      .filter((p): p is ParsedReviewRow => typeof p?.dedupe_key === 'string')
      .map((p) => [p.dedupe_key, p]),
  )

  // Each incoming row must correspond to a PERSISTED parsed row (by dedupe_key). The
  // authoritative row carries the trusted content; merge in only the client's choice.
  type AuthoritativeRow = {
    base: ParsedReviewRow
    categoryId: string | null
    reservaId: string | undefined
    // carroId is a client CHOICE (like categoryId/reservaId), NOT from base/parse.
    carroId: string | null
  }
  const authoritativeRows: AuthoritativeRow[] = []
  for (const r of parsedRows) {
    const base = persistedByKey.get(r.dedupe_key)
    if (!base) return { error: 'Linha não pertence a esta importação.' }
    authoritativeRows.push({
      base,
      categoryId: r.categoryId ?? null,
      reservaId: r.reservaId,
      carroId: r.carroId ?? null,
    })
  }

  // WR-03 (partial state): validate the reserva precondition BEFORE any transaction
  // insert. A row classified into an is_reserva category but missing its reservaId
  // rejects the WHOLE payload up front (exactly like a forged id) so no transaction
  // is ever persisted without its aporte ledger entry.
  for (const r of authoritativeRows) {
    if (
      r.categoryId &&
      (await isReservaCategory(supabase, r.categoryId)) &&
      !r.reservaId
    ) {
      return { error: 'Selecione uma reserva para os lançamentos de Reserva.' }
    }
  }

  // Recurring (CLS-06): compute the recurring descriptor set ONCE from the view
  // (security_invoker → caller's own rows). A row whose descriptor_norm is flagged
  // persists is_recurring=true.
  const { data: recurringRows } = await supabase
    .from('v_recurring_descriptors')
    .select('descriptor_norm')
  const recurring = new Set(
    (recurringRows ?? [])
      .map((r) => r.descriptor_norm)
      .filter((d): d is string => typeof d === 'string'),
  )

  // Build the insert payload from the AUTHORITATIVE (server-persisted) content —
  // amount / occurred_on / descriptor_norm / dedupe_key come from base, NEVER the
  // client (WR-01). Amount resolves to positive integer cents; a bad amount rejects
  // the whole payload (no silent mis-persist).
  type TxnInsert = import('@/types/database.types').Database['public']['Tables']['transactions']['Insert']
  const inserts: TxnInsert[] = []
  for (const r of authoritativeRows) {
    const amountCents = rowAmountCents(r.base.amount_cents)
    if (amountCents === null) return { error: 'Valor monetário inválido.' }
    inserts.push({
      user_id: userId,
      statement_id: statementId,
      category_id: r.categoryId, // unclassified persists category-less (honest)
      amount_cents: amountCents,
      // WR-01: kind is server-derived from the authoritative persisted base row
      // (the PDF parser sets 'credit' for an estorno), NEVER the client payload.
      // Defaults to 'expense' for OFX/CSV rows (no kind). Relies on the live
      // transactions.kind CHECK accepting 'credit' (Plan 13-02, depends_on).
      kind: r.base.kind ?? 'expense',
      occurred_on: r.base.occurred_on,
      description: r.base.descriptor_raw,
      descriptor_norm: r.base.descriptor_norm,
      dedupe_key: r.base.dedupe_key,
      // WR-02 (intentional): the PERSISTED transaction provenance is a coarse
      // approximation — any classified row records 'memória' (the transactions
      // classification_source CHECK from migration 0020 permits only 'memória'/'manual'/
      // 'sugerida'/null, NOT 'palavra-chave'). This pre-dates Phase 20 (it already
      // labels manual picks as 'memória'). The 'palavra-chave' provenance is a
      // REVIEW-TIME signal (the grid badge); widening the persisted enum would need a
      // new migration + PROD push and is out of scope for KW-02..05. KW-05's "confirm
      // learns merchant→category as today" is unaffected — the learn loop is category-gated.
      classification_source: r.categoryId ? 'memória' : null,
      is_recurring: recurring.has(r.base.descriptor_norm),
      // CAR-02 (D4): additive carro tag — the row persists tagged or untagged. Free
      // of category; does NOT touch the reserva-aporte loop or the metas views.
      carro_id: r.carroId ?? null,
    })
  }

  // Persist with ON CONFLICT (user_id, dedupe_key) DO NOTHING semantics. The dedupe
  // constraint is a PARTIAL unique index (where dedupe_key is not null), which
  // PostgREST's .upsert({ onConflict }) cannot target (42P10 — it can't supply the
  // index predicate). So we INSERT per-row and SWALLOW the 23505 unique-violation:
  // a fresh dedupe_key inserts (counts into M novas), an already-present one raises
  // 23505 and is silently skipped (counts into J duplicadas) — re-confirming or an
  // overlapping statement never duplicates (T-04-04, Pitfall 4).
  const insertedByKey = new Map<string, string>()
  for (const ins of inserts) {
    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert(ins)
      .select('id, dedupe_key')
      .maybeSingle()
    if (error) {
      if (error.code === '23505') continue // dedupe_key already present → J (skip)
      return { error: 'Não foi possível importar as transações. Tente de novo.' }
    }
    if (inserted?.dedupe_key) insertedByKey.set(inserted.dedupe_key, inserted.id)
  }
  const imported = insertedByKey.size
  const duplicated = authoritativeRows.length - imported

  // Reserva aporte (RSV-06): for each freshly-inserted is_reserva row, create the
  // 'in' ledger entry via the SHARED Phase-3 path — identical to manual entry, no new
  // ledger write. deleteOld=false (a fresh txn has no pre-existing linked entry).
  // Amount / occurred_on come from the AUTHORITATIVE base (WR-01).
  for (const r of authoritativeRows) {
    if (!r.categoryId) continue
    const txnId = insertedByKey.get(r.base.dedupe_key)
    if (!txnId) continue // a dedupe-skipped row already has its aporte from before
    if (await isReservaCategory(supabase, r.categoryId)) {
      const amountCents = rowAmountCents(r.base.amount_cents)
      if (amountCents === null) continue
      const sync = await syncReservaLedgerForTransaction(
        supabase,
        userId,
        txnId,
        r.categoryId,
        amountCents,
        r.base.occurred_on,
        r.reservaId,
        false,
      )
      if ('error' in sync) return sync
    }
  }

  // LEARN (CLS-03/04, T-04-08): UPSERT merchant_patterns ONLY for CLASSIFIED rows,
  // ONLY here on human confirm (no poisoning). descriptor_norm → category_id [,
  // reserva_id]; ON CONFLICT (user_id, descriptor_norm) DO UPDATE re-points the
  // mapping + bumps hit_count + last_used_at. Unclassified rows learn nothing.
  // De-dupe by descriptor_norm so one merchant yields one upsert (last wins).
  const patternByNorm = new Map<
    string,
    { descriptor_norm: string; category_id: string; reserva_id: string | null }
  >()
  for (const r of authoritativeRows) {
    if (!r.categoryId) continue
    // descriptor_norm is the SERVER-persisted key (WR-01) — the client cannot forge
    // an arbitrary descriptor_norm into merchant_patterns.
    patternByNorm.set(r.base.descriptor_norm, {
      descriptor_norm: r.base.descriptor_norm,
      category_id: r.categoryId,
      reserva_id: r.reservaId ?? null,
    })
  }
  for (const p of patternByNorm.values()) {
    const { error: learnError } = await supabase.from('merchant_patterns').upsert(
      {
        user_id: userId,
        descriptor_norm: p.descriptor_norm,
        category_id: p.category_id,
        reserva_id: p.reserva_id,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,descriptor_norm' },
    )
    // A learn failure does not unwind the persist — the transactions already landed.
    // Surface it so the user knows the memory may not have updated.
    if (learnError) {
      return { error: 'As transações foram importadas, mas a memória não atualizou.' }
    }
  }

  // Mark the statement consumed so a re-visit shows the done state.
  await supabase.from('statements').update({ status: 'imported' }).eq('id', statementId)

  revalidatePath(EXTRATO_PATH)
  revalidatePath(RESERVAS_PATH)
  revalidatePath(DASHBOARD_PATH)
  return { imported, duplicated }
}
