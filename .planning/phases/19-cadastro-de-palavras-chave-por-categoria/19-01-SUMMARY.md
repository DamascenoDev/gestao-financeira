---
phase: 19-cadastro-de-palavras-chave-por-categoria
plan: 01
subsystem: category-keywords (data + server layer)
tags: [supabase, rls, server-actions, zod, migration, tdd]
status: complete
requires:
  - normalizeDescriptor (src/lib/normalize.ts)
  - categories table + RLS-own shape (0002/0021)
  - getClaims() owner pattern (src/actions/categories.ts)
provides:
  - public.category_keywords table (migration 0036) + RLS "own" + unique(user_id,category_id,keyword)
  - Database['public']['Tables']['category_keywords'] Row/Insert/Update types
  - keywordSchema + KeywordInput (src/lib/schemas/category-keyword.ts)
  - addKeyword / removeKeyword server actions + AddKeywordResult / ActionResult types
affects:
  - Plan 19-02 (UI dialog consumes addKeyword/removeKeyword + the RSC keyword fetch)
  - Phase 20 (keyword match against descriptor_norm — same normalized key space)
tech-stack:
  added: []
  patterns:
    - "Standalone Zod string schema (not FormData/object) for a positional-arg action"
    - "Friendly duplicate no-op via maybeSingle pre-check + 23505 race backstop"
    - "Mocked-action harness with settable maybeSingle + 23505 insert variant"
key-files:
  created:
    - supabase/migrations/0036_category_keywords.sql
    - src/lib/schemas/category-keyword.ts
    - src/actions/category-keywords.ts
    - src/actions/category-keywords.test.ts
  modified:
    - src/types/database.types.ts
decisions:
  - "Applied 0036 to the LOCAL stack via `supabase migration up --local` (NOT db:push — that targets PROD, owner's manual action)"
  - "keyword stored NORMALIZED via normalizeDescriptor so Phase 20's match against descriptor_norm is apples-to-apples"
  - "duplicate is a friendly {duplicate:true} (pre-check + 23505 backstop), never an error"
metrics:
  duration_sec: 327
  completed: 2026-06-19
  tasks: 3
  files: 5
requirements: [KW-01, KW-06]
---

# Phase 19 Plan 01: Camada de dados + servidor das palavras-chave — Summary

Per-user `category_keywords` table (migration `0036`, RLS "own" + `unique(user_id, category_id, keyword)` + `ON DELETE CASCADE` no `category_id`), regenerated `database.types.ts`, and the `addKeyword`/`removeKeyword` server actions (Zod boundary, `normalizeDescriptor` on save, `getClaims()` owner, WR-06 uuid guard, friendly-duplicate no-op via `maybeSingle` pre-check + 23505 backstop, `revalidatePath('/categorias')`) — delivering KW-01 (CRUD) + KW-06 (RLS/owner isolation) at the backend. CRUD only; zero matching/auto-classification (Phase 20).

## What Was Built

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | RED — mocked keyword-action unit tests | `bc9b08f` | `src/actions/category-keywords.test.ts` |
| 2 | [BLOCKING] migration 0036 + apply local + gen:types | `a4858f3` | `supabase/migrations/0036_category_keywords.sql`, `src/types/database.types.ts` |
| 3 | GREEN — keywordSchema + addKeyword/removeKeyword | `ddcd290` | `src/lib/schemas/category-keyword.ts`, `src/actions/category-keywords.ts` |

### Migration `0036_category_keywords.sql`
- Table: `id`, `user_id` (FK `auth.users` cascade), `category_id` (FK `public.categories(id)` **cascade** — keywords are category-owned metadata), `keyword text`, `created_at`; `unique(user_id, category_id, keyword)`.
- Two indexes: `(user_id)` and `(category_id)`.
- `enable row level security`; grants to `authenticated, service_role`; single `for all` policy "own category_keywords" with `using ((select auth.uid()) = user_id) with check (...)`.
- No `handle_new_user`/seed block (category-specific to `0002`). `keyword` is plain `text` (no enum/check).
- Applied to the **local** stack with `supabase migration up --local`; `npm run gen:types` regenerated `database.types.ts` (the `category_keywords` Row/Insert/Update block is present at line ~241).

