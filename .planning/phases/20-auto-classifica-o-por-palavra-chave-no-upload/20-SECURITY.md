# SECURITY.md — Phase 20: Auto-classificação por palavra-chave no upload

**Audited:** 2026-06-19
**ASVS Level:** 1
**block_on:** high
**Disposition source:** register authored at plan time (`register_authored_at_plan_time: true`) — each declared mitigation verified against the implementation; no blind re-scan for new threats.
**Result:** SECURED — 6/6 threats CLOSED, 0 open, 0 unregistered flags.

This phase introduced NO migration (it consumes Phase 19's `category_keywords` table + RLS) and NO new packages. The keyword matcher is a pure deterministic layer inserted BEFORE the AI call, so it REDUCES (does not expand) the LLM trust surface.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-20-01 | Information Disclosure | mitigate | CLOSED | RLS-active fetch verified in code (see below) |
| T-20-02 | Tampering / EoP | accept | CLOSED | Accepted-risk log entry + underlying mitigation verified |
| T-20-03 | Tampering | accept | CLOSED | Accepted-risk log entry + pure matcher verified |
| T-20-04 | Information Disclosure | accept | CLOSED | Accepted-risk log entry + RLS-scoped read verified |
| T-20-05 | Tampering | accept | CLOSED | Accepted-risk log entry + non-interactive render verified |
| T-20-SC | Tampering (supply chain) | accept | CLOSED | Accepted-risk log entry + zero new packages verified |

---

## T-20-01 (mitigate) — Information Disclosure: `category_keywords` fetch

**Declared mitigation:** fetch runs under the RLS-active `createClient()`; the 0036 policy `using (auth.uid() = user_id)` returns only the caller's rules; NO app-layer `user_id` filter (the gate is Postgres, like `categories`/`merchant_patterns`).

All three legs verified present in the implementation:

1. **RLS-active client (no service_role bypass).**
   `src/lib/supabase/server.ts:15-17` — `createServerClient` is constructed with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the publishable/anon key) bound to the user's cookie session. This is the RLS-enforcing client, NOT a service_role client. `src/actions/import.ts:251` obtains `supabase` from this `createClient()`.

2. **The fetch carries no app-layer `user_id` filter.**
   `src/actions/import.ts:444-446`:
   ```
   const { data: kwRows } = await supabase
     .from('category_keywords')
     .select('category_id, keyword, categories(sort)')
   ```
   There is no `.eq('user_id', …)` — by design (matches the `categories` and `merchant_patterns` batched-fetch pattern). The isolation gate is Postgres RLS, exactly as declared.

3. **The 0036 RLS policy is the gate.**
   `supabase/migrations/0036_category_keywords.sql`:
   - line 24: `alter table public.category_keywords enable row level security;`
   - lines 28-29: `grant ... to authenticated, service_role;` (RLS is the real gate; only `service_role` bypasses, and the app uses the authenticated/publishable client).
   - lines 31-35: `create policy "own category_keywords" ... using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);` — SELECT returns only rows where `auth.uid() = user_id`.

**Conclusion:** A caller can only ever read their own keyword rules. The single entry point (the one batched fetch in `ingestStatement`) is fully covered — there is no other `from('category_keywords')` read in the upload pipeline. **CLOSED.**

---

## Accepted Risks Log

The following threats are dispositioned `accept` in the plan-time register. Each entry is logged here per the audit protocol, and the underlying mitigation rationale was independently verified against the code (an accepted risk whose rationale is false would be re-escalated — none were).

