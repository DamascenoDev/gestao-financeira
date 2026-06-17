import 'server-only' // build fails loudly if a client module imports this

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.types'

/**
 * Service-role admin client. Bypasses RLS — the FIRST legitimate server-side use of
 * the secret in this project (Phases 1–5 used only anon+JWT+RLS). It reads the
 * server-only env var `SUPABASE_SECRET_KEY` (NEVER `NEXT_PUBLIC_*`).
 *
 * USAGE CONTRACT (load-bearing):
 *   - DELETE ONLY. Used solely by the account-delete Server Action (06-03) for
 *     `auth.admin.deleteUser` + Storage `remove`. It is intentionally left UNWIRED
 *     in this plan — 06-03 is its sole importer.
 *   - NEVER import from a client component. The `import 'server-only'` on line 1
 *     makes the build fail loudly if any `'use client'` module imports this
 *     (directly or transitively), and the bundle-secret audit proves the key never
 *     reaches `.next/static`.
 *   - NEVER use for normal data reads. Those go through the RLS server client
 *     (`src/lib/supabase/server.ts`) so "only my rows" is structural, not assumed.
 *
 * Throws loudly if either the URL or the secret is missing rather than silently
 * constructing a client that can't authenticate.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY // server-only env var — NEVER NEXT_PUBLIC_
  if (!url || !secret) {
    throw new Error('admin client: missing SUPABASE_SECRET_KEY/URL')
  }
  return createClient<Database>(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
