// Centavos are the only money representation. Parse once at ingest;
// format only at the UI edge. Never store or compute money as a float. (SEC-02)

/**
 * Parse a pt-BR currency string (e.g. "1.234,56") into integer centavos.
 * Strips thousands dots, treats the comma as the decimal separator, and
 * rounds exactly once to avoid IEEE-754 drift.
 */
export function parseBRLToCents(input: string): number {
  const normalized = input.trim().replace(/\./g, '').replace(',', '.')
  return Math.round(Number(normalized) * 100)
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Format integer centavos as a pt-BR currency string (e.g. 123456 -> "R$ 1.234,56").
 * Only call this at the display edge.
 */
export function formatCents(cents: number): string {
  return brl.format(cents / 100)
}
