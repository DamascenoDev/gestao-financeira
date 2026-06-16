---
phase: 01-funda-o-auth-rls-dinheiro-schema
plan: 02
subsystem: schema-rls-security-boundary
tags: [supabase, migrations, rls, security-boundary, seed-trigger, storage, typed-client, auth-03, cat-01]
requires:
  - "Plan 01-01: vitest harness + RED-first rls-isolation/seed-categories tests + tests/helpers/local-supabase.ts + supabase/config.toml"
provides:
  - "supabase/migrations/0001_profiles.sql — profiles (1:1 auth.users) + user_id index + uniform RLS (USING+WITH CHECK) + role grants"
  - "supabase/migrations/0002_categories.sql — categories + RLS + role grants + SECURITY DEFINER handle_new_user trigger seeding 1 profile + 11 BR categories"
  - "supabase/migrations/0003_storage_statements.sql — private statements bucket + per-folder {user_id}/ RLS on storage.objects"
  - "src/types/database.types.ts — generated typed Database schema from the live local stack"
  - "Local Supabase stack with the Phase-1 schema applied (ports remapped to 553xx)"
affects:
  - "every later domain table inherits the uniform RLS shape + role-grant pattern established here"
  - "Phase 4 statement upload lands inside the already-private {user_id}/ bucket boundary"
  - "typed supabase client across the app keys off database.types.ts"
tech-stack:
  added: []
  patterns:
    - "Uniform RLS: enable RLS + single FOR ALL TO authenticated policy with (select auth.uid()) = user_id in BOTH using and with check + user_id index"
    - "Table privileges (GRANT select/insert/update/delete TO authenticated, service_role) are required alongside RLS — RLS scopes rows, grants let the role reach the table; without grants RLS is a silent false-green"
    - "Per-user seed via SECURITY DEFINER trigger on auth.users with pinned search_path (atomic with signup, multi-user-ready)"
    - "Private Storage bucket + per-folder {user_id}/ RLS established as a boundary before any upload flow exists"
    - "Regenerate database.types.ts from the live local stack after every migration"
key-files:
  created:
    - supabase/migrations/0001_profiles.sql
    - supabase/migrations/0002_categories.sql
    - supabase/migrations/0003_storage_statements.sql
    - src/types/database.types.ts
  modified:
    - supabase/config.toml
decisions:
  - "Local ports remapped to 553xx so this project's stack coexists with an unrelated running Supabase project holding the default 543xx ports (instead of stopping the user's other project)"
  - "Added explicit GRANT ... TO authenticated, service_role on profiles/categories — required for RLS to be the actual row gate rather than a blanket privilege denial (caught a false-green)"
  - "Generated types via supabase gen types typescript --local against the live applied schema (not config), per [BLOCKING] apply-before-verify"
metrics:
  duration_minutes: 12
  tasks_completed: 2
  files_created: 4
  files_modified: 1
  completed: 2026-06-16T15:26:49Z
---

# Phase 1 Plan 02: Schema, RLS & Security Boundary Summary

**One-liner:** Authored the three idempotent SQL migrations that ARE the app's security boundary — `profiles` + `categories` with the uniform `(select auth.uid()) = user_id` RLS (USING + WITH CHECK, `TO authenticated`) and `user_id` indexes, a `SECURITY DEFINER` `handle_new_user` trigger seeding 1 profile + exactly 11 BR categories per signup (Investimentos/Reserva = `alocacao`), and a private `statements` bucket with per-folder `{user_id}/` RLS — applied them to the local Supabase stack, generated the typed `Database` schema, and turned the two-user RLS-isolation and 11-category seed tests GREEN (full suite 18/18, `tsc --noEmit` clean).

## What Shipped

### Task 1 — Three SQL migrations (`504b006`)
- `0001_profiles.sql`: `profiles(id uuid pk → auth.users, user_id uuid not null → auth.users, display_name, created_at)`, `profiles_user_id_idx`, `enable row level security`, single `for all to authenticated` policy `using ((select auth.uid()) = user_id) with check (...)`, guarded by `drop policy if exists`. `id` mirrors `auth.users.id` and `user_id` carries the same value so the uniform shape applies identically everywhere.
- `0002_categories.sql`: `categories(id uuid pk default gen_random_uuid(), user_id not null → auth.users, name, kind text check (kind in ('consumo','alocacao')), sort int default 0, is_archived boolean default false, created_at)`, `categories_user_id_idx`, RLS + same uniform policy. Then `public.handle_new_user()` — `language plpgsql security definer set search_path = public` — inserts the profile (`new.id, new.id`) and the 11 BR categories for `new.id`, plus the `on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW` trigger (guarded by `drop trigger if exists`). ASCII enum values (`'consumo'`/`'alocacao'`, no accent) per RESEARCH A5.
- `0003_storage_statements.sql`: `insert into storage.buckets ('statements', 'statements', false) on conflict (id) do nothing`, single `for all to authenticated` policy on `storage.objects` scoped by `bucket_id = 'statements' and (storage.foldername(name))[1] = (select auth.uid())::text` in BOTH using and with check. Boundary only — no upload/parse flow (deferred to Phase 4).
- All migrations idempotent (`create ... if not exists`, `drop ... if exists` before `create policy/trigger`, `on conflict do nothing`).

