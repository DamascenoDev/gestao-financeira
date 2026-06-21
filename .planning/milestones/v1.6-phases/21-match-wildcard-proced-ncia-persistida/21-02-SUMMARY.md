---
phase: 21-match-wildcard-proced-ncia-persistida
plan: 02
subsystem: classification-keywords
tags: [keyword, wildcard, glob, regex, ReDoS, KW-09, matcher]
requires:
  - "normalizeKeyword (Plan 21-01) — keywords reach the matcher still containing `*`"
provides:
  - "globToRegExp — anchored ReDoS-safe glob→RegExp (`*`→`.*`, full metachar escape)"
  - "compileRule — precompiles a glob once per rule, skips literal-count-0 degenerates (Plan 04 pre-fetch entry point)"
  - "matchKeyword extended — glob match + specificity by literal-count, v1.5 substring bit-identical"
affects:
  - src/lib/classifier/keywords.ts
  - src/lib/classifier/keywords.test.ts
tech-stack:
  added: []
  patterns:
    - "Hand-rolled glob→regex (one metachar `*` only) instead of a glob lib — ~6 lines, smaller attack surface, ReDoS-safe (RESEARCH §Don't Hand-Roll)"
    - "Derived rule fields (glob/literals) are OPTIONAL + lazily derived in the matcher — keeps the plan PURE (import.ts untouched, deferred to Plan 04) while tsc stays green"
key-files:
  created: []
  modified:
    - src/lib/classifier/keywords.ts
    - src/lib/classifier/keywords.test.ts
decisions:
  - "Made the new KeywordRule.glob/literals fields OPTIONAL (not required) so import.ts's existing inline rule construction still compiles — wiring the precompiled pre-fetch is Plan 04's scope. The matcher derives them lazily when absent (defensive), so precompiled and raw rules behave identically."
  - "Comparator implemented inline in matchKeyword (tracking bestGlob/bestLiterals) rather than as a separate isBetter(rule, best) — avoids re-deriving the best rule's glob/literals each iteration; the 4-rung order matches RESEARCH Pattern 3 exactly."
metrics:
  duration: ~5m
  completed: 2026-06-20
  tasks: 1
  files: 2
status: complete
---

# Phase 21 Plan 02: glob wildcard matchKeyword (KW-09 pure core) Summary

KW-09's pure matcher core: `matchKeyword` now treats a stored keyword CONTAINING `*` as an anchored, ReDoS-safe glob (`UBER*` matches `uber trip 123`, `*ifood*` matches `pedido ifood centro`) while a keyword WITHOUT `*` stays the v1.5 `.includes()` substring — bit-identical (8 existing tests green). Specificity is now literal-character count with a new "contiguous substring beats glob" tie-break rung. No DB, no network — pure + synchronous.

## What Was Built

- **`globToRegExp(keyword)` in `src/lib/classifier/keywords.ts`** — splits on `*`, escapes each literal segment with the canonical full metachar class `/[.*+?^${}()|[\]\\]/g`, rejoins with `.*`, anchors `^…$`. A single `.*` per segment with no nested quantifiers is linear in V8 → ReDoS-safe even on `'a'.repeat(50000)`.
- **`compileRule(categoryId, keyword, sort)`** — exported builder that precompiles the glob ONCE per rule. Returns `null` for an empty keyword OR a literal-count-0 keyword (`*`, `**` — defense-in-depth mirroring the empty-keyword guard and the Plan 01 cadastro reject). This is the entry point Plan 04 will call in the import.ts pre-fetch.
- **`KeywordRule` extended** with two DERIVED, OPTIONAL fields: `glob?: RegExp | null` and `literals?: number`. Optional (not required) so import.ts's current inline `{categoryId, keyword, sort}` construction still type-checks — the precompiled pre-fetch wiring is deferred to Plan 04.
- **`matchKeyword` rewritten** — match predicate is `glob ? glob.test(descriptorNorm) : descriptorNorm.includes(rule.keyword)`. Tie-break chain (each rung breaks the previous): (1) higher literal-count wins; (2) NEW — at equal literals, contiguous substring (`glob===null`) beats glob; (3) lower `sort`; (4) lower `categoryId` (WR-01 stable, order-independent). For a substring, `literals === keyword.length` and `glob === null`, so rung 2 never fires between two substrings → v1.5 longest-wins is bit-identical. The matcher derives `glob`/`literals` lazily via small helpers when the rule wasn't precompiled, so raw and compiled rules behave the same.

