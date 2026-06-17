// 6-W0-04 (DATA-02 / SEC-01) — delete-A-leaves-B-intact. RED/deferred: the
// `deleteMyAccount` Server Action ships in 06-03. This is the load-bearing
// "doesn't touch B" guarantee: deleting user A must leave EVERY one of user B's 14
// rows + B's Storage object fully intact (no collateral erasure). Authored now as
// named `it.todo` so 06-03 flips it GREEN.
//
// Runs against `supabase start` (local Docker stack only) once GREEN.

import { describe, it, expect } from 'vitest'
import { OWNED_TABLES } from '../src/lib/data/owned-tables'

describe('LGPD delete isolation — A gone, B intact (DATA-02 / SEC-01 / 6-W0-04)', () => {
  it('the central owned-table list enumerates every table B\'s rows must survive in', () => {
    expect(OWNED_TABLES).toHaveLength(14)
  })

  // ── Deferred to 06-03 (deleteMyAccount) ──────────────────────────────────────
  it.todo('06-03: after deleting A, EVERY one of B\'s 14 owned-table rows still exists')
  it.todo('06-03: after deleting A, B\'s Storage object under {userB.id}/ is still downloadable')
  it.todo('06-03: after deleting A, B\'s auth user is unaffected (getUserById(B) succeeds)')
})
