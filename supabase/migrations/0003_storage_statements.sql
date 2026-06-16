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

-- DEFERRED (MD-04): the object policy below is path-scoped and holds file
-- contents private, but two refinements are consciously deferred to Phase 4
-- (when the upload/parse flow actually lands):
--   1. Split this single `for all` into explicit `for select` / `for insert`
--      / `for update` / `for delete` policies so INSERT-time checks
--      (content-type, size) can differ from SELECT.
--   2. Add a `storage.buckets` policy so an authenticated user cannot enumerate
--      the existence/metadata of the private 'statements' bucket (matters once
--      the wife joins as a second titular — AUTH-03 multi-user scenario).
-- Neither leaks file bytes today (the object policy holds), so deferring is safe
-- for Phase 1 — recorded here so it is not forgotten when upload ships.
drop policy if exists "own statement files" on storage.objects;
create policy "own statement files" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
