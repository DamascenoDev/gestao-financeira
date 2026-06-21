---
phase: 21-match-wildcard-proced-ncia-persistida
reviewed: 2026-06-20T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/lib/normalize.ts
  - src/lib/normalize.test.ts
  - src/lib/classifier/keywords.ts
  - src/lib/classifier/keywords.test.ts
  - src/actions/category-keywords.ts
  - src/actions/category-keywords.test.ts
  - src/actions/import.ts
  - src/actions/import.test.ts
  - supabase/migrations/0037_transactions_classification_source_palavra_chave.sql
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-06-20
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 21 delivers KW-09 (wildcard glob keyword match) and KW-10 (persisted
`classification_source='palavra-chave'`). I reviewed all nine files at standard depth
and verified the six high-attention areas called out in the brief by reading the code,
the supporting schemas (`category-keyword.ts`, `import.ts` schema, migrations 0020 /
0036 / 0037), and by empirically stress-testing the glob compiler.

Verified GOOD:

- **ReDoS safety (1).** `globToRegExp` splits on `*`, escapes every literal segment via
  the canonical `escapeRegExp` class, and joins with `.*` under `^…$` anchors. Empirically
  confirmed linear: `*a*a*…*` against `'a'.repeat(100000)` completes in ~0 ms, and adjacent
  `**` produces `.*.*` which does not backtrack catastrophically under anchored matching.
  No user input ever reaches `new RegExp` unescaped.
- **normalize parity (2).** `normalizeKeyword` and `normalizeDescriptor` both call
  `runNormalizePipeline`; the ONLY two branch points are the `\*+ → space` strip and the
  final allow-list (`[^a-z0-9 *]` vs `[^a-z0-9 ]`). Everything else (NFKD, accent strip,
  lowercase, payment tokens, dates, long-digit runs, trailing-UF, whitespace) is shared
  code, so drift is structurally impossible. The accent regex (`[̀-ͯ]`) verified
  to strip combining marks correctly. The bit-identical-when-no-`*` invariant is test-pinned.
- **Category-equality guard (3).** `deriveSource` only labels `'memória'`/`'palavra-chave'`
  when the matched category EQUALS the persisted `categoryId`; an overridden row (keyword
  binds X, user confirmed Y) correctly falls through to coarse `'memória'`. Test-pinned at
  import.test.ts:1194.
- **Migration (4).** The DO-block drops ANY CHECK referencing `classification_source`
  (defends a divergent live constraint name), the explicit named drop is idempotent, and the
  widened set is exactly `('memória','manual','sugerida','palavra-chave')` + null — matching
  0020's original set plus the one new value. Re-runnable (drop-then-add).
- **RLS / IDOR (5).** No regression. The two new `category_keywords` fetches use the same
  RLS-scoped read pattern as `categories`/`merchant_patterns` (no app-layer `user_id`
  filter, correct because RLS scopes it). `addKeyword`/`removeKeyword` take `user_id` from
  `getClaims().claims.sub`, validate row ids with `idSchema.uuid`, and rely on the migration
  0036 `own category_keywords` policy. `confirmImport`'s four IDOR re-derives and the
  WR-01 authoritative-row re-read are unchanged and intact — KW-10 derives source from
  `r.base.descriptor_norm` (server-trusted), never the client payload.
- **Money (6).** Integer cents preserved throughout; `rowAmountCents` is unchanged and the
  KW-10 changes touch only `classification_source`.

Two WARNINGs and three INFO items below — none block shipping.

## Warnings

### WR-01: `addKeyword` duplicate pre-check omits `category_id`-scoping completeness vs. the unique key

**File:** `src/actions/category-keywords.ts:73-79`
**Issue:** The unique constraint (migration 0036) is `unique (user_id, category_id, keyword)`.
The `maybeSingle` pre-check filters `.eq('category_id', categoryId).eq('keyword', normalized)`
under RLS (which scopes `user_id`), so the pre-check key correctly matches the constraint
columns. This is functionally correct. HOWEVER, the same normalized keyword may legitimately
exist on a DIFFERENT category for the same user (the constraint permits it), and that is fine —
but note the pre-check returns `{ duplicate: true }` only for the same-category case, while the
matcher (`matchKeyword`) treats the same keyword on two categories as a deterministic
`categoryId` tie-break. This is consistent, not a bug, but the duplicate UX silently allows the
same term to be registered against multiple categories where one will always lose the tie-break
and never classify anything. Consider surfacing that as info to the user, or documenting it.
**Fix:** No code change strictly required. If you want to prevent dead keywords, either (a) widen
the duplicate check to detect the same `keyword` on any of the user's categories and warn, or
(b) leave as-is and document that a duplicate term across categories resolves by the
`matchKeyword` tie-break (lower `categoryId` wins). Verify this matches the intended UX.

