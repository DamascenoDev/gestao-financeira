// The parse → normalize → review contract. RawTransaction is what a parser
// (OFX/CSV) emits after normalization; ParsedReviewRow is what the ingest action
// (Plan 02) hands the review table after dedup + memory classification. Interface
// -first so the parsers, the ingest action, and the review table all agree.

/**
 * WR-02: hard cap on the number of transactions a single statement may contribute.
 * A hostile file with hundreds of thousands of tiny `<STMTTRN>` blocks is cheap to
 * generate yet would produce an unbounded in-memory array, an enormous `parsed_rows`
 * jsonb write, and N sequential DB round-trips. The parsers stop at this cap; the
 * ingest action rejects the file with a friendly message when it is reached so the
 * truncation is never silent.
 */
export const MAX_PARSED_ROWS = 10_000

/**
 * The result of parsing a whole statement (CR-01). A malformed row (bad date /
 * amount) is SKIPPED, never thrown — `rows` holds the usable transactions and
 * `dropped` counts the rows that failed to parse, so the ingest summary can report
 * honestly (e.g. a file that parsed 0 usable rows out of N) instead of silently
 * importing nothing or aborting the whole upload on the first bad line.
 */
export interface ParseResult {
  rows: RawTransaction[]
  /** Count of rows skipped because a field (date/amount) failed to parse. */
  dropped: number
  /**
   * WR-02: true when the statement carried more usable rows than MAX_PARSED_ROWS,
   * so parsing stopped early. The ingest action rejects a capped result with a
   * friendly message rather than importing a silently-truncated statement.
   */
  capped: boolean
}

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
  /** PDF estorno/credit marker; absent (⇒ expense) for OFX/CSV. The sign/effect
   *  derives from kind, never the (always-positive) amount_cents. */
  kind?: 'expense' | 'credit'
}

/** Classification origin for the review row + persisted classification_source.
 *  'palavra-chave' (KW-02): a deterministic keyword pre-fill that runs on a memory
 *  MISS, before the AI — binding like 'memória', set by PASS 1 in the ingest action. */
export type ClassificationSource =
  | 'memória'
  | 'palavra-chave'
  | 'manual'
  | 'sugerida'
  | null

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
  /**
   * Pre-marked at ingest (Plan 02): this row's dedupe_key already exists in the
   * user's transactions, so confirm (Plan 03) collapses it via the partial unique
   * index — it counts into J (duplicadas ignoradas), not M (novas). Optional so the
   * pure parsers (which don't know the DB) need not set it.
   */
  duplicate?: boolean
  /**
   * O palpite NÃO-vinculante da IA para uma linha que deu memory-miss (CLSAI-01).
   * Anexado pela ação de ingestão (Plan 02) a partir de `classifyDescriptors`; é só
   * uma dica — NUNCA é aplicado a `category_id` (sem auto-commit, o palpite permanece
   * palpite). A Phase 16 renderiza esta dica na grade enquanto o usuário a aplica
   * manualmente. Opcional porque linhas persistidas antigas não o têm e os parsers
   * puros nunca o definem. `source: 'ia'` marca a origem do palpite.
   */
  suggestion?: { categoryId: string | null; confidence: number; source: 'ia' }
}
