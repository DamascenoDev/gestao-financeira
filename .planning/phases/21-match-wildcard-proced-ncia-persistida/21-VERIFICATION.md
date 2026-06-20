---
phase: 21-match-wildcard-proced-ncia-persistida
verified: 2026-06-20T18:45:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verified: "2026-06-20 — owner ran `supabase db push` (0037 applied live), gen:types no-op, live INSERT of 'palavra-chave' succeeded (no SQLSTATE 23514), and the UBER* end-to-end round-trip persisted classification_source='palavra-chave'. SC3/KW-10 confirmed live."
human_verification:
  - test: "Apply migration 0037 to the linked/PROD Supabase then run a live INSERT smoke"
    expected: "`supabase db push` succeeds (0037 in linked history); `npm run gen:types` is a no-op diff; a live INSERT of transactions.classification_source='palavra-chave' SUCCEEDS (no SQLSTATE 23514); the old set ('memória','manual','sugerida',null) still accepted."
    why_human: "The widened CHECK only exists live after `supabase db push` against the LINKED project, which requires interactive auth this autonomous run does not have. tsc + the mocked test suite pass WITHOUT the live constraint (false-positive), so the live persistence truth (SC3 / KW-10) cannot be observed programmatically here."
  - test: "End-to-end PROD smoke: wildcard keyword → upload → confirm → persisted provenance"
    expected: "In PROD: cadastrar the keyword `UBER*` on a category; upload a statement containing descriptor `UBER TRIP 123`; confirm the row; verify the persisted classification_source is 'palavra-chave' (not coarse 'memória')."
    why_human: "Persistence truth is more reliable via a real round-trip than a mock; depends on the db push above being applied. KW-09 wiring + KW-10 re-derivation are code-verified now, but the live persisted provenance is observable only after the migration is applied to PROD."
---

# Phase 21: Match wildcard + procedência persistida — Verification Report