### T-20-02 — Tampering / Elevation of Privilege: forged `category_id` via a keyword rule
**Accepted.** A keyword's `category_id` is FK-bound to the user's own `categories` under RLS, and a keyword can only ever point to a category the user owns.
- **Verified:** `0036_category_keywords.sql:13` — `category_id uuid not null references public.categories(id) on delete cascade` (FK to the user's own, RLS-scoped categories table).
- **Verified:** Phase 19 `addKeyword` (`src/actions/category-keywords.ts:59-60`) derives the owner from `claims?.claims.sub` (`getClaims()`), NEVER from the client; the insert (`:72-76`) writes `user_id: userId`, satisfying the RLS `with check` half.
- **Defense-in-depth at consume time:** even if a rule's `category_id` were somehow off-user, `confirmImport` re-derives ownership of every `category_id` via `assertOwnedCategories` (`src/actions/import.ts:695`) before any FK-bearing write, and a keyword pre-fill is fully overwritable in the review grid before confirm. No new attack surface. **No code change required.**

### T-20-03 — Tampering: the deterministic matcher
**Accepted.** `matchKeyword` is pure / in-memory over write-time-validated, normalized data; it never trusts a model.
- **Verified:** `src/lib/classifier/keywords.ts:32-58` — `matchKeyword(descriptorNorm, rules)` performs only an in-memory substring scan (`includes`) with a deterministic longest-wins + `sort` + `categoryId` tie-break. No I/O, no network, no LLM call, no `any`. It runs in the memory-miss branch BEFORE the AI call (`src/actions/import.ts:498-506`) and EXCLUDES matched rows from `missNorms`, shrinking the AI batch — a net reduction of the model trust surface. **No code change required.**

### T-20-04 — Information Disclosure: `page.tsx` reads `parsed_rows`
**Accepted.** The parsed row is already read under RLS by the RSC (the caller's statement); origin derivation is a pure field read.
- **Verified:** `src/app/(app)/importar/[statementId]/page.tsx:49-56` — the `statements` row is read via the RLS-active `createClient()` scoped by `statementId` (RLS restricts to the owner). The origin derivation (`:208-213`) is a pure read of the already-persisted `r.classification_source` / `r.category_id` — no new query, no client-supplied trust. **No code change required.**

### T-20-05 — Tampering: badge render (client)
**Accepted.** The badge is a non-interactive `<span>` pill (mirror of the memória badge); no new interactive element or write path. Overwrite runs the existing `classifyRow` (client state only; only `confirmImport` writes).
- **Verified:** `src/components/origin-badge.tsx:57-77` — the `palavra-chave` variant renders a non-interactive `<span>` (neutral `bg-muted`, `Tags` icon, never the gold IA treatment). `src/components/import-review-table.tsx:142-148` — the `ProvenanceBadge` keyword branch is a non-interactive `<span>` (`bg-secondary`, no icon).
- **Verified:** overwriting a keyword pick calls the existing `classifyRow` (`:344-360`), which mutates CLIENT state only (flips `origin → 'manual'`). The sole transactions / `merchant_patterns` write remains `confirmImport`; no auto-commit was introduced. **No code change required.**

### T-20-SC — Tampering (supply chain): npm/pip/cargo installs
**Accepted.** Zero new packages this phase; the only new import is the already-vendored `lucide-react` `Tags` icon.
- **Verified:** `20-01-SUMMARY.md` and `20-02-SUMMARY.md` both declare `tech-stack.added: []`. The only new import is `Tags` at `src/components/origin-badge.tsx:1` (`import { Brain, Pencil, Sparkles, Tags, TriangleAlert } from 'lucide-react'`) — a named export of an already-installed dependency. No registry/install action occurred. **No code change required.**

---

## Unregistered Flags

None.

Both plan SUMMARYs carry a `## Threat Surface` section (the executor's new-attack-surface report). Each entry maps cleanly to a registered threat ID:
- 20-01 Threat Surface → T-20-01 (RLS-scoped fetch), T-20-03 (pure matcher), T-20-SC (no packages). Explicitly states "No new surface beyond the threat model."
- 20-02 Threat Surface → T-20-04 (pure read), T-20-05 (non-interactive span), T-20-SC (no packages). Explicitly states "No new surface beyond the threat model."

No new attack surface appeared during implementation without a threat mapping.

---

## Notes

- **No migration this phase.** The `category_keywords` table + its `own` RLS policy (0036) ship with Phase 19; Phase 20 only reads them. The audit re-verified the 0036 policy because T-20-01's mitigation depends on it.
- **The matcher reduces, not expands, the AI/LLM surface** (T-20-03): keyword-matched rows are excluded from the batched `classifyDescriptors` call.
- Implementation files were treated as READ-ONLY; this audit created only this SECURITY.md.
