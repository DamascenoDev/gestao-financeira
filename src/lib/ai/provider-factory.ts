import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModelV3 } from '@ai-sdk/provider'

import type { AiProvider } from '@/lib/schemas/ai-settings'

/**
 * Per-call BYOK provider factory (BYOK-04).
 *
 * `modelFor` instantiates a concrete AI SDK LanguageModel for the user's chosen
 * provider, configured with THEIR OWN key passed per call — NEVER from an env var,
 * NEVER via AI Gateway. The exhaustive `switch` with a `never` default means an
 * unenumerated provider can never silently produce a model: it throws.
 *
 * Constructing the model object is offline; only an actual generate/stream hits the
 * wire. Consumed by `testConnection` (Plan 04) and `suggestCategory` (Phase 15).
 *
 * Note: this project does not depend on the `ai` umbrella package, so the return type
 * is `LanguageModelV3` from `@ai-sdk/provider` (the actual type both v3.0.x providers
 * return) rather than `LanguageModel` from `ai` — plan Assumption A5.
 */
export function modelFor(
  provider: AiProvider,
  model: string,
  apiKey: string
): LanguageModelV3 {
  switch (provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey })(model)
    case 'claude':
      return createAnthropic({ apiKey })(model)
    default: {
      const _exhaustive: never = provider
      throw new Error(`Provedor de IA desconhecido: ${String(_exhaustive)}`)
    }
  }
}
