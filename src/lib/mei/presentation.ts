// src/lib/mei/presentation.ts
// The MEI status → UI-token mapper: the adherence.ts twin for the MEI limit status.
// Pure, NO DB, NO money math. Maps the discriminated MeiStatus (from status.ts) to
// the existing semantic tokens + the verde/âmbar/vermelho wording + a lucide glyph
// NAME, reusing the Phase-3 tiered grammar (income/consumption/destructive) — no new
// color token. The 20% band sub-distinction (banda vs fora) is carried by the
// label + glyph, never a second red. The four labels come from the UI-SPEC
// Copywriting Contract and live HERE as the single source. (UI-SPEC §Semantic Color)

import type { MeiStatus } from './status'

/** Lucide glyph identifiers (resolved to icons by the badge, kept stringly here). */
export type MeiGlyph =
  | 'check-circle-2'
  | 'triangle-alert'
  | 'alert-octagon'
  | 'octagon-x'

export type MeiStatusTokens = {
  /** The gauge fill color class (LimiteGauge), reusing the adherence tiered tokens. */
  fill: string
  /** The status text / badge color class (hero figure + badge). */
  text: string
  /** pt-BR status label — color is never the sole signal. */
  label: string
  /** The lucide glyph name the badge renders alongside the label. */
  glyph: MeiGlyph
}

const STATUS_TOKENS: Record<MeiStatus, MeiStatusTokens> = {
  // verde (tranquilo) — comfortably under the limit; income = good outcome.
  verde: {
    fill: 'bg-income',
    text: 'text-income',
    label: 'Dentro do limite',
    glyph: 'check-circle-2',
  },
  // âmbar (aproximando) — ≥80% e <100%.
  ambar: {
    fill: 'bg-consumption',
    text: 'text-consumption',
    label: 'Aproximando do limite',
    glyph: 'triangle-alert',
  },
  // vermelho — acima do limite, dentro da tolerância de 20%.
  'vermelho-banda': {
    fill: 'bg-destructive',
    text: 'text-destructive',
    label: 'Acima do limite — dentro da tolerância de 20%',
    glyph: 'alert-octagon',
  },
  // vermelho — acima da tolerância de 20% (risco de desenquadramento).
  'vermelho-fora': {
    fill: 'bg-destructive',
    text: 'text-destructive',
    label: 'Acima da tolerância de 20%',
    glyph: 'octagon-x',
  },
}

/** Resolve the fill/text/label/glyph tokens for a MeiStatus. */
export function meiStatusTokens(status: MeiStatus): MeiStatusTokens {
  return STATUS_TOKENS[status]
}
