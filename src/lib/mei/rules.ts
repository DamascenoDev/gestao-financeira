// src/lib/mei/rules.ts
// The ONLY place MEI rule numbers live (D-MEI-RULES). A 2027 limit change is ONE edit
// here (plus the matching SQL literal in 0026_mei_views.sql, which rules.test.ts holds
// in parity). Confirm against the Receita / Portal do Empreendedor manual each tax year.
// Money is integer centavos — NEVER reais floats (money.ts invariant).
//
// VERIFIED 2026 (research 2026-06-16): no 2026 change from the long-standing figures.

/** Full calendar-year gross-revenue ceiling (centavos). 2026: R$ 81.000,00. */
export const MEI_ANNUAL_LIMIT_CENTS = 8_100_000

/** Proportional monthly rate for the opening year (centavos). 2026: R$ 6.750,00/mês ativo. */
export const MEI_MONTHLY_RATE_CENTS = 675_000

/** Tolerance band as basis points over the applicable limit. 20% = 2000 bp → ×1.20. */
export const MEI_TOLERANCE_BP = 2000

/** Alert threshold as basis points of the applicable limit. 80% = 8000 bp (MEI-05). */
export const MEI_ALERT_BP = 8000

/** DASN-SIMEI deadline (month/day) for the PRIOR calendar year. 31 de maio. */
export const DASN_DEADLINE = { month: 5, day: 31 } as const

/** Tax year these numbers were verified against (surface in the MEI-06 disclaimer). */
export const MEI_RULES_YEAR = 2026
