# Deferred items — Phase 10

## Out-of-scope discoveries (not fixed during 10-03 execution)

- **`tests/lgpd-export.test.ts` transient seed flake.** During a FULL `npm test` run
  the suite intermittently fails at the `income_templates` seed step with
  "An invalid response was received from the upstream server" (local Supabase stack
  contention under parallel load). It passes deterministically when run in isolation
  (`npx vitest run tests/lgpd-export.test.ts` → 5/5). Unrelated to the 10-03 abastecimento
  UI changes (different subsystem; no shared files). Pre-existing local-stack flakiness —
  left untouched per the executor scope boundary.
