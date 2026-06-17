'use server'

import { createHash } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { lookupMemory } from '@/lib/classifier/memory'
import { suggestCategory } from '@/lib/classifier/suggest'
import { contentHash, dedupeKey } from '@/lib/dedupe'
import { parseCsv, parseCsvRaw, readCsvHeaders } from '@/lib/parsers/csv'
import { parseOfx } from '@/lib/parsers/ofx'
import type { ParsedReviewRow, RawTransaction } from '@/lib/parsers/types'
import { csvMappingSchema, type CsvMapping } from '@/lib/schemas/import'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'

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

const BUCKET = 'statements'
const IMPORTAR_PATH = '/importar'

/** Only OFX and CSV are accepted (the bucket path ext + the parser dispatch key). */
const extSchema = z.enum(['ofx', 'csv'])

/** A non-empty original filename; defaults handled by the caller. */
const filenameSchema = z.string().min(1, 'Informe o nome do arquivo').max(255)

/** A storage path string — re-validated against the caller's uid prefix below. */
const pathSchema = z.string().min(1)

/** The header signature a CSV profile is keyed by (sorted headers, hashed). */
const headerSignatureSchema = z.string().min(1)

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
 * Stable header signature for CSV layout reuse: the sorted, trimmed header names
 * joined and hashed. Two CSVs with the same columns (any order) reuse one profile.
 */
export function csvHeaderSignature(headers: string[]): string {
  const basis = headers.map((h) => h.trim().toLowerCase()).sort().join('|')
  return createHash('sha256').update(basis).digest('hex')
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
    return { error: 'Formato não suportado. Envie um arquivo OFX ou CSV.' }
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

  const ext = path.toLowerCase().endsWith('.csv') ? 'csv' : 'ofx'

  // Download the object the browser uploaded direct to Storage.
  const { data: blob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(path)
  if (dlError || !blob) {
    return { error: 'Não foi possível ler este arquivo. Verifique se é um extrato OFX/CSV válido e tente de novo.' }
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
    return { error: 'Não foi possível registrar o arquivo. Tente de novo.' }
  }

  if (!inserted) {
    // content_hash hit → the "0 novas" path. Read back the existing statement id
    // WITHOUT re-parsing (no side effects on a re-upload).
    const { data: existing } = await supabase
      .from('statements')
      .select('id')
      .eq('content_hash', hash)
      .maybeSingle()
    return {
      statementId: existing?.id ?? '',
      rows: [],
      summary: { total: 0, novas: 0, naoClassificadas: 0, duplicadas: 0 },
      alreadyImported: true,
    }
  }

  const statementId = inserted.id
  const text = decodeStatement(bytes)

  // Parse by extension. CSV needs a mapping; resolve it from the argument, a saved
  // profile, or auto-map — else return the needsMapping branch.
  let rawRows: RawTransaction[]
  if (ext === 'ofx') {
    rawRows = parseOfx(text)
  } else {
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
    rawRows = parseCsv(text, resolved)
  }

  // Pre-fetch the user's categories once for the (deferred) suggestion seam.
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
  const categoryList = categories ?? []

  // Pre-mark cross-statement duplicates: a row whose dedupe_key already exists in
  // the user's transactions is `duplicada` (Plan 03's confirm collapses them via
  // the partial unique index; we surface the count here for the summary).
  const rows: ParsedReviewRow[] = []
  for (const raw of rawRows) {
    const key = dedupeKey(userId, raw)

    const { data: existingTxn } = await supabase
      .from('transactions')
      .select('id')
      .eq('dedupe_key', key)
      .maybeSingle()
    const isDuplicate = existingTxn !== null

    // Memory-first classification (CLS-01): a HIT auto-classifies with zero
    // external calls; a MISS leaves the row unclassified (suggestCategory is the
    // deferred-AI seam → null in v1) for a manual pick on the review screen.
    const hit = await lookupMemory(supabase, raw.descriptor_norm)
    let categoryId: string | null = null
    let reservaId: string | null = null
    let source: ParsedReviewRow['classification_source'] = null
    if (hit) {
      categoryId = hit.category_id
      reservaId = hit.reserva_id
      source = 'memória'
    } else {
      // Seam returns null in v1 — no PII egress, SEC-03 holds by construction.
      await suggestCategory(raw.descriptor_norm, categoryList)
      categoryId = null
      source = null
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

  const duplicadas = rows.filter((r) => r.duplicate).length
  const summary: IngestSummary = {
    total: rows.length,
    novas: rows.length - duplicadas,
    naoClassificadas: rows.filter((r) => r.category_id === null).length,
    duplicadas,
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
  headerSignature: string,
  mapping: CsvMapping,
  name: string,
): Promise<SaveCsvProfileResult> {
  if (!headerSignatureSchema.safeParse(headerSignature).success) {
    return { error: 'Assinatura de cabeçalho inválida.' }
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
      header_signature: headerSignature,
      mapping: parsedMapping.data as unknown as Json,
      name: name.trim(),
    },
    { onConflict: 'user_id,header_signature' },
  )
  if (error) return { error: 'Não foi possível salvar o perfil.' }
  return { ok: true }
}

/**
 * Point-read a saved CSV profile by header signature for silent reuse. Returns the
 * mapping on a hit (the dialog is skipped) or null on a miss. RLS scopes the read.
 */
export async function lookupCsvProfile(
  headerSignature: string,
): Promise<CsvMapping | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('csv_import_profiles')
    .select('mapping')
    .eq('header_signature', headerSignature)
    .maybeSingle()
  if (!data?.mapping) return null
  const parsed = csvMappingSchema.safeParse(data.mapping)
  return parsed.success ? parsed.data : null
}
