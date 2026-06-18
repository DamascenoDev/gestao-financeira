import { APICallError } from '@ai-sdk/provider'

/* ── 14-UI-SPEC §Copywriting Contract — the ONLY strings ever shown for a test ── */
const INVALID_KEY =
  'Chave inválida. Confira se você copiou a chave correta do provedor.'
const NO_CREDITS =
  'Sem créditos ou cota esgotada no provedor. Verifique sua conta no provedor.'
const TEST_GENERIC = 'Não foi possível testar agora. Tente novamente em instantes.'

/**
 * Map a thrown provider error to one of three fixed friendly pt-BR strings (BYOK-03,
 * T-14-07, Pitfall 5). SECURITY: the returned string is a CONSTANT — it NEVER embeds
 * the raw provider message, headers, a stack, or the decrypted key. `sk-…`/`AIza…`
 * fragments in the original error can never reach the UI through this function.
 *
 * Narrows via the verified `APICallError.isInstance` guard (@ai-sdk/provider@3.0.x)
 * to read `statusCode`: 401/403 → invalid key, 429 → no credits/quota, everything
 * else (network / non-APICallError / unknown) → the generic try-again copy.
 *
 * Lives in a plain (non-`'use server'`) module so it can be a SYNC export: a
 * `'use server'` file may only export async functions. The action imports it; the
 * Wave 0 unit test imports it here to assert the mapping with no real provider call.
 */
export function mapProviderError(e: unknown): string {
  // `isInstance` is duck-typed (works across copies of the package), so it also
  // matches the test's plain `{ statusCode }` objects — exactly the contract we pin.
  const status = APICallError.isInstance(e)
    ? e.statusCode
    : typeof e === 'object' && e !== null && 'statusCode' in e
      ? (e as { statusCode?: unknown }).statusCode
      : undefined

  if (status === 401 || status === 403) return INVALID_KEY
  if (status === 429) return NO_CREDITS
  return TEST_GENERIC
}
