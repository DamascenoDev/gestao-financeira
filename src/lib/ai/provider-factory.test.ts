import { describe, it, expect } from 'vitest'

// Wave 0 RED scaffold (BYOK-04). Pins the provider-factory contract BEFORE the
// module is implemented (Plan 03/04 creates `@/lib/ai/provider-factory`).
// `modelFor(provider, modelId, apiKey)` maps each shipped provider to a concrete
// AI SDK LanguageModel and THROWS for any unknown provider — so an unenumerated
// provider can never silently produce a model. NO network call is made here:
// constructing a model object is offline; only an actual generate/stream would
// hit the wire. RED now — the import below has no target.
import { modelFor } from '@/lib/ai/provider-factory'

describe('modelFor — provider factory mapping (BYOK-04)', () => {
  it('returns a defined LanguageModel for gemini', () => {
    const model = modelFor('gemini', 'gemini-2.5-flash-lite', 'k')
    expect(model).toBeDefined()
  })

  it('returns a defined LanguageModel for claude', () => {
    const model = modelFor('claude', 'claude-haiku-4-5', 'k')
    expect(model).toBeDefined()
  })

  it('throws for an unknown provider', () => {
    // @ts-expect-error — intentionally passing an unenumerated provider
    expect(() => modelFor('deepseek', 'whatever', 'k')).toThrow()
  })
})
