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
//
// KW-09 (Phase 21): `normalizeKeyword` is the keyword-aware variant of the SAME
// pipeline. For a cadastro keyword the `*` is glob SYNTAX, not card-network noise,
// so it must SURVIVE normalization — otherwise "UBER*" would be persisted as "uber"
// and the wildcard could never reach the DB (RESEARCH §Pitfall 1). The two — and
// ONLY two — differences from `normalizeDescriptor` (Assumption A3): (a) the keyword
// variant does NOT run the `\*+ → space` strip, and (b) it keeps `*` in the final
// punctuation allow-list. Everything else (NFKD, accent strip, lowercase, payment
// tokens, dates, long digit runs, trailing UF, whitespace collapse) stays bit-
// identical so keyword and descriptor remain in the SAME key space. The descriptor
// side MUST keep stripping `*` (it is noise there — "UBER *TRIP" → "uber trip").

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
  return runNormalizePipeline(raw, false)
}

/**
 * KW-09: keyword-aware normalization. Bit-identical to {@link normalizeDescriptor}
 * EXCEPT that the glob `*` is preserved (no `\*+ → space` strip; `*` kept in the
 * final punctuation allow-list). For any input WITHOUT a `*`, the output equals
 * normalizeDescriptor's — so keyword and descriptor stay in the same key space and
 * the v1.5 substring match is intact.
 *
 * Empty / whitespace-only input → '' (the non-match sentinel). A lone `*` (or `**`)
 * survives here as wildcard chars; rejecting a literal-count-0 keyword is the
 * caller's (addKeyword) responsibility, not this pure normalizer's.
 */
export function normalizeKeyword(raw: string): string {
  return runNormalizePipeline(raw, true)
}

/**
 * Shared normalize pipeline. `keepWildcard=false` is the descriptor behavior
 * (strips `*` as card-network noise); `keepWildcard=true` is the keyword behavior
 * (preserves `*` as glob syntax). The ONLY two branch points are the `\*+` strip
 * and the final punctuation allow-list — everything else is identical so the two
 * outputs share one key space (RESEARCH §Pitfall 1, Assumption A3).
 */
function runNormalizePipeline(raw: string, keepWildcard: boolean): string {
  // BR statement descriptors append `  CITY UF` after a multi-space gap; the
  // merchant identity lives in the first segment. Keeping only it is what makes
  // "PADARIA SAO JOAO  SAO PAULO BR" and "PADARIA SAO JOAO" collapse to one key.
  const merchant = raw.split(/\s{2,}/)[0] ?? ''
  let s = merchant
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(PAYMENT_TOKENS, ' ')
    .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, ' ') // dates DD/MM[/YY[YY]]
  if (!keepWildcard) {
    s = s.replace(/\*+/g, ' ') // card-network `*` noise (descriptor only)
  }
  s = s
    .replace(/\d{4,}/g, ' ') // long digit runs (terminal/store #)
    // any remaining punctuation → space. The keyword variant keeps `*` (glob
    // syntax); the descriptor variant has already stripped every `*` above.
    .replace(keepWildcard ? /[^a-z0-9 *]/g : /[^a-z0-9 ]/g, ' ')
    // IN-02: strip ONLY a real trailing UF state code, not any 2-letter word — a
    // merchant ending in a legitimate 2-letter token ("bar xv" → "bar") must not be
    // over-stripped into a different/empty key (a false-merge vector).
    .replace(
      /\s(?:ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\s*$/,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
  return s
}