**Phase Goal:** O matcher determinístico de palavra-chave ganha poder e honestidade: além do substring atual, o usuário pode escrever wildcard glob (`UBER*`, `*IFOOD*`) numa keyword, e quando uma linha é classificada por keyword o sistema finalmente grava a procedência real `palavra-chave` na transação (hoje grava o coarse `memória`).
**Verified:** 2026-06-20T18:45:00Z
**Status:** passed (human-verified live 2026-06-20)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (Success Criterion / Plan must_have) | Status | Evidence |
| --- | ------------------------------------------ | ------ | -------- |
| 1 | SC1 — wildcard glob (`UBER*`) pre-classifies a matching descriptor; substring match continues to work | ✓ VERIFIED | `globToRegExp`/`compileRule`/`matchKeyword` in `src/lib/classifier/keywords.ts:41-165`; wired in `import.ts:456-458` pre-fetch via `compileRule`. Tests: keywords.test.ts `UBER*`→`uber trip 123`, `*ifood*`→`pedido ifood centro`, substring `mercado`→`compra mercado livre sp` (unchanged); import.test.ts:698,713 glob pre-classifies → `palavra-chave`. |
| 2 | SC2 — most-specific keyword wins with wildcards; "maior keyword vence" preserved, no v1.5 regression | ✓ VERIFIED | `matchKeyword` tie-break chain literal-count → substring-beats-glob → sort → categoryId (keywords.ts:142-162). Tests: `UBER*`(4) beats `UB*`(2); substring `uber trip`(9) beats glob `uber*`(4); equal-literal contiguous beats glob; order-independence (WR-01) reversed-input same category. |
| 3 | SC3 / KW-10 — a keyword-classified confirmed row persists `classification_source='palavra-chave'` (LIVE) | ✓ VERIFIED (human, live 2026-06-20) | CODE in place: `deriveSource` server-side re-derivation + category-equality guard (`import.ts:855-867`), persisted at `import.ts:899`; migration 0037 committed (cba19b9). Owner ran `supabase db push` (0037 applied to linked/PROD), `gen:types` no-op, live INSERT of `classification_source='palavra-chave'` succeeded (no SQLSTATE 23514), and the `UBER*` → `UBER TRIP 123` → confirm round-trip persisted `'palavra-chave'` (not coarse `'memória'`). Mocked integration tests also pass (import.test.ts:1116,1133,1148,1165,1181,1194). |
| 4 | SC4 — wildcard is opt-in (pure regex stays out) and ReDoS-safe | ✓ VERIFIED | Non-`*` keyword → `glob === null` → `.includes()` substring (v1.5 bit-identical); `*`→`.*` with every other metachar escaped via `REGEX_META` (keywords.ts:24-44); anchored `^…$`, single `.*` per segment (no nested quantifiers). Tests: metachar `a.b(c)*` compiles + matches literally; ReDoS adversarial input stays linear/completes; literal-count-0 (`*`/`**`) skipped. |
| 5 | KW-09 cadastro — `UBER*` survives normalization and is read back still containing `*` | ✓ VERIFIED | `normalizeKeyword` (normalize.ts:63-65) shares one pipeline with `normalizeDescriptor` but skips the `\*+ → space` strip and keeps `*` in the final allow-list (normalize.ts:85-92). `addKeyword` calls `normalizeKeyword` (category-keywords.ts:58) — not `normalizeDescriptor`. Non-`*` keyword normalizes identically (substring v1.5 intact). |
| 6 | KW-09 cadastro guard — literal-count-0 keyword (`*`, `**`) rejected with pt-BR message | ✓ VERIFIED | `addKeyword` rejects `normalized.replace(/\*/g,'') === ''` with `'Use ao menos uma letra ou número além de *.'` (category-keywords.ts:63-64); defense-in-depth in `compileRule` (returns null) and `matchKeyword` (skips literals===0). |
| 7 | KW-10 wiring — glob compiled ONCE per rule at pre-fetch; provenance re-derived server-side with no false provenance on grid override | ✓ VERIFIED | `compileRule` in both pre-fetch (import.ts:456-458) and commit (import.ts:827-829) — no per-row `new RegExp`. `deriveSource` guard: labels `palavra-chave`/`memória` ONLY when re-derived category === persisted categoryId, else coarse `memória` (import.ts:861-866). Test KW-10 guard (import.test.ts:1194): override to category Y → coarse `memória`, NOT `palavra-chave`. |

