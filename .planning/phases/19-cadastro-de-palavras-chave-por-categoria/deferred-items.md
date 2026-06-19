# Phase 19 — Deferred Items (out of scope)

Items discovered during execution that are NOT caused by Phase 19 changes. Logged
per the SCOPE BOUNDARY rule (only auto-fix issues directly caused by the current
task). Do NOT fix here.

## D1 — `tests/seed-categories.test.ts` stale count (11 → 12)

- **Discovered during:** Plan 19-01, full-suite wave gate (`npm test`).
- **Symptom:** `tests/seed-categories.test.ts > creates exactly 11 categories for
  the new user` fails: `expected [...] to have a length of 11 but got 12`.
- **Root cause (pre-existing, NOT Phase 19):** migration
  `0035_categories_marketplace.sql` (Phase 17) re-seeded `handle_new_user` with a
  12th default category "Marketplace" (sort 9). The live-Docker integration test
  still asserts `EXPECTED_COUNT = 11`, so it is stale relative to the current seed.
- **Why deferred:** Phase 19 only adds the `category_keywords` table (migration
  `0036`); it does not touch `handle_new_user`, `categories`, or the seed. This is a
  test/migration drift owned by the marketplace-category work, and `tests/**` are
  the env-flaky live-Docker suite (project memory `gsd-execution-gotchas`,
  `dev-env-testing-gotchas`; RESEARCH Pitfall 5). The Phase 19 gate is the mocked
  unit suite + structural KW-06, which is green.
- **Suggested fix (future):** bump `EXPECTED_COUNT` to 12 and add `'Marketplace'`
  to the consumo set in `tests/seed-categories.test.ts`, OR have a dedicated
  follow-up align the seed-count tests with `0035`. Verify against the live stack.
