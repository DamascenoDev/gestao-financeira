-- 0003_storage_statements.sql
-- Private 'statements' Storage bucket + per-folder {user_id}/ RLS on storage.objects.
-- Establishes the boundary ONLY — there is NO upload/parse flow in Phase 1
-- (deferred to Phase 4). Bucket is public = false; objects are scoped so the first
-- path segment must equal the caller's auth.uid(). Idempotent: on conflict do nothing
-- + drop policy if exists before create policy.
-- (AUTH-03 / SEC-01 / threat T-1-storage)

insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

-- Phase 4 (threat T-04-03): the per-verb split deferred in Phase 1 lands here, now
-- that the upload/parse flow ships. The single `for all` policy is replaced by
-- explicit `for select` / `for insert` / `for update` / `for delete` policies so
-- INSERT-time checks can later differ from SELECT (content-type/size at upload).
-- The `{user_id}/` path scope is PRESERVED verbatim on every verb — the first path
-- segment MUST equal the caller's auth.uid() — so this is NOT a loosening; it is
-- the same gate, split by verb. Idempotent: drop policy if exists before each
-- create (including the legacy `for all` policy name so a re-reset is clean).
--   (Refinement 2 — a storage.buckets enumeration policy for the multi-user
--    AUTH-03 scenario — remains deferred; the wife is not yet a second titular and
--    no bucket-metadata leak exists in single-user v1.)
--
-- NOTE: editing this already-applied migration requires a `db reset` to take
-- effect (the reset replays 0001-0023); Plan 04-01 performs that reset.
drop policy if exists "own statement files"        on storage.objects;
drop policy if exists "own statement files select" on storage.objects;
drop policy if exists "own statement files insert" on storage.objects;
drop policy if exists "own statement files update" on storage.objects;
drop policy if exists "own statement files delete" on storage.objects;

create policy "own statement files select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own statement files insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own statement files update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "own statement files delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