**Score:** 7/7 truths verified. Truth 3 (SC3/KW-10 live persistence) was human-verified live in PROD on 2026-06-20 (db push applied + INSERT smoke + UBER* round-trip).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/lib/normalize.ts` | `normalizeKeyword` preserves `*`, else bit-identical to `normalizeDescriptor` | ✓ VERIFIED | `export function normalizeKeyword` (63); single shared `runNormalizePipeline(keepWildcard)`; only 2 branch points (`\*+` strip + final allow-list). Wired: imported by category-keywords.ts. |
| `src/lib/classifier/keywords.ts` | `globToRegExp` + `compileRule` + extended `KeywordRule` + literal-count specificity | ✓ VERIFIED | All present (41,77,52,127). ReDoS-safe anchored glob, defensive `ruleGlob`/`ruleLiterals`. Wired: imported by import.ts. |
| `src/actions/category-keywords.ts` | `addKeyword` uses `normalizeKeyword`, rejects literal-count-0 | ✓ VERIFIED | Import (7), call (58), reject (63-64). |
| `src/actions/import.ts` | `compileRule` pre-fetch + server-side provenance re-derivation at commit | ✓ VERIFIED | compileRule (456,827), matchKeyword (501,862), `deriveSource` (855), persisted `classification_source` (899). |
| `supabase/migrations/0037_transactions_classification_source_palavra_chave.sql` | drop+recreate CHECK widening to `palavra-chave` | ✓ VERIFIED (file) / ⚠️ NOT APPLIED LIVE | Resilient DO-block drops any CHECK referencing the column + named drop + recreate with `'palavra-chave'` added, old set preserved. Committed cba19b9. `supabase db push` to linked/PROD is the pending human gate. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `category-keywords.ts addKeyword` | `normalize.ts normalizeKeyword` | import + call at cadastro boundary | ✓ WIRED |
| `keywords.ts matchKeyword` | `globToRegExp` | `rule.glob.test()` when keyword has `*`, else `.includes()` | ✓ WIRED |
| `import.ts pre-fetch (~456)` | `keywords.ts compileRule` | maps kwRows → KeywordRule[] (glob compiled once) | ✓ WIRED |
| `import.ts commit (~899)` | `matchKeyword` + memory lookup | re-derives source: memória→'memória', keyword→'palavra-chave', else coarse | ✓ WIRED |
| `0037 migration` | live PROD transactions CHECK | `supabase db push` applies widened constraint | ⚠️ NOT WIRED LIVE — pending human-action gate (interactive auth) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-21 unit/integration tests | `npx vitest run` (4 phase files: keywords, import, normalize, category-keywords) | 120/120 pass | ✓ PASS |
| Full workspace suite | `npx vitest run` | 99 files / 892 tests pass (28.4s) | ✓ PASS |
| Type safety | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Live INSERT `palavra-chave` (no 23514) | `supabase db push` + live INSERT | requires PROD auth | ? SKIP → human (Step 8) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| KW-09 | 21-01, 21-02, 21-04 | Wildcard glob in a keyword + most-specific wins | ✓ SATISFIED | normalizeKeyword preserves `*`; globToRegExp/matchKeyword specificity; wired end-to-end in import.ts; green tests. |
| KW-10 | 21-03, 21-04 | Persist `palavra-chave` in `transactions.classification_source` via CHECK widening | ⚠️ NEEDS HUMAN | Code (deriveSource + guard) + migration written/committed/replay-validated; mocked tests pass; LIVE constraint not yet applied (db push gate). |

Both requirement IDs from PLAN frontmatter (KW-09, KW-10) are accounted for and map to REQUIREMENTS.md lines 15-16 (Phase 21, Complete). No orphaned requirements — REQUIREMENTS.md maps only KW-09/KW-10 to Phase 21, both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None (no TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER in modified files) | — | — |

### Human Verification Required

**1. Apply migration 0037 to the linked/PROD Supabase + live INSERT smoke**

- **Test:** Run `supabase db push` (root), then `npm run gen:types`, then a live INSERT of a transaction with `classification_source='palavra-chave'`.
- **Expected:** push succeeds and 0037 appears in the linked project's migration history; `gen:types` produces a no-op diff (column stays `text`/`string | null`); the INSERT SUCCEEDS with no SQLSTATE 23514; the old set (`'memória'`,`'manual'`,`'sugerida'`,null) still accepted.
- **Why human:** the widened CHECK only exists live after a `supabase db push` to the LINKED project, which needs interactive auth this autonomous run lacks. tsc + the mocked suite pass without the live constraint (false-positive), so SC3/KW-10 live persistence is unobservable programmatically.

**2. End-to-end PROD smoke (wildcard → upload → confirm → persisted provenance)**

- **Test:** In PROD, cadastrar keyword `UBER*` on a category; upload a statement with descriptor `UBER TRIP 123`; confirm the row; inspect the persisted `transactions.classification_source`.
- **Expected:** persisted provenance is `'palavra-chave'` (not coarse `'memória'`).
- **Why human:** persistence truth is more reliable via a real round-trip than a mock and depends on (1) being applied first.

### Gaps Summary

No gaps. All automated must-haves pass: 6/7 truths VERIFIED (SC1, SC2, SC4 plus the two KW-09 cadastro guards and the KW-10 wiring/guard), full suite green (99 files / 892 tests), tsc clean, no anti-patterns. The single remaining item is NOT a gap — it is an intentional human-action gate: Plan 21-03 Task 2 (`supabase db push` to the linked/PROD project) requires interactive auth the autonomous run does not have. The migration SQL is written, committed (cba19b9), and replay-validated on a throwaway probe; the code path that persists `'palavra-chave'` is complete and mock-tested. Only the LIVE CHECK widening + a live INSERT/end-to-end smoke remain, documented as Manual-Only in 21-VALIDATION.md. Verdict: **human_needed**, not gaps_found.

---

_Verified: 2026-06-20T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
