# Deferred Items — Phase 04

Out-of-scope discoveries logged during execution (not fixed; not caused by the
current task's changes).

## Pre-existing lint error (Plan 04-02, Task 2)

- **File:** `src/hooks/use-mobile.ts:14`
- **Rule:** `react-hooks/set-state-in-effect` (error)
- **Why deferred:** Pre-existing in a shadcn-vendored hook; not touched by Plan
  04-02 and unrelated to the upload slice. The plan's Task 2 `<done>` explicitly
  scopes verification to "modulo the known pre-existing React-Compiler
  useReactTable warning"; this `use-mobile` error predates this slice.
- **Suggested owner:** a dedicated lint-cleanup pass (or a shadcn re-vendor).
