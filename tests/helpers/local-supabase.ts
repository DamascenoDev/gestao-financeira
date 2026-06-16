// Test-only helper for the LOCAL Supabase stack (Docker via `supabase start`).
//
// SECURITY (threat T-1-03): this helper is HARD-GUARDED to 127.0.0.1/localhost.
// It must NEVER point at a remote Supabase project — the service/secret key it
// uses bypasses RLS and would expose real financial data. Any non-local URL
// throws immediately.
//
// These factories define the test contract for Wave 2 (RLS + seed migrations).
// They read the local URL + keys from `supabase status` (or the documented local
// defaults the CLI prints) so no secret is hard-coded here.

import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LOCAL_HOST_RE = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:\d+)?$/

export interface LocalSupabaseConfig {
  url: string
  /** Publishable / anon key for the local stack. */
  publishableKey: string
  /** Secret / service_role key for the local stack — TESTS ONLY. */
  secretKey: string
}

function assertLocal(url: string): void {
  if (!LOCAL_HOST_RE.test(url.replace(/\/$/, ''))) {
    throw new Error(
      `[local-supabase] refusing to target a non-local Supabase URL: "${url}". ` +
        'Test helpers may only ever talk to 127.0.0.1/localhost (threat T-1-03).',
    )
  }
}

/**
 * Read local stack credentials from `supabase status --output env`.
 * Throws if the stack is not running or if the resolved URL is not local.
 */
export function readLocalConfig(): LocalSupabaseConfig {
  let raw: string
  try {
    raw = execFileSync('npx', ['supabase', 'status', '--output', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    throw new Error(
      '[local-supabase] could not read `supabase status` — is the local stack running ' +
        `(\`supabase start\`)? Underlying error: ${(err as Error).message}`,
    )
  }

  const env = Object.fromEntries(
    raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=')
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim().replace(/^"(.*)"$/, '$1')
        return [key, value] as const
      }),
  )

  const url = env.API_URL ?? env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const publishableKey =
    env.ANON_KEY ?? env.PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const secretKey = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY ?? env.SUPABASE_SECRET_KEY ?? ''

  assertLocal(url)

  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      '[local-supabase] missing local credentials in `supabase status` output ' +
        '(need API_URL + ANON/PUBLISHABLE key + SERVICE_ROLE/SECRET key).',
    )
  }

  return { url, publishableKey, secretKey }
}

/**
 * Admin client backed by the LOCAL secret key. TESTS ONLY — used solely to
 * create/delete throwaway users via the admin API. Hard-guarded to localhost.
 */
export function serviceClient(config: LocalSupabaseConfig = readLocalConfig()): SupabaseClient {
  assertLocal(config.url)
  return createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * A user-scoped client authenticated with the given JWT (the RLS-relevant path).
 * Hard-guarded to localhost.
 */
export function userClient(
  jwt: string,
  config: LocalSupabaseConfig = readLocalConfig(),
): SupabaseClient {
  assertLocal(config.url)
  return createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
