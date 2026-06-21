---
phase: 19
slug: cadastro-de-palavras-chave-por-categoria
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-19
validated: 2026-06-19
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 |
| **Config file** | `vitest.config.ts` (jsdom, globals, `@`→`./src`, `server-only`→no-op, setup `./vitest.setup.ts`) |
| **Quick run command** | `npx vitest run src/actions/category-keywords.test.ts` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Typecheck (TS strict gate)** | `npx tsc --noEmit` (after `gen:types` regenerates `database.types.ts`) |
| **Estimated runtime** | ~2 s (mocked unit) / full suite + tsc |

Test split: mocked action unit tests in `src/**/*.test.ts`; live-Docker integration/RLS in `tests/**/*.test.ts` (env-flaky — local stack required); component tests `src/components/*.test.tsx`.

---

## Sampling Rate

- **After every task commit:** `npx vitest run src/actions/category-keywords.test.ts` (mocked, <2s)
- **After the migration task:** `npm run gen:types` (local) → `npx tsc --noEmit` clean (BLOCKING — TS-strict `.from('category_keywords')` won't compile before regen)
- **After every plan wave:** `npm test`
- **Before `/gsd-verify-work`:** Full mocked suite green + `tsc --noEmit` clean
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-02 | 01 | 1 | KW-06 | RLS "own" policy + grants on `category_keywords`; `gen:types` regen | typecheck | `npm run gen:types` → `npx tsc --noEmit` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | KW-01 | `addKeyword` inserts owner + normalized keyword + revalidate | unit | `npx vitest run src/actions/category-keywords.test.ts -t add` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | KW-01 | normalizes input; empty/whitespace → "Informe uma palavra-chave." (no insert) | unit | `… -t "normaliz\|empty"` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | KW-01 | too-long (>60) rejected by Zod | unit | `… -t long` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | KW-01 | duplicate → `{duplicate:true}` (pre-check + 23505 backstop), no error | unit | `… -t duplicate` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | KW-01 | `removeKeyword` deletes by id + revalidate | unit | `… -t remove` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | KW-06 | non-UUID id rejected before DB (WR-06); no `claims.sub` → "Sessão expirada."; insert carries `user_id` | unit | `… -t "uuid\|session\|owner"` | ✅ | ✅ green |
| 19-RLS | 01 | 1 | KW-06 | cross-user: B cannot select/delete A's keyword (live RLS) | integration (OPTIONAL — env-flaky) | `npx vitest run tests/category-keywords-rls.test.ts` | ➖ | ◷ not created (optional; structural assertions + verified RLS policy are the gate) |
| 19-02-03 | 02 | 2 | KW-01 | dialog renders chips, Empty at 0, add/remove call actions + toast | component | `npx vitest run src/components/category-keywords-dialog.test.tsx` | ✅ | ✅ green (4/4) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ◷ optional*

---

## Wave 0 Requirements

- [ ] `src/actions/category-keywords.test.ts` — KW-01 + KW-06 (structural) — mirror `src/actions/categories.test.ts`
- [ ] `tests/category-keywords-rls.test.ts` — KW-06 live isolation (OPTIONAL — env-flaky) — mirror `tests/category-idor.test.ts`
- [ ] `src/components/category-keywords-dialog.test.tsx` — dialog behavior (OPTIONAL) — mirror `src/components/receita-row-actions.test.tsx`
- [ ] Framework install: none — Vitest already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration `0036` applied to PROD | (deploy) | `supabase db push` to PROD is the owner's action (same as `0035`); not a local phase-19 gate. DEV/local + tests run against the migrated schema. | After merge: owner runs `supabase db push`. Local/test verification (KW-01/KW-06) is automated and does NOT depend on PROD. |

*KW-06 RLS isolation IS automatable (structural unit assertions are the gate; optional live Docker test if the local stack is up). Only the PROD deploy of `0036` is manual.*

---

## Validation Sign-Off

- [x] All KW-01/KW-06 behaviors have `<automated>` verify (mocked unit + dialog component; live RLS optional, not the gate)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (mandatory files landed; optional live RLS test intentionally not created)
- [x] gen:types → tsc clean gate present after migration task
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter after Wave 0 tests land green

**Approval:** approved 2026-06-19

---

## Validation Audit 2026-06-19

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Wave 0 mandatory tests landed green: `src/actions/category-keywords.test.ts` (KW-01 + KW-06 structural — add/remove/normalize/empty/long/duplicate/uuid/session/owner) and `src/components/category-keywords-dialog.test.tsx` (4 behaviors) → **20/20 green**; `npx tsc --noEmit` clean. `tests/category-keywords-rls.test.ts` (live cross-user RLS) was intentionally NOT created — it is OPTIONAL/env-flaky (local Docker), and the structural KW-06 assertions + the verified RLS policy SQL are the agreed gate. No MISSING mandatory references → nyquist-auditor not spawned (Step 3). Phase is nyquist-compliant.