### Task 2 — [BLOCKING] Apply locally, generate types, drive tests green (`0686f13`)
- Started the local stack (`supabase start`), applied migrations with `supabase db reset` (idempotent re-apply confirmed — only expected `drop ... if exists` NOTICEs).
- Generated `src/types/database.types.ts` via `supabase gen types typescript --local` against the live schema (`categories` + `profiles` Row/Insert/Update present); `tsc --noEmit` clean.
- `npx vitest run tests/rls-isolation.test.ts tests/seed-categories.test.ts` → GREEN: RLS isolation across all 4 verbs × `categories` + `profiles`; seed = exactly 11 categories with Investimentos/Reserva as `alocacao`, the rest `consumo`.

## Test Status

| Test | Req | Status | Notes |
|------|-----|--------|-------|
| `tests/rls-isolation.test.ts` | AUTH-03 | ✅ GREEN (8/8) | user B reads 0 of user A's rows; INSERT/UPDATE/DELETE across `user_id` all blocked, on both tables |
| `tests/seed-categories.test.ts` | CAT-01 | ✅ GREEN (2/2) | fresh user → exactly 11 categories; Investimentos/Reserva = `alocacao`, rest `consumo` |
| `src/lib/money.test.ts` | SEC-02 | ✅ GREEN (6/6) | unchanged from Plan 01 |
| `tests/bundle-secret-grep.test.ts` | SEC-02 | ✅ GREEN (2/2) | unchanged from Plan 01 |

Full suite: **4 files, 18 passed**. `npx tsc --noEmit` exit 0. `supabase db reset` is idempotent on re-apply.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Local ports collided with an unrelated running Supabase project**
- **Found during:** Task 2 (`supabase start`)
- **Issue:** `supabase start` failed — `Bind for :::54322 failed: port is already allocated`. A different, unrelated Supabase project (ref `zgfbxlnbkaoqtibtbpcx`, noted in 01-01-SUMMARY) was already holding the default ports 54321–54324.
- **Fix:** remapped this project's local ports in `supabase/config.toml` to a non-conflicting 553xx range (api 55321, db 55322, shadow 55320, pooler 55329, studio 55323, inbucket 55324, analytics 55327) so both stacks coexist. Did NOT stop the user's other project. The test helper reads the live URL/keys from `supabase status --output env`, so it picks up the new ports transparently (and the local-host guard still passes — `127.0.0.1`).
- **Files modified:** supabase/config.toml
- **Commit:** 0686f13

**2. [Rule 2 - Missing critical functionality] Tables had no DML grants → RLS was a silent false-green**
- **Found during:** Task 2 (first test run)
- **Issue:** the seed test failed with `permission denied for table categories` (code `42501`) for `service_role`. Inspection showed `authenticated`/`service_role` held only `REFERENCES/TRIGGER/TRUNCATE` on `profiles`/`categories` — **no** `SELECT/INSERT/UPDATE/DELETE`. Critically, this meant the RLS-isolation test was passing for the WRONG reason: user B's reads/writes were denied at the privilege layer, not scoped out by RLS — exactly the silent false-positive PITFALLS Pitfall 2 warns about (the policy is effectively untested when the role can't reach the table).
- **Fix:** added `grant select, insert, update, delete on public.<table> to authenticated, service_role;` to `0001_profiles.sql` and `0002_categories.sql` (the canonical Supabase migration pattern). After `db reset`, `has_table_privilege` confirms the grants, and the RLS test now genuinely exercises row-level scoping (`authenticated` reaches the table; RLS returns 0 cross-user rows + blocks cross-user writes).
- **Files modified:** supabase/migrations/0001_profiles.sql, supabase/migrations/0002_categories.sql
- **Commit:** 0686f13

## Authentication Gates
None — this plan is fully autonomous and local-only. No remote push (`db push` is Plan 04, `autonomous: false`); no credentialed/interactive steps.

## Local Stack State
The local Supabase stack was **left running** (api `http://127.0.0.1:55321`, db `127.0.0.1:55322`) with the Phase-1 schema applied. The orchestrator may stop it later (`npx supabase stop`). The unrelated project on the default 543xx ports was left untouched.

## Known Stubs
None. The `statements` bucket has no upload flow — this is the intentional Phase-1 boundary-only scope (upload/parse is Phase 4, explicitly deferred in CONTEXT/RESEARCH), not a stub.

## Threat Flags
None — all introduced surface (RLS on `profiles`/`categories`, the `SECURITY DEFINER` seed trigger, the per-folder Storage policy) maps directly to the plan's `<threat_model>` (T-1-rls, T-1-check, T-1-storage, T-1-defdef), and each mitigation is in place and tested.

## Requirements Touched
- **AUTH-03** (RLS data isolation) — proven by the two-user isolation test across 4 verbs × 2 tables; table grants make RLS the real gate.
- **CAT-01** (BR category seed) — `handle_new_user` seeds exactly 11 categories per user with correct `kind`, proven GREEN.

## Self-Check: PASSED
All 5 deliverable files (3 migrations + `database.types.ts` + `01-02-SUMMARY.md`) and the modified `supabase/config.toml` exist on disk; both task commits (`504b006`, `0686f13`) are present in git history.
