# Deferred items — Phase 11

## Out-of-scope discoveries (not fixed during 11-01 execution)

- **`tests/reserva-saida.test.ts` transient config flake.** During a FULL `npx vitest run`
  the suite intermittently fails in `readLocalConfig` (`tests/helpers/local-supabase.ts`)
  reading the local Supabase CLI config under parallel resource contention — the same
  flake class as Phase 10's `lgpd-export` note. In isolation (`npx vitest run reserva-saida`)
  it passes 4/4, and a re-run of the full suite passed 729/729. Unrelated to the Phase-11
  pure-presentation components (which import no Supabase client). Not fixed — pre-existing
  test-harness concurrency issue.
