// The parse → normalize → review contract. RawTransaction is what a parser
// (OFX/CSV) emits after normalization; ParsedReviewRow is what the ingest action
// (Plan 02) hands the review table after dedup + memory classification. Interface
// -first so the parsers, the ingest action, and the review table all agree.

/** A normalized statement row, parser output (Supabase-free, pure). */
export interface RawTransaction {
  /** Civil date 'YYYY-MM-DD' (SP). */
  occurred_on: string
  /** Positive integer centavos; the sign/effect derives from kind, never the value. */
  amount_cents: number
  /** The merchant string as it appeared (MEMO/NAME for OFX, the desc col for CSV). */
  descriptor_raw: string
  /** normalizeDescriptor(descriptor_raw) — the stable memory key. */
  descriptor_norm: string
  /** OFX bank-stable id (best dedupe basis); absent for CSV. */
  fitid?: string
}

/** Classification origin for the review row + persisted classification_source. */
export type ClassificationSource = 'memória' | 'manual' | 'sugerida' | null

/**
 * A review-ready row: a RawTransaction plus the dedup key and the (possibly null)
 * classification the ingest action resolved. category_id null = unclassified
 * (memory miss, awaiting a manual pick). reserva_id is set when the learned/chosen
 * category is the Reserva one (RSV-06).
 */
export interface ParsedReviewRow extends RawTransaction {
  dedupe_key: string
  category_id: string | null
  reserva_id: string | null
  classification_source: ClassificationSource
  is_recurring: boolean
}
