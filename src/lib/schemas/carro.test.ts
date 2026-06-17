import { describe, it, expect } from 'vitest'

import { carroSchema } from './carro'

// Unit tests for the carro Zod boundary (CAR-01, T-08-07). The assertOwnedCarro
// ownership re-derive (Task 1) is asserted through the IDOR no-write cases in
// src/actions/carros.test.ts (it needs the RLS-active client mock).

describe('carroSchema', () => {
  it('accepts apelido alone (all other fields optional)', () => {
    const r = carroSchema.safeParse({ apelido: 'Carro da família' })
    expect(r.success).toBe(true)
  })

  it('rejects an empty/whitespace apelido with the friendly message', () => {
    const empty = carroSchema.safeParse({ apelido: '' })
    expect(empty.success).toBe(false)
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe('Informe o apelido')
    }
    const blank = carroSchema.safeParse({ apelido: '   ' })
    expect(blank.success).toBe(false)
  })

  it('accepts a sane integer ano and an omitted ano', () => {
    expect(carroSchema.safeParse({ apelido: 'A', ano: 2020 }).success).toBe(true)
    expect(carroSchema.safeParse({ apelido: 'A' }).success).toBe(true)
  })

  it('rejects an out-of-range ano with "Ano inválido"', () => {
    const tooOld = carroSchema.safeParse({ apelido: 'A', ano: 1899 })
    expect(tooOld.success).toBe(false)
    if (!tooOld.success) {
      expect(tooOld.error.issues[0]?.message).toBe('Ano inválido')
    }
    const tooNew = carroSchema.safeParse({
      apelido: 'A',
      ano: new Date().getFullYear() + 2,
    })
    expect(tooNew.success).toBe(false)
  })

  it('accepts each valid combustivel_padrao and rejects any other string', () => {
    for (const c of ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'GNV'] as const) {
      expect(
        carroSchema.safeParse({ apelido: 'A', combustivel_padrao: c }).success,
      ).toBe(true)
    }
    expect(
      carroSchema.safeParse({ apelido: 'A', combustivel_padrao: 'Hidrogênio' })
        .success,
    ).toBe(false)
    // absent is accepted (optional)
    expect(carroSchema.safeParse({ apelido: 'A' }).success).toBe(true)
  })

  it('accepts optional modelo/placa free text', () => {
    const r = carroSchema.safeParse({
      apelido: 'A',
      modelo: 'Onix 1.0',
      placa: 'ABC1D23',
    })
    expect(r.success).toBe(true)
  })
})
