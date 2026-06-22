import { describe, it, expect } from 'vitest'

import {
  parcelaTargetCents,
  matchesValue,
  assignAbastecimentoMatches,
  type AbastecimentoMatchCandidate,
  type AbastecimentoMatchRow,
} from './abastecimento-match'

// Unit tests for the PURE value-match logic (CAR-09 / CAR-11). NO DB, NO I/O —
// entradas são objetos puros. Cobre o predicado D-01 (floor/ceil em centavos
// inteiros), o sem-filtro-de-data D-02, o desempate por data mais próxima + FIFO
// D-03, e a atribuição greedy 1:1 + ≤1 parcela/fatura D-04. Espelha o estilo da
// suíte pura consumo.test.ts (describe/it/expect, casos de centavos, guards).

/** Helper: monta um candidato à-vista (parcelasTotal null/1 ⇒ usa amountCents). */
function avista(
  over: Partial<AbastecimentoMatchCandidate> & { id: string; amountCents: number },
): AbastecimentoMatchCandidate {
  return {
    carroId: 'carro-1',
    carroApelido: 'Gol',
    occurredOn: '2026-03-10',
    createdAt: '2026-03-10T00:00:00Z',
    parcelasTotal: null,
    valorTotalCents: null,
    jaParceladas: 0,
    ...over,
  }
}

/** Helper: monta um candidato parcelado (parcelasTotal N + valorTotalCents). */
function parcelado(
  over: Partial<AbastecimentoMatchCandidate> & {
    id: string
    parcelasTotal: number
    valorTotalCents: number
  },
): AbastecimentoMatchCandidate {
  return {
    carroId: 'carro-1',
    carroApelido: 'Gol',
    occurredOn: '2026-03-10',
    createdAt: '2026-03-10T00:00:00Z',
    amountCents: null,
    jaParceladas: 0,
    ...over,
  }
}

/** Helper: monta uma linha de revisão (valor em centavos + data). */
function row(id: string, valorCents: number, occurredOn = '2026-03-10'): AbastecimentoMatchRow {
  return { id, amountCents: valorCents, occurredOn }
}

describe('parcelaTargetCents — conjunto-alvo {floor, ceil} (D-01 parcela)', () => {
  it('caso canônico do CONTEXT: 10000 ÷ 3 → {3333, 3334}', () => {
    const target = parcelaTargetCents(10000, 3)
    expect([...target].sort((a, b) => a - b)).toEqual([3333, 3334])
    // As três parcelas reais 3334 + 3333 + 3333 TODAS casam o conjunto.
    expect(target.has(3334)).toBe(true)
    expect(target.has(3333)).toBe(true)
  })

  it('divisão exata: 9000 ÷ 3 → {3000} (floor == ceil)', () => {
    const target = parcelaTargetCents(9000, 3)
    expect([...target]).toEqual([3000])
    expect(target.has(3000)).toBe(true)
    expect(target.has(3001)).toBe(false)
  })

  it('é aritmética inteira — nunca produz frações', () => {
    const target = parcelaTargetCents(10001, 4) // 2500.25 → {2500, 2501}
    expect([...target].sort((a, b) => a - b)).toEqual([2500, 2501])
  })
})

describe('matchesValue — predicado D-01 (à-vista exato + parcela ∈ conjunto)', () => {
  it('à-vista: igualdade exata em inteiros (10000 === 10000 → true)', () => {
    expect(matchesValue(10000, avista({ id: 'a1', amountCents: 10000 }))).toBe(true)
  })

  it('à-vista: 9999 ≠ 10000 → false (sem janela de centavos)', () => {
    expect(matchesValue(9999, avista({ id: 'a1', amountCents: 10000 }))).toBe(false)
  })

  it('à-vista trata parcelasTotal <= 1 como à-vista (igualdade com amountCents)', () => {
    const cand = avista({ id: 'a1', amountCents: 5000, parcelasTotal: 1 })
    expect(matchesValue(5000, cand)).toBe(true)
    expect(matchesValue(2500, cand)).toBe(false)
  })

  it('parcela: cada parcela real do split 10000÷3 casa {3333, 3334}', () => {
    const cand = parcelado({ id: 'p1', parcelasTotal: 3, valorTotalCents: 10000 })
    expect(matchesValue(3334, cand)).toBe(true)
    expect(matchesValue(3333, cand)).toBe(true)
    expect(matchesValue(3335, cand)).toBe(false)
  })

  it('parcela com divisão exata: só 3000 casa 9000÷3', () => {
    const cand = parcelado({ id: 'p1', parcelasTotal: 3, valorTotalCents: 9000 })
    expect(matchesValue(3000, cand)).toBe(true)
    expect(matchesValue(2999, cand)).toBe(false)
    expect(matchesValue(3001, cand)).toBe(false)
  })
})

