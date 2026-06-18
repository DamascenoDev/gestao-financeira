import { z } from 'zod'

/**
 * Zod validation boundary for BYOK AI settings (form ↔ Server Action), mirroring
 * schemas/mei.ts (co-located Zod, exported inferred types, pt-BR messages).
 *
 * `provider` is the live BYOK-01 gate: a CLOSED enum of the two shipped providers
 * (`gemini` | `claude`). deepseek/openai are excluded BY CONSTRUCTION so a future
 * classification call can never be pointed at an unowned/unverified provider. The
 * SQL CHECK constraint on `ai_settings.provider` is defense-in-depth on top of this.
 *
 * There is intentionally NO `model` field: the model is a hard-coded cheap default
 * chosen server-side per provider (no UI picker — CLSAI-F2 deferred). See
 * `@/lib/ai/settings` DEFAULT_MODEL.
 */

/** The two shipped BYOK providers. Closed enum — the BYOK-01 gate. */
export const AI_PROVIDERS = ['gemini', 'claude'] as const

/**
 * Register/update the user's own provider key. `apiKey` is the user's BYOK secret
 * (never an env var) — trimmed + non-empty. It crosses this boundary once on save,
 * then lives only encrypted in Vault (never returned to the client thereafter).
 */
export const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS, { message: 'Selecione um provedor' }),
  apiKey: z.string().trim().min(1, 'Cole sua chave da API'),
})

export type AiProvider = (typeof AI_PROVIDERS)[number]
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>
