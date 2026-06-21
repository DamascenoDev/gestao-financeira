# SECURITY.md — Phase 19: Cadastro de palavras-chave por categoria

**Audited:** 2026-06-19
**ASVS Level:** 1
**block_on:** high
**Scope:** KW-01 (keyword CRUD) + KW-06 (per-user RLS/owner isolation). CRUD only — no matching/auto-classification (deferred to Phase 20).
**Verdict:** SECURED — 7/7 threats CLOSED.

This audit verifies each declared mitigation against the implemented code (migration + action + page + UI). Documentation/intent was not accepted as evidence; every `mitigate` threat was traced to an actual code location.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-19-01 | Info Disclosure / EoP (KW-06 cross-user read/write) | mitigate | CLOSED | `supabase/migrations/0036_category_keywords.sql:24` `enable row level security`; `:28-29` grants to `authenticated, service_role`; `:32-35` policy `"own category_keywords" for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)` — byte-identical RLS shape to the `0002_categories.sql:30-33` precedent. `src/actions/category-keywords.ts:59-60` `userId = claims?.claims.sub`; `:72-76` insert payload `user_id: userId` — never from the client arg. Test: `category-keywords.test.ts:197-201` asserts the insert `user_id` is the getClaims `sub`. |
| T-19-02 | Tampering / EoP (removeKeyword/addKeyword IDOR) | mitigate | CLOSED | `src/actions/category-keywords.ts:38` `idSchema = z.string().uuid(...)`. `addKeyword`: `:45-47` rejects a non-uuid `categoryId` before any DB call. `removeKeyword`: `:90-92` rejects a non-uuid `keywordId` before `:99-102` `.delete().eq('id', keywordId)`. A foreign (valid-uuid) id is a 0-row no-op under the RLS policy (delete returns `error: null`, 0 rows affected — no cross-user delete). Tests: `category-keywords.test.ts:184-188` (addKeyword non-uuid), `:218-222` (removeKeyword non-uuid). |
| T-19-03 | Info Disclosure (raw DB error leak: 23505/22P02/23502) | mitigate | CLOSED | `src/actions/category-keywords.ts:79-82` — `23505` → `{ duplicate: true }`, every other code → fixed pt-BR string `'Não foi possível salvar a palavra-chave.'`; raw `error.message` is never returned. `removeKeyword` `:103` returns the fixed `'Não foi possível remover a palavra-chave.'`. 22P02 (non-uuid) is preempted by the `idSchema` guard (T-19-02) and never reaches the DB. Tests: `category-keywords.test.ts:171-176` (23505 → duplicate), `:178-182` (23502 → friendly, no leak), `:224-228` (delete error → friendly). |
| T-19-04 | Tampering (injection via keyword text) | mitigate | CLOSED | All DB access is parametrized supabase-js (`.insert({...})`, `.eq(col, val)`, `.select('...')`) — no SQL string concatenation anywhere in `src/actions/category-keywords.ts`. Content is double-constrained: `src/lib/schemas/category-keyword.ts:13-17` `keywordSchema` (`.trim().min(1).max(60)`) then `src/lib/normalize.ts:50` reduces to `[a-z0-9 ]` only (`.replace(/[^a-z0-9 ]/g, ' ')`) before persist (`category-keywords.ts:55-56,72-76`). Test: `category-keywords.test.ts:122-137` asserts the stored value equals `normalizeDescriptor(raw)`, never the raw string. |
| T-19-05 | Info Disclosure (categorias page select) | mitigate | CLOSED | `src/app/(app)/categorias/page.tsx:60-63` selects `category_keywords` with **no** `.eq('user_id', ...)` app-layer filter — the Postgres RLS "own" policy (T-19-01) is the only gate, consistent with the sibling `categories`/`v_category_totals` fetches in the same RSC. No service_role / RLS-bypass client is used on this page (`createClient` from `@/lib/supabase/server` is the cookie-scoped authenticated client). |
| T-19-06 | Tampering / EoP (dialog fires removeKeyword/addKeyword) | accept | CLOSED | Accepted risk recorded below. Verified the UI is not a security gate: `src/components/category-keywords-dialog.tsx:71,94` only forward `kw.id` / `category.id` + raw value to the server actions; the client-side empty check (`:80-83`) and `maxLength={60}` (`:163`) are UX only. All authoritative validation (WR-06 uuid, getClaims owner, RLS, normalize) is server-side in Plan 19-01. |
| T-19-SC | Tampering (supply chain: npm/pip/cargo installs) | accept | CLOSED | Accepted risk recorded below. Independently verified: `git log -- package.json` shows the last dependency change at commit `9868816` (Phase 14); **no** Phase 19 commit (`bc9b08f`, `a4858f3`, `ddcd290`, `a5ef674`, `9a29e50`, `43391d0`) touches `package.json`. Both summaries declare `tech-stack.added: []`. Zero new registry/component this phase. |

---

## Accepted Risks Log

| ID | Risk | Rationale | Owner | Date |
|----|------|-----------|-------|------|
| T-19-06 | The keyword dialog (`category-keywords-dialog.tsx`) is a client component that invokes the `addKeyword`/`removeKeyword` server actions. A malicious client could bypass the UI and call the actions directly with arbitrary args. | Accepted because the UI is explicitly **not** the security boundary. Every authoritative control lives server-side in the actions (uuid guard WR-06, owner from `getClaims().claims.sub`, Postgres RLS `(select auth.uid()) = user_id`, and `normalizeDescriptor` content constraint). A direct/forged call hits the same server gate as a UI call; the worst case is a 0-row no-op or a friendly error. | Solo owner (DamascenoDev) | 2026-06-19 |
| T-19-SC | Supply-chain risk from new package installs during the phase. | Accepted because this phase introduced **zero** new dependencies (verified vs `package.json` git history — no Phase 19 commit modifies it; both plan summaries declare `tech-stack.added: []`). No new registry/component to vet. The pre-existing dependency baseline is out of scope for this phase's threat register. | Solo owner (DamascenoDev) | 2026-06-19 |

---

## Unregistered Flags

None. `19-02-SUMMARY.md` `## Threat Flags` section explicitly declares "None" and confirms trust boundaries are identical to the plan's threat register. `19-01-SUMMARY.md` declares no new threat surface (CRUD-only, no matching/Phase-20 surface). No new attack surface appeared during implementation that lacks a threat mapping.

---

## Notes

- The new-keyword dialog UX fix (commit `3fa1104`, WR-01/WR-03) does not touch the action/security surface; the action layer is unchanged from Plan 19-01.
- A live cross-user RLS integration test was intentionally kept OPTIONAL (env-flaky live-Docker; documented in MEMORY and `19-01-SUMMARY.md`). The RLS policy is verified structurally here (migration shape identical to the proven `0002` precedent) and the owner-binding is proven in the mocked action suite. This is consistent with ASVS L1 for a single-user private app; no gap blocks the phase.