describe('assignAbastecimentoMatches — D-02 sem filtro de data', () => {
  it('dois abastecimentos com MESMO valor a meses de distância são AMBOS candidatos', () => {
    // Duas linhas com o mesmo valor → cada uma casa um dos dois candidatos (greedy 1:1).
    const candidates = [
      avista({ id: 'a-jan', amountCents: 8000, occurredOn: '2026-01-05' }),
      avista({ id: 'a-jun', amountCents: 8000, occurredOn: '2026-06-20' }),
    ]
    const rows = [row('r1', 8000, '2026-01-06'), row('r2', 8000, '2026-06-21')]
    const result = assignAbastecimentoMatches(rows, candidates)
    // Nenhum dos dois foi descartado por data — ambos viram match.
    expect(result.get('r1')?.abastecimentoId).toBe('a-jan')
    expect(result.get('r2')?.abastecimentoId).toBe('a-jun')
  })
})

describe('assignAbastecimentoMatches — D-03 nearest-by-date + FIFO', () => {
  it('escolhe o candidato de occurred_on mais próximo da linha', () => {
    const candidates = [
      avista({ id: 'a-08', amountCents: 5000, occurredOn: '2026-03-08' }),
      avista({ id: 'a-20', amountCents: 5000, occurredOn: '2026-03-20' }),
    ]
    // Linha em 2026-03-10 → 2026-03-08 (|2d|) mais próximo que 2026-03-20 (|10d|).
    const result = assignAbastecimentoMatches([row('r1', 5000, '2026-03-10')], candidates)
    expect(result.get('r1')?.abastecimentoId).toBe('a-08')
  })

  it('empate de distância → o mais antigo (occurred_on, depois created_at) — FIFO', () => {
    const candidates = [
      avista({
        id: 'a-novo',
        amountCents: 5000,
        occurredOn: '2026-03-12',
        createdAt: '2026-03-12T10:00:00Z',
      }),
      avista({
        id: 'a-antigo',
        amountCents: 5000,
        occurredOn: '2026-03-08',
        createdAt: '2026-03-08T10:00:00Z',
      }),
    ]
    // Linha em 2026-03-10 → ambos a |2d|; empate resolve pelo mais antigo (2026-03-08).
    const result = assignAbastecimentoMatches([row('r1', 5000, '2026-03-10')], candidates)
    expect(result.get('r1')?.abastecimentoId).toBe('a-antigo')
  })
})

describe('assignAbastecimentoMatches — D-04 greedy 1:1', () => {
  it('(a) duas linhas casam o MESMO abastecimento à-vista → só UMA recebe match', () => {
    const candidates = [avista({ id: 'a1', amountCents: 7000, occurredOn: '2026-03-10' })]
    const rows = [row('r1', 7000, '2026-03-10'), row('r2', 7000, '2026-03-11')]
    const result = assignAbastecimentoMatches(rows, candidates)
    const matched = [...result.values()].filter((m) => m.abastecimentoId === 'a1')
    expect(matched.length).toBe(1)
    // A melhor (mais próxima por data) leva: r1 (mesma data) vence r2.
    expect(result.get('r1')?.abastecimentoId).toBe('a1')
    expect(result.has('r2')).toBe(false)
  })

  it('kind do match à-vista é "avista" sem parcelaNum', () => {
    const candidates = [avista({ id: 'a1', amountCents: 7000 })]
    const result = assignAbastecimentoMatches([row('r1', 7000)], candidates)
    const m = result.get('r1')
    expect(m?.kind).toBe('avista')
    expect(m?.parcelaNum).toBeUndefined()
    expect(m?.carroId).toBe('carro-1')
    expect(m?.carroApelido).toBe('Gol')
  })
})

describe('assignAbastecimentoMatches — D-04 ≤1 parcela/fatura', () => {
  it('(b) parcelado N=3 com 2 já na junção + 1 linha casando → 1 match com parcelaNum=3', () => {
    const candidates = [
      parcelado({
        id: 'p1',
        parcelasTotal: 3,
        valorTotalCents: 10000, // {3333, 3334}
        jaParceladas: 2,
      }),
    ]
    const result = assignAbastecimentoMatches([row('r1', 3334, '2026-05-10')], candidates)
    const m = result.get('r1')
    expect(m?.abastecimentoId).toBe('p1')
    expect(m?.kind).toBe('parcela')
    expect(m?.parcelaNum).toBe(3)
  })

  it('(c) parcelado N=3 com 3 já completas → 0 matches', () => {
    const candidates = [
      parcelado({
        id: 'p1',
        parcelasTotal: 3,
        valorTotalCents: 10000,
        jaParceladas: 3,
      }),
    ]
    const result = assignAbastecimentoMatches([row('r1', 3334, '2026-06-10')], candidates)
    expect(result.has('r1')).toBe(false)
  })

  it('(d) parcelado N=3 com 0 já + 2 linhas casando → exatamente 1 match (parcelaNum=1)', () => {
    const candidates = [
      parcelado({
        id: 'p1',
        parcelasTotal: 3,
        valorTotalCents: 10000, // {3333, 3334}
        jaParceladas: 0,
        occurredOn: '2026-03-10',
      }),
    ]
    const rows = [row('r1', 3334, '2026-03-10'), row('r2', 3333, '2026-03-11')]
    const result = assignAbastecimentoMatches(rows, candidates)
    const matched = [...result.values()].filter((m) => m.abastecimentoId === 'p1')
    expect(matched.length).toBe(1)
    // ≤1 parcela nova por fatura: só a melhor linha leva a parcela 1.
    expect(result.get('r1')?.parcelaNum).toBe(1)
    expect(result.has('r2')).toBe(false)
  })
})
