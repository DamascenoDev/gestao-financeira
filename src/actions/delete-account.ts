'use server'

import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * deleteMyAccount (DATA-02) — the single most dangerous operation in the app.
 *
 * This is the ONLY importer of the server-only service-role admin client
 * (src/lib/supabase/admin.ts). The UI imports ONLY this action, never admin.ts —
 * `import 'server-only'` in admin.ts makes any client import fail the build, so the
 * secret can never reach the client bundle (T-06-01; the 06-04 bundle audit proves it).
 *
 * Guards:
 *   - confirm must equal the literal 'APAGAR' (zod) — else reject, perform NO delete.
 *   - userId derives from the SESSION, NEVER from input — a forged input userId cannot
 *     delete another account (T-06-09 / Pitfall 2). For THIS (the single most dangerous)
 *     operation we use auth.getUser(), which makes an authenticated round-trip to the
 *     Auth server and rejects a forged/expired access-token cookie (MD-01). getClaims()
 *     only verifies the JWT signature when asymmetric signing keys are configured and
 *     can otherwise trust the cookie's token, so it is NOT used on this path.
 *
 * Order (NON-NEGOTIABLE — T-06-10 / Pattern 2):
 *   1. Storage `{userId}/` objects FIRST — Storage is NOT FK-cascaded, so it must be
 *      removed explicitly. Doing it first means a Storage failure leaves the account
 *      fully intact + the whole operation idempotently retryable (remove on absent
 *      paths is a no-op). Current uploads are flat one level under `{userId}/` (A3) —
 *      nested folders would need a recursive walk. ALL pages are drained in a loop
 *      (HI-01): a single `list` is capped at 1000 objects, so a user with >1000
 *      statement files would otherwise leave the surplus orphaned in a private bucket
 *      whose owning auth user no longer exists. We re-list from offset 0 after each
 *      removal (removed objects shrink the set) and only proceed once the prefix is
 *      fully drained.
 *   2. `auth.admin.deleteUser(userId)` LAST — the `auth.users ON DELETE CASCADE`
 *      schema atomically deletes all 14 owned tables. We do NOT hand-roll a per-table
 *      DELETE loop (that races RESTRICT FKs — Anti-Pattern T-06-11).
 *
 * After a successful delete the CLIENT signs out + redirects to /auth/login.
 */

const ConfirmSchema = z.object({ confirm: z.literal('APAGAR') })

export type DeleteAccountResult =
  | { ok: true }
  | {
      ok: false
      error:
        | 'confirmacao_invalida'
        | 'nao_autenticado'
        | 'falha_storage'
        | 'falha_delete'
    }

/** The statements bucket name (private; objects keyed under `{userId}/`). */
const STATEMENTS_BUCKET = 'statements'

/** Storage `list` page size cap (Supabase max per page). */
const STORAGE_PAGE = 1000

export async function deleteMyAccount(input: {
  confirm: string
}): Promise<DeleteAccountResult> {
  // 1. Type-to-confirm gate — reject anything that is not exactly 'APAGAR'.
  const parsed = ConfirmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'confirmacao_invalida' }

  // 2. userId from the SESSION, never from client input. getUser() hits the Auth
  // server, so a forged/expired access-token cookie is rejected here (MD-01) BEFORE
  // any irreversible delete.
  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) return { ok: false, error: 'nao_autenticado' }
  const userId = user.id

  const admin = createAdminClient()

  // 3. Storage FIRST — NOT FK-cascaded. Drain ALL pages under {userId}/ before the
  // irreversible auth delete (HI-01): a single 1000-cap page would orphan the surplus.
  // Re-list from offset 0 each pass — removed objects leave the set, so a non-empty
  // page always means more to remove; an empty page means fully drained.
  for (;;) {
    const { data: files, error: listErr } = await admin.storage
      .from(STATEMENTS_BUCKET)
      .list(userId, { limit: STORAGE_PAGE })
    if (listErr) return { ok: false, error: 'falha_storage' } // retryable, account intact
    if (!files?.length) break // prefix fully drained
    const paths = files.map((f) => `${userId}/${f.name}`)
    const { error: rmErr } = await admin.storage.from(STATEMENTS_BUCKET).remove(paths)
    if (rmErr) return { ok: false, error: 'falha_storage' } // retryable, account intact
    // Fewer than a full page returned → nothing more to fetch, avoid an extra round-trip.
    if (files.length < STORAGE_PAGE) break
  }

  // 4. Auth LAST — cascades all 14 owned tables via ON DELETE CASCADE.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) return { ok: false, error: 'falha_delete' }

  return { ok: true }
}
