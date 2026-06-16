// Pure presentation layer for adherence. NO DB, NO money math beyond integer
// basis-points → percent formatting. The adherence ratio (`adherence_bp`) and the
// `direction` come from the security_invoker views (0014); this module maps them to
// the UI-SPEC §"Semantic Color — Direction-Aware Adherence" status + token, and
// formats the realized percentage. Imported by the dashboard slice (Plan 03) and
// its unit test (Plan 02). (BUD-02/BUD-04)

/** Meta direction: 'teto' = consumo (não exceder), 'alvo' = alocação (atingir). */
export type Direction = 'teto' | 'alvo'

/**
 * The default meta direction for a category kind (BUD-01): consumo → 'teto' (não
 * exceder), alocacao → 'alvo' (atingir). This is the pure business rule the MetaDialog
 * prefills from the category's kind; the user may override it before saving and the
 * action persists whatever direction the form sends. Kept here (not in the action or
 * the DB) so the form, the action contract, and the tests share one source of truth.
 */
export function directionForKind(kind: 'consumo' | 'alocacao'): Direction {
  return kind === 'alocacao' ? 'alvo' : 'teto'
}

/**
 * Discriminated adherence status. 'sem-receita' is shared (adherence_bp === null,
 * i.e. no net income in the period → the % meta is undefined). The teto branch and
 * the alvo branch are otherwise disjoint.
 */
export type AdherenceStatus =
  | 'sem-receita'
  | 'no-limite' // teto < 80%
  | 'aproximando' // teto 80–100%
  | 'estourou' // teto ≥ 100%
  | 'abaixo' // alvo < 80%
  | 'quase-la' // alvo 80–100%
  | 'atingido' // alvo ≥ 100%

// 80% / 100% thresholds expressed in basis-points of the meta (8000 = 80%, 10000 = 100%).
const BP_80 = 8000
const BP_100 = 10000

/**
 * Map (adherence_bp, direction) → an AdherenceStatus using the fixed 80%/100%
 * thresholds. `adherence_bp` is realized ÷ meta in basis-points of the meta
 * (8000 = 80% of the meta reached, 10000 = exactly the meta). `null` → 'sem-receita'
 * (no income in the period, the % meta cannot be computed — Pitfall 2).
 */
export function adherenceStatus(
  adherenceBp: number | null,
  direction: Direction,
): AdherenceStatus {
  if (adherenceBp === null) return 'sem-receita'

  if (direction === 'teto') {
    if (adherenceBp >= BP_100) return 'estourou'
    if (adherenceBp >= BP_80) return 'aproximando'
    return 'no-limite'
  }

  // alvo
  if (adherenceBp >= BP_100) return 'atingido'
  if (adherenceBp >= BP_80) return 'quase-la'
  return 'abaixo'
}

/** Semantic tokens for a status (UI-SPEC §"Semantic Color — Direction-Aware Adherence"). */
export type AdherenceTokens = {
  /** The bar fill color class (`AdherenceBar`). */
  fill: string
  /** The status text / badge color class. */
  text: string
  /** pt-BR status label rendered alongside the color (color is never the sole signal). */
  label: string
}

const STATUS_TOKENS: Record<AdherenceStatus, AdherenceTokens> = {
  // teto (consumo): amber while under, fuller amber near, red over.
  'no-limite': { fill: 'bg-consumption', text: 'text-muted-foreground', label: 'No limite' },
  aproximando: { fill: 'bg-consumption', text: 'text-consumption', label: 'Aproximando' },
  estourou: { fill: 'bg-destructive', text: 'text-destructive', label: 'Estourou' },
  // alvo (alocação): muted while far, indigo near, green when reached.
  abaixo: { fill: 'bg-muted-foreground', text: 'text-muted-foreground', label: 'Abaixo' },
  'quase-la': { fill: 'bg-allocation', text: 'text-allocation', label: 'Quase lá' },
  atingido: { fill: 'bg-income', text: 'text-income', label: 'Atingido' },
  // shared: no income in the period.
  'sem-receita': { fill: 'bg-muted', text: 'text-muted-foreground', label: 'Sem receita' },
}

/** Resolve the fill/text/label tokens for an AdherenceStatus. */
export function adherenceTokens(status: AdherenceStatus): AdherenceTokens {
  return STATUS_TOKENS[status]
}

const PERCENT_FMT = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

/**
 * Format an adherence/percent value (basis-points of the meta, where 10000 = 100%)
 * as a pt-BR percent string. NEVER returns NaN%/Infinity%: a `null` bp (no receita)
 * returns the dash placeholder — the caller renders the full "sem receita" copy.
 */
export function formatBpAsPercent(bp: number | null): string {
  if (bp === null || !Number.isFinite(bp)) return '—'
  return PERCENT_FMT.format(bp / 10000)
}
