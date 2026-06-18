import { describe, it, expect } from 'vitest'

// Wave 0 RED scaffold (BYOK-03). Pins the provider-error → friendly pt-BR mapping
// BEFORE the action module is implemented (Plan 04 exports `mapProviderError`
// from `@/actions/ai-settings`). The security-critical invariant: the message
// shown to the user must be one of the three fixed pt-BR strings from
// 14-UI-SPEC §Copywriting, and must NEVER leak the raw key (`sk-`, `AIza`) or a
// stack trace. The `server-only` guard is aliased to a no-op in vitest.config.ts,
// so importing the server module transitively does not trip the client guard.
// RED now — the import below has no target. No real provider call is made; the
// provider error objects are simulated.
import { mapProviderError } from '@/actions/ai-settings'

// Exact copy from 14-UI-SPEC §Copywriting Contract.
const INVALID_KEY = 'Chave inválida. Confira se você copiou a chave correta do provedor.'
const NO_CREDITS =
  'Sem créditos ou cota esgotada no provedor. Verifique sua conta no provedor.'
const NETWORK = 'Não foi possível testar agora. Tente novamente em instantes.'

describe('mapProviderError — friendly pt-BR mapping, no leak (BYOK-03)', () => {
  it('maps a 401 to the invalid-key copy', () => {
    const msg = mapProviderError({
      statusCode: 401,
      // a raw key fragment a naive impl might echo back
      message: 'Unauthorized: key sk-ant-secret AIzaSecret',
    })
    expect(msg).toBe(INVALID_KEY)
  })

  it('maps a 403 to the invalid-key copy', () => {
    const msg = mapProviderError({ statusCode: 403, message: 'Forbidden' })
    expect(msg).toBe(INVALID_KEY)
  })

  it('maps a 429 to the no-credits/quota copy', () => {
    const msg = mapProviderError({ statusCode: 429, message: 'Too Many Requests' })
    expect(msg).toBe(NO_CREDITS)
  })

  it('maps a generic/network error to the try-again copy', () => {
    const msg = mapProviderError(new TypeError('fetch failed'))
    expect(msg).toBe(NETWORK)
  })

  it('never leaks the key fragment or a stack trace', () => {
    const msg = mapProviderError({
      statusCode: 401,
      message: 'Unauthorized: key sk-ant-secret AIzaSecret',
      stack: 'Error\n    at provider.call (provider.ts:42)',
    })
    expect(msg).not.toContain('sk-')
    expect(msg).not.toContain('AIza')
    expect(msg.toLowerCase()).not.toContain('stack')
  })
})
