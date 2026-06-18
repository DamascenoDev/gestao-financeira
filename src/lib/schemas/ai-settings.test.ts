import { describe, it, expect } from 'vitest'

// Wave 0 RED scaffold (BYOK-01). Pins the live enum gate for the BYOK provider
// + apiKey shape BEFORE the schema module is implemented (Plan 03 creates
// `@/lib/schemas/ai-settings`). The security-critical invariant: `provider` is a
// closed enum (only the two shipped providers, `gemini` | `claude`) so a future
// classification call can never be pointed at an unowned/unverified provider, and
// `apiKey` must be a non-empty string. RED now — the import below has no target.
import { aiSettingsSchema } from '@/lib/schemas/ai-settings'

describe('aiSettingsSchema — provider enum + apiKey shape (BYOK-01)', () => {
  it('accepts a Gemini provider with a non-empty key', () => {
    const result = aiSettingsSchema.safeParse({
      provider: 'gemini',
      apiKey: 'AIzaSyExampleKey0000000000000000000000000',
    })
    expect(result.success).toBe(true)
  })

  it('accepts a Claude provider with a non-empty key', () => {
    const result = aiSettingsSchema.safeParse({
      provider: 'claude',
      apiKey: 'sk-ant-example0000000000000000000000000000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-enum provider (deepseek — deferred, not shipped)', () => {
    const result = aiSettingsSchema.safeParse({
      provider: 'deepseek',
      apiKey: 'sk-anything',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-enum provider (openai)', () => {
    const result = aiSettingsSchema.safeParse({
      provider: 'openai',
      apiKey: 'sk-anything',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an empty apiKey', () => {
    const result = aiSettingsSchema.safeParse({
      provider: 'gemini',
      apiKey: '',
    })
    expect(result.success).toBe(false)
  })
})