### Actions (`src/actions/category-keywords.ts`)
- `addKeyword(categoryId, keyword)`: WR-06 uuid guard → `keywordSchema` (trim/min1/max60) → `normalizeDescriptor` (called once) → `'' ` guard ("Informe uma palavra-chave.") → `getClaims()` owner → `maybeSingle` dup pre-check (`{duplicate:true}`) → insert `{user_id, category_id, keyword normalizado}` → `23505` backstop (`{duplicate:true}`), other errors → friendly pt-BR → `revalidatePath('/categorias')`.
- `removeKeyword(keywordId)`: WR-06 uuid guard → session gate → `delete().eq('id', …)` → friendly error mapping → `revalidatePath`.
- `keywordSchema` is a standalone string schema (the action takes a positional string arg, not FormData).

## Verification

- `npx vitest run src/actions/category-keywords.test.ts` → **16/16 green** (KW-01 + structural KW-06).
- `npx tsc --noEmit` → **clean** (TS-strict gate; only passed after the Task 2 `gen:types`, confirming the [BLOCKING] ordering).
- `npm test` (full suite) → 839/840 pass; the single failure is an **out-of-scope, pre-existing** live-Docker test (see Deferred Issues).

## Deviations from Plan

None — the plan executed exactly as written. Task 2's inline `<verify>` (`grep category_keywords && tsc --noEmit`) intentionally cannot be clean until Task 3 exists (the RED test imports the not-yet-created action module); the migration + types half (`grep` + `category_keywords` block present) was satisfied at Task 2, and `tsc` went clean at Task 3 — the documented [BLOCKING] sequence.

**Note on local-apply command:** used `supabase migration up --local` instead of the plan's suggested `npm run db:push`, because `db:push` resolves to `supabase db push` which targets **PROD** (the owner's manual action, explicitly out of scope per the plan notes + project memory). `migration up --local` applies the pending `0036` to the running local stack — the intended autonomous step.

## Deferred Issues

**1. [Out of scope] `tests/seed-categories.test.ts` stale category count (11 → 12)**
- **Found during:** Plan 19-01 full-suite wave gate.
- **Issue:** test asserts `EXPECTED_COUNT = 11` but the seed now creates 12 categories.
- **Root cause:** migration `0035_categories_marketplace.sql` (Phase 17) added a 12th default "Marketplace" category to `handle_new_user`; the live-Docker test was never updated. NOT caused by Phase 19 (which does not touch the seed, `categories`, or `handle_new_user`).
- **Action:** logged to `.planning/phases/19-.../deferred-items.md` (D1); left unfixed per SCOPE BOUNDARY. Suggested future fix: bump the count + add 'Marketplace' to the consumo set.

## Known Stubs

None. The actions are fully wired (real schema, real `normalizeDescriptor`, real RLS). No placeholder/empty-data paths introduced. UI wiring is Plan 19-02 (intentional split).

## KW-06 (security) note

KW-06 is enforced structurally and proven in the mocked suite: the `0036` policy "own category_keywords" has both `using` + `with check ((select auth.uid()) = user_id)`; `addKeyword` sets `user_id` only from `getClaims().claims.sub` (asserted by the `owner` test — never from the client); `idSchema` (WR-06) rejects malformed `categoryId`/`keywordId` before any `.eq(...)`. DB errors are always mapped to friendly pt-BR (23505 → `{duplicate:true}`), never leaked raw. A live cross-user RLS test was kept OPTIONAL (env-flaky live-Docker, per RESEARCH Pitfall 5) and not run as a gate.

## Self-Check: PASSED
- Files: all 5 present on disk.
- Commits: `bc9b08f`, `a4858f3`, `ddcd290` all in git history.
