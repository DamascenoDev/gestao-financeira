# Deferred Items — Phase 27

Out-of-scope discoveries logged during execution (not fixed; not caused by this phase's tasks).

## Pre-existing lint error (out of scope)

- **File:** `src/hooks/use-mobile.ts:14`
- **Rule:** `react-hooks/set-state-in-effect` (error)
- **Detail:** `setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)` called synchronously in a `useEffect`. Pre-existing on commit `7aaa5cf` (confirmed via stash baseline); unrelated to the AbastecimentoForm changes in 27-03.
- **Discovered during:** 27-03 Task 1 (`npm run lint`).
