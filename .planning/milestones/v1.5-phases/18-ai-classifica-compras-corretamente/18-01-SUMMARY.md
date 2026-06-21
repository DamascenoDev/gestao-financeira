---
phase: 18-ai-classifica-compras-corretamente
plan: 01
subsystem: ai-classification
tags: [ai, classification, prompt-engineering, security, ts-strict]
requires:
  - "classifyDescriptors batched LLM path (v1.4)"
  - "validateSuggestion enum gate (CLSAI-04)"
  - "CategoryKind type (@/lib/schemas/category)"
provides:
  - "kind-aware classification prompt (categories tagged consumo/alocação)"
  - "anti-allocation code gate (kind!=='consumo' → categoryId null)"
  - "single {id,name,kind: CategoryKind} category shape across AI/classifier layer"
affects:
  - src/lib/ai/classify.ts
  - src/lib/classifier/suggest.ts
  - src/actions/import.ts
tech-stack:
  added: []
  patterns:
    - "Reuse existing 'never trust the model' gate point (result loop in classifyDescriptors)"
    - "Widen param type with canonical CategoryKind, no local string union"
    - "kind is INPUT context (prompt tag), never in the output JSON_SCHEMA"
key-files:
  created:
    - .planning/phases/18-ai-classifica-compras-corretamente/18-01-SUMMARY.md
  modified:
    - src/lib/ai/classify.ts
    - src/lib/classifier/suggest.ts
    - src/actions/import.ts
    - src/lib/ai/classify.test.ts
    - src/lib/classifier/suggest.test.ts
    - tests/pii-guard.test.ts
    - src/actions/import.test.ts
decisions:
  - "Gate lives ONLY inside classifyDescriptors result loop; suggestCategory inherits it via delegation (no second gate in import.ts)"
  - "validateSuggestion widened to {id,name,kind} too — one uniform category shape in the layer (ignores kind)"
  - "categoryList narrowed with `c.kind as CategoryKind` because database.types types kind as non-null `string`"
  - "Prompt tag uses accented 'alocação'; code gate compares ASCII enum '!== consumo' — accent never leaks into comparison"
metrics:
  duration: "~5 min"
  completed: 2026-06-19
  tasks: 2
  files: 7
requirements: [CLSAI-09]
status: complete
---

# Phase 18 Plan 01: Kind-aware AI classification + anti-allocation gate Summary

Made the v1.4 batched LLM classification path *kind-aware* with defense in depth — the prompt now sends each category's `kind` plus a hard anti-allocation rule, and a code gate nulls any suggestion whose owned category has `kind !== 'consumo'`, fixing "AliExpress / Mercado Livre → Investimentos" (CLSAI-09).

## What Was Built

- **Kind-aware prompt** (`classify.ts`): `buildUserText` tags every category line `id: nome (consumo)` / `(alocação)`; `SYSTEM_PROMPT` gains a one-line kind glossary and the hard rule "Todo descritor é um GASTO. NUNCA atribua uma categoria de alocação a um gasto; … retorne categoryId: null".
- **Anti-allocation code gate** (`classify.ts` result loop): immediately after the existing `validateSuggestion` enum gate, the chosen id is mapped back to its `kind` via the in-scope `categories` array; only `kind === 'consumo'` passes — `'alocacao'` and `undefined` → `categoryId: null`, confidence always preserved.
- **Type widening** to `{ id, name, kind: CategoryKind }` across `classifyDescriptors`, `suggestCategory`, and `validateSuggestion` (one uniform shape; imports the canonical `CategoryKind`, no local union).
- **Caller threading** (`import.ts`): `.select('id, name')` → `.select('id, name, kind')`; `categoryList` narrowed with `c.kind as CategoryKind` (DB row types `kind` as non-null `string`).
- **Tests**: 4 fixtures widened to `{ id, name, kind }`; 2 new describes in `classify.test.ts` — "kind-aware prompt" (asserts `(consumo)`/`(alocação)` in the user msg + `NUNCA atribua` / `categoryId: null` in the system msg) and "kind gate" (allocation id → `{ categoryId: null, confidence }` kept; consumo id passes straight through).

## Deviations from Plan

None - plan executed exactly as written. All edits matched the exact diffs in 18-RESEARCH "Code Examples".

## Verification Results

- `npx vitest run src/lib/ai/classify.test.ts` — green, 13 tests (was 9, +4 new CLSAI-09 assertions).
- 4 plan-relevant files (`classify.test.ts`, `suggest.test.ts`, `tests/pii-guard.test.ts`, `import.test.ts`) — 68 tests green; SEC-03 egress guard unchanged.
- `npx tsc --noEmit` — clean (TS strict; widened shape compiles at every call site, no non-test source errors after Task 1 alone).
- `npm test` (full suite) — 804 passed, 20 skipped. 4 integration test files (`reserva-crud`, `income-*`, `mei-report`, `adherence-ytd`, `import-*`, `category-delete`, `carro-consumo`) failed ONLY because the local Supabase stack is not running in this environment (`[local-supabase] could not read supabase status`). This is a known env-flaky condition (project memory: "Supabase integration tests are env-flaky") — unrelated to this plan's changes (no DB/RLS touched).

## Security Notes (SEC-03 / threat model)

- **T-18-01 / T-18-03 (Tampering, mitigate):** enum gate + new kind gate both apply in one auditable spot; a prompt-injection coaxing an allocation id is now nulled by both gates.
- **T-18-02 (Information Disclosure, accept):** the `(kind)` tag is category metadata, not PII. SEC-03 egress test in `classify.test.ts` and `tests/pii-guard.test.ts` remain green — no R$ / date / amount / occurred_on / descriptor_raw token introduced (new fixture category name is "Investimentos", new descriptor is `aliexpress`, no numbers).
- **T-18-SC:** zero packages installed — no legitimacy checkpoint needed.
- `JSON_SCHEMA` / `classifyResultSchema` byte-unchanged — kind is input context, not model output.

## Self-Check: PASSED

- Files created: `.planning/phases/18-ai-classifica-compras-corretamente/18-01-SUMMARY.md` — FOUND.
- Commits: `6016877` (feat Task 1) — present; `f0757f0` (test Task 2) — present.
- `tsc --noEmit` clean and the 2 new CLSAI-09 describes pass.
