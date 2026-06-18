// CLSAI-03/04/06 + SEC-03: the batched classify call contract, pinned RED-first.
//
// classifyDescriptors makes exactly ONE doGenerate call for N>0 unique descriptors
// and ZERO for an empty input; every returned categoryId is enum-gated by the REAL
// validateSuggestion (not mocked — that is the CLSAI-04 assertion); any provider
// error / malformed JSON / schema failure degrades to an empty Map without throwing;
// and the prompt carries ONLY descriptor_norm strings + `id: name` category lines —
// never an amount/date/raw descriptor (SEC-03 / LGPD).
//
// provider-factory.modelFor is mocked so doGenerate is a spy we drive per test; the
// real Gemini/Anthropic factory is never hit.

import { describe, it, expect, vi, afterEach } from 'vitest'

import { DEFAULT_MODEL } from '@/lib/ai/settings'
import { modelFor } from '@/lib/ai/provider-factory'

vi.mock('@/lib/ai/provider-factory', () => ({
  modelFor: vi.fn(),
}))

import { classifyDescriptors } from './classify'

const MERCADO_ID = '11111111-1111-4111-8111-111111111111'
const TRANSPORTE_ID = '22222222-2222-4222-8222-222222222222'
const CATEGORIES = [
  { id: MERCADO_ID, name: 'Mercado' },
  { id: TRANSPORTE_ID, name: 'Transporte' },
]

const FAKE_SETTINGS = {
  provider: 'gemini' as const,
  model: DEFAULT_MODEL.gemini,
  apiKey: 'fake',
}

/** Build a fake LanguageModelV3 whose doGenerate is the supplied spy. */
function withDoGenerate(doGenerate: ReturnType<typeof vi.fn>) {
  vi.mocked(modelFor).mockReturnValue({ doGenerate } as never)
  return doGenerate
}

/** A doGenerate result with the structured JSON in a single text part (both providers). */
function textResult(obj: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(modelFor).mockReset()
})

describe('classifyDescriptors — one batched call (CLSAI-03)', () => {
  it('makes exactly ONE doGenerate call for N unique descriptors, prompt lists all N', async () => {
    const doGenerate = withDoGenerate(vi.fn().mockResolvedValue(textResult({ results: [] })))
    const descriptors = ['padaria sao joao', 'posto shell', 'uber trip']

    await classifyDescriptors(descriptors, CATEGORIES, FAKE_SETTINGS)

    expect(doGenerate).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify(doGenerate.mock.calls[0]?.[0]?.prompt)
    for (const d of descriptors) expect(sent).toContain(d)
  })

  it('returns an empty Map and calls doGenerate ZERO times for an empty descriptor list', async () => {
    const doGenerate = withDoGenerate(vi.fn())
    const map = await classifyDescriptors([], CATEGORIES, FAKE_SETTINGS)
    expect(map.size).toBe(0)
    expect(doGenerate).not.toHaveBeenCalled()
  })

  it('returns an empty Map and calls doGenerate ZERO times when there are no categories', async () => {
    const doGenerate = withDoGenerate(vi.fn())
    const map = await classifyDescriptors(['x'], [], FAKE_SETTINGS)
    expect(map.size).toBe(0)
    expect(doGenerate).not.toHaveBeenCalled()
  })
})

describe('classifyDescriptors — happy path + enum gate (CLSAI-04)', () => {
  it('maps a returned owned categoryId straight through', async () => {
    withDoGenerate(
      vi.fn().mockResolvedValue(
        textResult({
          results: [{ descriptor: 'padaria sao joao', categoryId: MERCADO_ID, confidence: 0.9 }],
        }),
      ),
    )
    const map = await classifyDescriptors(['padaria sao joao'], CATEGORIES, FAKE_SETTINGS)
    expect(map.get('padaria sao joao')).toEqual({ categoryId: MERCADO_ID, confidence: 0.9 })
  })

  it('gates an enum-drift categoryId (not owned) to null, preserving confidence (CLSAI-04)', async () => {
    const NOT_OWNED = '99999999-9999-4999-8999-999999999999'
    withDoGenerate(
      vi.fn().mockResolvedValue(
        textResult({
          results: [{ descriptor: 'loja desconhecida', categoryId: NOT_OWNED, confidence: 0.7 }],
        }),
      ),
    )
    const map = await classifyDescriptors(['loja desconhecida'], CATEGORIES, FAKE_SETTINGS)
    expect(map.get('loja desconhecida')).toEqual({ categoryId: null, confidence: 0.7 })
  })

  it('passes through a null categoryId ("nothing fits") without throwing (CLSAI-04)', async () => {
    withDoGenerate(
      vi.fn().mockResolvedValue(
        textResult({
          results: [{ descriptor: 'algo estranho', categoryId: null, confidence: 0.1 }],
        }),
      ),
    )
    const map = await classifyDescriptors(['algo estranho'], CATEGORIES, FAKE_SETTINGS)
    expect(map.get('algo estranho')).toEqual({ categoryId: null, confidence: 0.1 })
  })
})

describe('classifyDescriptors — never-throw fallback (CLSAI-06)', () => {
  it('returns an empty Map when doGenerate rejects', async () => {
    withDoGenerate(vi.fn().mockRejectedValue(new Error('429 rate limited')))
    const map = await classifyDescriptors(['padaria sao joao'], CATEGORIES, FAKE_SETTINGS)
    expect(map.size).toBe(0)
  })

  it('returns an empty Map when the text part is malformed JSON', async () => {
    withDoGenerate(
      vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'not json {{{' }] }),
    )
    const map = await classifyDescriptors(['padaria sao joao'], CATEGORIES, FAKE_SETTINGS)
    expect(map.size).toBe(0)
  })

  it('returns an empty Map when valid JSON fails the flat schema', async () => {
    withDoGenerate(
      vi.fn().mockResolvedValue(textResult({ results: [{ descriptor: 'x', confidence: 'high' }] })),
    )
    const map = await classifyDescriptors(['x'], CATEGORIES, FAKE_SETTINGS)
    expect(map.size).toBe(0)
  })
})

describe('classifyDescriptors — PII payload guard (SEC-03)', () => {
  it('sends ONLY descriptor_norm strings + id:name lines — no amount/date/raw', async () => {
    const doGenerate = withDoGenerate(vi.fn().mockResolvedValue(textResult({ results: [] })))
    await classifyDescriptors(['padaria sao joao', 'posto shell'], CATEGORIES, FAKE_SETTINGS)

    const sent = JSON.stringify(doGenerate.mock.calls[0]?.[0]?.prompt)
    // carries the descriptors + the id: name category lines
    expect(sent).toContain('padaria sao joao')
    expect(sent).toContain(MERCADO_ID)
    expect(sent).toContain('Mercado')
    // carries NO monetary / date / raw-descriptor tokens
    expect(sent).not.toMatch(/R\$/)
    expect(sent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(sent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(sent).not.toMatch(/amount_cents|occurred_on|descriptor_raw/)
  })
})
