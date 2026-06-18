import 'server-only' // build fails loudly if a client module imports this

import { createClient } from '@/lib/supabase/server'
import type { AiProvider } from '@/lib/schemas/ai-settings'

/**
 * Server-only decrypt DAL for the user's BYOK key (BYOK-04).
 *
 * SECURITY CONTRACT (load-bearing): this is the ONLY module in the app that ever
 * handles the DECRYPTED key. `import 'server-only'` on line 1 makes the build fail
 * loudly if any `'use client'` module imports this (directly or transitively) —
 * the structural guarantee the key path can never reach the client bundle
 * (Pitfall 1 / T-14-05). It must NEVER return the key to a client or pass it as a prop.
 *
 * Reads the caller's OWN settings under the RLS cookie client:
 *   - `ai_settings` row (provider + model) via the RLS-scoped table read
 *   - the decrypted key via the `get_ai_api_key()` RPC (Vault-backed)
 * If either the row or the key is missing, returns `null` — the no-key state that
 * drives the graceful pre-IA fallback. Consumed by `testConnection` (Plan 04) and
 * `suggestCategory` (Phase 15).
 */
export async function getDecryptedAiSettings(): Promise<{
  provider: AiProvider
  model: string
  apiKey: string
} | null> {
  const supabase = await createClient()

  const [{ data: row }, { data: key }] = await Promise.all([
    supabase.from('ai_settings').select('provider, model').maybeSingle(),
    supabase.rpc('get_ai_api_key'),
  ])

  if (!row || !key) return null

  return {
    provider: row.provider as AiProvider,
    model: row.model,
    apiKey: key,
  }
}
