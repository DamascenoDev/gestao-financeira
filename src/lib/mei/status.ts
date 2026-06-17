// src/lib/mei/status.ts
// Pure tiered-status mapper (the adherence.ts twin) — NO DB, NO limit recompute. It
// consumes the v_mei_year_summary numbers (ratio_bp + gross vs band_ceiling) and maps
// them to the discriminated MEI status. The 20% band distinguishes vermelho-banda
// (gross ≤ ceiling → migra Simples ano seguinte, DAS complementar) from vermelho-fora
// (gross > ceiling → desenquadramento retroativo). (MEI-02 / MEI-05)

import { MEI_ALERT_BP } from './rules'

export type MeiStatus = 'verde' | 'ambar' | 'vermelho-banda' | 'vermelho-fora'

// 100% expressed in basis-points of the applicable limit (10000 = exactly the limit).
const BP_100 = 10000

/**
 * Map (ratioBp, grossCents, bandCeilingCents) → a MeiStatus using the fixed 80%/100%
 * thresholds + the 20% band edge. `ratioBp` is gross ÷ applicable limit in basis
 * points (8000 = 80%, 10000 = 100%); `null` (pre-opening year, no applicable limit)
 * → 'verde'. Gross vs band is compared as BigInt so no float intermediate appears in
 * the money math (Pitfall 5).
 */
export function meiStatus(
  ratioBp: number | null,
  grossCents: number | bigint,
  bandCeilingCents: number | bigint,
): MeiStatus {
  if (ratioBp === null) return 'verde' // no applicable limit yet (pre-opening year)
  if (ratioBp < MEI_ALERT_BP) return 'verde' // < 80%
  // Exactly at the ceiling (ratioBp === 10000, gross === applicable to the centavo)
  // is still WITHIN the limit, not above it: desenquadramento triggers when gross
  // *exceeds* the limit, not when it equals it (LR-01). The ceiling is a value the
  // MEI may reach. So the band/over-limit branch fires only strictly above 100%.
  if (ratioBp <= BP_100) return 'ambar' // 80–100% inclusive → approaching / at limit
  return BigInt(grossCents) <= BigInt(bandCeilingCents)
    ? 'vermelho-banda' // over limit, within +20% → migra Simples ano seguinte
    : 'vermelho-fora' // > +20% → desenquadramento retroativo
}

/**
 * The MEI-05 alert flag: true once the gross reaches 80% (MEI_ALERT_BP) of the
 * applicable limit. `null` (pre-opening) → false (no limit to be near).
 */
export function isNearLimit(ratioBp: number | null): boolean {
  return ratioBp !== null && ratioBp >= MEI_ALERT_BP
}
