import { describe, it, expect } from 'vitest'

import { abastecimentoSchema } from './abastecimento'

// Unit tests for the abastecimento Zod schema (CAR-03). The security-critical
// invariant is the cost-source XOR: an abastecimento's cost comes from EXACTLY
// ONE source — a linked fatura transaction (transactionId) OR a manual value
// (amountCents) — never both, never neither (D2; mirrors the DB cost XOR CHECK
// in migration 0027). The schema also pins the field bounds (odometroKm int>0,
// litros numeric>0, combustivel enum, occurredOn yyyy-MM-dd).

const CARRO_ID = '44444444-4444-4444-8444-444444444444'
const TX_ID = '55555555-5555-5555-8555-555555555555'

/** A valid manual base: cost from amountCents, no transactionId. */
const manualBase = {
  carroId: CARRO_ID,
  occurredOn: '2026-06-17',
  odometroKm: 10000,
  litros: 40.5,
  tanqueCheio: true,
  combustivel: 'Gasolina' as const,
  amountCents: 25000,
}

/** A valid from-fatura base: cost from the linked transaction, no amountCents. */
const fromFaturaBase = {
  carroId: CARRO_ID,
  occurredOn: '2026-06-17',
  odometroKm: 10000,
  litros: 40.5,
  tanqueCheio: true,
  combustivel: 'Gasolina' as const,
  transactionId: TX_ID,
}

/**
 * A valid parcelado base: cost from valorTotalCents + parcelasTotal, with NO
 * transactionId and NO amountCents (mirrors the 0039 cost XOR truth table for
 * a parcelado fuel-up — parcelas_total > 1 → valor_total_cents present, both
 * transaction_id and amount_cents null).
 */
const parceladoBase = {
  carroId: CARRO_ID,
  occurredOn: '2026-06-17',
  odometroKm: 10000,
  litros: 40.5,
  tanqueCheio: true,
  combustivel: 'Gasolina' as const,
  valorTotalCents: 60000,
  parcelasTotal: 6,
}

const COST_SOURCE_MESSAGE =
  'Informe exatamente uma fonte de custo: lançamento da fatura ou valor manual.'

describe('abastecimentoSchema — valid inputs', () => {
  it('accepts a valid manual abastecimento (amountCents, no transactionId)', () => {
    const r = abastecimentoSchema.safeParse(manualBase)
    expect(r.success).toBe(true)
  })

  it('accepts a valid from-fatura abastecimento (transactionId, no amountCents)', () => {
    const r = abastecimentoSchema.safeParse(fromFaturaBase)
    expect(r.success).toBe(true)
  })

  it('accepts a decimal litros (e.g. 40.123)', () => {
    const r = abastecimentoSchema.safeParse({ ...manualBase, litros: 40.123 })
    expect(r.success).toBe(true)
  })

  it('accepts an absent/undefined combustivel', () => {
    const { combustivel: _drop, ...rest } = manualBase
    const r = abastecimentoSchema.safeParse(rest)
    expect(r.success).toBe(true)
  })

  it('accepts a null combustivel', () => {
    const r = abastecimentoSchema.safeParse({ ...manualBase, combustivel: null })
    expect(r.success).toBe(true)
  })
})

describe('abastecimentoSchema — cost-source XOR (D2)', () => {
  it('rejects BOTH transactionId AND amountCents with the cost-source message', () => {
    const r = abastecimentoSchema.safeParse({
      ...manualBase,
      transactionId: TX_ID,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === COST_SOURCE_MESSAGE)).toBe(true)
    }
  })

  it('rejects NEITHER transactionId NOR amountCents with the cost-source message', () => {
    const { amountCents: _drop, ...rest } = manualBase
    const r = abastecimentoSchema.safeParse(rest)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === COST_SOURCE_MESSAGE)).toBe(true)
    }
  })
})

