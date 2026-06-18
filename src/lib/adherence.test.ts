// 3-W0-09 (BUD-04 — unit, NO DB): the direction-aware status mapper pins the exact
// 80%/100% thresholds (teto: no-limite/aproximando/estourou; alvo: abaixo/quase-la/
// atingido), null bp → sem-receita, and the percent formatter never renders NaN%/
// Infinity% (Pitfall 2). Pure — imports the Plan-01 adherence.ts directly.
//
// GREEN now: adherence.ts shipped in 03-01.

import { describe, it, expect } from 'vitest'
import {
  adherenceStatus,
  adherenceTokens,
  formatBpAsPercent,
  shouldRenderMetaRow,
  type Direction,
} from './adherence'

// 80% = 8000 bp of the meta; 100% = 10000 bp.
const BP_79 = 7900
const BP_80 = 8000
const BP_100 = 10000
const BP_120 = 12000

describe('adherenceStatus — teto (consumo: não exceder)', () => {
  const teto: Direction = 'teto'
  it('< 80% → no-limite', () => {
    expect(adherenceStatus(BP_79, teto)).toBe('no-limite')
    expect(adherenceStatus(0, teto)).toBe('no-limite')
  })
  it('80%..<100% → aproximando (80% is inclusive)', () => {
    expect(adherenceStatus(BP_80, teto)).toBe('aproximando')
    expect(adherenceStatus(9999, teto)).toBe('aproximando')
  })
  it('>= 100% → estourou (100% is inclusive)', () => {
    expect(adherenceStatus(BP_100, teto)).toBe('estourou')
    expect(adherenceStatus(BP_120, teto)).toBe('estourou')
  })
})

describe('adherenceStatus — alvo (alocação: atingir)', () => {
  const alvo: Direction = 'alvo'
  it('< 80% → abaixo', () => {
    expect(adherenceStatus(BP_79, alvo)).toBe('abaixo')
    expect(adherenceStatus(0, alvo)).toBe('abaixo')
  })
  it('80%..<100% → quase-la (80% inclusive)', () => {
    expect(adherenceStatus(BP_80, alvo)).toBe('quase-la')
    expect(adherenceStatus(9999, alvo)).toBe('quase-la')
  })
  it('>= 100% → atingido (100% inclusive)', () => {
    expect(adherenceStatus(BP_100, alvo)).toBe('atingido')
    expect(adherenceStatus(BP_120, alvo)).toBe('atingido')
  })
})

describe('adherenceStatus — shared sem-receita', () => {
  it('null bp → sem-receita for both directions', () => {
    expect(adherenceStatus(null, 'teto')).toBe('sem-receita')
    expect(adherenceStatus(null, 'alvo')).toBe('sem-receita')
  })
})

describe('adherenceTokens — every status resolves a fill/text/label', () => {
  const statuses = [
    'sem-receita',
    'no-limite',
    'aproximando',
    'estourou',
    'abaixo',
    'quase-la',
    'atingido',
  ] as const
  for (const s of statuses) {
    it(`${s} has non-empty fill/text/label`, () => {
      const t = adherenceTokens(s)
      expect(t.fill).toBeTruthy()
      expect(t.text).toBeTruthy()
      expect(t.label).toBeTruthy()
    })
  }
})

describe('adherenceTokens — calm under-teto copy (G-04)', () => {
  it('a teto well under its cap reads a calm "Dentro", not "No limite"', () => {
    // 280 bp = 2,8% of the meta — a low-utilization teto must NOT imply "at the cap".
    expect(adherenceTokens(adherenceStatus(280, 'teto')).label).toBe('Dentro')
  })
  it('zero spend under a teto is calm "Dentro"', () => {
    expect(adherenceTokens(adherenceStatus(0, 'teto')).label).toBe('Dentro')
  })
  it('the other status labels are unchanged', () => {
    expect(adherenceTokens(adherenceStatus(8000, 'teto')).label).toBe('Aproximando')
    expect(adherenceTokens(adherenceStatus(10000, 'teto')).label).toBe('Estourou')
    expect(adherenceTokens(adherenceStatus(0, 'alvo')).label).toBe('Abaixo')
    expect(adherenceTokens(adherenceStatus(8000, 'alvo')).label).toBe('Quase lá')
    expect(adherenceTokens(adherenceStatus(10000, 'alvo')).label).toBe('Atingido')
    expect(adherenceTokens(adherenceStatus(null, 'teto')).label).toBe('Sem receita')
  })
})

describe('shouldRenderMetaRow — a saved meta is visible when there is income (G-03)', () => {
  it('meta + income, even at zero spend → rendered', () => {
    expect(shouldRenderMetaRow({ hasMeta: true, incomeCents: 100000 })).toBe(true)
  })
  it('meta but no income → not rendered (the % meta is undefined → sem-receita copy)', () => {
    expect(shouldRenderMetaRow({ hasMeta: true, incomeCents: 0 })).toBe(false)
  })
  it('income but no meta → not rendered', () => {
    expect(shouldRenderMetaRow({ hasMeta: false, incomeCents: 100000 })).toBe(false)
  })
  it('accepts bigint income', () => {
    expect(shouldRenderMetaRow({ hasMeta: true, incomeCents: 100000n })).toBe(true)
    expect(shouldRenderMetaRow({ hasMeta: true, incomeCents: 0n })).toBe(false)
  })
})

describe('formatBpAsPercent — never NaN%/Infinity%', () => {
  it('renders a fractional percent in pt-BR (72,5%)', () => {
    // 7250 bp of the meta = 72.5%.
    expect(formatBpAsPercent(7250)).toBe('72,5%')
  })
  it('renders 100% exactly', () => {
    expect(formatBpAsPercent(10000)).toBe('100%')
  })
  it('null → dash placeholder (never NaN%)', () => {
    expect(formatBpAsPercent(null)).toBe('—')
  })
  it('non-finite → dash placeholder (never Infinity%)', () => {
    expect(formatBpAsPercent(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatBpAsPercent(Number.NaN)).toBe('—')
  })
})
