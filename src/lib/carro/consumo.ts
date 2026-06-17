// Consumption presentation helpers (CAR-04). PURE — no DB, no I/O. The single
// place preco_litro is derived (custo ÷ litros); it is NEVER persisted on the
// abastecimentos row (D2 / 10-CONTEXT). The label helpers render the numbers the
// views (v_abastecimento_consumo / v_carro_resumo) already compute and fall back
// to the '—' sentinel for null/invalid intervals (the view nulls bad data; the
// helper just renders). Money stays in centavos until the display edge.

import { centsToBigInt, formatCents } from '@/lib/money'

/** The dash sentinel rendered for a null/invalid consumption value. */
export const SENTINEL = '—'

/**
 * Derive preço/litro in CENTAVOS = custo (centavos) ÷ litros (volume). This is the
 * only place the per-litre price is computed — it is never a stored column.
 * Returns null for litros <= 0 or non-finite (the guard the view applies for
 * km/l): a meaningless price never surfaces a number. The custo is accepted as
 * number | bigint and routed through centsToBigInt so no float ever touches money.
 */
export function precoLitroCents(
  custoCents: bigint | number,
  litros: number,
): number | null {
  if (!Number.isFinite(litros) || litros <= 0) return null
  const cents = centsToBigInt(custoCents)
  return Number(cents) / litros
}

const KM_PER_LITRO_FMT = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Render km/l (a number from the view, already guarded to null for bad intervals)
 * as a pt-BR one-decimal string, or the '—' sentinel for null / non-positive /
 * non-finite values. The view never emits a non-positive km/l, but the helper
 * guards defensively so no nonsense number is ever shown.
 */
export function kmPerLitroLabel(kmPorLitro: number | null): string {
  if (kmPorLitro === null || !Number.isFinite(kmPorLitro) || kmPorLitro <= 0) {
    return SENTINEL
  }
  return KM_PER_LITRO_FMT.format(kmPorLitro)
}

/**
 * Render R$/km (centavos/km from the view) as a pt-BR currency string, or the '—'
 * sentinel for null / non-positive / non-finite values. The input is centavos/km;
 * formatCents renders it at the currency edge (e.g. 48 → "R$ 0,48").
 */
export function reaisPerKmLabel(reaisPorKmCents: number | null): string {
  if (
    reaisPorKmCents === null ||
    !Number.isFinite(reaisPorKmCents) ||
    reaisPorKmCents <= 0
  ) {
    return SENTINEL
  }
  // Round to whole centavos at the display edge (the view stores a numeric ratio).
  return formatCents(Math.round(reaisPorKmCents))
}
