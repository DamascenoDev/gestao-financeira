// 6-W0-03 (DATA-02) — LGPD account delete (full erasure). RED/deferred: the
// `deleteMyAccount` Server Action core ships in 06-03. Authored now as named
// `it.todo` pinning the exact erasure guarantees 06-03 must satisfy:
//   - Storage `{userId}/` objects removed FIRST (not FK-cascaded).
//   - `auth.admin.deleteUser(userId)` LAST → cascades all 14 owned tables.
// Driven by OWNED_TABLES (exists this plan) so the "0 rows in every table" proof
// can't drift from the schema.
//
// Runs against `supabase start` (local Docker stack only) once GREEN.

import { describe, it, expect } from 'vitest'
import { OWNED_TABLES } from '../src/lib/data/owned-tables'

describe('LGPD account delete — full erasure (DATA-02 / 6-W0-03)', () => {
  it('the central owned-table list enumerates every table the delete must empty', () => {
    expect(OWNED_TABLES).toHaveLength(14)
  })

  // ── Deferred to 06-03 (deleteMyAccount core) ─────────────────────────────────
  it.todo('06-03: after delete, EVERY one of A\'s 14 owned tables returns 0 rows (CASCADE)')
  it.todo('06-03: after delete, A\'s Storage objects under {userId}/ are gone (removed first)')
  it.todo('06-03: after delete, admin.auth.admin.getUserById(A) fails (auth user removed)')
  it.todo('06-03: deleteMyAccount rejects unless confirm === "APAGAR" (zod literal)')
  it.todo('06-03: userId derives from the session (getClaims), never from client input')
})