## Key Behaviors (test-pinned)

- Glob prefix `uber*` matches `uber trip 123`; contains `*ifood*` matches `pedido ifood centro`; interior `ub*er` matches `ub xyz er` but NOT `ub xyz er trip` (the `$` anchor).
- Substring `mercado` still matches `compra mercado livre sp` (v1.5 intact).
- Specificity: `uber*` (4 literals) beats `ub*` (2); substring `uber trip` (9 literals) beats glob `uber*` (4); at equal literals (`abcd` vs `a*bcd` = 4 each) the contiguous substring wins.
- Degenerate `*` / `**` → `compileRule` returns null AND a raw unfiltered rule is skipped by the matcher's literal-count-0 guard.
- Metachar keyword `a.b(c)*` compiles without throw and matches `a.b(c) qualquer` literally (not `axb(c)` — the `.` is escaped).
- ReDoS: `'a'.repeat(50000)` against `*a*a*a*` completes under 1 s (linear).
- Order-independence (WR-01): a glob+substring mix returns the same category reversed.

## Deviations from Plan

### 1. [Rule 3 — Blocking] KeywordRule.glob/literals made OPTIONAL instead of required

- **Found during:** Task 1 implementation (pre-check of callers).
- **Issue:** `src/actions/import.ts` (line 450) constructs `KeywordRule[]` inline with `{categoryId, keyword, sort}`. The RESEARCH Pattern 2 sketch shows `glob`/`literals` as REQUIRED interface fields — adding them as required would break `import.ts`'s construction and fail `npx tsc --noEmit` (a stated acceptance criterion). This plan is explicitly PURE; rewiring import.ts to call `compileRule` at pre-fetch is Plan 04's scope.
- **Fix:** Declared `glob?` and `literals?` optional. `matchKeyword` resolves them via `ruleGlob`/`ruleLiterals` helpers that use the precomputed value when present and derive it once otherwise. Precompiled (Plan 04) and raw inline (current import.ts) rules therefore produce identical match results; precompilation is purely a per-rule perf optimization, not a correctness dependency.
- **Files modified:** src/lib/classifier/keywords.ts
- **Commit:** 9f5bc24

### 2. [Style] Inline comparator instead of a standalone isBetter()

- The RESEARCH Pattern 3 sketch shows `isBetter(rule, best)`. Implemented the same 4-rung order inline, tracking `bestGlob`/`bestLiterals` alongside `best`, to avoid re-deriving the incumbent's glob/literals on every iteration. Behavior is identical to the sketch; this is an efficiency-only choice. Not a functional deviation.

## Authentication Gates

None.

## Known Stubs

None. The matcher is the complete pure core for KW-09. What is NOT yet wired (by design, Plan 04 scope): import.ts does not yet call `compileRule` at pre-fetch — it still maps raw inline rules, which the lazy-derive path handles correctly, so wildcard matching already works end-to-end; Plan 04 only optimizes (compile-once) and adds the KW-10 provenance re-derivation.

## Threat Flags

None new. The plan's threat register (T-21-03 ReDoS, T-21-04 regex injection, T-21-05 silent over-match) is fully mitigated and test-pinned: anchored linear regex (ReDoS test), canonical full metachar escape (metachar test), literal-count-0 skip in both compileRule and the matcher (degenerate test).

## Verification

- `npx vitest run src/lib/classifier/keywords.test.ts` → 21 passed (8 existing v1.5 + 13 new KW-09).
- `npx tsc --noEmit` → clean (TypeScript estrito, sem JS; extended KeywordRule compiles).
- Acceptance greps: `globToRegExp` ×3, `export function compileRule` ×1, canonical metachar class present ×1.

## Self-Check: PASSED

- FOUND: src/lib/classifier/keywords.ts (globToRegExp + compileRule + extended matchKeyword)
- FOUND: src/lib/classifier/keywords.test.ts (glob/specificity/ReDoS/metachar/order-indep cases)
- FOUND commit 9f5bc24 (Task 1)