describe('abastecimentoSchema — parcelado (3 estados)', () => {
  it('accepts a valid parcelado (valorTotalCents + parcelasTotal, no tx/amount)', () => {
    const r = abastecimentoSchema.safeParse(parceladoBase)
    expect(r.success).toBe(true)
  })

  it('accepts parcelasTotal at the lower bound (2)', () => {
    const r = abastecimentoSchema.safeParse({ ...parceladoBase, parcelasTotal: 2 })
    expect(r.success).toBe(true)
  })

  it('accepts parcelasTotal at the upper bound (24)', () => {
    const r = abastecimentoSchema.safeParse({ ...parceladoBase, parcelasTotal: 24 })
    expect(r.success).toBe(true)
  })

  it('rejects parcelasTotal < 2 (e.g. 1) when valorTotalCents is present', () => {
    // parcelas_total === 1 with a valor_total_cents is a mixed/invalid state:
    // not parcelado (needs > 1) and not à-vista (has no tx/amount, carries valor).
    const r = abastecimentoSchema.safeParse({ ...parceladoBase, parcelasTotal: 1 })
    expect(r.success).toBe(false)
  })

  it('rejects parcelasTotal > 24 (e.g. 25) — D-07 ceiling', () => {
    const r = abastecimentoSchema.safeParse({ ...parceladoBase, parcelasTotal: 25 })
    expect(r.success).toBe(false)
  })

  it('rejects a non-integer parcelasTotal (e.g. 6.5)', () => {
    const r = abastecimentoSchema.safeParse({ ...parceladoBase, parcelasTotal: 6.5 })
    expect(r.success).toBe(false)
  })

  it('rejects valorTotalCents <= 0 (D-09)', () => {
    expect(abastecimentoSchema.safeParse({ ...parceladoBase, valorTotalCents: 0 }).success).toBe(
      false,
    )
    expect(
      abastecimentoSchema.safeParse({ ...parceladoBase, valorTotalCents: -100 }).success,
    ).toBe(false)
  })

  it('rejects a MIXED state: parcelado + transactionId present', () => {
    const r = abastecimentoSchema.safeParse({ ...parceladoBase, transactionId: TX_ID })
    expect(r.success).toBe(false)
  })

  it('rejects a MIXED state: parcelado + amountCents present', () => {
    const r = abastecimentoSchema.safeParse({ ...parceladoBase, amountCents: 25000 })
    expect(r.success).toBe(false)
  })

  it('rejects parcelasTotal >= 2 WITHOUT valorTotalCents (parcelado needs the cost)', () => {
    const { valorTotalCents: _drop, ...rest } = parceladoBase
    const r = abastecimentoSchema.safeParse(rest)
    expect(r.success).toBe(false)
  })

  it('rejects an à-vista state that also carries valorTotalCents', () => {
    // À-vista (amountCents) must NEVER carry valorTotalCents — mirrors the 0039
    // CHECK else-branch (valor_total_cents must be null on the à-vista path).
    const r = abastecimentoSchema.safeParse({ ...manualBase, valorTotalCents: 60000 })
    expect(r.success).toBe(false)
  })
})

describe('abastecimentoSchema — field bounds', () => {
  it('rejects odometroKm <= 0', () => {
    expect(abastecimentoSchema.safeParse({ ...manualBase, odometroKm: 0 }).success).toBe(false)
    expect(abastecimentoSchema.safeParse({ ...manualBase, odometroKm: -5 }).success).toBe(false)
  })

  it('rejects a non-integer odometroKm', () => {
    expect(abastecimentoSchema.safeParse({ ...manualBase, odometroKm: 100.5 }).success).toBe(false)
  })

  it('rejects litros <= 0', () => {
    expect(abastecimentoSchema.safeParse({ ...manualBase, litros: 0 }).success).toBe(false)
    expect(abastecimentoSchema.safeParse({ ...manualBase, litros: -1 }).success).toBe(false)
  })

  it('rejects a combustivel outside the enum', () => {
    const r = abastecimentoSchema.safeParse({
      ...manualBase,
      combustivel: 'Hidrogênio' as never,
    })
    expect(r.success).toBe(false)
  })

  it('rejects an occurredOn that is not yyyy-MM-dd', () => {
    expect(abastecimentoSchema.safeParse({ ...manualBase, occurredOn: '17/06/2026' }).success).toBe(
      false,
    )
  })

  it('rejects a non-uuid carroId', () => {
    expect(abastecimentoSchema.safeParse({ ...manualBase, carroId: 'nope' }).success).toBe(false)
  })

  it('rejects a non-uuid transactionId on the from-fatura path', () => {
    expect(
      abastecimentoSchema.safeParse({ ...fromFaturaBase, transactionId: 'nope' }).success,
    ).toBe(false)
  })

  it('rejects amountCents <= 0', () => {
    expect(abastecimentoSchema.safeParse({ ...manualBase, amountCents: 0 }).success).toBe(false)
    expect(abastecimentoSchema.safeParse({ ...manualBase, amountCents: -100 }).success).toBe(false)
  })
})
