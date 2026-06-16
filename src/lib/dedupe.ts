// Two-layer dedup key derivation (IMP-04). Idempotency is ultimately DB-enforced
// (statements.content_hash unique + transactions.dedupe_key partial unique, both
// ON CONFLICT DO NOTHING), but the KEYS are derived here, deterministically, so a
// retried parse/confirm never produces a different key for the same logical row.

import { createHash } from 'node:crypto'

/**
 * File-level idempotency basis (IMP-04 "0 novas"): the sha256 hex of the raw file
 * bytes. Byte-identical input → identical hash → the statements unique(user_id,
 * content_hash) collapses the re-upload to the existing row.
 */
export function contentHash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The minimal row shape dedupeKey needs (a subset of RawTransaction). */
export interface DedupeRow {
  /** OFX bank-stable transaction id, when present. */
  fitid?: string
  occurred_on: string
  amount_cents: number
  descriptor_norm: string
}

/**
 * Transaction-level dedup key (IMP-04 cross-statement collapse). The basis is the
 * bank-stable FITID for OFX rows (`ofx:<fitid>`), or the normalized tuple for CSV
 * rows with no FITID (`csv:<occurred_on>:<amount_cents>:<descriptor_norm>`). The
 * userId is prefixed before hashing so a key is scoped to its owner. Two rows with
 * the same basis collide (the partial unique index skips the duplicate); rows with
 * a different basis never collide.
 */
export function dedupeKey(userId: string, row: DedupeRow): string {
  const basis =
    row.fitid !== undefined && row.fitid !== ''
      ? `ofx:${row.fitid}`
      : `csv:${row.occurred_on}:${row.amount_cents}:${row.descriptor_norm}`
  return createHash('sha256').update(`${userId}:${basis}`).digest('hex')
}
