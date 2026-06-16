// THE single shared deterministic merchant-key derivation. This is the ONLY place
// `descriptor_norm` is computed — never re-derive it in a cell, query, or action
// (drift between the matched key and the displayed key is RESEARCH anti-pattern).
//
// Memory match is EXACT on the output of this function (no fuzzy in v1 — avoids the
// false-positive collapse of "UBER trips" vs "UBER eats"). Determinism is
// test-pinned: the same raw input always yields the same key.
//
// [ASSUMED] The noise-strip rule set (card-network/payment tokens, dates, card `*`
// noise, long digit runs, trailing 2-letter UF codes) is tuned against the
// synthetic BR fixtures. It is intentionally tunable on real bank exports later
// (user-deferred — RESEARCH Assumption A1); changing it is a deliberate, tested edit.

/** Card-network / payment-rail tokens that carry no merchant identity. */
const PAYMENT_TOKENS =
  /\b(compra|cartao|debito|credito|pag|pagamento|tef|pix|ted|doc)\b/g

/**
 * Normalize a raw statement descriptor into the stable memory key.
 *
 * Pipeline (order matters — each step assumes the previous ran):
 *  1. keep only the merchant segment: BR exports separate `MERCHANT  CITY UF`
 *     with a multi-space gap, so split on 2+ spaces and take the first segment
 *     ("PADARIA SAO JOAO  SAO PAULO BR" → "PADARIA SAO JOAO")
 *  2. NFKD + strip combining accents  → "SÃO" ≈ "SAO"
 *  3. lowercase
 *  4. drop payment-rail tokens (compra/cartao/debito/.../pix/ted/doc)
 *  5. strip dates DD/MM[/YY[YY]]
 *  6. strip card-network `*` noise ("UBER *TRIP" → "uber trip")
 *  7. drop long digit runs (≥4 — terminal/store ids)
 *  8. drop a trailing 2-letter UF code
 *  9. drop any remaining non-alphanumeric to spaces
 * 10. collapse whitespace + trim
 *
 * Empty / whitespace-only input → '' (a deterministic non-match sentinel).
 */
export function normalizeDescriptor(raw: string): string {
  // BR statement descriptors append `  CITY UF` after a multi-space gap; the
  // merchant identity lives in the first segment. Keeping only it is what makes
  // "PADARIA SAO JOAO  SAO PAULO BR" and "PADARIA SAO JOAO" collapse to one key.
  const merchant = raw.split(/\s{2,}/)[0] ?? ''
  return merchant
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(PAYMENT_TOKENS, ' ')
    .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, ' ') // dates DD/MM[/YY[YY]]
    .replace(/\*+/g, ' ') // card-network `*` noise
    .replace(/\d{4,}/g, ' ') // long digit runs (terminal/store #)
    .replace(/[^a-z0-9 ]/g, ' ') // any remaining punctuation → space
    .replace(/\s+[a-z]{2}\s*$/g, ' ') // trailing 2-letter UF code
    .replace(/\s+/g, ' ')
    .trim()
}
