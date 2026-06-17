// Pure CSV-profile helpers (Supabase-free). Lives OUTSIDE the 'use server' import
// action module so it can be imported by both the Server Action and the client
// uploader — a 'use server' module may only export async Server Actions, so this
// sync, deterministic helper cannot live there.

import { createHash } from 'node:crypto'

/**
 * Stable header signature for CSV layout reuse: the sorted, lowercased, trimmed
 * header names joined and hashed. Two CSVs with the same columns (in any order)
 * resolve to the same profile, so the CsvColumnMapper is skipped on the second one.
 */
export function csvHeaderSignature(headers: string[]): string {
  const basis = headers.map((h) => h.trim().toLowerCase()).sort().join('|')
  return createHash('sha256').update(basis).digest('hex')
}
