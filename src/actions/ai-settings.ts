'use server'

import { revalidatePath } from 'next/cache'

import { getDecryptedAiSettings } from '@/lib/ai/settings.server'
import { DEFAULT_MODEL } from '@/lib/ai/settings'
import { mapProviderError } from '@/lib/ai/map-provider-error'
import { modelFor } from '@/lib/ai/provider-factory'
import { aiSettingsSchema } from '@/lib/schemas/ai-settings'
import { createClient } from '@/lib/supabase/server'

/**
 * BYOK AI-settings Server Actions: the ONLY write/test/remove surface for the
 * user's provider key. Mirrors actions/mei.ts EXACTLY — `'use server'` + Zod
 * `safeParse` boundary → { error } (never throws/leaks) + getClaims() owner +
 * revalidatePath on success.
 *
 * SECURITY CONTRACT (load-bearing):
 *  - The plaintext key crosses the boundary ONCE on save (formData → save_ai_api_key
 *    RPC → Vault). It is NEVER written to an app column and NEVER read back to the
 *    client (BYOK-02, T-14-09).
 *  - testConnection decrypts server-only (via the @/lib/ai/settings.server DAL),
 *    pings ~1 token, and is wrapped in a TOTAL try/catch. On any failure it returns
 *    one of the three fixed pt-BR strings from mapProviderError — never the key,
 *    never a raw provider message, never a stack (BYOK-03, T-14-07, Pitfall 5).
 *  - removeAiKey drops the row + Vault secret so the app returns to the pre-IA state;
 *    suggestCategory() already returns null safely, so nothing breaks (BYOK-05).
 *
 * All three return { ok: true } | { error } and never throw.
 */
export type ActionResult = { error: string } | { ok: true }

/** The single page these actions revalidate (14-UI-SPEC scope anchor). */
const AI_PATH = '/conta/configuracoes-ia'

/**
 * Register/rotate the user's BYOK key (BYOK-02). The pasted key is validated at the
 * boundary, the owner is checked, then the key is handed STRAIGHT to Vault via the
 * `save_ai_api_key` RPC — it never lands in an app column and is never read back.
 * The model is the hard-coded cheap default per provider (CLSAI-F2 deferred), NOT
 * user-supplied. Saving is decoupled from testing: a successful test is not required.
 */
export async function saveAiSettings(formData: FormData): Promise<ActionResult> {
  const parsed = aiSettingsSchema.safeParse({
    provider: formData.get('provider'),
    apiKey: formData.get('apiKey'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  // The plaintext key flows formData → RPC → Vault; the model is the server-side
  // default, never user input. No app column ever holds the key (T-14-09).
  const { error } = await supabase.rpc('save_ai_api_key', {
    p_provider: parsed.data.provider,
    p_model: DEFAULT_MODEL[parsed.data.provider],
    p_key: parsed.data.apiKey,
  })
  if (error) return { error: 'Não foi possível salvar. Tente novamente.' }

  revalidatePath(AI_PATH)
  return { ok: true }
}

/**
 * Remove the user's BYOK key (BYOK-05): owner check, then `remove_ai_api_key` drops
 * both the `ai_settings` row and the Vault secret. The app returns to the pre-IA
 * manual-pick state — suggestCategory() already returns null safely.
 */
export async function removeAiKey(): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims.sub) return { error: 'Sessão expirada.' }

  const { error } = await supabase.rpc('remove_ai_api_key')
  if (error) return { error: 'Não foi possível remover a chave. Tente novamente.' }

  revalidatePath(AI_PATH)
  return { ok: true }
}

/**
 * Test the saved BYOK key with a cheap ~1-token ping (BYOK-03). Decrypts server-only
 * via the @/lib/ai/settings.server DAL, instantiates the per-call BYOK model, and
 * runs a single `doGenerate` ('ping', capped at 1 output token). The WHOLE body is
 * wrapped in a total try/catch: on any throw it returns mapProviderError(e) — one of
 * three fixed pt-BR strings, never the key, never a raw provider message, never a
 * stack (T-14-07). Saving is decoupled from testing; this is a pure read+ping.
 */
export async function testConnection(): Promise<ActionResult> {
  try {
    const settings = await getDecryptedAiSettings()
    if (!settings) return { error: 'Nenhuma chave configurada.' }

    const model = modelFor(settings.provider, settings.model, settings.apiKey)
    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
      maxOutputTokens: 1,
    })

    return { ok: true }
  } catch (e) {
    // The decrypted key only ever existed inside this try; it never leaves via the
    // returned string (mapProviderError is constant-output) and is never logged.
    return { error: mapProviderError(e) }
  }
}
