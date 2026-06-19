import type { AiProvider } from '@/lib/schemas/ai-settings'

/**
 * CLIENT-SAFE provider/model registry for the BYOK settings UI.
 *
 * SECURITY CONTRACT (load-bearing): this module is the half of the lib/ai split that
 * is safe to import from a client component. It has NO server-bundle guard, NO key
 * access, NO supabase import. The plaintext key path lives EXCLUSIVELY in
 * `@/lib/ai/settings.server` (the server-bundle-guarded DAL) — never import that from
 * here or from the form. (Pitfall 1 / T-14-05.)
 *
 * The form reads PROVIDER_LABEL for its Select copy. DEFAULT_MODEL is the cheap,
 * hard-coded model id chosen per provider (no UI picker — CLSAI-F2 deferred); the
 * decrypt DAL + factory use it to instantiate the model.
 */

export { AI_PROVIDERS, type AiProvider } from '@/lib/schemas/ai-settings'

/** Select option copy (14-UI-SPEC). */
export const PROVIDER_LABEL: Record<AiProvider, string> = {
  gemini: 'Gemini (Google)',
  claude: 'Claude (Anthropic)',
}

/**
 * Cheap hard-coded default model per provider — bare aliases, no date suffix.
 * gemini → 2.0-flash: NON-thinking, fast, cheap, high availability. (History:
 * 2.5-flash-lite was chronically 503 "high demand" on the free tier; 3.5-flash
 * is a thinking model that stalls 50s under the test's 1-token cap and risks the
 * 60s function limit — both wrong for a small-token classification workhorse.)
 * claude → haiku 4.5.
 */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  gemini: 'gemini-2.0-flash',
  claude: 'claude-haiku-4-5',
}