### WR-02: `ingestStatement` and `confirmImport` ignore the `statements` write errors

**File:** `src/actions/import.ts:573-581` (ingest parsed_rows persist) and `:981` (confirm status update)
**Issue:** Both `.update(...)` calls are awaited but their `{ error }` is discarded. If the
ingest `parsed_rows` persist silently fails (RLS, transient, or a payload too large for jsonb),
`confirmImport` later re-reads empty `parsed_rows` and rejects EVERY row with
"Linha não pertence a esta importação." — a confusing dead-end with no diagnostic. The confirm
`status: 'imported'` update at :981 failing silently means a re-upload of the same file would
NOT short-circuit (re-review instead of "0 novas"), which is benign but masks a real failure.
These fail safe (no bad data persists), but a swallowed error is undiagnosable in PROD — the same
class of issue the codebase already guards against elsewhere (e.g. the `insError` `console.error`
at :299 and the parse-catch `console.error` at :407).
**Fix:** Capture and log the error (mirror the existing `console.error` pattern), and for the
ingest persist consider returning a friendly `{ error }` if it fails, since a confirm against an
empty `parsed_rows` is unrecoverable:
```ts
const { error: persistErr } = await supabase.from('statements').update({ ... }).eq('id', statementId)
if (persistErr) {
  console.error(`[ingestStatement] parsed_rows persist failed (statement=${statementId}):`, persistErr)
  return { error: 'Não foi possível salvar os lançamentos para revisão. Tente de novo.' }
}
```

## Info

### IN-01: `deriveSource` runs `matchKeyword` per-row inside the insert-build loop

**File:** `src/actions/import.ts:843-855` (called from the loop at :863-893)
**Issue:** `deriveSource` calls `matchKeyword(descriptorNorm, keywordRules)` for every classified
row, and `matchKeyword` scans all rules each call → O(rows × rules). The glob RegExps are
pre-compiled once (correct, avoids per-match `new RegExp`), so this is linear and bounded by
`MAX_PARSED_ROWS`. Performance is out of v1 scope; flagged only because the comment at :801-811
emphasizes "never a per-row point-read" yet the per-row in-memory `matchKeyword` scan remains
(intentionally — it is pure/CPU, not a query).
**Fix:** None required for v1. If rule counts grow, memoize `matchKeyword` by `descriptorNorm`
across the distinct `classifiedNorms` set (already computed at :819).

### IN-02: `globToRegExp` produces redundant `.*.*` for adjacent wildcards

**File:** `src/lib/classifier/keywords.ts:42`
**Issue:** A keyword normalizing to `a**b` (two adjacent `*`, e.g. user typed `a * * b` that
collapsed) compiles to `^a.*.*$b` → `^a.*.*b$`. Harmless and still ReDoS-safe (verified), but
the empty middle segment yields a redundant `.*`. `compileRule` only rejects literal-count-0,
not adjacent stars, so this can reach the regex.
**Fix:** Optional cosmetic cleanup — collapse empty segments before join:
```ts
const body = keyword.split('*').filter((s, i, a) => s !== '' || i === 0 || i === a.length - 1)
  .map(escapeLiteral).join('.*')
```
Not worth the added complexity unless profiling shows it matters; current behavior is correct.

### IN-03: Migration 0037 `add constraint` is not guarded for replay against a fully-up-to-date DB

**File:** `supabase/migrations/0037_transactions_classification_source_palavra_chave.sql:49-52`
**Issue:** The final `alter table ... add constraint transactions_classification_source_check`
has no `if not exists` (Postgres does not support it on ADD CONSTRAINT). Idempotency relies
entirely on the preceding DO-block + named `drop ... if exists` removing the constraint first.
This is correct for normal replay. The only failure mode is if a future migration adds a
DIFFERENTLY-named CHECK on the same column that the DO-block's `ilike '%classification_source%'`
predicate does NOT match (e.g. a constraint definition that references the column via a function
without the literal substring) — then the ADD would collide. Low risk given current schema.
**Fix:** None required. If you want belt-and-suspenders, the ADD could itself be wrapped in a
DO-block that checks `pg_constraint` first, but the current pattern is the conventional Supabase
idiom and is safe for this schema.

---

_Reviewed: 2026-06-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
