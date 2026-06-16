// Centavos are the only money representation. Parse once at ingest;
// format only at the UI edge. Never store or compute money as a float. (SEC-02)

/**
 * Parse a pt-BR currency string (e.g. "1.234,56", "R$ 10,00", "10,00") into
 * integer centavos. Strips an optional R$ prefix and surrounding whitespace,
 * removes thousands dots, treats the comma as the decimal separator, and
 * rounds exactly once to avoid IEEE-754 drift.
 *
 * Rejects non-money input by throwing — never silently returns NaN or 0.
 * Blank/whitespace-only and unparseable strings (e.g. "abc") are invalid
 * (HG-01: silent NaN/0 is a money-corruption vector for a financial app).
 *
 * Enforces the app's core money invariant in ONE place: the result must be a
 * STRICTLY POSITIVE integer of centavos (HG-03). Negative and zero amounts are
 * rejected here — they are not a valid domain value for a receita/transação and
 * must never depend on a divergent DB CHECK to be caught.
 *
 * Rejects ambiguous thousands-grouping input rather than silently coercing it to
 * a plausible-but-wrong value (WR-05): "10.5" (a US-style decimal) is NOT R$ 105,00.
 */
export function parseBRLToCents(input: string): number {
  const trimmed = input.trim().replace(/^R\$\s*/i, '')
  // Validate the pt-BR grouping shape on the pre-strip string so ambiguous input
  // ("1.2.3,45", "10.5") becomes a field error rather than a wrong amount (WR-05).
  // Accepts: optional sign, integer part with optional well-formed thousands dots,
  // optional ",dd" decimals.
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Valor monetário inválido: "${input}"`)
  }
  const normalized = trimmed.replace(/\./g, '').replace(',', '.')
  const value = Number(normalized)
  const cents = Math.round(value * 100)
  if (normalized === '' || !Number.isFinite(value) || cents <= 0) {
    throw new Error(`Valor monetário inválido: "${input}"`)
  }
  return cents
}

/**
 * Coerce a money column straight to `bigint` centavos WITHOUT going through a JS
 * float (MD-04). supabase-js surfaces a Postgres `bigint` as `string`, `number`,
 * or `bigint` depending on magnitude/driver; the generated types say `number`,
 * but a `Number(...)` cast is exactly the lossy step the bigint-safe `formatCents`
 * exists to avoid above Number.MAX_SAFE_INTEGER. Use this for any value that feeds
 * `formatCents` or is summed as money.
 */
export function centsToBigInt(value: number | bigint | string | null | undefined): bigint {
  if (value === null || value === undefined) return 0n
  if (typeof value === 'bigint') return value
  // BigInt() throws on a non-integer float; money columns are always integers,
  // so a string ("90000000000000") or an integer number both convert exactly.
  return BigInt(value)
}

/**
 * Format integer centavos as the RAW pt-BR string the MoneyInput / edit dialogs
 * prefill (e.g. 123456 -> "1.234,56", no "R$"). Done entirely on the bigint via
 * integer division so it NEVER round-trips money through a float (WR-02): the
 * value can be sent back through parseBRLToCents on save with zero rounding drift.
 */
export function centsToEditableBRL(value: number | bigint | string | null | undefined): string {
  const c = centsToBigInt(value)
  const negative = c < 0n
  const abs = negative ? -c : c
  const reais = abs / 100n
  const cents = abs % 100n
  const sign = negative ? '-' : ''
  return `${sign}${groupReais(reais)},${cents.toString().padStart(2, '0')}`
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// Groups an integer-reais bigint with pt-BR thousands dots (e.g. 90000000000000n
// -> "90.000.000.000.000"). Done on the bigint's decimal string so the major
// unit stays exact above Number.MAX_SAFE_INTEGER — never round-tripped through
// a float. (MD-01)
function groupReais(reais: bigint): string {
  const digits = reais.toString()
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Format integer centavos as a pt-BR currency string (e.g. 123456 -> "R$ 1.234,56").
 * Only call this at the display edge.
 *
 * Accepts `number | bigint` because money is stored as `bigint` centavos and
 * supabase-js may surface a bigint column as `number`, `bigint`, or `string`.
 * The bigint path keeps the major/minor split exact via integer division, so
 * values beyond Number.MAX_SAFE_INTEGER centavos do not lose precision. The
 * number path is guarded against unsafe integers (MD-01: the bigint↔number
 * boundary is exactly where the "no float in money" discipline can leak).
 */
export function formatCents(cents: number | bigint): string {
  if (typeof cents === 'number' && !Number.isSafeInteger(cents)) {
    throw new Error(`Centavos fora do intervalo inteiro seguro: ${cents}`)
  }
  const c = typeof cents === 'bigint' ? cents : BigInt(cents)
  const negative = c < 0n
  const abs = negative ? -c : c
  const reais = abs / 100n
  const centsPart = abs % 100n
  // For values within the safe range, defer entirely to Intl (canonical
  // symbol/spacing). Above it, assemble the string ourselves with the exact
  // bigint-grouped reais so no float drift can occur.
  if (abs <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return brl.format(Number(c) / 100)
  }
  const sign = negative ? '-' : ''
  return `${sign}R$ ${groupReais(reais)},${centsPart.toString().padStart(2, '0')}`
}
