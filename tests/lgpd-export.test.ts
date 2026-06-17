// 6-W0-02 (DATA-02) — LGPD export completeness. RED/deferred: the `exportMyData`
// Server Action ships in 06-03. Authored now as named `it.todo` pinning the exact
// behavior 06-03 must satisfy, driven by the central OWNED_TABLES so the proof
// can't drift from the schema (Pitfall 3). Importing the central list (which exists
// this plan) keeps the todo names honest without crashing collection on the
// not-yet-shipped action.
//
// Runs against `supabase start` (local Docker stack only) once GREEN.

import { describe, it, expect } from 'vitest'
import { OWNED_TABLES } from '../src/lib/data/owned-tables'

describe('LGPD export bundle completeness (DATA-02 / 6-W0-02)', () => {
  // Guard the central contract NOW so the todos below reference a real 14-table set.
  it('the central owned-table list has all 14 tables the export must cover', () => {
    expect(OWNED_TABLES).toHaveLength(14)
    expect(new Set(OWNED_TABLES).size).toBe(14) // no dupes
  })

  // ── Deferred to 06-03 (exportMyData) ──────────────────────────────────────────
  it.todo(
    '06-03: exportMyData() returns a bundle with a key for EVERY entry in OWNED_TABLES',
  )
  it.todo('06-03: the bundle contains ONLY the calling user\'s rows (RLS-scoped, no B rows)')
  it.todo('06-03: the bundle embeds the transactions CSV (transactionsToCsv) + the MEI CSV')
  it.todo('06-03: a seeded row in each of the 14 tables for user A appears in A\'s export')
})
