---
phase: 19
slug: cadastro-de-palavras-chave-por-categoria
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
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
| (migration) | — | 1 | KW-06 | RLS "own" policy + grants on `category_keywords`; `gen:types` regen | typecheck | `npm run gen:types` → `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| (action) | — | 1 | KW-01 | `addKeyword` inserts owner + normalized keyword + revalidate | unit | `npx vitest run src/actions/category-keywords.test.ts -t add` | ❌ W0 | ⬜ pending |
| (action) | — | 1 | KW-01 | normalizes input; empty/whitespace → "Informe uma palavra-chave." (no insert) | unit | `… -t "normaliz\|empty"` | ❌ W0 | ⬜ pending |
| (action) | — | 1 | KW-01 | too-long (>60) rejected by Zod | unit | `… -t long` | ❌ W0 | ⬜ pending |
| (action) | — | 1 | KW-01 | duplicate → `{duplicate:true}` (pre-check + 23505 backstop), no error | unit | `… -t duplicate` | ❌ W0 | ⬜ pending |
| (action) | — | 1 | KW-01 | `removeKeyword` deletes by id + revalidate | unit | `… -t remove` | ❌ W0 | ⬜ pending |
| (action) | — | 1 | KW-06 | non-UUID id rejected before DB (WR-06); no `claims.sub` → "Sessão expirada."; insert carries `user_id` | unit | `… -t "uuid\|session\|owner"` | ❌ W0 | ⬜ pending |
| (RLS) | — | 1 | KW-06 | cross-user: B cannot select/delete A's keyword (live RLS) | integration (OPTIONAL — env-flaky) | `npx vitest run tests/category-keywords-rls.test.ts` | ❌ W0 | ⬜ pending |
| (UI) | — | 2 | KW-01 | dialog renders chips, Empty at 0, add/remove call actions + toast | component (OPTIONAL) | `npx vitest run src/components/category-keywords-dialog.test.tsx` | ❌ W0 | ⬜ pending |

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

- [ ] All KW-01/KW-06 behaviors have `<automated>` verify (mocked unit; live RLS optional)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] gen:types → tsc clean gate present after migration task
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter after Wave 0 tests land green

**Approval:** pending
