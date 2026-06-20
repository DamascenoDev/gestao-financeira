---
phase: 21-match-wildcard-proced-ncia-persistida
plan: 04
subsystem: import/classification
tags: [classification, keyword, glob, provenance, import, KW-09, KW-10]
requires:
  - 21-01 normalizeKeyword (keywords persist `*` literally)
  - 21-02 compileRule / matchKeyword (glob + literal-specificity)
  - 21-03 migration 0037 (widened classification_source CHECK — db push still pending)
provides:
  - import.ts pre-fetch compiles keyword globs ONCE per rule (compileRule)
  - import.ts confirmImport re-derives classification_source server-side (batched)
affects:
  - src/actions/import.ts
  - src/actions/import.test.ts
tech-stack:
  added: []
  patterns:
    - compile-once-at-pre-fetch (glob→RegExp built per rule, not per row)
    - batched memory re-derivation (one .in('descriptor_norm', [...]) — WR-02)
    - server-authoritative provenance with category-equality guard (WR-01)
key-files:
  created: []
  modified:
    - src/actions/import.ts
    - src/actions/import.test.ts
decisions:
  - Keyword globs are compiled once per rule via compileRule at BOTH pre-fetch paths (PASS 1 ingest + confirmImport commit) — never N×M new RegExp per row.
  - Persisted classification_source is re-derived server-side over r.base.descriptor_norm, gated by category-equality on both the memory and keyword rungs (no false provenance for grid overrides).
  - Memory prevails over keyword at commit time, mirroring the PASS 1 ordering (memória > palavra-chave).
metrics:
  duration: ~25m
  completed: 2026-06-20
  tasks: 2
  files: 2
status: complete
---

# Phase 21 Plan 04: Match wildcard & procedência persistida (wiring + re-derivação) Summary

KW-09 wires `compileRule` into the import pre-fetch so a stored glob keyword (`uber*`, `*flix*`) matches end-to-end on upload with the glob compiled once per rule; KW-10 replaces the coarse `classification_source` ternary at commit with a batched, server-authoritative re-derivation (memória→'memória', keyword→'palavra-chave', overridden/manual→coarse 'memória') guarded by category equality.

## What Was Built

### Task 1 — Compile the glob once at pre-fetch (KW-09 wiring) — commit `e88dd18`
- Imported `compileRule` alongside `matchKeyword`/`KeywordRule` in `import.ts`.
- Replaced the raw `kwRows.map({ categoryId, keyword, sort })` at the PASS 1 pre-fetch (~444) with `compileRule(category_id, keyword, sort)` + a non-null filter. Each rule's glob (RegExp) is now compiled exactly once per rule instead of being lazily derived on every per-row `matchKeyword` scan. The `category_keywords` fetch contract (WR-02) is unchanged.
- Degenerate rules (empty / all-`*`) return `null` from `compileRule` and are filtered out (defense-in-depth alongside the Plan 01 cadastro reject).
- Added two end-to-end tests: `uber*` prefix glob pre-classifies `uber trip`; `*flix*` contains-glob pre-classifies `netflix com`, both with `classification_source === 'palavra-chave'`.

### Task 2 — Re-derive classification_source server-side at commit (KW-10) — commit `6271d11`
- In `confirmImport`, before the insert loop, pre-fetch two inputs once (mirroring the batched `dupSet` / `recurring` sets):
  - (a) keyword rules via the same RLS-scoped fetch + `compileRule` as PASS 1;
  - (b) memory hits for the classified descriptors in ONE batched `merchant_patterns.select('descriptor_norm, category_id').in('descriptor_norm', [...])` over the distinct `descriptor_norm`s of rows carrying a `categoryId`, collected into a `Map`. No per-row `lookupMemory` inside the loop (WR-02).
- Added a `deriveSource(descriptorNorm, categoryId)` helper that re-derives provenance over the server-trusted `r.base.descriptor_norm`: `null` when unclassified; `'memória'` when the memory hit's category equals the persisted category; else `'palavra-chave'` when `matchKeyword` returns a rule whose category equals the persisted category; else coarse `'memória'`.
- Replaced the `classification_source: r.categoryId ? 'memória' : null` ternary (the KW-10 bug) with `deriveSource(r.base.descriptor_norm, r.categoryId)`.
- The **category-equality guard** applies to both rungs: a grid override (descriptor matches category X but the user confirmed category Y) keeps coarse `'memória'` — never claims `'palavra-chave'`/`'memória'` for the wrong category (T-21-09, CONTEXT "sem procedência falsa").
- Extended the test mock with a batched `merchant_patterns` `.in('descriptor_norm', …)` handler and added six KW-10 cases: keyword→'palavra-chave', memória→'memória', memory-prevails-over-keyword, no-match-keeps-coarse-'memória', unclassified→null, override-guard→coarse 'memória'.

## Verification

- `npx vitest run src/actions/import.test.ts` — 56 passed (KW-09 wiring + KW-10 re-derive + all existing PASS 1 / IDOR / dedupe / recurring / learn cases green).
- `npx vitest run` (full suite) — 99 files, 892 tests passed (no cross-file regression).
- `npx tsc --noEmit` — clean.
- Acceptance greps: `compileRule` appears in `import.ts` (4 hits); the commit ternary is gone (`deriveSource` in its place); the batched `.in('descriptor_norm', …)` is present in the commit handler.

Tests are fully mocked/unit-level — none depend on the not-yet-pushed migration 0037. The live persistence proof of `'palavra-chave'` reaching `transactions` is the separate manual PROD smoke gated on the 0037 db push (Plan 21-03 human-action).

## Deviations from Plan

None — plan executed exactly as written.

### TDD note (RED behavior)
For Task 1, the two new KW-09 glob tests passed at RED before `compileRule` was wired. This is expected and was investigated: `keywords.ts` (Plan 21-02) made `KeywordRule.glob`/`literals` OPTIONAL with defensive `ruleGlob`/`ruleLiterals` fallbacks, so `matchKeyword` already derives the glob lazily even from an uncompiled raw rule. The real Task 1 deliverable is the **compile-once structural change** (perf — no N×M `new RegExp`), gated by the `grep compileRule` acceptance criterion, which DID fail before the wiring (`NOT WIRED YET` confirmed). For Task 2, the keyword case failed at RED as expected (`expected 'memória' to be 'palavra-chave'`) and went green after `deriveSource`.

## Authentication Gates

None during this plan. (The migration 0037 db push is a separate pending human-action gate owned by Plan 21-03 — out of scope here; all tests are mocked.)

## Known Stubs

None. No placeholder/empty-value patterns introduced.

## Self-Check: PASSED

- FOUND: src/actions/import.ts
- FOUND: src/actions/import.test.ts
- FOUND commit: e88dd18 (Task 1)
- FOUND commit: 6271d11 (Task 2)
